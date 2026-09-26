// Slide-out panels shared by both screens: the intel log and the battle history.
import { esc, ui } from "./page-state.js";

export function renderPanels(): string {
  const view = ui.view;
  const feed = [...view.feed].reverse().slice(0, 50)
    .map((f) => `<li class="${f.kind}"><time>${esc(new Date(f.at).toLocaleTimeString())}</time>${esc(f.text)}</li>`)
    .join("");
  const files = view.filesEdited.map(esc).join("<br>") || "none yet";

  const done = view.cards.filter((c) => c.answer).slice().reverse();
  const histItems = done.map((c) => {
    const isCorrected = c.answer!.pick !== "bob";
    const ans = c.answer!.pick === "bob" ? "AGREED" : c.answer!.pick === "ask_why" ? "ASKED WHY" : "CHALLENGED";
    const thread = c.thread.map((m) => `<div class="hist-thread">${m.from === "bob" ? "👮" : "🧑"} ${esc(m.text)}</div>`).join("");
    return `<div class="hist-item">
      <div class="hist-claim">${esc(c.card.claim)}</div>
      <div class="hist-ans ${isCorrected ? "challenged" : "agreed"}">${ans}</div>
      ${thread}
      ${isCorrected ? `<form data-thread="${esc(c.card.id)}" style="display:flex;gap:6px;margin-top:4px">
        <input class="b-input" style="font-size:10px;padding:3px 6px" name="text" data-keep="thread-${esc(c.card.id)}" placeholder="Reply…" autocomplete="off">
        <button class="b-send" style="font-size:6px;padding:4px 7px">→</button>
      </form>` : ""}
    </div>`;
  }).join("") || `<p style="color:#444;font-size:10px;padding:4px 0">No encounters yet.</p>`;

  return `
    <div id="log-panel" class="${ui.logOpen ? "open" : ""}">
      <div class="log-h">⚔ INTEL LOG</div>
      <ul class="log-list">${feed || "<li>Awaiting Bob…</li>"}</ul>
      <div class="log-h">FILES EDITED</div>
      <p style="font-size:10px;color:#666;line-height:1.6">${files}</p>
    </div>
    <button class="panel-toggle" id="log-toggle" data-log-toggle>📜 LOG</button>
    <div id="hist-panel" class="${ui.histOpen ? "open" : ""}">
      <div class="log-h">📋 BATTLE HISTORY (${done.length})</div>
      ${histItems}
    </div>
    <button class="panel-toggle" id="hist-toggle" data-hist-toggle>📋 HIST</button>`;
}
