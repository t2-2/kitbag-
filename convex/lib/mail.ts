// תבניות מייל: אותו סגנון כמו האפליקציה (מנטה #CCF8F7, טורקיז #0E7C7B, לוגו). APP_URL = כתובת האתר ב-Vercel.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
function shell(inner: string) {
  const url = (process.env.APP_URL || "").replace(/\/+$/, "");
  const logo = url ? `<img src="${url}/logo.png" width="84" height="84" alt="" style="display:block;margin:0 auto 6px;border:0">` : "";
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#F4FFFE;font-family:Arial,Helvetica,sans-serif;color:#0E1A2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4FFFE;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #D5EEEC;border-radius:24px;overflow:hidden">
<tr><td align="center" style="background:#CCF8F7;padding:26px 16px 18px">${logo}<div style="font-size:28px;font-weight:800;letter-spacing:1px;color:#0E1A2B">KITBAG<span style="color:#0E7C7B">+</span></div><div style="font-size:13px;color:#0E7C7B;margin-top:2px">ניהול ציוד אישי ולוגיסטיקה</div></td></tr>
<tr><td style="padding:28px 28px 10px;font-size:16px;line-height:1.6">${inner}</td></tr>
<tr><td align="center" style="padding:14px 16px 22px;color:#8AA3A2;font-size:11px;letter-spacing:2px">MADE BY GUY REVIVO</td></tr>
</table></td></tr></table></body></html>`;
}
const btn = (href: string, label: string) => href ? `<p style="text-align:center;margin:22px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#0E7C7B;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 30px;border-radius:14px">${label}</a></p>` : "";
export function welcomeHtml(p: { name: string; username: string }) {
  const url = process.env.APP_URL || "";
  return shell(`<h2 style="margin:0 0 8px;font-size:22px">ברוך הבא, ${esc(p.name)} 👋</h2>
<p style="margin:0 0 16px;color:#4a5b6b">נרשמת למערכת KITBAG+. זה שם המשתמש האישי שלך. תצטרך אותו בכל כניסה:</p>
<p style="text-align:center;margin:18px 0"><span dir="ltr" style="display:inline-block;background:#CCF8F7;border:2px solid #0E7C7B;border-radius:16px;padding:14px 26px;font-size:30px;font-weight:800;letter-spacing:3px;font-family:Consolas,Menlo,monospace;color:#0E1A2B">${esc(p.username)}</span></p>
<p style="margin:0 0 6px;color:#4a5b6b"><b>איך נכנסים?</b><br>1. מזינים את שם המשתמש באתר<br>2. מקבלים קוד בן 6 ספרות למייל הזה<br>3. מזינים את הקוד והכניסה מתבצעת</p>${btn(url, "כניסה ל-KITBAG+")}
<p style="margin:16px 0 0;color:#8AA3A2;font-size:13px">שמור את המייל הזה. אפשר לבקש מהמפקד לשלוח אותו שוב.</p>`);
}
export function otpHtml(p: { code: string; name: string }) {
  const cells = p.code.split("").map((d) => `<td align="center" width="44" height="54" style="width:44px;height:54px;background:#CCF8F7;border:2px solid #0E7C7B;border-radius:12px;font-size:26px;font-weight:800;font-family:Consolas,Menlo,monospace;color:#0E1A2B">${esc(d)}</td><td width="6"></td>`).join("");
  return shell(`<h2 style="margin:0 0 8px;font-size:22px">היי ${esc(p.name)}, קוד הכניסה שלך</h2>
<p style="margin:0 0 18px;color:#4a5b6b">הזן את הקוד באתר כדי להיכנס:</p>
<table role="presentation" dir="ltr" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 18px"><tr>${cells}</tr></table>
<p style="margin:0;color:#4a5b6b;text-align:center">הקוד תקף ל-<b>10 דקות</b> ואפשר להשתמש בו פעם אחת.</p>
<p style="margin:14px 0 0;color:#8AA3A2;font-size:13px;text-align:center">לא ביקשת להיכנס? אפשר להתעלם מהמייל, אף אחד לא נכנס בלעדיו.</p>`);
}
