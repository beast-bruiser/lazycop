// The soldier's loadout on the unit profile: weapons (Bob's tools), skills and squadmates (subagents).
import type { Loadout } from "./loadout.js";
import { WEAPONS, lockedSkills } from "./loadout.js";
import { esc } from "./page-state.js";

const LABEL = "font-family:var(--px);font-size:5px;color:var(--c-muted);margin:6px 0 4px;line-height:1.5";
const LINE = "font-size:10px;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

/** Bob's mode, as the soldier's class; Bob's hooks do not say which mode a task started in. */
export const classOf = (l: Loadout) => (l.mode ? l.mode.toUpperCase() : "STARTING MODE");

function weapons(l: Loadout): string {
  return WEAPONS.map((w) => {
    const n = l.shots[w.cls];
    return `<div class="loadout-slot" style="padding:4px;text-align:center;${n ? "" : "opacity:.4"}" title="${esc(`${w.name}: Bob ${w.what}`)}">
      <span class="slot-icon" style="font-size:14px">${w.icon}</span>
      <div class="slot-name" style="font-size:5px">${w.name}</div>
      <div class="slot-name" style="font-size:7px;color:#fff;margin-top:2px">×${n}</div>
    </div>`;
  }).join("");
}

function skills(l: Loadout): string {
  const about = new Map(l.defined.map((s) => [s.name, s.description]));
  const learned = l.learned.map((name) =>
    `<div style="${LINE};color:var(--c-gold)" title="${esc(about.get(name) ?? "Bob's built-in skill")}">✦ ${esc(name)}</div>`);
  const locked = lockedSkills(l).map((s) =>
    `<div style="${LINE};color:#555" title="${esc(s.description)}">🔒 ${esc(s.name)}</div>`);
  const list = [...learned, ...locked].join("");
  return list || `<div style="${LINE};color:#555">No skills in .bob/skills</div>`;
}

function squadmates(l: Loadout): string {
  if (l.subagents.length === 0) return `<div style="${LINE};color:#555">None deployed</div>`;
  const rows = l.subagents.map((s) => {
    const status = s.running ? `<span style="color:var(--c-green)">RUNNING</span>`
      : s.returned ? `<span style="color:var(--c-muted)">DONE</span>` : `<span style="color:var(--c-red2)">NO RESULT</span>`;
    return `<div style="${LINE}" title="${esc(s.task)}">🪖 ${esc(s.preset)} · ${status} · ${s.calls} calls — ${esc(s.task)}</div>`;
  });
  const shared = l.sharedCalls
    ? [`<div style="${LINE};color:var(--c-muted)">+${l.sharedCalls} calls by subagents running together</div>`]
    : [];
  return [...rows, ...shared].join("");
}

export function renderLoadout(l: Loadout): string {
  return `<div class="loadout" style="flex-direction:column;gap:0;overflow-y:auto;min-height:0">
    <div style="${LABEL}">WEAPONS (BOB'S TOOLS):</div>
    <div style="display:flex;gap:4px">${weapons(l)}</div>
    <div style="${LABEL}">SKILLS:</div>
    ${skills(l)}
    <div style="${LABEL}">SQUADMATES (SUBAGENTS):</div>
    ${squadmates(l)}
  </div>`;
}
