import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookPayload, SseEventInput } from "@lazycops/contracts";
import { createStore } from "../store.js";
import { onHook } from "../hook.js";
import { onMcp } from "../mcp.js";
import { endSession } from "../session.js";
import { definedSkills } from "../skills.js";

function workspace(skills: Record<string, string>): string {
  const ws = mkdtempSync(join(tmpdir(), "lazycop-skills-"));
  for (const [dir, text] of Object.entries(skills)) {
    mkdirSync(join(ws, ".bob", "skills", dir), { recursive: true });
    writeFileSync(join(ws, ".bob", "skills", dir, "SKILL.md"), text);
  }
  return ws;
}

describe("the skills a soldier can learn", () => {
  it("lists each skill in .bob/skills by its frontmatter name and description", () => {
    const ws = workspace({
      tdd: "---\nname: tdd-workflow\ndescription: \"Tests first\"\n---\n# TDD\n",
      debug: "---\nname: systematic-debugging\ndescription: Find the cause first\n---\n",
      broken: "# no frontmatter\n",
    });
    mkdirSync(join(ws, ".bob", "skills", "empty"));
    expect(definedSkills(ws)).toEqual([
      { name: "systematic-debugging", description: "Find the cause first" },
      { name: "tdd-workflow", description: "Tests first" },
    ]);
  });

  it("gives none when the repo has no .bob/skills", () => {
    expect(definedSkills(mkdtempSync(join(tmpdir(), "lazycop-skills-")))).toEqual([]);
    expect(definedSkills(undefined)).toEqual([]);
  });

  it("sends the roster with the session start", async () => {
    const ws = workspace({ tdd: "---\nname: tdd-workflow\ndescription: Tests first\n---\n" });
    const store = createStore();
    const start: HookPayload = {
      hook_event_name: "PreToolUse", session_id: "s-1", cwd: ws, tool_name: "mcp__lazycop__start_session", tool_input: { task: "t" }, tool_use_id: "t-0",
    };
    onHook(store, start);
    const events: SseEventInput[] = [];
    await onMcp(store, "start_session", { task: "t" }, (e) => events.push(e));
    endSession(store);
    expect(events.find((e) => e.type === "session")).toMatchObject({ on: true, skills: [{ name: "tdd-workflow", description: "Tests first" }] });
  });
});
