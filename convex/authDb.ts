import { v, ConvexError } from "convex/values";
import { genUsername } from "./lib/username";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireSession } from "./lib/auth";
const MAX_FAILS = 5, WINDOW = 15 * 60_000, LOCK = 15 * 60_000;
export const getUser = internalQuery({ args: { username: v.string() },
  handler: (ctx, a) => ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", a.username)).unique() });
export const getCadetByEmail = internalQuery({ args: { email: v.string() },
  handler: (ctx, a) => ctx.db.query("cadets").withIndex("by_email", (q) => q.eq("email", a.email)).unique() });
export const otpIssue = internalMutation({ args: { cadetId: v.id("cadets"), codeHash: v.string() }, handler: async (ctx, a) => {
  const now = Date.now(), all = await ctx.db.query("otps").withIndex("by_cadet", (q) => q.eq("cadetId", a.cadetId)).collect();
  if (all.filter((o) => now - o.createdAt < 3600_000).length >= 5 || all.some((o) => now - o.createdAt < 30_000)) return false;
  for (const o of all) if (!o.used) await ctx.db.patch(o._id, { used: true });
  await ctx.db.insert("otps", { cadetId: a.cadetId, codeHash: a.codeHash, expiresAt: now + 600_000, attempts: 0, used: false, createdAt: now }); return true; } });
export const otpCheck = internalMutation({ args: { cadetId: v.id("cadets"), codeHash: v.string() }, handler: async (ctx, a) => {
  const o = (await ctx.db.query("otps").withIndex("by_cadet", (q) => q.eq("cadetId", a.cadetId)).collect()).filter((x) => !x.used).sort((x, y) => y.createdAt - x.createdAt)[0];
  if (!o || o.expiresAt < Date.now()) return false;
  if (o.attempts >= 5) { await ctx.db.patch(o._id, { used: true }); return false; }
  if (o.codeHash !== a.codeHash) { await ctx.db.patch(o._id, { attempts: o.attempts + 1 }); return false; }
  await ctx.db.patch(o._id, { used: true }); return true; } });
export const countUsers = internalQuery({ args: {}, handler: async (ctx) => (await ctx.db.query("users").take(1)).length });
export const createUser = internalMutation({
  args: { username: v.string(), passwordHash: v.string(), salt: v.string(), displayName: v.string() },
  handler: (ctx, a) => ctx.db.insert("users", { ...a, active: true, createdAt: Date.now() }) });
export const isLocked = internalQuery({ args: { key: v.string() }, handler: async (ctx, a) => {
  const r = await ctx.db.query("loginAttempts").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
  return !!r && r.lockedUntil > Date.now(); } });
export const recordFail = internalMutation({ args: { key: v.string() }, handler: async (ctx, a) => {
  const now = Date.now();
  const r = await ctx.db.query("loginAttempts").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
  if (!r) return void (await ctx.db.insert("loginAttempts", { key: a.key, count: 1, windowStart: now, lockedUntil: 0 }));
  const fresh = now - r.windowStart > WINDOW; const count = fresh ? 1 : r.count + 1;
  await ctx.db.patch(r._id, { count, windowStart: fresh ? now : r.windowStart, lockedUntil: count >= MAX_FAILS ? now + LOCK : 0 });
} });
export const clearFails = internalMutation({ args: { key: v.string() }, handler: async (ctx, a) => {
  const r = await ctx.db.query("loginAttempts").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
  if (r) await ctx.db.delete(r._id); } });
export const createSession = internalMutation({
  args: { tokenHash: v.string(), role: v.union(v.literal("commander"), v.literal("cadet")),
    userId: v.optional(v.id("users")), cadetId: v.optional(v.id("cadets")), actor: v.string() },
  handler: async (ctx, a) => {
    const { actor, ...s } = a; const now = Date.now();
    await ctx.db.insert("sessions", { ...s, revoked: false, createdAt: now, expiresAt: now + 12 * 3600_000 });
    await ctx.db.insert("activityLogs", { actor, action: "login", details: a.role, createdAt: now });
  } });
export const me = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token);
  if (s.userId) { const u = (await ctx.db.get(s.userId))!; return { role: "commander" as const, name: u.displayName }; }
  const c = (await ctx.db.get(s.cadetId!))!; return { role: "cadet" as const, name: c.firstName, grade: c.grade };
} });
export const logout = mutation({ args: { token: v.string() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token); await ctx.db.patch(s._id, { revoked: true });
  await ctx.db.insert("activityLogs", { actor: s.userId ?? s.cadetId ?? "?", action: "logout", details: s.role, createdAt: Date.now() });
} });
export const commanderName = internalQuery({ args: { token: v.string() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); return (await ctx.db.get(s.userId!))!.username; } });
export const usersList = query({ args: { token: v.string() }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander");
  return (await ctx.db.query("users").collect()).map((u) => ({ _id: u._id, username: u.username, active: u.active })); } });
