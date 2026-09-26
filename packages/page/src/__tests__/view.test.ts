import { describe, it, expect } from "vitest";
import type { CardRecord, SseEvent } from "@lazycops/contracts";
import { currentCard, emptyView, fromSnapshot, reduce, summary } from "../view.js";

const at = "2026-09-26T12:00:00.000Z";
const card: CardRecord = {
  kind: "card", id: "k-1", type: "assumption", question: "Bob assumes: absent means no expiry. Is that right?",
  claim: "absent means no expiry", source: "declare_step",
  options: [{ id: "bob", text: "absent means no expiry" }, { id: "other", text: "Something else…" }, { id: "ask_why", text: "Ask Bob why" }],
};
const tool = (tool_name: string, hook_event_name: "PreToolUse" | "PostToolUse", path: string): SseEvent => ({
  type: "hook", at, seq: 1,
  payload: hook_event_name === "PostToolUse"
    ? { hook_event_name, session_id: "s", cwd: ".", tool_name, tool_input: { path }, tool_use_id: "t", tool_response: "ok" }
    : { hook_event_name, session_id: "s", cwd: ".", tool_name, tool_input: { path }, tool_use_id: "t" },
});
const run = (...events: SseEvent[]) => events.reduce(reduce, { ...emptyView(), connected: true });
const started: SseEvent = { type: "session", at, on: true, task: "Add coupon expiry" };

describe("page view", () => {
  it("is dormant until a session starts", () => {
    const view = fromSnapshot({ type: "state", at, session: null, hold: false, pending: [], history: [] });
    expect(view.task).toBeNull();
    expect(view.ended).toBe(false);
  });

  it("shows the oldest unanswered card, then the next one", () => {
    const second = { ...card, id: "k-2" };
    let view = run(started, { type: "card", at, card, waitUntil: at }, { type: "card", at, card: second });
    expect(currentCard(view)?.card.id).toBe("k-1");
    view = reduce(view, { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "bob" } });
    expect(currentCard(view)?.card.id).toBe("k-2");
  });

  it("threads Bob's reply and the developer's follow-up on the card", () => {
    const view = run(
      started,
      { type: "card", at, card },
      { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "ask_why" } },
      { type: "reply", at, text: "Because the spec has no expiry field", card: "k-1" },
      { type: "queued", at, id: "m-1", text: "It does: expiresOn", channel: "context", card: "k-1" },
    );
    expect(view.cards[0]!.thread).toEqual([
      { from: "bob", text: "Because the spec has no expiry field" },
      { from: "you", text: "It does: expiresOn" },
    ]);
  });

  it("does not echo a late card answer into its thread", () => {
    const view = run(
      started,
      { type: "card", at, card },
      { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "other", text: "end of local day" } },
      { type: "queued", at, id: "m-2", text: "The developer disagrees…", channel: "block", card: "k-1", fromAnswer: true },
    );
    expect(view.cards[0]!.thread).toEqual([]);
  });

  it("counts each file once, from PostToolUse only", () => {
    const view = run(started, tool("apply_diff", "PreToolUse", "coupon.js"), tool("apply_diff", "PostToolUse", "coupon.js"),
      tool("apply_diff", "PostToolUse", "coupon.js"), tool("read_file", "PostToolUse", "cart.js"));
    expect(view.filesEdited).toEqual(["coupon.js"]);
    expect(view.filesRead).toEqual(["cart.js"]);
    expect(view.feed.filter((f) => f.kind === "edit")).toHaveLength(2);
  });

  it("rebuilds the same view from a snapshot after a reload", () => {
    const history: SseEvent[] = [started, { type: "card", at, card }];
    const live = run(...history);
    const reloaded = fromSnapshot({ type: "state", at, session: { task: "Add coupon expiry" }, hold: false, pending: [], history });
    expect(reloaded.cards).toEqual(live.cards);
    expect(reloaded.task).toBe("Add coupon expiry");
  });

  it("wraps up when the session ends", () => {
    const view = run(
      started,
      { type: "card", at, card },
      { type: "card", at, card: { ...card, id: "k-2" } },
      { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "other", text: "x" } },
      tool("write_file", "PostToolUse", "coupon.js"),
      { type: "session", at, on: false },
    );
    expect(view.ended).toBe(true);
    expect(summary(view)).toMatchObject({ cards: 2, corrected: 1, unanswered: 1, filesEdited: ["coupon.js"] });
  });
});

