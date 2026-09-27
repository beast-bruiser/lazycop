import { describe, it, expect, vi, afterEach } from "vitest";
import type { CardRecord, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp } from "../mcp.js";
import { makeCard, markStale, recordAnswer } from "../review.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setRecordDir } from "../logger.js";
import { setCardWriter } from "../writer.js";

const silent = { alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => null };
afterEach(() => setCardWriter(null));

const cardsOf = (events: SseEventInput[]) => events.flatMap((e) => (e.type === "card" ? [e.card] : []));
const declare = (assumption: string) => ({ intent: "add expiry", files: ["coupon.js"], assumption });

async function correctFirstCard(pick: string, text?: string) {
  setCardWriter(silent);
  const events: SseEventInput[] = [];
  const store = watchedStore();
  store.pending.push({ id: "m-0", text: "skip the pause", channel: "context" });
  await onMcp(store, "declare_step", declare("expiresAt is a timestamp"), (e) => events.push(e));
  const first = cardsOf(events)[0] as CardRecord;
  recordAnswer(store, first, { kind: "answer", card: first.id, pick, ...(text ? { text } : {}) }, "context");
  return { store, events, first };
}

describe("a correction comes back as a confirmation card", () => {
  it("Bob's next assumption after receiving a correction asks whether he got it right", async () => {
    const { store, events, first } = await correctFirstCard("other", "expiry is the end of the local day");
    await onMcp(store, "check_in", { poll: 1 }, vi.fn()); // Bob receives the correction here
    store.pending.push({ id: "m-9", text: "skip the pause", channel: "context" });
    await onMcp(store, "declare_step", { ...declare("expiresOn is compared at the end of the store's local day"), important: false }, (e) => events.push(e));
    const next = cardsOf(events).at(-1)!;
    expect(next).toMatchObject({ source: "confirm", confirms: first.id });
    expect(next.question).toBe("Bob now reads your correction as: expiresOn is compared at the end of the store's local day. Is that what you meant?");
  });

  it("only once, and not for the assumption Bob made before he saw the correction", async () => {
    const { store, events } = await correctFirstCard("other", "end of the local day");
    // This declare_step delivers the correction in its own result: its assumption predates it.
    await onMcp(store, "declare_step", declare("written before reading the correction"), (e) => events.push(e));
    expect(cardsOf(events).at(-1)!.source).toBe("declare_step");
    store.pending.push({ id: "m-1", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("restates the correction"), (e) => events.push(e));
    expect(cardsOf(events).at(-1)!.source).toBe("confirm");
    store.pending.push({ id: "m-2", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("a later, unrelated assumption"), (e) => events.push(e));
    expect(cardsOf(events).at(-1)!.source).toBe("declare_step");
  });

  it("asking why or agreeing is not a correction", async () => {
    for (const pick of ["ask_why", "bob"]) {
      const { store, events } = await correctFirstCard(pick);
      store.pending.push({ id: "m-8", text: "note", channel: "context" });
      await onMcp(store, "check_in", { poll: 1 }, vi.fn());
      store.pending.push({ id: "m-3", text: "skip", channel: "context" });
      await onMcp(store, "declare_step", declare("next"), (e) => events.push(e));
      expect(cardsOf(events).at(-1)!.source).toBe("declare_step");
    }
  });
});

describe("stale cards", () => {
  it("older unanswered before-an-edit cards become stale when a new assumption is declared", async () => {
    setCardWriter(silent);
    const events: SseEventInput[] = [];
    const store = watchedStore();
    // First declare — creates k-1 (before-an-edit)
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("first assumption"), (e) => events.push(e));
    const k1 = cardsOf(events)[0]!;
    expect(k1.source).toBe("declare_step");
    // Second declare — k-1 should become stale
    store.pending.push({ id: "m-1", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("second assumption"), (e) => events.push(e));
    const staleEvents = events.filter((e) => e.type === "stale");
    expect(staleEvents).toHaveLength(1);
    expect((staleEvents[0] as { type: "stale"; ids: string[] }).ids).toContain(k1.id);
    // The stale card is no longer in store.cards
    expect(store.cards.has(k1.id)).toBe(false);
  });

  it("the just-declared card is never made stale by its own declaration", async () => {
    setCardWriter(silent);
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("the assumption"), (e) => events.push(e));
    const staleEvents = events.filter((e) => e.type === "stale");
    expect(staleEvents).toHaveLength(0);
  });

  it("the hold card is never made stale", () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    // Simulate a held card by inserting it directly into store.cards
    const heldCard = makeCard("held assumption", "assumption", "declare_step");
    store.cards.set(heldCard.id, heldCard);
    store.holdCard = heldCard.id;
    store.hold = true;
    // Another older unanswered declare_step card (not the held one)
    const oldCard = makeCard("old assumption", "assumption", "declare_step");
    store.cards.set(oldCard.id, oldCard);
    // markStale: the new card has a different id; it should stale oldCard but not heldCard
    const newCard = makeCard("new assumption", "assumption", "declare_step");
    markStale(store, newCard.id, (e) => events.push(e));
    const staleEvents = events.filter((e) => e.type === "stale");
    const staledIds = staleEvents.flatMap((e) => (e as { type: "stale"; ids: string[] }).ids);
    expect(staledIds).toContain(oldCard.id);
    expect(staledIds).not.toContain(heldCard.id);
  });

  it("final-review cards from end_session are never stale", () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    const review = makeCard("a coupon without expiresOn never expires", "hidden_assumption", "end_session");
    store.cards.set(review.id, review);
    const older = makeCard("old assumption", "assumption", "declare_step");
    store.cards.set(older.id, older);
    markStale(store, "k-new", (e) => events.push(e));
    const ids = events.flatMap((e) => (e.type === "stale" ? e.ids : []));
    expect(ids).toEqual([older.id]);
    expect(store.cards.has(review.id)).toBe(true);
  });

  it("stale cards are recorded as skipped", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazycop-stale-"));
    setRecordDir(dir);
    try {
      const store = watchedStore();
      const older = makeCard("old assumption", "assumption", "declare_step");
      store.cards.set(older.id, older);
      markStale(store, "k-new", vi.fn());
      const lines = readFileSync(join(dir, "stales.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
      expect(lines).toEqual([expect.objectContaining({ kind: "stale", ids: [older.id] })]);
    } finally {
      setRecordDir(null);
    }
  });
});

