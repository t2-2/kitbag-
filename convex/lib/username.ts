// שם משתמש לשוחר: 2 אותיות + 128 + 4 ספרות (למשל kx1284821). לא סודי; הסוד הוא קוד ה-OTP.
const L = "abcdefghjkmnpqrstuvwxyz";
export const USERNAME_RE = /^[a-z]{2}128\d{4}$/;
export async function genUsername(ctx: any): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const u = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)] + "128" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    if (!(await ctx.db.query("cadets").withIndex("by_username", (q: any) => q.eq("username", u)).unique())) return u;
  }
  throw new Error("USERNAME_EXHAUSTED");
}
