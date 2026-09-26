import { describe, it, expect } from "vitest";
import { watchedStore } from "./helpers.js";
import { onHook } from "../hook.js";

describe("lazycop tools are never blocked by hooks (invariant 2)", () => {
  it("PreToolUse does not block mcp__lazycop__declare_step even when hold is active", () => {
    const store = watchedStore();
    store.hold = true;
    const result = onHook(store, {
      hook_event_name: "PreToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "mcp__lazycop__declare_step",
      tool_input: { intent: "add check", files: ["a.ts"] },
      tool_use_id: "t-1",
    });
    expect(result.block).toBeUndefined();
    expect(result).toEqual({});
  });

  it("PreToolUse does not block mcp__lazycop__check_in even when hold is active", () => {
    const store = watchedStore();
    store.hold = true;
    const result = onHook(store, {
      hook_event_name: "PreToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "mcp__lazycop__check_in",
      tool_input: { poll: 1 },
      tool_use_id: "t-2",
    });
    expect(result.block).toBeUndefined();
    expect(result).toEqual({});
  });

  it("PreToolUse does not block mcp__lazycop__reply_to_developer even on hold with pending block", () => {
    const store = watchedStore();
    store.hold = true;
    store.pending.push({ id: "m-1", text: "Stop!", channel: "block" });
    const result = onHook(store, {
      hook_event_name: "PreToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "mcp__lazycop__reply_to_developer",
      tool_input: { text: "ok" },
      tool_use_id: "t-3",
    });
    expect(result.block).toBeUndefined();
    // Pending message is NOT consumed for lazycop tools
    expect(store.pending).toHaveLength(1);
  });
});
