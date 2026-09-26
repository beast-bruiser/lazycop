import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp } from "../mcp.js";
import { startSession } from "../session.js";

describe("events the page relies on", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("an assumption card never carries a countdown: Bob does not wait for it", async () => {
    const events: SseEventInput[] = [];
    await onMcp(watchedStore(), "declare_step", { intent: "x", files: ["a"], assumption: "A1" }, (e) => events.push(e));
    const card = events.find((e) => e.type === "card");
    expect(card && "waitUntil" in card ? card.waitUntil : undefined).toBeUndefined();
  });

  it("Bob's reply is attached to the card behind the message it answers", async () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m-2", text: "why?", channel: "context", card: "k-7" });
    await onMcp(store, "check_in", { poll: 1 }, vi.fn());
    await onMcp(store, "reply_to_developer", { text: "Because the spec says so" }, (e) => events.push(e));
    expect(events.find((e) => e.type === "reply")).toMatchObject({ card: "k-7", text: "Because the spec says so" });
  });

  it("a new session starts with an empty history", () => {
    const store = watchedStore();
    store.history.push({ type: "hold", at: "t", on: true, reason: "developer" });
    startSession(store, "Next task");
    expect(store.history).toEqual([]);
  });
});

describe("waiting for the developer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("tells the page while check_in waits, on the card Bob asked about", async () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m-5", text: "why?", channel: "context", card: "k-3" });
    await onMcp(store, "check_in", { poll: 1 }, vi.fn());
    await onMcp(store, "reply_to_developer", { text: "Is the timezone on cart?" }, vi.fn());
    const waiting = onMcp(store, "check_in", { poll: 1 }, (e) => events.push(e));
    expect(events.find((e) => e.type === "waiting")).toMatchObject({ on: true, card: "k-3" });
    await vi.advanceTimersByTimeAsync(46_000);
    await waiting;
    expect(events.filter((e) => e.type === "waiting").at(-1)).toMatchObject({ on: false });
  });
});
