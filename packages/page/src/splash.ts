// The loading splash lives in index.html so it paints before app.js runs; this only takes it down.

const MIN_SHOW_MS = 1200;
const shownAt = performance.now();
let hidden = false;

/** Fades the splash out once it has been up at least MIN_SHOW_MS, then removes it. Safe to call repeatedly. */
export function hideSplash(): void {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById("splash");
  if (!el) return;
  setTimeout(() => {
    el.classList.add("splash-out");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  }, Math.max(0, MIN_SHOW_MS - (performance.now() - shownAt)));
}
