import { describe, it, expect } from "vitest";
import type { HookPayload, SseEvent } from "@lazycops/contracts";
import { emptyView, reduce } from "../view.js";
import { lockedSkills } from "../loadout.js";

const at = "2026-09-27T10:00:00.000Z";
const base = { session_id: "s-1", cwd: "/work" };
const hook = (payload: HookPayload): SseEvent => ({ type: "hook", at, seq: 0, payload });
const post = (tool_name: string, tool_input: unknown = {}, tool_use_id = "t"): SseEvent =>
  hook({ ...base, hook_event_name: "PostToolUse", tool_name, tool_input, tool_use_id, tool_response: "ok" });
const spawn = (id: string, name?: string): SseEvent =>
  hook({ ...base, hook_event_name: "PreToolUse", tool_name: "spawn_subagent", tool_input: { name, description: `find ${id}` }, tool_use_id: id });
const start: SseEvent = {
  type: "session", at, on: true, task: "t",
  skills: [{ name: "tdd-workflow", description: "tests first" }, { name: "systematic-debugging", description: "debug" }],
};
const run = (...events: SseEvent[]) => events.reduce(reduce, reduce({ ...emptyView(), connected: true }, start)).loadout;

describe("a soldier's loadout", () => {
  it("counts each finished tool call under its weapon", () => {
    const l = run(post("read_file", { path: "a" }), post("grep"), post("apply_diff", { path: "a" }), post("execute_command"), post("mcp__lazycop__declare_step"), post("read_file", { path: "b" }));
    expect(l.shots).toEqual({ recon: 2, search: 1, edit: 1, command: 1, radio: 1 });
  });

  it("does not count a call that has not finished", () => {
    const l = run(hook({ ...base, hook_event_name: "PreToolUse", tool_name: "read_file", tool_input: {}, tool_use_id: "t" }));
    expect(l.shots.recon).toBe(0);
  });

  it("learns a skill Bob loads and forgets it at compaction", () => {
    const learned = run(post("use_skill", { skill_name: "tdd-workflow" }), post("use_skill", { skill_name: "create-plan" }));
    expect(learned.learned).toEqual(["tdd-workflow", "create-plan"]);
    expect(lockedSkills(learned).map((s) => s.name)).toEqual(["systematic-debugging"]);
    const after = run(post("use_skill", { skill_name: "tdd-workflow" }), hook({ ...base, hook_event_name: "PostCompact", trigger: "auto", compact_summary: "" }));
    expect(after.learned).toEqual([]);
    expect(lockedSkills(after)).toHaveLength(2);
  });

  it("credits a lone subagent's calls to it, not to the soldier", () => {
    const l = run(spawn("x", "explore"), post("read_file", { path: "a" }), post("spawn_subagent", {}, "x"), post("read_file", { path: "b" }));
    expect(l.subagents).toEqual([{ id: "x", preset: "explore", task: "find x", running: false, returned: true, calls: 1 }]);
    expect(l.shots.recon).toBe(1);
  });

  it("never credits one of several running subagents", () => {
    const l = run(spawn("x"), spawn("y"), post("grep"), post("grep"));
    expect(l.subagents.map((s) => [s.preset, s.running, s.calls])).toEqual([["general", true, 0], ["general", true, 0]]);
    expect(l.sharedCalls).toBe(2);
    expect(l.shots.search).toBe(0);
  });

  it("ends a subagent that never returned when the chat stops", () => {
    const l = run(spawn("x"), hook({ ...base, hook_event_name: "Stop", last_assistant_message: null }));
    expect(l.subagents.map((s) => [s.running, s.returned])).toEqual([[false, false]]);
  });

  it("takes the mode Bob switched to as the soldier's class", () => {
    expect(run().mode).toBeNull();
    expect(run(post("switch_mode", { mode_id: "implementer" })).mode).toBe("implementer");
  });
});