describe("end_session drops already-answered assumptions", () => {
  it("does not re-ask an assumption the developer already answered in this session", async () => {
    setCardWriter(silent);
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("expiresAt is a timestamp"), (e) => events.push(e));
    const card = cardsOf(events)[0] as CardRecord;
    // Developer answers the card
    recordAnswer(store, card, { kind: "answer", card: card.id, pick: "bob" }, "context");
    // end_session with the same assumption
    vi.useFakeTimers();
    const endPromise = onMcp(store, "end_session", { assumptions: ["expiresAt is a timestamp"], summary: "done", changes: [] }, (e) => events.push(e));
    await vi.runAllTimersAsync();
    const result = await endPromise;
    vi.useRealTimers();
    // Should not have created a new final-review card for the already-answered assumption
    const endCards = cardsOf(events).filter((c) => c.source === "end_session");
    expect(endCards).toHaveLength(0);
    expect(result).toContain("stopped watching");
  });

  it("still asks about assumptions not yet answered", async () => {
    setCardWriter(silent);
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", declare("expiresAt is a timestamp"), (e) => events.push(e));
    const card = cardsOf(events)[0] as CardRecord;
    recordAnswer(store, card, { kind: "answer", card: card.id, pick: "bob" }, "context");
    // end_session with a different assumption never seen before
    vi.useFakeTimers();
    const endPromise = onMcp(store, "end_session", { assumptions: ["timezone is from the store not the user"], summary: "done", changes: [] }, (e) => events.push(e));
    await vi.runAllTimersAsync();
    await endPromise;
    vi.useRealTimers();
    const endCards = cardsOf(events).filter((c) => c.source === "end_session");
    expect(endCards).toHaveLength(1);
  });
});
