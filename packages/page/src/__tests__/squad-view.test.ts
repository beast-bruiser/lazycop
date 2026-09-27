import { describe, it, expect } from "vitest";
import type { CardRecord, SseEvent } from "@lazycops/contracts";
import { SOLO, emptySquad, focused, focusedView, reduceSquad } from "../squad-view.js";
import { buildSquadMap, homeSlot } from "../map-model.js";

const at = (s: number) => `2026-09-26T12:00:0${s}.000Z`;
const start = (agent: string, task: string, s = 0): SseEvent => ({ type: "session", at: at(s), on: true, task, agent });
const read = (agent: string, path: string, s: number): SseEvent => ({
  type: "hook", at: at(s), seq: s, agent,
  payload: { hook_event_name: "PostToolUse", session_id: agent, cwd: "/w", tool_name: "read_file", tool_input: { path }, tool_use_id: "t", tool_response: "ok" },
});
const card = (id: string): CardRecord => ({
  kind: "card", id, type: "assumption", question: "q", claim: "c", source: "declare_step",
  options: [{ id: "bob", text: "c" }, { id: "other", text: "Something else…" }, { id: "ask_why", text: "Ask Bob why" }],
});
const run = (...events: SseEvent[]) => events.reduce(reduceSquad, emptySquad());

describe("squad view", () => {
  it("folds each agent's events into its own view", () => {
    const squad = run(start("a", "Coupons"), start("b", "Rounding"), read("a", "src/x.ts", 1), { type: "card", at: at(2), card: card("k-1"), agent: "b" });
    expect(squad.agents.map((a) => [a.id, a.n, a.view.task])).toEqual([["a", 1, "Coupons"], ["b", 2, "Rounding"]]);
    expect(squad.agents[0]!.view.trail).toHaveLength(1);
    expect(squad.agents[0]!.view.cards).toHaveLength(0);
    expect(squad.agents[1]!.view.cards).toHaveLength(1);
  });

  it("focuses the agent picked, else the newest one still watched", () => {
    const squad = run(start("a", "Coupons"), start("b", "Rounding"), { type: "session", at: at(3), on: false, agent: "b" });
    expect(focused(squad, null)?.id).toBe("a");
    expect(focused(squad, "b")?.id).toBe("b");
    expect(focusedView(emptySquad(), null).task).toBeNull();
  });

  it("follows the agent whose card has waited longest, unless one was picked", () => {
    const squad = run(start("a", "Coupons"), start("b", "Rounding"), start("c", "Docs"),
      { type: "card", at: at(2), card: card("k-1"), agent: "b" }, { type: "card", at: at(3), card: card("k-2"), agent: "a" });
    expect(focused(squad, null)?.id).toBe("b");
    expect(focused(squad, "c")?.id).toBe("c");
  });

  it("rebuilds every agent from a snapshot", () => {
    const history = [start("a", "Coupons"), start("b", "Rounding"), read("b", "docs/y.md", 1)];
    const squad = run({
      type: "state", at: at(5), session: { task: "Rounding" }, hold: true, pending: [], history,
      agents: [
        { id: "a", n: 1, task: "Coupons", watching: false, hold: false },
        { id: "b", n: 2, task: "Rounding", watching: true, hold: true },
      ],
    });
    expect(squad.agents.map((a) => [a.id, a.view.ended, a.view.hold, a.view.trail.length])).toEqual([["a", true, false, 0], ["b", false, true, 1]]);
  });

  it("reads a server without agents as one solo agent", () => {
    const squad = run({ type: "state", at: at(0), session: { task: "Coupons" }, hold: false, pending: [], history: [{ type: "session", at: at(0), on: true, task: "Coupons" }] });
    expect(squad.agents.map((a) => a.id)).toEqual([SOLO]);
  });

  it("starts a fresh squad once every agent has ended", () => {
    const squad = run(start("a", "Coupons"), { type: "session", at: at(1), on: false, agent: "a" }, start("b", "Rounding", 2));
    expect(squad.agents.map((a) => [a.id, a.n])).toEqual([["b", 1]]);
  });

  it("shares places across the squad and puts each soldier at its own", () => {
    const squad = run(start("a", "Coupons"), start("b", "Rounding"), read("b", "docs/y.md", 1), read("a", "src/x.ts", 2), read("b", "src/z.ts", 3));
    const map = buildSquadMap(squad.agents, "a");
    expect(map.places.map((p) => p.key)).toEqual(["", "docs", "src"]);
    expect(map.soldiers.map((s) => [s.id, s.at])).toEqual([["a", homeSlot("src")], ["b", homeSlot("src")]]);
    expect(map.places.find((p) => p.key === "src")!.visits).toBe(2);
  });
});
