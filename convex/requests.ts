import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSession } from "./lib/auth";
const bad = (c: string) => new ConvexError({ code: c });
const TYPES = ["kitbag", "shirt", "pants", "shoes", "jacket", "belt", "beret", "shoulder", "badge"];
const itemV = v.object({ itemType: v.string(), size: v.string(), quantity: v.number(), reason: v.string() });
const row = (ctx: any, t: string, s: string) => ctx.db.query("inventory").withIndex("by_item_size", (q: any) => q.eq("itemType", t).eq("size", s)).unique();
const cadetOf = async (ctx: any, token: string) => { const s = await requireSession(ctx, token, "cadet"); return { s, c: (await ctx.db.get(s.cadetId!))! }; };
const log = (ctx: any, actor: string, action: string, details: string) => ctx.db.insert("activityLogs", { actor, action, details, createdAt: Date.now() });
const note = (ctx: any, cadetId: any, title: string, body: string) => ctx.db.insert("notifications", { cadetId, forCommanders: !cadetId, title, body, read: false, createdAt: Date.now() });

export const catalog = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token); const out: Record<string, string[]> = {};
  for (const r of await ctx.db.query("inventory").collect()) (out[r.itemType] ??= []).push(r.size); return out; } });

export const create = mutation({ args: { token: v.string(), kind: v.union(v.literal("replace"), v.literal("receive")), items: v.array(itemV), key: v.string() }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token);
  const dup = await ctx.db.query("requests").withIndex("by_cadet_key", (q) => q.eq("cadetId", c._id).eq("idempotencyKey", a.key)).unique(); if (dup) return dup._id;
  if (!a.items.length || a.items.length > 10) throw bad("BAD_ITEMS");
  for (const i of a.items) { if (!TYPES.includes(i.itemType) || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 5 || !(await row(ctx, i.itemType, i.size))) throw bad("BAD_ITEMS"); }
  const id = await ctx.db.insert("requests", { cadetId: c._id, kind: a.kind, status: "pending", idempotencyKey: a.key, createdAt: Date.now() });
  for (const i of a.items) await ctx.db.insert("requestItems", { requestId: id, itemType: i.itemType, size: i.size, quantity: i.quantity, reason: i.reason.slice(0, 200) });
  await note(ctx, undefined, "בקשה חדשה", `${c.lastName} ${c.firstName}`); await log(ctx, c.idNumber, "request_create", id); return id; } });

export const cancel = mutation({ args: { token: v.string(), requestId: v.id("requests") }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token); const r = await ctx.db.get(a.requestId);
  if (!r || r.cadetId !== c._id || r.status !== "pending") throw bad("BAD_STATE"); await ctx.db.patch(r._id, { status: "cancelled" }); await log(ctx, c.idNumber, "request_cancel", r._id); } });

const withItems = async (ctx: any, r: any) => (await ctx.db.query("requestItems").withIndex("by_request", (q: any) => q.eq("requestId", r._id)).collect())
  .map((i: any) => ({ id: i._id, itemType: i.itemType, size: i.size, quantity: i.quantity, reason: i.reason, approvedSize: i.approvedSize, approvedQty: i.approvedQty }));
export const mine = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token); const rs = (await ctx.db.query("requests").withIndex("by_cadet", (q) => q.eq("cadetId", c._id)).collect()).sort((x, y) => y.createdAt - x.createdAt);
  return Promise.all(rs.map(async (r) => ({ _id: r._id, kind: r.kind, status: r.status, note: r.commanderNote, createdAt: r.createdAt, items: await withItems(ctx, r) }))); } });
export const all = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  await requireSession(ctx, a.token, "commander"); const rs = (await ctx.db.query("requests").collect()).sort((x, y) => y.createdAt - x.createdAt).slice(0, 150);
  return Promise.all(rs.map(async (r) => { const c = await ctx.db.get(r.cadetId); const items = await withItems(ctx, r);
    for (const i of items) i.stock = (await row(ctx, i.itemType, i.approvedSize ?? i.size))?.quantity ?? 0;
    return { _id: r._id, cadet: c ? `${c.lastName} ${c.firstName}` : "?", grade: c?.grade, kind: r.kind, status: r.status, note: r.commanderNote, createdAt: r.createdAt, items }; })); } });

export const decide = mutation({ args: { token: v.string(), requestId: v.id("requests"), approve: v.boolean(), note: v.optional(v.string()),
  items: v.array(v.object({ id: v.id("requestItems"), size: v.string(), qty: v.number() })) }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); const r = await ctx.db.get(a.requestId); if (!r || r.status !== "pending") throw bad("BAD_STATE");
  if (a.approve) for (const i of a.items) { const it = await ctx.db.get(i.id); if (!it || it.requestId !== r._id) throw bad("BAD_ITEMS");
    const inv = await row(ctx, it.itemType, i.size); if (!inv || !Number.isInteger(i.qty) || i.qty < 1 || i.qty > 5) throw bad("BAD_ITEMS"); if (inv.quantity < i.qty) throw bad("NO_STOCK");
    await ctx.db.patch(i.id, { approvedSize: i.size, approvedQty: i.qty }); }
  const who = (await ctx.db.get(s.userId!))!.username;
  await ctx.db.patch(r._id, { status: a.approve ? "approved" : "rejected", commanderNote: a.note?.slice(0, 300), decidedBy: who, decidedAt: Date.now() });
  await note(ctx, r.cadetId, a.approve ? "הבקשה אושרה" : "הבקשה נדחתה", a.note ?? ""); await log(ctx, who, a.approve ? "request_approve" : "request_reject", r._id); } });
