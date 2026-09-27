import { describe, it, expect } from "vitest";
import type { HookPayload } from "@lazycops/contracts";
import { shownOnPage } from "../squad.js";

const pre = (tool_name: string): HookPayload => ({ hook_event_name: "PreToolUse", session_id: "s-1", cwd: "/w", tool_name, tool_input: {}, tool_use_id: "t" });

describe("hook events the soldier's loadout needs", () => {
  it("shows a subagent from its start, so its calls can be told from its parent's", () => {
    expect(shownOnPage(pre("spawn_subagent"))).toBe(true);
  });

  it("shows other tools once, after they run", () => {
    expect(shownOnPage(pre("read_file"))).toBe(false);
    expect(shownOnPage({ hook_event_name: "PostToolUse", session_id: "s-1", cwd: "/w", tool_name: "read_file", tool_input: {}, tool_use_id: "t", tool_response: "x" })).toBe(true);
  });

  it("shows compaction and the end of a turn", () => {
    expect(shownOnPage({ hook_event_name: "PostCompact", session_id: "s-1", cwd: "/w", trigger: "auto", compact_summary: "" })).toBe(true);
    expect(shownOnPage({ hook_event_name: "Stop", session_id: "s-1", cwd: "/w", last_assistant_message: null })).toBe(true);
  });
});
