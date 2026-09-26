// One button per agent: pick which Bob chat the screens show and the HUD's actions act on.
import { currentCard } from "./view.js";
import { esc, focusedAgent, ui } from "./page-state.js";
import { agentColor, callSign } from "./units.js";

export function renderSquadBar(cls: string): string {
  if (ui.squad.agents.length === 0) return "";
  const focus = focusedAgent()?.id;
  const buttons = ui.squad.agents.map((a) => {
    const v = a.view;
    const waiting = v.cards.filter((c) => !c.answer).length;
    const status = v.ended ? "✓ DONE" : v.hold ? "⏸ HOLD" : currentCard(v) ? `⚠ ${waiting}` : "● LIVE";
    const task = (v.task ?? "").slice(0, 28);
    return `<button class="squad-agent${a.id === focus ? " active" : ""}${v.ended ? " ended" : ""}" data-agent="${esc(a.id)}"
      style="--agent:${agentColor(a.n)}" title="${esc(v.task ?? "")}">
      <span class="squad-sign">${callSign(a.n)}</span>
      <span class="squad-status">${status}</span>
      <span class="squad-task">${esc(task)}</span>
    </button>`;
  }).join("");
  return `<div class="${cls}">${buttons}</div>`;
}
