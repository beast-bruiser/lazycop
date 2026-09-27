/**
 * Record shapes written to .lazycop/ as append-only JSONL.
 * Every record carries a `kind` discriminant for exhaustive switch.
 * Shapes match the Contracts section of docs/product/LazyCop — Two-Way Quiz Design.md.
 */

import type { ReportedChange } from "./mcp.js";

export type LazycopRecord =
  | SessionRecord
  | StaleRecord
  | EventRecord
  | CardRecord
  | AnswerRecord
  | MessageRecord
  | ReplyRecord
  | ReportRecord;

/** A LazyCop session started or ended. `id` is Bob's session_id when a hook bound it. */
export interface SessionRecord {
  kind: "session";
  ts: string;
  on: boolean;
  id?: string;
  task?: string;
}

/** Cards dropped unanswered because Bob moved on to a new assumption: the developer skipped them. */
export interface StaleRecord {
  kind: "stale";
  ts: string;
  ids: string[];
}

/** A Bob tool call event logged from a hook. */
export interface EventRecord {
  kind: "event";
  ts: string;
  tool: string;
  /** File path the tool operated on, if applicable. */
  path?: string;
  /** Unified patch, if the tool produced a diff. */
  patch?: string;
}

export type CardType =
  | "interpretation"
  | "assumption"
  | "predict_move"
  | "read_hunk"
  | "hidden_assumption"
  | "decision_review"
  | "spec_check";

/** One selectable option on a card. The option whose id is "bob" is Bob's claim. */
export interface CardOption {
  id: string;
  text: string;
}

/** A quiz card generated for the developer. */
export interface CardRecord {
  kind: "card";
  id: string;
  type: CardType;
  /** The question shown to the developer. */
  question: string;
  /** Bob's claim text (also the text of the "bob" option). */
  claim: string;
  /** What produced this card: "declare_step", "end_session", or "confirm" for a re-declared correction. */
  source: string;
  /** Set on a "confirm" card: the card whose correction Bob now restates. */
  confirms?: string;
  /** Set on a "spec" card: the assumption card it checks. */
  about?: string;
  /** Set on a "spec" card: the passage it rests on, verified to appear in the document. */
  quote?: { path: string; text: string };
  /**
   * Selectable options. Always includes one with id "bob" (Bob's claim).
   * May include alt-N alternatives Bob gave in declare_step.
   */
  options: CardOption[];
}

/**
 * The developer's pick on a card:
 * - "bob" — agrees with Bob's claim
 * - an alt id (e.g. "alt-1") — disagrees, chose that alternative
 * - "other" — disagrees in their own words; text holds what they typed
 * - "ask_why" — wants Bob to explain before continuing
 */
export type AnswerPick = "bob" | "other" | "ask_why" | (string & {});

/** The developer's answer to a card. */
export interface AnswerRecord {
  kind: "answer";
  card: string;
  pick: AnswerPick;
  /** The chosen alternative text, or the developer's typed text for "other". */
  text?: string;
}

/**
 * A message delivered to Bob (from developer via the server).
 * card is absent when the message comes from the free-text box or the Hold button.
 */
export interface MessageRecord {
  kind: "message";
  id: string;
  card?: string;
  text: string;
  delivered_via: "mcp" | "hook";
  ts: string;
}

/** Bob's reply to a developer message or ask-why. */
export interface ReplyRecord {
  kind: "reply";
  /** The card being answered, when Bob's reply can be tied to one. */
  card?: string;
  text: string;
}

/** What LazyCop measured itself over a session, from its hook events; Bob cannot misreport these. */
export interface MissionStats {
  toolCalls: number;
  /** Distinct files Bob read. */
  filesRead: number;
  /** Distinct files Bob edited, as the hooks saw them. */
  filesEdited: string[];
  /** Characters of tool input and output divided by four: an estimate, never a bill. */
  approxTokens: number;
}

/** A place in Bob's finished change the reviewer (Granite) thinks could break or surprise; its file is one Bob edited. */
export interface RiskArea {
  file: string;
  /** Line in the new version of the file, when the reviewer gave one. */
  line?: number;
  risk: string;
}

/** Bob's mission report, accepted at end_session, with LazyCop's own stats beside it. */
export interface ReportRecord {
  kind: "report";
  ts: string;
  summary: string;
  changes: ReportedChange[];
  effort_note?: string;
  stats: MissionStats;
  /** At most 3, only when a reviewer is configured and found something. */
  risks?: RiskArea[];
}
