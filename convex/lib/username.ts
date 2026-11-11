// שם משתמש לשוחר: 2 אותיות + 4 ספרות (למשל kx4821). לא סודי; הסוד הוא קוד ה-OTP.
// שמות ישנים בפורמט עם 128 (kx1284821) ממשיכים לעבוד.
const L = "abcdefghjkmnpqrstuvwxyz";
export const USERNAME_RE = /^[a-z]{2}(128)?\d{4}$/;
export async function genUsername(ctx: any): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const u = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!(await ctx.db.query("cadets").withIndex("by_username", (q: any) => q.eq("username", u)).unique())) return u;
  }
  throw new Error("USERNAME_EXHAUSTED");
}
