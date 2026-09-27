import { join } from "node:path";
import type { StoreState } from "./store.js";
import { clearSession } from "./store.js";
import { appendRecord, setRecordDir } from "./logger.js";
import { cancelAllCards } from "./cards.js";
import { emptyUsage } from "./report.js";

export const START_TOOL = "mcp__lazycop__start_session";

/**
 * Called from the PreToolUse hook of start_session, the only place Bob's
 * session_id is visible. The latest invocation wins: a different task that
 * was still being watched is ended first.
 */
export function bindSession(store: StoreState, id: string, cwd: string): void {
  if (store.session?.id === id) return;
  if (store.session) endSession(store);
  store.session = { id, task: "", cwd };
  setRecordDir(join(cwd, ".lazycop"));
}

/** Called from the start_session MCP call. Without a hook binding, cards still work but hooks stay dormant. */
export function startSession(store: StoreState, task: string): void {
  store.history = [];
  store.usage = emptyUsage();
  if (store.session) store.session.task = task;
  else store.session = { id: null, task };
  const { id } = store.session;
  appendRecord({ kind: "session", ts: new Date().toISOString(), on: true, ...(id ? { id } : {}), task });
}

export function endSession(store: StoreState): void {
  if (!store.session) return;
  const { id, task } = store.session;
  appendRecord({ kind: "session", ts: new Date().toISOString(), on: false, ...(id ? { id } : {}), task });
  cancelAllCards();
  clearSession(store);
  setRecordDir(null);
}
