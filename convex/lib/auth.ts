import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";
export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Identity comes only from a server-side session. Role / ids sent by the browser are never trusted.
export async function requireSession(ctx: QueryCtx, token: string, role?: "commander" | "cadet") {
  const fail = () => new ConvexError({ code: "UNAUTHENTICATED" });
  if (!token) throw fail();
  const tokenHash = await sha256Hex(token);
  const s = await ctx.db.query("sessions").withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash)).unique();
  if (!s || s.revoked || s.expiresAt < Date.now()) throw fail();
  if (role && s.role !== role) throw new ConvexError({ code: "FORBIDDEN" });
  if (s.userId) { const u = await ctx.db.get(s.userId); if (!u || !u.active) throw fail(); }
  if (s.cadetId) { const c = await ctx.db.get(s.cadetId); if (!c || !c.active) throw fail(); }
  return s;
}