export const userSetActive = mutation({ args: { token: v.string(), id: v.id("users"), active: v.boolean() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); if (s.userId === a.id) throw new Error("SELF"); await ctx.db.patch(a.id, { active: a.active });
  if (!a.active) for (const x of await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", a.id)).collect()) await ctx.db.patch(x._id, { revoked: true });
  await ctx.db.insert("activityLogs", { actor: String(s.userId), action: a.active ? "user_enable" : "user_disable", details: String(a.id), createdAt: Date.now() }); } });
export const setUserPassword = internalMutation({ args: { id: v.id("users"), passwordHash: v.string(), salt: v.string(), actor: v.string() }, handler: async (ctx, a) => {
  await ctx.db.patch(a.id, { passwordHash: a.passwordHash, salt: a.salt });
  for (const x of await ctx.db.query("sessions").withIndex("by_user", (q) => q.eq("userId", a.id)).collect()) await ctx.db.patch(x._id, { revoked: true });
  await ctx.db.insert("activityLogs", { actor: a.actor, action: "user_password", details: String(a.id), createdAt: Date.now() }); } });

const gradeV = v.union(v.literal("ט"), v.literal("י"), v.literal("יא"), v.literal("יב"));
export const getCadetByUsername = internalQuery({ args: { username: v.string() }, handler: (ctx, a) => ctx.db.query("cadets").withIndex("by_username", (q) => q.eq("username", a.username)).unique() });
export const cadetInsert = internalMutation({ args: { firstName: v.string(), lastName: v.string(), email: v.string(), grade: gradeV, actor: v.string() }, handler: async (ctx, a) => {
  const email = a.email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError({ code: "BAD_EMAIL" });
  if (!a.firstName.trim() || !a.lastName.trim()) throw new ConvexError({ code: "BAD_NAME" });
  if (await ctx.db.query("cadets").withIndex("by_email", (q) => q.eq("email", email)).unique()) throw new ConvexError({ code: "DUPLICATE_EMAIL" });
  const username = await genUsername(ctx);
  const id = await ctx.db.insert("cadets", { firstName: a.firstName.trim(), lastName: a.lastName.trim(), email, grade: a.grade, username, active: true, createdAt: Date.now() });
  await ctx.db.insert("activityLogs", { actor: a.actor, action: "cadet_create", details: username, createdAt: Date.now() }); return { id, username }; } });
export const ensureUsername = internalMutation({ args: { id: v.id("cadets") }, handler: async (ctx, a) => {
  const c = await ctx.db.get(a.id); if (!c) return null; let u = c.username; if (!u) { u = await genUsername(ctx); await ctx.db.patch(a.id, { username: u }); }
  return { username: u, email: c.email, name: c.firstName }; } });
export const markUsernameSent = internalMutation({ args: { id: v.id("cadets"), actor: v.string() }, handler: async (ctx, a) => {
  await ctx.db.patch(a.id, { usernameSentAt: Date.now() }); await ctx.db.insert("activityLogs", { actor: a.actor, action: "username_sent", details: String(a.id), createdAt: Date.now() }); } });
export const pendingUsernames = internalQuery({ args: {}, handler: async (ctx) => (await ctx.db.query("cadets").collect()).filter((c) => c.email && !c.usernameSentAt).slice(0, 150).map((c) => ({ id: c._id })) });
