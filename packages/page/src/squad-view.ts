// Several Bob chats at once: one ViewState per agent, folded from the events that name it.
// No DOM here, so it is testable. view.ts still folds a single agent.
import type { AgentInfo, SseEvent, SseStateEvent } from "@lazycops/contracts";
import type { ViewState } from "./view.js";
import { currentCard, emptyView, fromSnapshot, reduce } from "./view.js";

/** Events that name no agent come from one chat without hooks, or from a server before agents. */
export const SOLO = "solo";

export interface AgentView {
  id: string;
  /** 1, 2, 3…: the agent's call sign and colour. */
  n: number;
  view: ViewState;
}

export interface SquadView {
  connected: boolean;
  agents: AgentView[];
}

export const emptySquad = (): SquadView => ({ connected: false, agents: [] });

const agentOf = (event: SseEvent) => ("agent" in event && event.agent) || SOLO;
const connected = (): ViewState => ({ ...emptyView(), connected: true });

/** Rebuilds every agent from the server's snapshot: the page keeps no state of its own. */
function fromSquadSnapshot(snapshot: SseStateEvent): SquadView {
  if (!snapshot.agents) {
    const view = fromSnapshot(snapshot);
    return { connected: true, agents: view.task !== null ? [{ id: SOLO, n: 1, view }] : [] };
  }
  const agents = snapshot.agents.map((info: AgentInfo) => {
    const own = snapshot.history.filter((e) => agentOf(e) === info.id);
    const view = own.reduce(reduce, connected());
    return { id: info.id, n: info.n, view: { ...view, task: info.task, ended: !info.watching, hold: info.hold } };
  });
  return { connected: true, agents };
}

export function reduceSquad(squad: SquadView, event: SseEvent): SquadView {
  if (event.type === "state") return fromSquadSnapshot(event);
  const id = agentOf(event);
  let agents = squad.agents;
  // A start while every agent has ended begins a fresh squad, as the server does.
  if (event.type === "session" && event.on && agents.every((a) => a.view.ended)) agents = [];
  const known = agents.find((a) => a.id === id);
  const current = known ?? { id, n: agents.length + 1, view: connected() };
  const next = { ...current, view: reduce(current.view, event) };
  return { connected: true, agents: known ? agents.map((a) => (a === known ? next : a)) : [...agents, next] };
}

export function disconnected(squad: SquadView): SquadView {
  return { connected: false, agents: squad.agents.map((a) => ({ ...a, view: { ...a.view, connected: false } })) };
}

/**
 * The agent the page shows: the one picked; else the one whose card has waited longest, so a
 * question is never hidden behind another agent; else the newest still watched; else the newest.
 */
export function focused(squad: SquadView, pick: string | null): AgentView | undefined {
  const asking = squad.agents
    .filter((a) => !a.view.ended && currentCard(a.view))
    .sort((a, b) => Date.parse(currentCard(a.view)!.at) - Date.parse(currentCard(b.view)!.at))[0];
  return squad.agents.find((a) => a.id === pick)
    ?? asking
    ?? [...squad.agents].reverse().find((a) => !a.view.ended)
    ?? squad.agents.at(-1);
}

/** The view of the agent in focus, or an empty one before any agent starts. */
export function focusedView(squad: SquadView, pick: string | null): ViewState {
  return focused(squad, pick)?.view ?? { ...emptyView(), connected: squad.connected };
}
