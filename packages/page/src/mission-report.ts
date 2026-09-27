// The MISSION CLEAR screen: Bob's mission report beside what LazyCop measured itself.
import type { ViewState } from "./view.js";
import { esc } from "./page-state.js";

/** 12345 → "12.3k": the token count is an estimate, so it never shows false precision. */
export function approx(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n);
}

function stat(icon: string, label: string, value: string): string {
  return `<div class="rep-stat"><span class="rep-stat-v">${icon} ${value}</span><span class="rep-stat-l">${label}</span></div>`;
}

export function renderMissionReport(view: ViewState): string {
  const r = view.report;
  if (!r) {
    // /lazycop off, or a task that ended before Bob filed one: say so rather than show an empty report.
    return `<div class="report-box"><p class="rep-summary rep-none">No report filed — the mission ended without end_session's report.</p></div>`;
  }
  const changes = r.changes.map((c) =>
    `<li><span class="rep-file">${esc(c.file)}</span>${c.what ? ` — ${esc(c.what)}` : ""}</li>`
  ).join("");
  const risks = (r.risks ?? []).map((k) =>
    `<li><span class="rep-file">${esc(k.file)}${k.line ? `:${k.line}` : ""}</span> — ${esc(k.risk)}</li>`
  ).join("");
  const s = r.stats;
  return `<div class="report-box">
    ${r.summary ? `<p class="rep-summary">${esc(r.summary)}</p>` : ""}
    <div class="rep-h">CHANGES (${r.changes.length})</div>
    ${changes ? `<ul class="rep-changes">${changes}</ul>` : `<p class="rep-none">No files changed.</p>`}
    ${risks ? `<div class="rep-risks"><div class="rep-h risk">RISK AREAS · GRANITE REVIEW</div><ul class="rep-changes">${risks}</ul></div>` : ""}
    <div class="rep-stats">
      ${stat("⚙", "TOOL CALLS", String(s.toolCalls))}
      ${stat("📖", "FILES READ", String(s.filesRead))}
      ${stat("✏", "FILES EDITED", String(s.filesEdited.length))}
      ${stat("≈", "TOKENS (EST.)", approx(s.approxTokens))}
    </div>
    ${r.effort_note ? `<div class="rep-effort"><div class="rep-h warn">WHY IT TOOK THIS MUCH</div>${esc(r.effort_note)}</div>` : ""}
  </div>`;
}
