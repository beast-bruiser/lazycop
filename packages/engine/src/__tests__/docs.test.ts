import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardRecord, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { addDoc, fileText, isDocPath, loadNamedDocs, quoteAppears, DOC_BUDGET } from "../docs.js";
import { answerToMessage, specCheck } from "../review.js";
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
    expect(card.options[1]!.text).toBe("expiry is the end of the store's local day");
    const message = answerToMessage(card, { kind: "answer", card: card.id, pick: "spec", text: card.options[1]!.text });
    expect(message).toContain('what SPEC.md says: "Coupons expire at the end of the day in the store\'s timezone"');
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
