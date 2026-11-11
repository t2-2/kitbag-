import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSession } from "./lib/auth";
import { genUsername } from "./lib/username";
import { deleteCadetCascade } from "./lib/cadets";
import { getSetting, putS } from "./promote";
const GRADES = ["ט", "י", "יא", "יב"];
const gradeV = v.union(v.literal("ט"), v.literal("י"), v.literal("יא"), v.literal("יב"));
const range = (a: number, b: number, s = 2) => { const r: string[] = []; for (let i = a; i <= b; i += s) r.push(String(i)); return r; };
const STOCK: [string, string[], number, number][] = [["kitbag", ["סטנדרט"], 60, 10], ["shirt", ["ק׳", "ב׳", "ג׳", "מ׳", "ממ׳", "מממ׳"], 25, 5],
  ["pants", range(36, 66), 8, 2], ["shoes", range(35, 48, 1), 6, 2], ["jacket", ["S", "M", "L", "XL", "XXL", "XXXL"], 10, 3],
  ["belt", ["סטנדרט"], 80, 10], ["beret", ["סטנדרט"], 90, 10], ["shoulder", ["סטנדרט"], 100, 10], ["badge", ["סטנדרט"], 100, 10]];
const bad = (code: string) => new ConvexError({ code });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const emailTaken = (ctx: any, e: string) => ctx.db.query("cadets").withIndex("by_email", (q: any) => q.eq("email", e)).unique();
async function actor(ctx: any, s: any) { return s.userId ? (await ctx.db.get(s.userId)).username : String(s.cadetId); }
const log = (ctx: any, who: string, action: string, details: string) => ctx.db.insert("activityLogs", { actor: who, action, details, createdAt: Date.now() });

export const cadetsList = query({ args: { token: v.string(), grade: v.optional(gradeV) }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander");
  const rows = a.grade ? await ctx.db.query("cadets").withIndex("by_grade", (q) => q.eq("grade", a.grade!)).collect() : await ctx.db.query("cadets").collect();
  return rows.sort((x, y) => x.lastName.localeCompare(y.lastName, "he")).map((c) => ({ _id: c._id, firstName: c.firstName, lastName: c.lastName, username: c.username, email: c.email, grade: c.grade, signed: !!c.initialSignedAt, mailed: !!c.usernameSentAt })); } });
export const cadetRemove = mutation({ args: { token: v.string(), ids: v.array(v.id("cadets")) }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); if (a.ids.length > 100) throw bad("TOO_MANY");
  for (const id of a.ids) { const u = await deleteCadetCascade(ctx, id); if (u) await log(ctx, await actor(ctx, s), "cadet_delete", u); } } });
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
  const GK: Record<string, string> = { "ט": "g9", "י": "g10", "יא": "g11", "יב": "g12" }; // מפתחות אובייקט ב-Convex חייבים להיות ASCII
  const byGrade: Record<string, number> = {}; for (const g of GRADES) byGrade[GK[g]] = cadets.filter((c) => c.grade === g).length;
  const reqs = await ctx.db.query("requests").collect(), st: Record<string, number> = {}; for (const r of reqs) st[r.status] = (st[r.status] ?? 0) + 1;
  return { inv: inv.length, total: cadets.length, byGrade, requests: st, low: inv.filter((r) => r.quantity <= r.minThreshold).map((r) => ({ itemType: r.itemType, size: r.size, quantity: r.quantity })).slice(0, 30) }; } });

// ---------- שלב 3: עריכה, תיק שוחר, ייבוא, יומן, התראות ----------
const SIZE_FIELDS: Record<string, string> = { shirtSize: "shirt", pantsSize: "pants", shoeSize: "shoes", jacketSize: "jacket" };
const normGrade = (g: unknown) => { const s = String(g ?? "").replace(/[׳'"״\s]/g, ""); return ({ "ט": "ט", "9": "ט", "י": "י", "10": "י", "יא": "יא", "11": "יא", "יב": "יב", "12": "יב" } as Record<string, string>)[s]; };
const hasSize = (ctx: any, t: string, s: string) => ctx.db.query("inventory").withIndex("by_item_size", (q: any) => q.eq("itemType", t).eq("size", s)).unique();
export const cadetUpdate = mutation({ args: { token: v.string(), id: v.id("cadets"), firstName: v.string(), lastName: v.string(), email: v.string(), grade: gradeV,
  shirtSize: v.optional(v.string()), pantsSize: v.optional(v.string()), shoeSize: v.optional(v.string()), jacketSize: v.optional(v.string()), note: v.optional(v.string()) }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); const c = await ctx.db.get(a.id); if (!c) throw bad("NOT_FOUND");
  if (!a.firstName.trim() || !a.lastName.trim()) throw bad("BAD_NAME");
  const em = normEmail(a.email); if (!EMAIL_RE.test(em)) throw bad("BAD_EMAIL");
  if (em !== c.email) { const t: any = await emailTaken(ctx, em); if (t && t._id !== c._id) throw bad("DUPLICATE_EMAIL"); }
  const patch: any = { email: em, firstName: a.firstName.trim(), lastName: a.lastName.trim(), grade: a.grade, commanderNote: a.note?.slice(0, 500) || undefined };
  if (em !== c.email) patch.usernameSentAt = undefined;
  for (const [f, t] of Object.entries(SIZE_FIELDS)) { const val = (a as any)[f]; if (val) { if (!(await hasSize(ctx, t, val))) throw bad("BAD_SIZE"); patch[f] = val; } else patch[f] = undefined; }
  await ctx.db.patch(a.id, patch); await log(ctx, await actor(ctx, s), "cadet_update", c.username ?? String(c._id)); } });
export const cadetGet = query({ args: { token: v.string(), id: v.id("cadets") }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander"); const c = await ctx.db.get(a.id); if (!c) return null;
  const equipment = (await ctx.db.query("cadetEquipment").withIndex("by_cadet", (q) => q.eq("cadetId", a.id)).collect()).filter((e) => e.quantity > 0).map((e) => ({ itemType: e.itemType, size: e.size, quantity: e.quantity }));
  const reqs = (await ctx.db.query("requests").withIndex("by_cadet", (q) => q.eq("cadetId", a.id)).collect()).sort((x, y) => y.createdAt - x.createdAt);
  const requests = await Promise.all(reqs.map(async (r) => ({ kind: r.kind, status: r.status, createdAt: r.createdAt, items: (await ctx.db.query("requestItems").withIndex("by_request", (q) => q.eq("requestId", r._id)).collect()).map((i) => ({ itemType: i.itemType, size: i.approvedSize ?? i.size, quantity: i.approvedQty ?? i.quantity })) })));
  const signatures = (await ctx.db.query("signatures").withIndex("by_cadet", (q) => q.eq("cadetId", a.id)).collect()).map((g) => ({ _id: g._id, kind: g.kind, signedAt: g.signedAt }));
  return { _id: c._id, firstName: c.firstName, lastName: c.lastName, username: c.username, email: c.email, grade: c.grade, shirtSize: c.shirtSize, pantsSize: c.pantsSize, shoeSize: c.shoeSize, jacketSize: c.jacketSize, note: c.commanderNote, createdAt: c.createdAt, equipment, requests, signatures }; } });
