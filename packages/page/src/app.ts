// LazyCop — retro tactical mission interface. Entry point: renders the screens, routes clicks
// and forms to the server, and folds the server's event stream into the view.
import type { SseEvent } from "@lazycops/contracts";
import { currentCard } from "./view.js";
import { disconnected, reduceSquad } from "./squad-view.js";
import { esc, focusedAgent, onRender, post, refocus, secondsLeft, ui } from "./page-state.js";
import { renderBriefingScreen } from "./briefing-screen.js";
import { renderMissionScreen } from "./mission-screen.js";
import { countdownHtml } from "./battle-overlays.js";
import { renderPanels } from "./panels.js";
import { attachMap, onPickAgent, updateMap } from "./map-canvas.js";
import { onAssetsChanged } from "./map-assets.js";

const root = document.getElementById("app")!;

function render(): void {
  // Preserve input values and focus across renders
  const kept = new Map<string, string | boolean>();
  root.querySelectorAll<HTMLInputElement>("[data-keep]").forEach((el) =>
    kept.set(el.dataset.keep!, el.type === "checkbox" ? el.checked : el.value)
  );
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.keep;

  // Auto-enter the mission when a task starts, and stay for its wrap-up once it ends
  // until the developer goes back to the briefing.
  const { view } = ui;
  if (!view.ended) ui.leftEnded = false;
  if (view.task !== null && !ui.leftEnded) ui.inMission = true;
  if (view.task === null) ui.inMission = false;

  const noticeHtml = ui.notice ? `<p class="notice-bar">${esc(ui.notice)}</p>` : "";
  root.innerHTML = noticeHtml + (ui.inMission ? renderMissionScreen() : renderBriefingScreen()) + renderPanels();
  updateMap(ui.squad, focusedAgent()?.id);
  attachMap(root.querySelector<HTMLElement>(".map-host"));

  root.querySelectorAll<HTMLInputElement>("[data-keep]").forEach((el) => {
    const v = kept.get(el.dataset.keep!);
    if (typeof v === "boolean") el.checked = v;
    else if (typeof v === "string") el.value = v;
  });
  if (focused) root.querySelector<HTMLElement>(`[data-keep="${focused}"]`)?.focus();
}
onRender(render);

/** Shows another agent; the screens, the HUD's hold and new messages then act on it. */
function focusOn(agent: string): void {
  ui.focus = agent;
  refocus();
  render();
}
onPickAgent(focusOn);
onAssetsChanged(render);

// ── Event delegation ─────────────────────────────────────────
function answer(card: string, pick: string, text?: string): void {
  void post("/answer", { card, pick, ...(text ? { text } : {}) });
}

root.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("button, [data-enter-mission], [data-to-briefing]");
  if (!el) return;

  if (el.dataset.hold !== undefined)         { void post("/hold", { on: !ui.view.hold, agent: focusedAgent()?.id }); return; }
  if (el.dataset.logToggle !== undefined)    { ui.logOpen = !ui.logOpen; render(); return; }
  if (el.dataset.histToggle !== undefined)   { ui.histOpen = !ui.histOpen; render(); return; }
  if (el.dataset.enterMission !== undefined) { ui.inMission = true; render(); return; }
  if (el.dataset.toBriefing !== undefined)   { ui.inMission = false; ui.leftEnded = ui.view.ended; render(); return; }
  if (el.dataset.agent !== undefined)        { focusOn(el.dataset.agent); return; }

  const { card, pick, text } = el.dataset;
  if (!card || !pick) return;
  if (pick === "other") {
    const form = root.querySelector<HTMLFormElement>(`[data-other="${card}"]`)!;
    form.hidden = false;
    form.querySelector("input")!.focus();
    return;
  }
  answer(card, pick, pick === "ask_why" ? undefined : text);
});

root.addEventListener("toggle", (e) => {
  if ((e.target as HTMLElement).dataset.earlier !== undefined) earlierOpen = (e.target as HTMLDetailsElement).open;
}, true);

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const input = form.querySelector<HTMLInputElement>('input[name="text"]')!;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (form.dataset.other)   { answer(form.dataset.other, "other", text); return; }
  if (form.dataset.thread)  { void post("/queue", { text, card: form.dataset.thread }); return; }
  if (form.dataset.compose !== undefined) {
    const urgent = form.querySelector<HTMLInputElement>('input[name="urgent"]')?.checked ?? false;
    void post("/queue", { text, channel: urgent ? "block" : "context", agent: focusedAgent()?.id });
  }
});

// Keyboard: 1/2/3 pick battle options
document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const n = Number(e.key);
  if (ui.view.ended || !currentCard(ui.view) || !Number.isInteger(n) || n < 1) return;
  root.querySelectorAll<HTMLButtonElement>("#battle-overlay .option")[n - 1]?.click();
});

// Live countdown tick (no full re-render)
setInterval(() => {
  const now = currentCard(ui.view);
  const cdWrap = now && root.querySelector(`[data-countdown="${now.card.id}"] .cd-wrap`);
  if (cdWrap) cdWrap.innerHTML = countdownHtml(now, "battle-cd");
  const left = root.querySelector("[data-left]");
  if (left) left.textContent = `${secondsLeft(ui.view.waiting?.until)}s`;
}, 1000);

// SSE stream
const stream = new EventSource("/stream");
stream.onmessage = (e) => {
  try { ui.squad = reduceSquad(ui.squad, JSON.parse(e.data) as SseEvent); }
  catch { ui.notice = "Got an event LazyCop's page could not read"; }
  refocus();
  render();
};
stream.onerror = () => { ui.squad = disconnected(ui.squad); refocus(); render(); };
render();
