/** Input types for the three LazyCop MCP tools Bob calls. */

/** declare_step — Bob calls this before every file edit. */
export interface DeclareStepInput {
  /** One sentence: what this edit does and why. */
  intent: string;
  /** Files this edit will touch. */
  files: string[];
  /** The main assumption this edit relies on, if any. */
  assumption?: string;
  /** Other readings a reasonable developer might have meant instead of the assumption; they become one-click options. */
  alternatives?: string[];
  /**
   * True for decisions costly to undo: new dependency, schema or public API
   * change, deleting code. Triggers a hold.
   */
  important?: boolean;
}

/** check_in — Bob calls this when told the developer is reviewing (hold). */
export interface CheckInInput {
  /**
   * 1 on the first call, then the number the previous result asked for.
   * Ensures consecutive calls are never identical.
   */
  poll: number;
}

/** start_session — Bob calls this first when the developer invokes LazyCop. */
export interface StartSessionInput {
  /** The developer's request, in their words. */
  task: string;
}

/** end_session — Bob calls this when the task is done, or on `/lazycop off`. */
export interface EndSessionInput {
  /** Assumptions Bob relied on that the developer never confirmed; each becomes a final card. */
  assumptions?: string[];
  /** true on `/lazycop off`: stop at once, with no final review. */
  stop?: boolean;
}

/** reply_to_developer — Bob sends a reply after a disagreement or ask-why. */
export interface ReplyToDeveloperInput {
  text: string;
}