export const signatureImage = query({ args: { token: v.string(), id: v.id("signatures") }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander"); return (await ctx.db.get(a.id))?.image ?? null; } });

const rowsV = v.array(v.object({ firstName: v.string(), lastName: v.string(), grade: v.string(), email: v.string() }));
async function checkRows(ctx: any, rows: any[]) {
  if (rows.length > 500) throw bad("TOO_MANY"); const seenE = new Set<string>(), out: any[] = [];
  for (const r of rows) { const row = { firstName: r.firstName.trim(), lastName: r.lastName.trim(), grade: normGrade(r.grade) as any, email: normEmail(r.email) }; let error = "";
    if (!row.firstName || !row.lastName) error = "חסר שם"; else if (!row.grade) error = "שכבה לא מזוהה"; else if (!EMAIL_RE.test(row.email)) error = "מייל לא תקין";
    else if (seenE.has(row.email)) error = "מייל כפול בקובץ"; else if (await emailTaken(ctx, row.email)) error = "המייל כבר קיים";
    seenE.add(row.email); out.push({ row, error }); }
  return out; }
export const importPreview = query({ args: { token: v.string(), rows: rowsV }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander"); return checkRows(ctx, a.rows); } });
export const importCommit = mutation({ args: { token: v.string(), rows: rowsV }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); let n = 0;
  for (const { row, error } of await checkRows(ctx, a.rows)) if (!error) { await ctx.db.insert("cadets", { ...row, username: await genUsername(ctx), active: true, createdAt: Date.now() }); n++; }
  await log(ctx, await actor(ctx, s), "import", `${n}/${a.rows.length}`); return { inserted: n, skipped: a.rows.length - n }; } });
export const logsList = query({ args: { token: v.string() }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander");
  return (await ctx.db.query("activityLogs").withIndex("by_createdAt").order("desc").take(200)).map((l) => ({ actor: l.actor, action: l.action, details: l.details, at: l.createdAt })); } });
export const notifList = query({ args: { token: v.string() }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander");
  const all = (await ctx.db.query("notifications").collect()).filter((n) => n.forCommanders).sort((x, y) => y.createdAt - x.createdAt);
  return { unread: all.filter((n) => !n.read).length, items: all.slice(0, 8).map((n) => ({ title: n.title, body: n.body, at: n.createdAt, read: n.read })) }; } });
export const notifRead = mutation({ args: { token: v.string() }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander");
  for (const n of await ctx.db.query("notifications").collect()) if (n.forCommanders && !n.read) await ctx.db.patch(n._id, { read: true }); } });
export const thresholdSet = mutation({ args: { token: v.string(), itemType: v.string(), size: v.string(), min: v.number() }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander"); const r = await hasSize(ctx, a.itemType, a.size); if (!r || a.min < 0 || a.min > 1000) throw bad("BAD_AMOUNT"); await ctx.db.patch(r._id, { minThreshold: Math.floor(a.min) }); } });

export const promotionStatus = query({ args: { token: v.string() }, handler: async (ctx, a) => { await requireSession(ctx, a.token, "commander");
  return { enabled: (await getSetting(ctx, "promotionEnabled")) !== false, lastYear: (await getSetting(ctx, "promotionLastYear")) ?? null }; } });
export const promotionSet = mutation({ args: { token: v.string(), enabled: v.boolean() }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); await putS(ctx, "promotionEnabled", a.enabled); await log(ctx, await actor(ctx, s), a.enabled ? "promotion_enable" : "promotion_disable", ""); } });
