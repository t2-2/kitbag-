"use node";
import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import nodemailer from "nodemailer";
import { welcomeHtml, otpHtml } from "./lib/mail";
import { USERNAME_RE } from "./lib/username";
import { randomBytes, scryptSync, timingSafeEqual, createHash, randomInt } from "node:crypto";
const hash = (pw: string, salt: string) => scryptSync(pw, salt, 64).toString("hex");
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const bad = () => new ConvexError({ code: "BAD_CREDENTIALS" });
async function open(ctx: any, role: "commander" | "cadet", ids: any, actor: string) {
  const token = randomBytes(32).toString("base64url");
  await ctx.runMutation(internal.authDb.createSession, { tokenHash: createHash("sha256").update(token).digest("hex"), role, actor, ...ids });
  return token;
}
// First commander is created from Convex env vars KITBAG_BOOTSTRAP_USER / KITBAG_BOOTSTRAP_PASSWORD (no terminal needed).
async function bootstrap(ctx: any) {
  const u = process.env.KITBAG_BOOTSTRAP_USER, p = process.env.KITBAG_BOOTSTRAP_PASSWORD;
  if (!u || !p || (await ctx.runQuery(internal.authDb.countUsers, {}))) return;
  const salt = randomBytes(16).toString("hex");
  await ctx.runMutation(internal.authDb.createUser, { username: u, passwordHash: hash(p, salt), salt, displayName: u });
}
export const loginCommander = action({ args: { username: v.string(), password: v.string() },
  handler: async (ctx, a): Promise<{ token: string; role: "commander" }> => {
    await bootstrap(ctx);
    const key = "u:" + a.username.toLowerCase();
    if (await ctx.runQuery(internal.authDb.isLocked, { key })) throw new ConvexError({ code: "LOCKED" });
    const u: any = await ctx.runQuery(internal.authDb.getUser, { username: a.username });
    const ok = same(hash(a.password, u?.salt ?? "0".repeat(32)), u?.passwordHash ?? "x".repeat(128)) && !!u?.active;
    if (!ok) { await ctx.runMutation(internal.authDb.recordFail, { key }); throw bad(); }
    await ctx.runMutation(internal.authDb.clearFails, { key });
    return { token: await open(ctx, "commander", { userId: u!._id }, u!.username), role: "commander" as const };
  } });
const okPw = (p: string) => p.length >= 10;
export const createCommander = action({ args: { token: v.string(), username: v.string(), password: v.string() }, handler: async (ctx, a): Promise<{ ok: boolean; by: string }> => {
  const actor: string = await ctx.runQuery(internal.authDb.commanderName, { token: a.token });
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(a.username)) throw new ConvexError({ code: "BAD_USERNAME" }); if (!okPw(a.password)) throw new ConvexError({ code: "WEAK_PASSWORD" });
  const dupU: any = await ctx.runQuery(internal.authDb.getUser, { username: a.username }); if (dupU) throw new ConvexError({ code: "DUPLICATE" });
  const salt = randomBytes(16).toString("hex"); await ctx.runMutation(internal.authDb.createUser, { username: a.username, passwordHash: hash(a.password, salt), salt, displayName: a.username });
  return { ok: true, by: actor }; } });
export const resetPassword = action({ args: { token: v.string(), username: v.string(), password: v.string() }, handler: async (ctx, a) => {
  const actor: string = await ctx.runQuery(internal.authDb.commanderName, { token: a.token }); if (!okPw(a.password)) throw new ConvexError({ code: "WEAK_PASSWORD" });
  const u: any = await ctx.runQuery(internal.authDb.getUser, { username: a.username }); if (!u) throw new ConvexError({ code: "NOT_FOUND" });
  const salt = randomBytes(16).toString("hex"); await ctx.runMutation(internal.authDb.setUserPassword, { id: u._id, passwordHash: hash(a.password, salt), salt, actor }); return { ok: true }; } });

