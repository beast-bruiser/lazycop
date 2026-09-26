/** Input types for the three LazyCop MCP tools Bob calls. */

/** declare_step — Bob calls this before every file edit. */
export interface DeclareStepInput {
  /** One sentence: what this edit does and why. */
  intent: string;
  /** Files this edit will touch. */
  files: string[];
  /** The main assumption this edit relies on, if any. */
  assumption?: string;
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

/** reply_to_developer — Bob sends a reply after a disagreement or ask-why. */
export interface ReplyToDeveloperInput {
  text: string;
}
