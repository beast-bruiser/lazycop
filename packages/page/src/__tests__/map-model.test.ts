import { describe, it, expect } from "vitest";
import type { CardRecord, SseEvent } from "@lazycops/contracts";
import { emptyView, health, reduce } from "../view.js";
import type { MapModel } from "../map-model.js";
import { DROP_ZONE, ROADS, SLOTS, UNCHARTED, buildMap, homeSlot, placeKey, route } from "../map-model.js";

const at = "2026-09-26T12:00:00.000Z";
const cwd = "/work/shop";
const post = (tool_name: string, tool_input: unknown): SseEvent => ({
  type: "hook", at, seq: 1,
  payload: { hook_event_name: "PostToolUse", session_id: "s", cwd, tool_name, tool_input, tool_use_id: "t", tool_response: "ok" },
});
const card = (id: string): CardRecord => ({
  kind: "card", id, type: "assumption", question: "q", claim: "c", source: "declare_step",
  options: [{ id: "bob", text: "c" }, { id: "other", text: "Something else…" }, { id: "ask_why", text: "Ask Bob why" }],
});
const slotOf = (map: MapModel, key: string) => map.places.find((p) => p.key === key)!.slot;
const run = (...events: SseEvent[]) =>
  events.reduce(reduce, reduce({ ...emptyView(), connected: true }, { type: "session", at, on: true, task: "t" }));

describe("tactical map", () => {
  it("keys places by top-level folder, or package folder in a monorepo", () => {
    expect(placeKey("src/cart/coupon.ts")).toBe("src");
    expect(placeKey("packages/page/src/app.ts")).toBe("packages/page");
    expect(placeKey("README.md")).toBe("(root)");
    expect(placeKey("./docs/a.md")).toBe("docs");
    expect(placeKey("docs", true)).toBe("docs");
    expect(placeKey(".", true)).toBe("(root)");
  });

  it("starts Bob at the drop zone with only the drop zone revealed", () => {
    const map = buildMap(run());
    expect(map.at).toBe(DROP_ZONE);
    expect(map.places.map((p) => p.slot)).toEqual([DROP_ZONE]);
  });

  it("reveals a place per folder Bob touches, relative to the repo, and moves him there", () => {
    const view = run(post("read_file", { path: `${cwd}/src/cart.ts` }), post("search_files", { path: "docs" }),
      post("apply_diff", { path: "src/coupon.ts" }));
    const map = buildMap(view);
    expect(view.trail.map((s) => s.path)).toEqual(["src/cart.ts", "docs", "src/coupon.ts"]);
    expect(map.places.map((p) => [p.key, p.visits, p.edits])).toEqual([["", 0, 0], ["src", 2, 1], ["docs", 1, 0]]);
    expect(map.at).toBe(slotOf(map, "src"));
    expect(map.steps).toBe(3);
  });

  it("sends Bob to the drop zone for a shell command", () => {
    const map = buildMap(run(post("read_file", { path: "src/a.ts" }), post("execute_command", { command: "npm test" })));
    expect(map.at).toBe(DROP_ZONE);
    expect(map.places.find((p) => p.slot === DROP_ZONE)!.visits).toBe(1);
    expect(map.places.find((p) => p.key === "src")!.slot).toBe(homeSlot("src"));
  });

  it("keeps a folder at the same spot whatever order Bob reaches it in", () => {
    const one = buildMap(run(post("read_file", { path: "src/a.ts" }), post("read_file", { path: "docs/b.md" })));
    const two = buildMap(run(post("read_file", { path: "docs/b.md" }), post("read_file", { path: "src/a.ts" })));
    expect(slotOf(one, "src")).toBe(slotOf(two, "src"));
    expect(slotOf(one, "docs")).toBe(slotOf(two, "docs"));
    expect(slotOf(one, "src")).not.toBe(slotOf(one, "docs"));
  });

  it("folds folders past the last free slot into one uncharted place", () => {
    const folders = Array.from({ length: SLOTS.length + 2 }, (_, i) => post("read_file", { path: `f${i}/x.ts` }));
    const map = buildMap(run(...folders));
    expect(map.places).toHaveLength(SLOTS.length);
    expect(map.places.find((p) => p.slot === UNCHARTED)!.label).toBe("UNCHARTED");
    expect(map.at).toBe(UNCHARTED);
  });

  it("stands each unanswered card where Bob was when it arrived", () => {
    const view = run(
      { type: "card", at, card: card("k-0") },
      post("read_file", { path: "src/a.ts" }),
      { type: "card", at, card: card("k-1") },
      post("read_file", { path: "docs/b.md" }),
      { type: "card", at, card: card("k-2") },
      { type: "answer", at, answer: { kind: "answer", card: "k-0", pick: "bob" } },
    );
    const map = buildMap(view);
    expect(map.enemies).toEqual([{ card: "k-1", slot: slotOf(map, "src"), active: true }, { card: "k-2", slot: slotOf(map, "docs"), active: false }]);
  });

  it("leaves no enemies once the task ends, since its open cards were cancelled", () => {
    const view = run({ type: "card", at, card: card("k-1") }, { type: "session", at, on: false });
    expect(buildMap(view).enemies).toEqual([]);
  });

  it("walks along roads between slots", () => {
    const path = route(1, 7);
    expect(path[0]).toBe(1);
    expect(path.at(-1)).toBe(7);
    for (let i = 1; i < path.length; i++) {
      expect(ROADS.some(([a, b]) => (a === path[i - 1] && b === path[i]) || (b === path[i - 1] && a === path[i]))).toBe(true);
    }
    expect(route(3, 3)).toEqual([3]);
  });
});

describe("health", () => {
  it("drops only when the developer corrects an assumption", () => {
    const answer = (id: string, pick: string): SseEvent => ({ type: "answer", at, answer: { kind: "answer", card: id, pick } });
    const cards = ["k-1", "k-2", "k-3"].map((id): SseEvent => ({ type: "card", at, card: card(id) }));
    expect(health(run(...cards))).toBe(100);
    expect(health(run(...cards, answer("k-1", "bob"), answer("k-2", "ask_why")))).toBe(100);
    expect(health(run(...cards, answer("k-1", "other")))).toBe(80);
  });
});
