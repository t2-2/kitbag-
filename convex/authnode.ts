"use node";
import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
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
  handler: async (ctx, a) => {
    await bootstrap(ctx);
    const key = "u:" + a.username.toLowerCase();
    if (await ctx.runQuery(internal.authDb.isLocked, { key })) throw new ConvexError({ code: "LOCKED" });
    const u = await ctx.runQuery(internal.authDb.getUser, { username: a.username });
    const ok = same(hash(a.password, u?.salt ?? "0".repeat(32)), u?.passwordHash ?? "x".repeat(128)) && !!u?.active;
    if (!ok) { await ctx.runMutation(internal.authDb.recordFail, { key }); throw bad(); }
    await ctx.runMutation(internal.authDb.clearFails, { key });
    return { token: await open(ctx, "commander", { userId: u!._id }, u!.username), role: "commander" as const };
  } });
export const loginCadet = action({ args: { idNumber: v.string(), code: v.string() },
  handler: async (ctx, a) => {
    const key = "c:" + a.idNumber;
    if (await ctx.runQuery(internal.authDb.isLocked, { key })) throw new ConvexError({ code: "LOCKED" });
    const c = await ctx.runQuery(internal.authDb.getCadet, { idNumber: a.idNumber });
    const h = createHash("sha256").update(a.code.trim().toUpperCase()).digest("hex");
    const ok = !!c && c.active && !!c.accessCodeHash && (c.accessCodeExpires ?? 0) > Date.now() && same(h, c.accessCodeHash);
    if (!ok) { await ctx.runMutation(internal.authDb.recordFail, { key }); throw bad(); }
    await ctx.runMutation(internal.authDb.clearFails, { key });
    return { token: await open(ctx, "cadet", { cadetId: c!._id }, c!.idNumber), role: "cadet" as const };
  } });
export const issueCadetCode = action({ args: { token: v.string(), cadetId: v.id("cadets") }, handler: async (ctx, a) => {
  const actor = await ctx.runQuery(internal.authDb.commanderName, { token: a.token });
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code = ""; for (const x of randomBytes(10)) code += A[x % 32];
  await ctx.runMutation(internal.authDb.setCadetCode, { cadetId: a.cadetId, hash: createHash("sha256").update(code).digest("hex"), actor });
  return { code }; } });
