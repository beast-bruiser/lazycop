import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardRecord, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { addDoc, fileText, isDocPath, loadNamedDocs, quoteAppears, DOC_BUDGET } from "../docs.js";
import { answerToMessage, recordAnswer, specCheck } from "../review.js";
import { onMcp } from "../mcp.js";
import { setCardWriter } from "../writer.js";
import type { CardWriter, SpecFinding } from "../writer.js";

const SPEC = "# Coupons\n\nCoupons expire at the end of the day in the store's timezone (`cart.timezone`).\nA coupon without an expiry date is rejected.\n";
const assumptionCard: CardRecord = {
  kind: "card", id: "k-1", type: "assumption", question: "q", claim: "an expired coupon is one with expiresAt < now", source: "declare_step",
  options: [{ id: "bob", text: "an expired coupon is one with expiresAt < now" }],
};
const writerFinding = (finding: SpecFinding | null): CardWriter => ({ alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => finding });
const cardsOf = (events: SseEventInput[]) => events.flatMap((e) => (e.type === "card" ? [e.card] : []));

afterEach(() => setCardWriter(null));

describe("the task's documents", () => {
  it("counts prose files as documents, not code", () => {
    expect(["SPEC.md", "docs/api.rst", "notes.txt", "requirements.pdf", "design-notes"].map(isDocPath)).toEqual([true, true, true, true, true]);
    expect(["coupon.js", "spec/coupon.test.ts", "readme.json"].map(isDocPath)).toEqual([false, false, false]);
  });

  it("gives back a file's text from Bob's numbered read_file view", () => {
    expect(fileText("Contents of file SPEC.md:\n\n1 | # Coupons\n2 | \n3 | Coupons expire.\n")).toBe("# Coupons\n\nCoupons expire.");
  });

  it("loads named documents inside the workspace only, and keeps the budget", () => {
    const ws = mkdtempSync(join(tmpdir(), "lazycop-docs-"));
    mkdirSync(join(ws, "docs"));
    writeFileSync(join(ws, "SPEC.md"), SPEC);
    writeFileSync(join(ws, "docs", "big.md"), "x".repeat(DOC_BUDGET));
    const store = watchedStore();
    const events: SseEventInput[] = [];
    expect(loadNamedDocs(store, ws, ["SPEC.md", "../etc/passwd", "/etc/hosts", "missing.md", "docs/big.md"], (e) => events.push(e))).toEqual(["SPEC.md", "docs/big.md"]);
    expect([...store.docs.values()].reduce((n, t) => n + t.length, 0)).toBe(DOC_BUDGET);
    expect(addDoc(store, "more.md", "anything", "bob", vi.fn())).toBe(false);
    expect(events.filter((e) => e.type === "doc")).toHaveLength(2);
  });

  it("recognises a quote despite spacing, case and markdown, but not a paraphrase", () => {
    expect(quoteAppears(SPEC, "coupons expire at the end of the day in the store's timezone (cart.timezone).")).toBe(true);
    expect(quoteAppears(SPEC, "Coupons expire at midnight UTC.")).toBe(false);
    expect(quoteAppears(SPEC, "rejected")).toBe(false); // too short to prove anything
  });
});

describe("the spec check", () => {
  it("shows a card quoting the passage, with what the documents say as an option", async () => {
    setCardWriter(writerFinding({ path: "SPEC.md", quote: "Coupons expire at the end of the day in the store's timezone", reading: "expiry is the end of the store's local day." }));
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    const card = cardsOf(events)[0]!;
    expect(card).toMatchObject({ type: "spec_check", source: "spec", about: "k-1", quote: { path: "SPEC.md" } });
    expect(card.options.map((o) => o.id)).toEqual(["bob", "spec", "other", "ask_why"]);
    expect(card.options[1]!.text).toBe("Coupons expire at the end of the day in the store's timezone"); // the quote, not the paraphrase
    const message = answerToMessage(card, { kind: "answer", card: card.id, pick: "spec", text: card.options[1]!.text });
    expect(message).toContain('follow SPEC.md: "Coupons expire at the end of the day in the store\'s timezone"');
    expect(message).not.toContain("disagrees"); // the spec may agree with Bob: he checks, he is not told he was wrong
  });

  it("drops a finding whose quote is not in the document", async () => {
    setCardWriter(writerFinding({ path: "SPEC.md", quote: "Coupons expire exactly at midnight UTC every day", reading: "midnight UTC" }));
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    expect(cardsOf(events)).toHaveLength(0);
  });

  it("asks nothing without documents", async () => {
    let asked = false;
    setCardWriter({ ...writerFinding(null), specCheck: async () => ((asked = true), null) });
    await specCheck(watchedStore(), assumptionCard, vi.fn());
    expect(asked).toBe(false);
  });
});

