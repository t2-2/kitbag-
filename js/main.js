import { ConvexClient } from "https://esm.sh/convex@1.17.4/browser";
import { makeFunctionReference } from "https://esm.sh/convex@1.17.4/server";
import { CONVEX_URL } from "./config.js";
import { KitbagLoader } from "./loader.js";
const root = document.getElementById("app");
const ref = (n) => makeFunctionReference(n);
let token = null; // memory only: no localStorage/sessionStorage by design
const show = (...n) => root.replaceChildren(...n);
function boot() {
  show(Object.assign(document.createElement("div"), { className: "center" }));
  root.firstChild.append(KitbagLoader({ size: "lg" }));
  if (!CONVEX_URL) { root.firstChild.replaceChildren("הגדר CONVEX_URL ב-js/config.js"); return; }
  const client = new ConvexClient(CONVEX_URL);
  setTimeout(() => loginView(client), 900);
}
function loginView(client) {
  let mode = "commander";
  const card = document.createElement("form"); card.className = "card"; card.style.width = "min(380px,100%)";
  const draw = () => {
    card.innerHTML = `<h2 style="margin:0 0 12px">קיטבג+</h2>
    <div class="tabs"><button type="button" data-m="commander" class="${mode === "commander" ? "on" : ""}">מפקד</button>
    <button type="button" data-m="cadet" class="${mode === "cadet" ? "on" : ""}">שוחר</button></div>
    <input name="a" autocomplete="username" placeholder="${mode === "commander" ? "שם משתמש" : "תעודת זהות"}" required>
    <input name="b" type="password" autocomplete="current-password" placeholder="${mode === "commander" ? "סיסמה" : "קוד אישי"}" required>
    <p class="err" role="alert"></p><button style="width:100%">כניסה</button>`;
    card.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { mode = b.dataset.m; draw(); }));
  };
  draw();
  card.onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(card), btn = card.querySelector("button:last-child");
    if (btn.disabled) return; btn.disabled = true;
    try {
      const r = mode === "commander"
        ? await client.action(ref("authNode:loginCommander"), { username: f.get("a"), password: f.get("b") })
        : await client.action(ref("authNode:loginCadet"), { idNumber: f.get("a"), code: f.get("b") });
      token = r.token; show(KitbagLoader({ size: "md" })); // next: mount commander / cadet app with `token`
    } catch (err) {
      const c = err?.data?.code; card.querySelector(".err").textContent = c === "LOCKED" ? "יותר מדי ניסיונות, נסה מאוחר יותר" : "פרטי התחברות שגויים";
      btn.disabled = false;
    }
  };
  const w = document.createElement("div"); w.className = "center"; w.append(card); show(w);
}
boot();
