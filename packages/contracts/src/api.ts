/**
 * Shapes for the server↔page API: SSE events the server pushes and POST bodies
 * the page sends back. All state lives in the server; the page is view-only.
 */

import type { HookPayload } from "./hooks.js";
import type { CardRecord, AnswerRecord } from "./records.js";

// ---------------------------------------------------------------------------
// SSE events (server → page, over /stream)
// ---------------------------------------------------------------------------

/** The task LazyCop is watching, as the page shows it. */
export interface SessionInfo {
  task: string;
}

/**
 * One Bob chat LazyCop watches. Each chat that runs /lazycop is its own agent; `id` is its
 * session_id, or "solo" when no hook bound the chat (hooks not installed).
 */
export interface AgentInfo {
  id: string;
  /** 1 for the first agent, 2 for the next…: the agent's call sign and colour on the page. */
  n: number;
  task: string;
  /** false once the agent's task ended; it stays listed so the page can show how it went. */
  watching: boolean;
  hold: boolean;
}

/** Which agent an event came from. Absent on events that concern the whole page. */
export interface FromAgent {
  agent?: string;
}

/** Initial state snapshot sent on SSE connect. */
export interface SseStateEvent {
  type: "state";
  at: string;
  /** The most recently started agent that is still watched; null while LazyCop is dormant. */
  session: SessionInfo | null;
  /** true when any agent is on hold. */
  hold: boolean;
  /** Every agent since LazyCop last went dormant, in the order they started. Absent means one agent, as before. */
  agents?: AgentInfo[];
  pending: PendingMessage[];
  /** Every event of the current (or last) session, oldest first; the page rebuilds itself from it. */
  history: SseEvent[];
}

/** A session started (on) or ended (off). */
export interface SseSessionEvent {
  type: "session";
  at: string;
  on: boolean;
  task?: string;
}

/** Hold state changed. */
export interface SseHoldEvent {
  type: "hold";
  at: string;
  on: boolean;
  reason: string;
  /** The card whose decision Bob is held on; absent for the developer's own Hold. */
  card?: string;
}

/** A Bob hook event arrived. */
export interface SseHookEvent {
  type: "hook";
  at: string;
  seq: number;
  payload: HookPayload;
}

/** Bob called an MCP tool. */
export interface SseMcpEvent {
  type: "mcp";
  at: string;
  tool: string;
  args: Record<string, unknown>;
}

/** A card was created for the developer. */
export interface SseCardEvent {
  type: "card";
  at: string;
  card: CardRecord;
  /** When Bob stops waiting for this card; absent when Bob did not pause on it. */
  waitUntil?: string;
}

/** A developer answer arrived. */
export interface SseAnswerEvent {
  type: "answer";
  at: string;
  answer: AnswerRecord;
}

/** A queued message is waiting for Bob. */
export interface SseQueuedEvent {
  type: "queued";
  at: string;
  id: string;
  text: string;
  channel: "block" | "context";
  card?: string;
  /** true when the message is a card answer given after Bob's pause, not a follow-up. */
  fromAnswer?: boolean;
}

/** A queued message was delivered to Bob. */
export interface SseDeliveredEvent {
  type: "delivered";
  at: string;
  id: string;
  via: "mcp" | "hook";
}

/** Bob started (on) or stopped (off) waiting in check_in for the developer's answer. */
export interface SseWaitingEvent {
  type: "waiting";
  at: string;
  on: boolean;
  /** When Bob gives up waiting. */
  until?: string;
  /** The card Bob last asked the developer about, if any. */
  card?: string;
}

/** The knowledge agent took in a document for this task. */
export interface SseDocEvent {
  type: "doc";
  at: string;
  path: string;
  /** "named" by the developer, or read by Bob. */
  source: "named" | "bob";
}

/** Bob replied to the developer. */
export interface SseReplyEvent {
  type: "reply";
  at: string;
  text: string;
  /** The card Bob is answering: the one behind the last developer message it received. */
  card?: string;
}

export type SseEvent =
  | SseStateEvent
  | ((
      | SseSessionEvent
      | SseHoldEvent
      | SseHookEvent
      | SseMcpEvent
      | SseCardEvent
      | SseAnswerEvent
      | SseQueuedEvent
      | SseDeliveredEvent
      | SseReplyEvent
      | SseWaitingEvent
      | SseDocEvent
    ) & FromAgent);

/** An SSE event before the server stamps its `at` time. */
export type SseEventInput = SseEvent extends infer E ? (E extends SseEvent ? Omit<E, "at"> : never) : never;

// ---------------------------------------------------------------------------
// POST bodies (page → server)
// ---------------------------------------------------------------------------

/** Body for POST /queue — developer sends a free-text message to Bob. */
export interface QueueBody {
  text: string;
  channel?: "block" | "context";
  /** Set when the developer answers Bob on a card's thread. */
  card?: string;
  /** The agent to send it to; the card's agent when `card` is set, else the most recently active one. */
  agent?: string;
}

/** Body for POST /hold — developer toggles the hold. */
export interface HoldBody {
  on: boolean;
  /** The agent to hold or release; every watched agent when absent. */
  agent?: string;
}

/** Body for POST /answer — developer answers a card. */
export interface AnswerBody {
  card: string;
  pick: string;
  text?: string;
}

// ---------------------------------------------------------------------------
// Internal: pending message waiting for Bob
// ---------------------------------------------------------------------------
export interface PendingMessage {
  id: string;
  text: string;
  channel: "block" | "context";
  /** The card this message answers; absent for free-text and Hold messages. */
  card?: string;
  /** true when the message corrects Bob's reading, so his next assumption should restate it. */
  correction?: boolean;
}
