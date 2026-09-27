// The dialogs over the mission screen's tactical map: the battle card, Bob's question and the end screen.
import type { CardView } from "./view.js";
import { currentCard, waitingQuestion } from "./view.js";
import { esc, secondsLeft, ui } from "./page-state.js";
import { renderMissionReport } from "./mission-report.js";

export function countdownHtml(c: CardView, cls: string): string {
  if (!c.waitUntil) return "";
  const left = Math.ceil((Date.parse(c.waitUntil) - Date.now()) / 1000);
  return left > 0
    ? `<p class="${cls}">⏳ ${left}s — BOB WAITS</p>`
    : `<p class="${cls} late">⌛ BOB MOVED ON — answer still reaches him</p>`;
}

/** The dialogs that float over the tactical map: the battle card, Bob's question and the end screen. */
export function renderBattleOverlays(): string {
  return renderBattleDialog() + renderWaitingBanner() + renderScreenOverlay();
}

function renderBattleDialog(): string {
  // An ended task's open cards were cancelled with it.
  const now = ui.view.ended ? undefined : currentCard(ui.view);
  if (!now) return `<div id="battle-overlay" class="hidden"></div>`;

  const opts = now.card.options.map((o, i) => {
    const cls = o.id === "bob" ? "b-btn agree option" : "b-btn disagree option";
    // Alternatives show their reading, so the developer can correct Bob in one click.
    const label = o.id === "bob" ? "🔫 FIRE & AGREE" : o.id === "ask_why" ? "❓ REQUEST INTEL"
      : o.id === "other" ? "⚔️ CHALLENGE — OTHER INTEL…" : `⚔️ ${o.text}`;
    return `<button class="${cls}" data-card="${esc(now.card.id)}" data-pick="${esc(o.id)}" data-text="${esc(o.text)}">
      <span class="b-kbd">${i + 1}</span>${esc(label)}
    </button>`;
  }).join("");

  const thread = now.thread.map((m) =>
    `<p style="font-size:11px;margin-top:4px;color:${m.from === "bob" ? "var(--c-cyan)" : "var(--c-green)"}">
      <b>${m.from === "bob" ? "👮 BOB:" : "🧑 YOU:"}</b> ${esc(m.text)}</p>`
  ).join("");

  return `<div id="battle-overlay" data-countdown="${esc(now.card.id)}">
    <div id="battle-box">
      <div class="battle-title-bar">
        <span class="blink">▶</span>
        <span class="ttl">ENEMY INTEL — CONFIRM OR CHALLENGE</span>
      </div>
      <div class="battle-body">
        <p class="battle-q">${esc(now.card.question)}</p>
        <div class="cd-wrap">${countdownHtml(now, "battle-cd")}</div>
        <div class="battle-opts">${opts}</div>
        <form class="b-other-form" data-other="${esc(now.card.id)}" hidden>
          <input class="b-input" name="text" data-keep="other-${esc(now.card.id)}" placeholder="Provide correct intel…" autocomplete="off">
          <button class="b-send">SEND</button>
        </form>
        ${thread}
      </div>
    </div>
  </div>`;
}

function renderWaitingBanner(): string {
  const q = waitingQuestion(ui.view);
  if (!q) return `<div id="waiting-banner" class="hidden"></div>`;
  const target = q.card ? `data-thread="${esc(q.card)}"` : "data-compose";
  return `<div id="waiting-banner">
    <div class="wait-title">⚠️ BOB AWAITS YOUR RESPONSE <span data-left>${secondsLeft(ui.view.waiting?.until)}s</span></div>
    ${q.text ? `<div class="wait-msg">👮 BOB: ${esc(q.text)}</div>` : ""}
    <form class="wait-form" ${target}>
      <input class="b-input" name="text" data-keep="waiting" placeholder="Respond to Bob…" autocomplete="off">
      <button class="b-send">SEND</button>
    </form>
  </div>`;
}

function renderScreenOverlay(): string {
  if (!ui.view.connected) {
    return `<div id="screen-overlay"><div class="screen-title">CONNECTING…</div><div class="screen-sub">Linking to LazyCop server…</div></div>`;
  }
  if (!ui.view.ended) return `<div id="screen-overlay" class="hidden"></div>`;
  return `<div id="screen-overlay">
    <div class="screen-trophy">🏆</div>
    <div class="screen-title">MISSION CLEAR!</div>
    <div class="mission-label">▶ MISSION REPORT</div>
    ${renderMissionReport(ui.view)}
    <div style="margin-top:16px"><button class="start-btn" data-to-briefing>◀ MISSION SELECT</button></div>
  </div>`;
}
