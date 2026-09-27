// Replays the live run of 27 Sep 09:30 (~/lazycop-demo, --docs SPEC.md) with Bob's real wording.
import { describe, it, expect, vi, afterEach } from "vitest";
import type { CardRecord, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp } from "../mcp.js";
import { recordAnswer } from "../review.js";
import { meaningful, setCardWriter } from "../writer.js";

const K1 = "Expiry is checked by comparing the end of expiresOn day (23:59:59.999) in cart.timezone against the current time; a coupon missing expiresOn is also rejected (no discount) per the spec";
const SPEC_QUOTE = "A coupon without an expiry date is rejected: it gives no discount.";
const ROUND_1 = [
  "Expiry is checked against the wall-clock end of the expiresOn day (23:59:59.999) in cart.timezone using toLocaleString+Date re-parsing, which is standard in Node.js/browser environments with Intl support",
  "A coupon missing expiresOn is treated as invalid/rejected (no discount), matching the spec line 'A coupon without an expiry date is rejected'",
];
const ROUND_2 = [
  "Expiry is checked by computing end-of-day (23:59:59.999) in cart.timezone via toLocaleString+Date re-parsing, which works in Intl-capable environments (Node.js/browsers)",
  "A coupon missing expiresOn is rejected (no discount) per SPEC.md: 'A coupon without an expiry date is rejected: it gives no discount.'",
];

afterEach(() => { vi.useRealTimers(); setCardWriter(null); });

describe("replay of the 09:30 live run", () => {
  it("shows one new final-review card instead of four", async () => {
    setCardWriter({ alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => null });
    const store = watchedStore();
    const events: SseEventInput[] = [];
    const push = (e: SseEventInput) => events.push(e);
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "add expiry", files: ["coupon.js"], assumption: K1 }, push);
    const k1 = events.flatMap((e) => (e.type === "card" ? [e.card] : []))[0]!;
    const k2: CardRecord = { ...k1, id: "k-spec", source: "spec", about: k1.id, quote: { path: "SPEC.md", text: SPEC_QUOTE } };
    recordAnswer(store, k1, { kind: "answer", card: k1.id, pick: "alt-1", text: "Only check expiry (skip the missing-expiresOn rejection, treat it as always-valid)" }, "block");
    recordAnswer(store, k2, { kind: "answer", card: k2.id, pick: "spec", text: "Missing expiresOn rejects coupon" }, "block");

    vi.useFakeTimers();
    const endCards = () => events.flatMap((e) => (e.type === "card" && e.card.source === "end_session" ? [e.card.claim] : []));

    const first = onMcp(store, "end_session", { assumptions: ROUND_1, summary: "s", changes: [] }, push);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(await first).toContain("Before you finish"); // the two waiting corrections are handed over
    expect(endCards()).toEqual([ROUND_1[0]!.replace(/[.\s]+$/, "")]);

    const second = onMcp(store, "end_session", { assumptions: ROUND_2, summary: "s", changes: [] }, push);
    await vi.advanceTimersByTimeAsync(46_000);
    expect(await second).toContain("stopped watching");
    expect(endCards()).toHaveLength(1); // round 2 asks nothing new
  });
});

describe("model filler never becomes a card", () => {
  it("rejects the live run's filler and keeps real statements", () => {
    expect(["unit", "[No notable behavior specified]", "None", "No notable behaviour change.", "N/A"].map(meaningful)).toEqual([false, false, false, false, false]);
    expect(meaningful("a coupon without expiresOn never expires")).toBe(true);
    expect(meaningful("expiry uses the server's timezone, not cart.timezone")).toBe(true);
  });
});

describe("one final review per task", () => {
  it("a second end_session after fixing objections opens no new review, even for new wording", async () => {
    setCardWriter({ alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => null });
    const store = watchedStore();
    const events: SseEventInput[] = [];
    const reviewCards = () => events.filter((e) => e.type === "card" && e.card.source === "end_session");
    vi.useFakeTimers();
    const first = onMcp(store, "end_session", { assumptions: ["a coupon is valid on its expiresOn date"], summary: "s", changes: [] }, (e) => events.push(e));
    const card = reviewCards()[0]!;
    const { resolveCard } = await import("../cards.js");
    resolveCard(card.type === "card" ? card.card.id : "", { kind: "answer", card: card.type === "card" ? card.card.id : "", pick: "other", text: "it expires at the start of that day" });
    expect(await first).toContain("Before you finish");
    const second = onMcp(store, "end_session", { assumptions: ["en-CA gives YYYY-MM-DD for comparing dates"], summary: "s", changes: [] }, (e) => events.push(e));
    expect(await second).toContain("stopped watching");
    expect(reviewCards()).toHaveLength(1);
  });
});

describe("an answer given during the final review", () => {
  it("closes a final-review card it already settles (the 09:41 run: k-2 answered while k-4 was open)", async () => {
    setCardWriter({ alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => null });
    const { closeSettledReviews, makeCard } = await import("../review.js");
    const store = watchedStore();
    const events: SseEventInput[] = [];
    vi.useFakeTimers();
    const ending = onMcp(store, "end_session", {
      assumptions: ["A coupon with no expiresOn field is rejected (gives no discount), per SPEC.md line 5", "en-CA gives YYYY-MM-DD for comparing dates"],
      summary: "s", changes: [],
    }, (e) => events.push(e));
    const spec: CardRecord = { ...makeCard("Expiry is checked at the end of the expiresOn day", "spec_check", "declare_step"), source: "spec", quote: { path: "SPEC.md", text: SPEC_QUOTE } };
    recordAnswer(store, spec, { kind: "answer", card: spec.id, pick: "spec", text: "Reject coupons without expiresOn" }, "block");
    closeSettledReviews(store, (e) => events.push(e));
    const stale = events.flatMap((e) => (e.type === "stale" ? e.ids : []));
    const review = events.flatMap((e) => (e.type === "card" && e.card.source === "end_session" ? [e.card] : []));
    expect(stale).toEqual([review[0]!.id]); // the "no expiresOn is rejected" card closes
    expect(store.cards.has(review[1]!.id)).toBe(true); // the en-CA point stays open: it is new
    await vi.advanceTimersByTimeAsync(46_000);
    expect(await ending).toContain("Before you finish"); // the spec answer itself still reaches Bob
  });
});