export const ready = mutation({ args: { token: v.string(), requestId: v.id("requests") }, handler: async (ctx, a) => {
  const s = await requireSession(ctx, a.token, "commander"); const r = await ctx.db.get(a.requestId); if (!r || r.status !== "approved") throw bad("BAD_STATE");
  await ctx.db.patch(r._id, { status: "awaiting_signature" }); await note(ctx, r.cadetId, "הציוד מוכן", "יש לחתום על קבלת הציוד"); await log(ctx, (await ctx.db.get(s.userId!))!.username, "request_ready", r._id); } });

const okImg = (img: string) => /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img) && img.length > 400 && img.length < 300_000;
export const sign = mutation({ args: { token: v.string(), requestId: v.id("requests"), image: v.string() }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token); const r = await ctx.db.get(a.requestId); if (!okImg(a.image)) throw bad("BAD_SIGNATURE");
  if (!r || r.cadetId !== c._id || r.status !== "awaiting_signature") throw bad("BAD_STATE");
  const now = Date.now(), held = await ctx.db.query("cadetEquipment").withIndex("by_cadet", (q) => q.eq("cadetId", c._id)).collect();
  for (const i of await ctx.db.query("requestItems").withIndex("by_request", (q) => q.eq("requestId", r._id)).collect()) {
    const size = i.approvedSize ?? i.size, qty = i.approvedQty ?? i.quantity, inv = await row(ctx, i.itemType, size);
    if (!inv || inv.quantity < qty) throw bad("NO_STOCK");
    await ctx.db.patch(inv._id, { quantity: inv.quantity - qty });
    await ctx.db.insert("inventoryTransactions", { itemType: i.itemType, size, delta: -qty, balanceAfter: inv.quantity - qty, reason: "issue", actor: c.idNumber, requestId: r._id, createdAt: now });
    if (r.kind === "replace") { let left = qty; for (const h of held.filter((x) => x.itemType === i.itemType && x.size !== size)) { const d = Math.min(left, h.quantity); if (d > 0) { await ctx.db.patch(h._id, { quantity: h.quantity - d }); h.quantity -= d; left -= d; } } }
    const same = held.find((x) => x.itemType === i.itemType && x.size === size);
    if (same) { await ctx.db.patch(same._id, { quantity: same.quantity + qty }); same.quantity += qty; } else held.push({ _id: await ctx.db.insert("cadetEquipment", { cadetId: c._id, itemType: i.itemType, size, quantity: qty }) } as any);
  }
  await ctx.db.insert("signatures", { cadetId: c._id, kind: "request", requestId: r._id, image: a.image, signedAt: now });
  await ctx.db.patch(r._id, { status: "completed", completedAt: now }); await log(ctx, c.idNumber, "request_sign", r._id); } });

export const signInitial = mutation({ args: { token: v.string(), image: v.string() }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token); if (c.initialSignedAt) throw bad("BAD_STATE"); if (!okImg(a.image)) throw bad("BAD_SIGNATURE"); const now = Date.now();
  const kit: [string, string, number][] = [["shirt", c.shirtSize ?? "—", 3], ["pants", c.pantsSize ?? "—", 3], ["shoes", c.shoeSize ?? "—", 1], ["belt", "סטנדרט", 1], ["beret", "סטנדרט", 1], ["shoulder", "סטנדרט", 1], ["badge", "סטנדרט", 1], ["kitbag", "סטנדרט", 1]];
  for (const [itemType, size, quantity] of kit) await ctx.db.insert("cadetEquipment", { cadetId: c._id, itemType, size, quantity });
  await ctx.db.insert("signatures", { cadetId: c._id, kind: "initial", image: a.image, signedAt: now }); await ctx.db.patch(c._id, { initialSignedAt: now }); await log(ctx, c.idNumber, "sign_initial", c._id); } });
export const cadetHome = query({ args: { token: v.string() }, handler: async (ctx, a) => {
  const { c } = await cadetOf(ctx, a.token); const eq = await ctx.db.query("cadetEquipment").withIndex("by_cadet", (q) => q.eq("cadetId", c._id)).collect();
  const ns = (await ctx.db.query("notifications").withIndex("by_cadet", (q) => q.eq("cadetId", c._id)).collect()).sort((x, y) => y.createdAt - x.createdAt).slice(0, 5);
  return { name: c.firstName, grade: c.grade, signed: !!c.initialSignedAt, sizes: { shirt: c.shirtSize, pants: c.pantsSize, shoes: c.shoeSize, jacket: c.jacketSize },
    equipment: eq.filter((e) => e.quantity > 0).map((e) => ({ itemType: e.itemType, size: e.size, quantity: e.quantity })), notes: ns.map((n) => ({ title: n.title, body: n.body, at: n.createdAt })) }; } });