// ---- שוחרים: שם משתמש + OTP במייל
const hashOtp = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");
const configured = () => !!((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.SMTP_HOST || process.env.RESEND_API_KEY);
// שליחת מייל: Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) -> SMTP כללי (SMTP_HOST) -> Resend (RESEND_API_KEY)
async function sendMail(to: string, subject: string, html: string) {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") } });
    await t.sendMail({ from: `KITBAG+ <${process.env.GMAIL_USER}>`, to, subject, html }); return;
  }
  const from = process.env.MAIL_FROM || "KITBAG+ <onboarding@resend.dev>";
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await t.sendMail({ from, to, subject, html }); return;
  }
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [to], subject, html }) });
  if (!r.ok) throw new Error("resend " + r.status + " " + (await r.text()));
}
const mailFail = () => new ConvexError({ code: "MAIL_FAILED" });
export const requestOtp = action({ args: { username: v.string() }, handler: async (ctx, a): Promise<{ ok: boolean }> => {
  const username = a.username.trim().toLowerCase(); if (!USERNAME_RE.test(username)) throw new ConvexError({ code: "BAD_CADET_USERNAME" });
  if (!configured()) throw new ConvexError({ code: "MAIL_NOT_CONFIGURED" });
  const c: any = await ctx.runQuery(internal.authDb.getCadetByUsername, { username });
  if (c && c.active && c.email) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (await ctx.runMutation(internal.authDb.otpIssue, { cadetId: c._id, codeHash: hashOtp(c._id, code) })) {
      try { await sendMail(c.email, "קוד הכניסה שלך ל-KITBAG+", otpHtml({ code, name: c.firstName })); } catch (e) { console.error("mail failed", e); throw mailFail(); }
    }
  }
  return { ok: true }; } });
export const verifyOtp = action({ args: { username: v.string(), code: v.string() }, handler: async (ctx, a): Promise<{ token: string; role: "cadet" }> => {
  const username = a.username.trim().toLowerCase(), key = "otp:" + username;
  if (await ctx.runQuery(internal.authDb.isLocked, { key })) throw new ConvexError({ code: "LOCKED" });
  const c: any = USERNAME_RE.test(username) ? await ctx.runQuery(internal.authDb.getCadetByUsername, { username }) : null;
  const ok = !!c && c.active && /^\d{6}$/.test(a.code) && (await ctx.runMutation(internal.authDb.otpCheck, { cadetId: c._id, codeHash: hashOtp(c._id, a.code) }));
  if (!ok) { await ctx.runMutation(internal.authDb.recordFail, { key }); throw new ConvexError({ code: "BAD_CODE" }); }
  await ctx.runMutation(internal.authDb.clearFails, { key });
  return { token: await open(ctx, "cadet", { cadetId: c._id }, c.username), role: "cadet" as const }; } });

async function sendUsernameTo(ctx: any, id: any, actor: string): Promise<boolean> {
  const u: any = await ctx.runMutation(internal.authDb.ensureUsername, { id }); if (!u || !u.email || !configured()) return false;
  try { await sendMail(u.email, "שם המשתמש שלך ב-KITBAG+", welcomeHtml({ name: u.name, username: u.username })); await ctx.runMutation(internal.authDb.markUsernameSent, { id, actor }); return true; }
  catch (e) { console.error("mail failed", e); return false; }
}
export const cadetRegister = action({ args: { token: v.string(), firstName: v.string(), lastName: v.string(), email: v.string(),
  grade: v.union(v.literal("ט"), v.literal("י"), v.literal("יא"), v.literal("יב")) }, handler: async (ctx, a): Promise<{ username: string; mailed: boolean }> => {
  const { token, ...rest } = a; const actor: string = await ctx.runQuery(internal.authDb.commanderName, { token });
  const r: any = await ctx.runMutation(internal.authDb.cadetInsert, { ...rest, actor });
  return { username: r.username, mailed: await sendUsernameTo(ctx, r.id, actor) }; } });
export const resendUsername = action({ args: { token: v.string(), cadetId: v.id("cadets") }, handler: async (ctx, a): Promise<{ ok: boolean }> => {
  const actor: string = await ctx.runQuery(internal.authDb.commanderName, { token: a.token }); if (!configured()) throw new ConvexError({ code: "MAIL_NOT_CONFIGURED" });
  if (!(await sendUsernameTo(ctx, a.cadetId, actor))) throw mailFail(); return { ok: true }; } });
export const sendUsernames = action({ args: { token: v.string() }, handler: async (ctx, a): Promise<{ sent: number; failed: number; remaining: number }> => {
  const actor: string = await ctx.runQuery(internal.authDb.commanderName, { token: a.token }); if (!configured()) throw new ConvexError({ code: "MAIL_NOT_CONFIGURED" });
  const list: any[] = await ctx.runQuery(internal.authDb.pendingUsernames, {}); let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += 3) { const res = await Promise.all(list.slice(i, i + 3).map((x) => sendUsernameTo(ctx, x.id, actor))); res.forEach((ok) => (ok ? sent++ : failed++)); }
  const rest: any[] = await ctx.runQuery(internal.authDb.pendingUsernames, {}); return { sent, failed, remaining: rest.length }; } });
