// Screen 1 — mission briefing: Bob's unit profile beside the tactical map.
import { health } from "./view.js";
import { esc, focusN, ui } from "./page-state.js";
import { callSign, unitPortrait, unitSprite, imgClass } from "./units.js";
import { classOf, renderLoadout } from "./loadout-view.js";
import { renderSquadBar } from "./squad-bar.js";
import { muted } from "./audio.js";

/** Ten segments, filled from the left; the colour warns as SYNC with Bob falls. */
function hpSegments(): string {
  const filled = Math.round(health(ui.view) / 10);
  return Array.from({ length: 10 }, (_, i) => {
    const cls = i >= filled ? "hp-seg empty" : filled <= 3 ? "hp-seg low" : filled <= 6 ? "hp-seg mid" : "hp-seg";
    return `<div class="${cls}"></div>`;
  }).join("");
}

function renderUnitProfile(): string {
  const n = focusN();
  const squad = ui.squad.agents.length;

  return `<div id="unit-profile">
    ${renderSquadBar("squad-bar unit-tabs")}
    <div class="panel-header">AGENT PROFILE</div>
    <div class="unit-portrait-row">
      <div class="unit-portrait"><img class="${imgClass("portrait")}" src="${unitPortrait(n)}" alt=""></div>
      <div class="unit-info">
        <div class="unit-name">UNIT: ${callSign(n)}</div>
        <div class="unit-rank">SQUAD: ${squad} AGENT${squad === 1 ? "" : "S"}</div>
        <div class="unit-rank" title="The mode Bob last switched to">CLASS: ${esc(classOf(ui.view.loadout))}</div>
        <div class="unit-hp-label" title="How closely you and Bob read the task alike; each correction costs 20">SYNC:</div>
        <div class="hp-segments">${hpSegments()}</div>
      </div>
    </div>
    <div class="unit-sprite-area">
      <img class="unit-sprite ${imgClass("unit")}" src="${unitSprite(n)}" alt="Bob's soldier">
    </div>
    ${renderLoadout(ui.view.loadout)}
  </div>`;
}

export function renderBriefingScreen(): string {
  const v = ui.view;
  const status = !v.connected ? "CONNECTING…" : v.ended ? "MISSION COMPLETE" : v.task ? "MISSION ACTIVE" : "AWAITING ORDERS";
  const statusCls = v.task && !v.ended ? "status-badge watching" : "status-badge";

  return `<div id="screen-briefing" class="screen active">
    <div id="briefing-title">
      <div class="mission-label">▶ MISSION BRIEFING</div>
      <div class="briefing-task">${esc(v.task ?? "No active mission")}</div>
      <div class="briefing-controls">
        <span class="${statusCls}">${status}</span>
        <button class="hud-mute" data-mute title="Toggle sound and music">${muted() ? "🔇" : "🔊"}</button>
      </div>
    </div>
    <div id="briefing-body">
      ${renderUnitProfile()}
      <div id="tactical-map">
        <div class="panel-header">REPO TACTICAL OVERLAY</div>
        <div class="map-host"></div>
      </div>
    </div>
    <div id="briefing-footer">
      <div class="briefing-prompt">▶ SELECT AGENT AND CONFIRM MISSION</div>
      ${v.task && !v.ended
        ? `<button class="start-btn" data-enter-mission>ENTER MISSION ▶</button>`
        : v.task && v.ended
        ? `<button class="start-btn" data-enter-mission>LAST MISSION REPORT ▶</button>`
        : `<div style="font-family:var(--px);font-size:8px;color:var(--c-muted)">Waiting for /lazycop command…</div>`}
    </div>
  </div>`;
}
