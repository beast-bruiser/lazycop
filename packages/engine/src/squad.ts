// Several Bob chats at once: each chat that runs /lazycop is its own agent with its own store.
// Hooks name their chat (session_id); MCP calls do not, so each one is matched to the
// PreToolUse hook that Bob fired for it just before.
import { join } from "node:path";
import type { AgentInfo, HookPayload, SseEvent, SseEventInput } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import { createStore } from "./store.js";
import type { HookResult } from "./hook.js";
import { onHook } from "./hook.js";
import type { Push } from "./mcp.js";
import { onMcp } from "./mcp.js";
import { START_TOOL, endSession } from "./session.js";
import { withRecordDir } from "./logger.js";

/** The agent of a chat whose hooks are not installed: its MCP calls cannot be told apart. */
export const SOLO = "solo";
const OWN_TOOL = "mcp__lazycop__";
/** A PreToolUse hook not followed by its MCP call within this long is forgotten. */
const EXPECT_MS = 60_000;
/** A Bob told not to stop yet that stays quiet this long ignored the Stop hook: his task is closed. */
export const STOP_GRACE_MS = 60_000;

export interface Agent {
  id: string;
  n: number;
  store: StoreState;
  /** Kept after the task ends, so the page can still name it. */
  task: string;
  lastActive: number;
}

export interface Squad {
  agents: Map<string, Agent>;
  /** Own-tool PreToolUse hooks waiting for their MCP call, oldest first. */
  expected: { tool: string; key: string; agent: Agent; at: number }[];
  /** Every event pushed since LazyCop last went dormant; the page rebuilds from it. */
  history: SseEvent[];
  seq: number;
}

export const createSquad = (): Squad => ({ agents: new Map(), expected: [], history: [], seq: 0 });

/**
 * Whether the page sees a hook event. It only uses what happened, so tools show once, after they
 * run; a subagent shows from its start too, so the page can tell its calls from its parent's.
 */
export const shownOnPage = (p: HookPayload) => p.hook_event_name !== "PreToolUse" || p.tool_name === "spawn_subagent";

export const isWatching = (agent: Agent) => agent.store.session !== null;
export const watching = (squad: Squad) => [...squad.agents.values()].filter(isWatching);

/** The watched agent that acted last: where a message without an agent or card goes. */
export const latest = (squad: Squad): Agent | undefined =>
  watching(squad).sort((a, b) => b.lastActive - a.lastActive)[0];

export const agentOfCard = (squad: Squad, card: string): Agent | undefined =>
  [...squad.agents.values()].find((a) => a.store.cards.has(card));

/** The same arguments give the same key, whatever order their fields came in. */
function argsKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(argsKey).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${argsKey(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The chat's agent, joining it to the squad if new. A start while nothing is watched begins a fresh page. */
function joinAgent(squad: Squad, id: string): Agent {
  if (watching(squad).length === 0) {
    squad.agents.clear();
    squad.history = [];
    squad.expected = [];
  }
  let agent = squad.agents.get(id);
  if (!agent) {
    agent = { id, n: squad.agents.size + 1, store: createStore(), task: "", lastActive: Date.now() };
    squad.agents.set(id, agent);
  }
  return agent;
}

/** Runs one agent's work with its records going to its own workspace. */
export function withRecords<T>(agent: Agent, fn: () => T): T {
  const cwd = agent.store.session?.cwd;
  return withRecordDir(cwd ? join(cwd, ".lazycop") : null, fn);
}

/** Stamps every event an agent's work pushes with that agent. */
export const tagged = (push: Push, agent: Agent): Push => (event: SseEventInput) =>
  push(event.type === "state" ? event : { ...event, agent: agent.id });

export function routeHook(squad: Squad, payload: HookPayload): { agent?: Agent; result: HookResult } {
  const pre = payload.hook_event_name === "PreToolUse" ? payload : null;
  const agent = pre?.tool_name === START_TOOL ? joinAgent(squad, payload.session_id) : squad.agents.get(payload.session_id);
  // Invariant 7: dormant for every chat LazyCop was not invoked in
  if (!agent || (!isWatching(agent) && pre?.tool_name !== START_TOOL)) return { result: {} };
  agent.lastActive = Date.now();
  if (pre?.tool_name.startsWith(OWN_TOOL)) {
    squad.expected.push({ tool: pre.tool_name.slice(OWN_TOOL.length), key: argsKey(pre.tool_input), agent, at: Date.now() });
  }
  return { agent, result: withRecords(agent, () => onHook(agent.store, payload)) };
}

/** The agent an MCP call came from: the chat whose hook announced it, else the best guess. */
export function routeMcp(squad: Squad, tool: string, args: unknown): Agent | undefined {
  squad.expected = squad.expected.filter((e) => Date.now() - e.at < EXPECT_MS);
  const key = argsKey(args);
  // Exact match first; then the oldest hook for the same tool, in case Bob reshaped the arguments.
  const i = [squad.expected.findIndex((e) => e.tool === tool && e.key === key), squad.expected.findIndex((e) => e.tool === tool)]
    .find((j) => j >= 0);
  if (i !== undefined) return squad.expected.splice(i, 1)[0]!.agent;
  // No hook announced it: hooks are not installed in that chat.
  return tool === "start_session" ? joinAgent(squad, SOLO) : latest(squad);
}

export async function runMcp(squad: Squad, tool: string, args: Record<string, unknown>, push: Push): Promise<string> {
  const agent = routeMcp(squad, tool, args);
  // Nothing is watched: a throwaway store gives the dormant answer.
  if (!agent) return onMcp(createStore(), tool, args, push);
  agent.lastActive = Date.now();
  const text = await withRecords(agent, () => onMcp(agent.store, tool, args, tagged(push, agent)));
  if (tool === "start_session") agent.task = agent.store.session?.task ?? agent.task;
  return text;
}

/** Ends an agent's task without end_session: no mission report, but the page reaches its wrap-up. */
export function closeAgent(agent: Agent, push: Push): void {
  if (!isWatching(agent)) return;
  withRecords(agent, () => endSession(agent.store));
  tagged(push, agent)({ type: "session", on: false });
}

/** After a watched chat's Stop hook: close its task now, or once it stays quiet after being told to end it. */
export function afterStop(agent: Agent, end: boolean, push: Push, graceMs = STOP_GRACE_MS): void {
  if (end) return closeAgent(agent, push);
  const { store, lastActive } = agent;
  setTimeout(() => {
    if (agent.store === store && agent.lastActive === lastActive) closeAgent(agent, push);
  }, graceMs).unref();
}

export function agentsInfo(squad: Squad): AgentInfo[] {
  return [...squad.agents.values()].map((a) => ({ id: a.id, n: a.n, task: a.task, watching: isWatching(a), hold: a.store.hold }));
}
