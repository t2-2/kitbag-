// KitbagLoader: size = "sm" | "md" | "lg"; speed multiplier; honours prefers-reduced-motion.
const SIZES = { sm: 56, md: 120, lg: 220 };
export function KitbagLoader({ size = "md", speed = 1, label = true } = {}) {
  const el = document.createElement("div");
  el.className = "kb-loader"; el.setAttribute("role", "status"); el.setAttribute("aria-label", "טוען");
  const box = document.createElement("div"); const px = SIZES[size] ?? SIZES.md;
  box.style.cssText = `width:${px}px;height:${px}px`; el.append(box);
  if (label && size !== "sm") {
    const w = document.createElement("div"); w.className = "kb-word"; w.textContent = "KITBAG+";
    w.style.fontSize = px / 5 + "px"; el.append(w);
  }
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  fetch("assets/kitbag-loader.json").then((r) => r.json()).then((data) => {
    const a = lottie.loadAnimation({ container: box, renderer: "svg", loop: !still, autoplay: !still, animationData: data });
    a.setSpeed(speed); if (still) a.goToAndStop(120, true);
  }).catch(() => {});
  return el;
}
