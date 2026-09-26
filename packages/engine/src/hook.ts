import type { HookPayload } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import { takePending, isWatched } from "./store.js";
import { START_TOOL, bindSession } from "./session.js";
import { appendRecord } from "./logger.js";

export interface HookResult {
  block?: string;
  context?: string;
}

export function onHook(store: StoreState, payload: HookPayload): HookResult {
  if (payload.hook_event_name === "PreToolUse" && payload.tool_name === START_TOOL) {
    bindSession(store, payload.session_id, payload.cwd);
    return {};
  }

  // Invariant 7: dormant for every task LazyCop was not invoked on
  if (!isWatched(store, payload.session_id)) return {};

  // One record per tool call, once it has run
  if (payload.hook_event_name === "PostToolUse") {
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
      if (msg.card) store.lastMessageCard = msg.card;
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
      if (msg.card) store.lastMessageCard = msg.card;
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
