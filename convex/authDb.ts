import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireSession } from "./lib/auth";
const MAX_FAILS = 5, WINDOW = 15 * 60_000, LOCK = 15 * 60_000;
export const getUser = internalQuery({ args: { username: v.string() },
  handler: (ctx, a) => ctx.db.query("users").withIndex("by_username", (q) => q.eq("username", a.username)).unique() });
export const getCadet = internalQuery({ args: { idNumber: v.string() },
  handler: (ctx, a) => ctx.db.query("cadets").withIndex("by_idNumber", (q) => q.eq("idNumber", a.idNumber)).unique() });
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
export const setCadetCode = internalMutation({ args: { cadetId: v.id("cadets"), hash: v.string(), actor: v.string() }, handler: async (ctx, a) => {
  const now = Date.now(); await ctx.db.patch(a.cadetId, { accessCodeHash: a.hash, accessCodeExpires: now + 30 * 86400_000 });
  await ctx.db.insert("activityLogs", { actor: a.actor, action: "issue_code", details: a.cadetId, createdAt: now }); } });
