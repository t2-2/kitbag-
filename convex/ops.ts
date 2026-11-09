import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSession } from "./lib/auth";
const GRADES = ["ט", "י", "יא", "יב"];
const gradeV = v.union(v.literal("ט"), v.literal("י"), v.literal("יא"), v.literal("יב"));
const range = (a: number, b: number, s = 2) => { const r: string[] = []; for (let i = a; i <= b; i += s) r.push(String(i)); return r; };
const STOCK: [string, string[], number, number][] = [["kitbag", ["סטנדרט"], 60, 10], ["shirt", ["ק׳", "ב׳", "ג׳", "מ׳", "ממ׳", "מממ׳"], 25, 5],
  ["pants", range(36, 66), 8, 2], ["shoes", range(35, 48, 1), 6, 2], ["jacket", ["S", "M", "L", "XL", "XXL", "XXXL"], 10, 3],
  ["belt", ["סטנדרט"], 80, 10], ["beret", ["סטנדרט"], 90, 10], ["shoulder", ["סטנדרט"], 100, 10], ["badge", ["סטנדרט"], 100, 10]];
const bad = (code: string) => new ConvexError({ code });
async function actor(ctx: any, s: any) { return s.userId ? (await ctx.db.get(s.userId)).username : String(s.cadetId); }
const log = (ctx: any, who: string, action: string, details: string) => ctx.db.insert("activityLogs", { actor: who, action, details, createdAt: Date.now() });

export const cadetsList = query({ args: { token: v.string(), grade: v.optional(gradeV) }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander");
  const rows = a.grade ? await ctx.db.query("cadets").withIndex("by_grade", (q) => q.eq("grade", a.grade!)).collect() : await ctx.db.query("cadets").collect();
  return rows.sort((x, y) => x.lastName.localeCompare(y.lastName, "he")).map((c) => ({ _id: c._id, firstName: c.firstName, lastName: c.lastName,
    idNumber: c.idNumber, grade: c.grade, hasCode: !!c.accessCodeHash, signed: !!c.initialSignedAt })); } });
export const cadetCreate = mutation({ args: { token: v.string(), firstName: v.string(), lastName: v.string(), idNumber: v.string(), grade: gradeV }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); const { token, ...c } = a;
  if (!/^\d{5,9}$/.test(c.idNumber)) throw bad("BAD_ID"); if (!c.firstName.trim() || !c.lastName.trim()) throw bad("BAD_NAME");
  if (await ctx.db.query("cadets").withIndex("by_idNumber", (q) => q.eq("idNumber", c.idNumber)).unique()) throw bad("DUPLICATE");
  const id = await ctx.db.insert("cadets", { ...c, firstName: c.firstName.trim(), lastName: c.lastName.trim(), active: true, createdAt: Date.now() });
  await log(ctx, await actor(ctx, s), "cadet_create", c.idNumber); return id; } });
export const cadetRemove = mutation({ args: { token: v.string(), ids: v.array(v.id("cadets")) }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); if (a.ids.length > 100) throw bad("TOO_MANY");
  for (const id of a.ids) { const c = await ctx.db.get(id); if (!c) continue;
    for (const t of ["sessions", "cadetEquipment"] as const) for (const r of await ctx.db.query(t).withIndex("by_cadet" as any, (q: any) => q.eq(t === "sessions" ? "cadetId" : "cadetId", id)).collect()) await ctx.db.delete(r._id);
    for (const r of await ctx.db.query("requests").withIndex("by_cadet", (q) => q.eq("cadetId", id)).collect()) {
      for (const i of await ctx.db.query("requestItems").withIndex("by_request", (q) => q.eq("requestId", r._id)).collect()) await ctx.db.delete(i._id);
      for (const g of await ctx.db.query("signatures").withIndex("by_request", (q) => q.eq("requestId", r._id)).collect()) await ctx.db.delete(g._id); await ctx.db.delete(r._id); }
    for (const g of await ctx.db.query("signatures").withIndex("by_cadet", (q) => q.eq("cadetId", id)).collect()) await ctx.db.delete(g._id);
    await ctx.db.delete(id); await log(ctx, await actor(ctx, s), "cadet_delete", c.idNumber); } } });
export const cadetMove = mutation({ args: { token: v.string(), ids: v.array(v.id("cadets")), grade: gradeV }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); for (const id of a.ids.slice(0, 100)) await ctx.db.patch(id, { grade: a.grade });
  await log(ctx, await actor(ctx, s), "cadet_move", `${a.ids.length}→${a.grade}`); } });

export const inventoryOverview = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander"); const rows = await ctx.db.query("inventory").collect();
  return rows.map((r) => ({ itemType: r.itemType, size: r.size, quantity: r.quantity, minThreshold: r.minThreshold })); } });
export const inventorySeed = mutation({ args: { token: v.string() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); if ((await ctx.db.query("inventory").take(1)).length) return 0; let n = 0; const now = Date.now();
  for (const [itemType, sizes, quantity, minThreshold] of STOCK) for (const size of sizes) { await ctx.db.insert("inventory", { itemType, size, quantity, minThreshold });
    await ctx.db.insert("inventoryTransactions", { itemType, size, delta: quantity, balanceAfter: quantity, reason: "seed", actor: await actor(ctx, s), createdAt: now }); n++; }
  return n; } });
export const inventoryAdjust = mutation({ args: { token: v.string(), itemType: v.string(), size: v.string(), delta: v.number(), note: v.optional(v.string()) }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); if (!Number.isInteger(a.delta) || Math.abs(a.delta) > 1000) throw bad("BAD_AMOUNT");
  const r = await ctx.db.query("inventory").withIndex("by_item_size", (q) => q.eq("itemType", a.itemType).eq("size", a.size)).unique(); if (!r) throw bad("NOT_FOUND");
  const next = r.quantity + a.delta; if (next < 0) throw bad("NEGATIVE_STOCK"); await ctx.db.patch(r._id, { quantity: next });
  await ctx.db.insert("inventoryTransactions", { itemType: a.itemType, size: a.size, delta: a.delta, balanceAfter: next, reason: a.delta > 0 ? "manual_add" : "manual_remove", actor: await actor(ctx, s), createdAt: Date.now() });
  return next; } });
export const dashboardStats = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander"); const cadets = await ctx.db.query("cadets").collect(), inv = await ctx.db.query("inventory").collect();
  const byGrade: Record<string, number> = {}; for (const g of GRADES) byGrade[g] = cadets.filter((c) => c.grade === g).length;
  const reqs = await ctx.db.query("requests").collect(), st: Record<string, number> = {}; for (const r of reqs) st[r.status] = (st[r.status] ?? 0) + 1;
  return { total: cadets.length, byGrade, requests: st, low: inv.filter((r) => r.quantity <= r.minThreshold).map((r) => ({ itemType: r.itemType, size: r.size, quantity: r.quantity })).slice(0, 30) }; } });
