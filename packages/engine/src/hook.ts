import type { HookPayload } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import { takePending, isWatched } from "./store.js";
import { START_TOOL, bindSession } from "./session.js";
import { noteDelivered } from "./review.js";
import { appendRecord } from "./logger.js";
import { countToolCall } from "./report.js";

export interface HookResult {
  block?: string;
  context?: string;
  /** Bob stopped twice without end_session: the caller ends the task for him. */
  end?: true;
}

export const STOP_NUDGE =
  "LazyCop is still watching this task. Call the lazycop end_session tool with your mission report before you finish.";

export function onHook(store: StoreState, payload: HookPayload): HookResult {
  if (payload.hook_event_name === "PreToolUse" && payload.tool_name === START_TOOL) {
    bindSession(store, payload.session_id, payload.cwd);
    return {};
  }

  // Invariant 7: dormant for every task LazyCop was not invoked on
  if (!isWatched(store, payload.session_id)) return {};

  // Bob's turn is over but the task was never closed: remind him once, then close it.
  if (payload.hook_event_name === "Stop") {
    if (store.stopNudged) return { end: true };
    store.stopNudged = true;
    return { block: STOP_NUDGE };
  }

  // One record per tool call, once it has run
  if (payload.hook_event_name === "PostToolUse") {
    countToolCall(store.usage, payload);
    appendRecord({
      kind: "event",
      ts: new Date().toISOString(),
      tool: payload.tool_name,
      path: extractPath(payload.tool_input),
      patch: extractPatch(payload),
    });
  }

  // Invariant 2: own MCP tools are never blocked
  if (
    payload.hook_event_name === "PreToolUse" &&
    payload.tool_name.startsWith("mcp__lazycop__")
  ) {
    return {};
  }

  if (payload.hook_event_name === "PreToolUse") {
    if (store.hold) {
      return {
        block:
          "LazyCop: the developer is reviewing an important decision. Call the lazycop check_in tool; it waits for the developer's answer. Do not end your turn.",
      };
    }
    const msg = takePending(store, "block");
    if (msg) {
      noteDelivered(store, msg);
      appendRecord({
        kind: "message",
        id: msg.id,
        ...(msg.card ? { card: msg.card } : {}),
        text: msg.text,
        delivered_via: "hook",
        ts: new Date().toISOString(),
      });
      return { block: `Message from the developer (via LazyCop): ${msg.text}` };
    }
    return {};
  }

  if (
    payload.hook_event_name === "PostToolUse" ||
    payload.hook_event_name === "UserPromptSubmit"
  ) {
    const msg = takePending(store, "context");
    if (msg) {
      noteDelivered(store, msg);
      appendRecord({
        kind: "message",
        id: msg.id,
        ...(msg.card ? { card: msg.card } : {}),
        text: msg.text,
        delivered_via: "hook",
        ts: new Date().toISOString(),
      });
      return { context: `Message from the developer (via LazyCop): ${msg.text}` };
    }
  }

  return {};
}

function extractPath(input: unknown): string | undefined {
  if (input && typeof input === "object") {
    const p = (input as Record<string, unknown>)["path"];
    if (typeof p === "string") return p;
  }
  return undefined;
}

function extractPatch(payload: HookPayload): string | undefined {
  if (payload.hook_event_name === "PostToolUse") {
    const r = payload.tool_response;
    if (typeof r === "string" && r.includes("@@")) return r;
  }
  return undefined;
}
