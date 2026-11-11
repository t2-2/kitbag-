// מחיקת שוחר עם כל הנתונים שלו (שימוש: מחיקה ידנית וקידום שנתי). מחזיר את שם המשתמש שנמחק.
export async function deleteCadetCascade(ctx: any, id: any): Promise<string | null> {
  const c = await ctx.db.get(id); if (!c) return null;
  const del = async (table: string, index: string, field: string, val: any) => {
    for (const r of await ctx.db.query(table).withIndex(index, (q: any) => q.eq(field, val)).collect()) await ctx.db.delete(r._id);
  };
  for (const t of ["sessions", "cadetEquipment", "otps", "notifications", "signatures"]) await del(t, "by_cadet", "cadetId", id);
  for (const r of await ctx.db.query("requests").withIndex("by_cadet", (q: any) => q.eq("cadetId", id)).collect()) {
    await del("requestItems", "by_request", "requestId", r._id); await del("signatures", "by_request", "requestId", r._id); await ctx.db.delete(r._id);
  }
  await ctx.db.delete(id); return c.username ?? String(id);
}
