import { describe, it, expect } from "vitest";
import type { SseEvent } from "@lazycops/contracts";
import { emptySquad, reduceSquad } from "../squad-view.js";
import { DROP_ZONE, buildSquadMap, homeSlot } from "../map-model.js";

const at = (s: number) => `2026-09-26T12:00:${String(s).padStart(2, "0")}.000Z`;
const read = (agent: string, path: string, s: number): SseEvent => ({
  type: "hook", at: at(s), seq: s, agent,
  payload: { hook_event_name: "PostToolUse", session_id: agent, cwd: "/w", tool_name: "read_file", tool_input: { path }, tool_use_id: "t", tool_response: "ok" },
});
const step = (agent: string, intent: string, s: number): SseEvent => ({ type: "mcp", at: at(s), tool: "declare_step", args: { intent }, agent });
const run = (...events: SseEvent[]) => events.reduce(reduceSquad, emptySquad());
const start: SseEvent = { type: "session", at: at(0), on: true, task: "t", agent: "a" };

describe("route lines and checkpoints", () => {
  it("remembers the places an agent went, from the drop zone, without repeats in a row", () => {
    const squad = run(start, read("a", "src/x.ts", 1), read("a", "src/y.ts", 2), read("a", "docs/z.md", 3), read("a", "src/w.ts", 4));
    const map = buildSquadMap(squad.agents, "a");
    const [src, docs] = ["src", "docs"].map((k) => map.places.find((p) => p.key === k)!.slot);
    expect(map.soldiers[0]!.route).toEqual([DROP_ZONE, src, docs, src]);
  });

  it("keeps only the last eight places", () => {
    const events = Array.from({ length: 12 }, (_, i) => read("a", `${i % 2 ? "src" : "docs"}/f.ts`, i + 1));
    expect(buildSquadMap(run(start, ...events).agents, "a").soldiers[0]!.route).toHaveLength(8);
  });

  it("plants a flag where the agent stood when it declared a step, once per place", () => {
    const squad = run(start, step("a", "plan", 1), read("a", "src/x.ts", 2), step("a", "edit x", 3), step("a", "edit x again", 4));
    expect(buildSquadMap(squad.agents, "a").flags).toEqual([{ slot: DROP_ZONE, n: 1 }, { slot: homeSlot("src"), n: 1 }]);
  });
});
