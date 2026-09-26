import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CardRecord, AnswerRecord } from "@lazycops/contracts";
import { createStore, setHold } from "../store.js";
import { watchedStore } from "./helpers.js";
import { onMcp, PAUSE_MS } from "../mcp.js";
import { recordAnswer } from "../review.js";
import { onHook } from "../hook.js";

const assumption = "expiresAt is a Date compared to now";

describe("answers are never lost", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("an answer after the 20 s pause reaches Bob at its next tool call", async () => {
    const store = watchedStore();
    const declare = onMcp(store, "declare_step", { intent: "add check", files: ["coupon.js"], assumption }, vi.fn());
    const card = [...store.cards.values()][0] as CardRecord;
    await vi.advanceTimersByTimeAsync(PAUSE_MS + 10);
    expect(await declare).toBe("No messages. Continue.");

    const late: AnswerRecord = { kind: "answer", card: card.id, pick: "other", text: "end of the customer's local day" };
    recordAnswer(store, card, late, "block");

    const next = onHook(store, { hook_event_name: "PreToolUse", session_id: "s-1", cwd: ".", tool_name: "apply_diff", tool_input: {}, tool_use_id: "t-1" });
    expect(next.block).toContain(`disagrees with: ${assumption}`);
    expect(next.block).toContain("end of the customer's local day");
  });

  it("an agreeing late answer queues nothing", () => {
    const store = createStore();
    const card: CardRecord = { kind: "card", id: "k-9", type: "assumption", question: "q", claim: assumption, source: "declare_step", options: [] };
    recordAnswer(store, card, { kind: "answer", card: "k-9", pick: "bob" }, "block");
    expect(store.pending).toHaveLength(0);
  });
});

describe("declare_step with an assumption does not skip what is already waiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delivers queued developer messages without pausing", async () => {
    const store = watchedStore();
    store.pending.push({ id: "m-1", text: "Use the store timezone", channel: "context" });
    const result = await onMcp(store, "declare_step", { intent: "add check", files: ["coupon.js"], assumption }, vi.fn());
    expect(result).toContain("Use the store timezone");
    expect(store.cards.size).toBe(1);
  });

  it("respects an active hold instead of returning Continue", async () => {
    const store = watchedStore();
    setHold(store, true);
    const declare = onMcp(store, "declare_step", { intent: "add check", files: ["coupon.js"], assumption }, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    store.pending.push({ id: "m-2", text: "Wait for my review", channel: "context" });
    for (const done of store.waiters) done();
    const result = await declare;
    expect(result).toContain("Wait for my review");
    expect(result).toContain("still reviewing");
  });
});

describe("check_in waits for the developer instead of letting Bob poll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the developer's message as soon as it is queued", async () => {
    const store = watchedStore();
    const waiting = onMcp(store, "check_in", { poll: 1 }, vi.fn());
    await vi.advanceTimersByTimeAsync(3000);
    store.pending.push({ id: "m-3", text: "Yes, no expiry field means it never expires", channel: "context" });
    for (const done of store.waiters) done();
    expect(await waiting).toContain("never expires");
  });

  it("after one full wait with no answer, tells Bob to continue on its assumption", async () => {
    const store = watchedStore();
    const waiting = onMcp(store, "check_in", { poll: 1 }, vi.fn());
    await vi.advanceTimersByTimeAsync(44_000);
    let settled = false;
    void waiting.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await waiting).toContain("Continue with your stated assumption");
  });
});

describe("card wording", () => {
  it("does not double the claim's final period", async () => {
    const store = watchedStore();
    store.pending.push({ id: "m-4", text: "skip the pause", channel: "context" });
    await onMcp(store, "declare_step", { intent: "x", files: ["a"], assumption: "absent means no expiry." }, vi.fn());
    const card = [...store.cards.values()][0] as CardRecord;
    expect(card.question).toBe("Bob assumes: absent means no expiry. Is that right?");
  });
});
