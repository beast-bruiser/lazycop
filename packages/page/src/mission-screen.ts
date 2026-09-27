// Screen 2 — the active mission: HUD, the live tactical map with its dialogs, and the compose bar.
import { health } from "./view.js";
import { esc, focusN, ui } from "./page-state.js";
import { WEAPON, callSign, unitPortrait, imgClass } from "./units.js";
import { renderBattleOverlays } from "./battle-overlays.js";
import { renderSquadBar } from "./squad-bar.js";
import { muted } from "./audio.js";

function renderActiveHud(): string {
  const view = ui.view;
  const total = view.cards.length;
  const answered = view.cards.filter((c) => c.answer).length;
  const agreed = view.cards.filter((c) => c.answer?.pick === "bob").length;
  const hp = health(view);
  const hpCls = hp < 30 ? "hud-hp-fill low" : hp < 60 ? "hud-hp-fill mid" : "hud-hp-fill";
  const score = String(agreed * 100).padStart(6, "0");
  const steps = view.feed.filter((f) => f.kind === "step");
  const stageName = steps.at(-1)?.text ?? view.task ?? "JUNGLE FORTRESS";

  return `<div id="active-hud">
    <div class="hud-portrait"><img class="${imgClass("portrait")}" src="${unitPortrait(focusN())}" alt="" title="${callSign(focusN())}"></div>
    <div class="hud-lives"><div class="hud-lives-label">LIVES</div>x${Math.max(0, total - answered)}</div>
    <div class="hud-div"></div>
    <div class="hud-hp">
      <span class="hud-hp-label" title="How closely you and Bob read the task alike; each correction costs 20">SYNC</span>
      <div class="hud-hp-track"><div class="${hpCls}" style="width:${hp}%"></div></div>
    </div>
    <div class="hud-div"></div>
    <div class="hud-weapon">
      <div class="hud-weapon-icon">🎯</div>
      <div class="hud-weapon-name">${WEAPON}</div>
    </div>
    <div class="hud-div"></div>
    <div class="hud-score">${score}</div>
    <div class="hud-div"></div>
    <div class="hud-stage">
      <div class="hud-stage-num">STAGE ${steps.length}</div>
      <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px">${esc(stageName)}</div>
    </div>
    <button class="hud-hold ${view.hold ? "on" : ""}" data-hold title="Hold or release ${callSign(focusN())}">${view.hold ? "▶ RESUME" : "⏸ HOLD"}</button>
    <button class="hud-mute" data-mute title="Toggle sound">${muted() ? "🔇" : "🔊"}</button>
  </div>`;
}

export function renderMissionScreen(): string {
  return `<div id="screen-mission" class="screen active">
    ${renderActiveHud()}
    <div id="field-map">
      <div class="map-host"></div>
      ${renderBattleOverlays()}
    </div>
    ${renderSquadBar("squad-bar floating")}
    <form id="compose-bar" data-compose>
      <input class="c-input" name="text" data-keep="compose" placeholder="💬 Send intel to Bob…" autocomplete="off">
      <label><input type="checkbox" name="urgent" data-keep="urgent"> 🛑 STOP</label>
      <button class="c-send">SEND</button>
    </form>
  </div>`;
}
