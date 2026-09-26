// What the page remembers between renders, and the helpers every screen uses.
// The view itself is folded from the server's stream; nothing here is authoritative.
import type { ViewState } from "./view.js";
import { emptyView } from "./view.js";
import type { AgentView, SquadView } from "./squad-view.js";
import { emptySquad, focused, focusedView } from "./squad-view.js";

export const ui = {
  squad: emptySquad() as SquadView,
  /** The agent the developer picked; null follows the newest watched agent. */
  focus: null as string | null,
  /** The focused agent's view: what the screens show. */
  view: emptyView() as ViewState,
  notice: "",
  logOpen: false,
  histOpen: false,
  /** true shows the mission screen, false the briefing. */
  inMission: false,
  /** The developer left an ended mission's wrap-up; a new task clears it. */
  leftEnded: false,
};

/** Recomputes the focused view after the squad or the focus changes. */
export function refocus(): void {
  ui.view = focusedView(ui.squad, ui.focus);
}

export const focusedAgent = (): AgentView | undefined => focused(ui.squad, ui.focus);
/** The focused agent's call-sign number, 1 before any agent starts. */
export const focusN = () => focusedAgent()?.n ?? 1;

let rerender = () => {};
export const onRender = (fn: () => void) => { rerender = fn; };
export const render = () => rerender();

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function post(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    ui.notice = res.ok ? "" : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    ui.notice = "LazyCop's server is not reachable";
  }
  if (ui.notice) render();
}

export function secondsLeft(until?: string): number {
  return until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 1000)) : 0;
}
