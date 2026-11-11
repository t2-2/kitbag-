// קידום שנתי ב-1 בספטמבר: י״ב נמחקים, י״א→י״ב, י→י״א, ט→י. רץ בשלבים קטנים כדי לא לעבור את מגבלות Convex.
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { deleteCadetCascade } from "./lib/cadets";
const getS = (ctx: any, key: string) => ctx.db.query("systemSettings").withIndex("by_key", (q: any) => q.eq("key", key)).unique();
export const putS = async (ctx: any, key: string, value: any) => { const r = await getS(ctx, key); if (r) await ctx.db.patch(r._id, { value }); else await ctx.db.insert("systemSettings", { key, value }); };
export const getSetting = async (ctx: any, key: string) => (await getS(ctx, key))?.value;
const ORDER = ["יב", "יא", "י", "ט"] as const;
const NEXT: Record<string, string> = { "יא": "יב", "י": "יא", "ט": "י" };
const logSys = (ctx: any, action: string, details: string) => ctx.db.insert("activityLogs", { actor: "system", action, details, createdAt: Date.now() });
export const start = internalMutation({ args: {}, handler: async (ctx) => {
  if ((await getSetting(ctx, "promotionEnabled")) === false) return;
  const year = new Date().getUTCFullYear(); const last = await getSetting(ctx, "promotionLastYear");
  if ((last ?? 0) >= year || (await getS(ctx, "promotionRun"))) return;
  await putS(ctx, "promotionRun", { year, step: 0 }); await logSys(ctx, "promotion_start", String(year));
  await ctx.scheduler.runAfter(0, internal.promote.step, {}); } });
export const step = internalMutation({ args: {}, handler: async (ctx) => {
  const run = await getS(ctx, "promotionRun"); if (!run) return; const { year, step: i } = run.value as { year: number; step: number }; const g = ORDER[i];
  const rows = await ctx.db.query("cadets").withIndex("by_grade", (q) => q.eq("grade", g)).take(g === "יב" ? 15 : 150);
  if (rows.length) {
    for (const c of rows) { if (g === "יב") { const u = await deleteCadetCascade(ctx, c._id); await logSys(ctx, "promotion_delete", u ?? ""); } else await ctx.db.patch(c._id, { grade: NEXT[g] as any }); }
    await ctx.scheduler.runAfter(0, internal.promote.step, {}); return;
  }
  if (i + 1 < ORDER.length) { await putS(ctx, "promotionRun", { year, step: i + 1 }); await ctx.scheduler.runAfter(0, internal.promote.step, {}); return; }
  await putS(ctx, "promotionLastYear", year); await ctx.db.delete(run._id); await logSys(ctx, "promotion_done", String(year)); } });