describe("waiting banner", () => {
  it("shows Bob's last question on the card he is waiting on, until he stops waiting", async () => {
    const { waitingQuestion } = await import("../view.js");
    let view = run(
      started,
      { type: "card", at, card },
      { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "other", text: "store timezone" } },
      { type: "reply", at, text: "Is the timezone on cart?", card: "k-1" },
      { type: "waiting", at, on: true, until: at, card: "k-1" },
    );
    expect(waitingQuestion(view)).toEqual({ card: "k-1", text: "Is the timezone on cart?" });
    view = reduce(view, { type: "waiting", at, on: false });
    expect(waitingQuestion(view)).toBeNull();
  });
});

describe("card updates", () => {
  it("replaces a card in place when its alternative readings arrive, keeping its countdown", () => {
    const withAlternatives = { ...card, options: [card.options[0]!, { id: "alt-1", text: "end of local day" }, ...card.options.slice(1)] };
    const view = run(started, { type: "card", at, card, waitUntil: "2026-09-26T12:00:30.000Z" }, { type: "card", at, card: withAlternatives });
    expect(view.cards).toHaveLength(1);
    expect(view.cards[0]!.card.options.map((o) => o.id)).toEqual(["bob", "alt-1", "other", "ask_why"]);
    expect(view.cards[0]!.waitUntil).toBe("2026-09-26T12:00:30.000Z");
  });
});

describe("answered cards and labels", () => {
  it("labels cards by where they came from", async () => {
    const { sourceLabel } = await import("../view.js");
    expect(["declare_step", "diff", "end_session", "confirm"].map((source) => sourceLabel({ ...card, source })))
      .toEqual(["Before an edit", "After an edit", "Final review", "Checking your correction"]);
  });

  it("keeps the latest answer first, whatever order the cards were created in", async () => {
    const { answeredCards } = await import("../view.js");
    const view = run(
      started,
      { type: "card", at, card },
      { type: "card", at, card: { ...card, id: "k-2" } },
      { type: "answer", at: "2026-09-26T12:00:05.000Z", answer: { kind: "answer", card: "k-2", pick: "bob" } },
      { type: "answer", at: "2026-09-26T12:00:09.000Z", answer: { kind: "answer", card: "k-1", pick: "bob" } },
    );
    expect(answeredCards(view).map((c) => c.card.id)).toEqual(["k-1", "k-2"]);
  });

  it("a confirmation card knows what the developer had said", async () => {
    const { correctionBeingConfirmed } = await import("../view.js");
    const confirm = { ...card, id: "k-2", source: "confirm", confirms: "k-1" };
    const view = run(
      started,
      { type: "card", at, card },
      { type: "answer", at, answer: { kind: "answer", card: "k-1", pick: "other", text: "end of the local day" } },
      { type: "card", at, card: confirm },
    );
    expect(correctionBeingConfirmed(view, view.cards[1]!)).toBe("end of the local day");
  });
});

describe("hold on a card", () => {
  it("remembers which card Bob is held on until the hold ends", () => {
    let view = run(started, { type: "card", at, card }, { type: "hold", at, on: true, reason: "add date-fns", card: "k-1" });
    expect(view.holdCard).toBe("k-1");
    view = reduce(view, { type: "hold", at, on: false, reason: "answered" });
    expect(view.holdCard).toBeUndefined();
  });
});