describe("spec-check deduplication", () => {
  const FINDING: SpecFinding = { path: "SPEC.md", quote: "Coupons expire at the end of the day in the store's timezone", reading: "expiry is end of store's local day." };

  it("suppresses a spec check when the same quote was already shown in this session", async () => {
    setCardWriter(writerFinding(FINDING));
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    expect(cardsOf(events)).toHaveLength(1);
    // Second call with same writer finding — same quote key is already in shownQuotes.
    await specCheck(store, { ...assumptionCard, id: "k-2" }, (e) => events.push(e));
    expect(cardsOf(events)).toHaveLength(1); // still only one card
  });

  it("shows a spec check again when the quote is different", async () => {
    setCardWriter(writerFinding(FINDING));
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    // Different quote from a different call.
    setCardWriter(writerFinding({ path: "SPEC.md", quote: "A coupon without an expiry date is rejected", reading: "no expiry means rejected." }));
    await specCheck(store, { ...assumptionCard, id: "k-2" }, (e) => events.push(e));
    expect(cardsOf(events)).toHaveLength(2);
  });

  it("a confirmation of a correction taken from the spec gets no spec check, through the real flow", async () => {
    let asked = 0;
    setCardWriter({ ...writerFinding(FINDING), specCheck: async () => (asked++, FINDING) });
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "x", files: ["coupon.js"], assumption: "an expired coupon is one with expiresAt < now" }, (e) => events.push(e));
    await new Promise((r) => setImmediate(r));
    const spec = cardsOf(events).find((c) => c.source === "spec")!;
    recordAnswer(store, spec, { kind: "answer", card: spec.id, pick: "spec", text: spec.options[1]!.text }, "block");
    await onMcp(store, "check_in", { poll: 1 }, vi.fn()); // Bob receives the spec correction
    store.pending.push({ id: "m-1", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "y", files: ["coupon.js"], assumption: "expiry is the end of the store's local day" }, (e) => events.push(e));
    await new Promise((r) => setImmediate(r));
    expect(cardsOf(events).at(-1)!.source).toBe("confirm");
    expect(asked).toBe(1); // only the first assumption was checked
  });

  it("a confirmation of any other correction still gets its spec check", async () => {
    let asked = 0;
    const other: SpecFinding = { path: "SPEC.md", quote: "A coupon without an expiry date is rejected", reading: "no expiry means rejected" };
    setCardWriter({ ...writerFinding(other), specCheck: async () => (asked++, other) });
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    store.pending.push({ id: "m-0", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "x", files: ["coupon.js"], assumption: "expiresAt is a timestamp" }, (e) => events.push(e));
    const first = cardsOf(events)[0]!;
    recordAnswer(store, first, { kind: "answer", card: first.id, pick: "other", text: "expiresOn is a date" }, "block");
    await onMcp(store, "check_in", { poll: 1 }, vi.fn());
    store.pending.push({ id: "m-1", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "y", files: ["coupon.js"], assumption: "expiresOn is a YYYY-MM-DD date" }, (e) => events.push(e));
    await new Promise((r) => setImmediate(r));
    expect(asked).toBe(2);
  });
});

describe("telling whether two claims say the same thing", () => {
  it("the live run's repeat counts as settled, a new point does not", async () => {
    const { alreadySettled } = await import("../docs.js");
    const answered = ["Coupons without expiresOn are rejected (no discount, per SPEC). Expiry is checked at end-of-day (23:59:59.999) in cart.timezone using Intl.DateTimeFormat to derive the UTC offset"];
    expect(alreadySettled("A coupon without expiresOn is rejected and gives no discount (per SPEC line 5)", answered)).toBe(true);
    expect(alreadySettled("The SPEC's 'discount never makes the total negative' constraint was already implemented", answered)).toBe(false);
    expect(alreadySettled("", answered)).toBe(false);
  });
});

describe("spec-check wording", () => {
  it("leads with the document, so it never reads like the assumption card it checks", async () => {
    setCardWriter(writerFinding({ path: "SPEC.md", quote: "Coupons expire at the end of the day in the store's timezone", reading: "end of the store's local day" }));
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    const q = cardsOf(events)[0]!.question;
    expect(q.startsWith('SPEC.md says: "Coupons expire at the end of the day in the store\'s timezone"')).toBe(true);
    expect(q).not.toBe(assumptionCard.question);
  });
});

describe("the spec check's second opinion", () => {
  const FINDING = { path: "SPEC.md", quote: "A coupon without an expiry date is rejected", reading: "accepted and gives a discount" };

  it("drops the card when the passage adds nothing to Bob's assumption", async () => {
    setCardWriter({ ...writerFinding(FINDING), passageMatters: async () => false });
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    expect(cardsOf(events)).toHaveLength(0);
  });

  it("never offers the model's paraphrase, which can contradict the passage (live run: 'accepted')", async () => {
    setCardWriter({ ...writerFinding(FINDING), passageMatters: async () => true });
    const store = watchedStore();
    store.docs.set("SPEC.md", SPEC);
    const events: SseEventInput[] = [];
    await specCheck(store, assumptionCard, (e) => events.push(e));
    const texts = cardsOf(events)[0]!.options.map((o) => o.text);
    expect(texts).toContain("A coupon without an expiry date is rejected");
    expect(texts.join(" ")).not.toContain("accepted");
  });
});
