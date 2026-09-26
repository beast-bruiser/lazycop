import { describe, it, expect } from "vitest";
import { watchedStore } from "./helpers.js";
import { onHook } from "../hook.js";

describe("hook ignores events it does not act on", () => {
  it("returns an empty object for unknown events (no crash)", () => {
    const store = watchedStore();
    const result = onHook(store, {
      hook_event_name: "SessionStart",
      session_id: "s-1",
      cwd: "/work",
      source: "user",
    });
    expect(result).toEqual({});
  });

  it("returns empty for Stop event", () => {
    const store = watchedStore();
    const result = onHook(store, {
      hook_event_name: "Stop",
      session_id: "s-1",
      cwd: "/work",
      last_assistant_message: "Done.",
    });
    expect(result).toEqual({});
  });
});

describe("hook blocks on hold", () => {
  it("PreToolUse returns a block message when hold is active", () => {
    const store = watchedStore();
    store.hold = true;
    const result = onHook(store, {
      hook_event_name: "PreToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "apply_diff",
      tool_input: {},
      tool_use_id: "t-1",
    });
    expect(result.block).toContain("developer is reviewing");
  });

  it("PreToolUse delivers a queued block message when not on hold", () => {
    const store = watchedStore();
    store.pending.push({ id: "m-1", text: "Please stop!", channel: "block" });
    const result = onHook(store, {
      hook_event_name: "PreToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "apply_diff",
      tool_input: {},
      tool_use_id: "t-1",
    });
    expect(result.block).toContain("Please stop!");
    expect(store.pending).toHaveLength(0);
  });

  it("PostToolUse delivers a queued context message", () => {
    const store = watchedStore();
    store.pending.push({ id: "m-2", text: "Good work", channel: "context" });
    const result = onHook(store, {
      hook_event_name: "PostToolUse",
      session_id: "s-1",
      cwd: "/work",
      tool_name: "read_file",
      tool_input: {},
      tool_use_id: "t-2",
      tool_response: "file content",
    });
    expect(result.context).toContain("Good work");
  });
});
