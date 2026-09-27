import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp, HOLD_WAIT_MS } from "../mcp.js";
import { resolveCard } from "../cards.js";
import { recordAnswer } from "../review.js";
import { setCardWriter } from "../writer.js";
import { loadEnvFile } from "../env.js";

const cards = (events: SseEventInput[]) => events.filter((e): e is Extract<SseEventInput, { type: "card" }> => e.type === "card").map((e) => e.card);
const flush = () => new Promise((r) => setImmediate(r));

afterEach(() => setCardWriter(null));

describe("the final review in end_session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the session open and returns the correction when the developer objects", async () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    const ending = onMcp(store, "end_session", { assumptions: ["a coupon without expiresOn never expires."] }, (e) => events.push(e));
    const card = cards(events)[0]!;
    expect(card.question).toBe("Bob relied on this without asking you: a coupon without expiresOn never expires. Is that right?");
    resolveCard(card.id, { kind: "answer", card: card.id, pick: "other", text: "reject coupons without an expiry date" });
    const result = await ending;
    expect(result).toContain("reject coupons without an expiry date");
    expect(result).toContain("call end_session again");
    expect(store.session).not.toBeNull();
  });

  it("ends the session when every assumption is confirmed or the developer does not answer", async () => {
    const store = watchedStore();
    const ending = onMcp(store, "end_session", { assumptions: ["A1", "A2"] }, vi.fn());
    await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS + 10);
    expect(await ending).toContain("stopped watching");
    expect(store.session).toBeNull();
  });
});

describe(".env loading", () => {
  it("sets missing keys only, and strips quotes", () => {
    const file = join(mkdtempSync(join(tmpdir(), "lazycop-env-")), ".env");
    writeFileSync(file, 'LAZYCOP_TEST_A="quoted"\nLAZYCOP_TEST_B=kept\n# comment\n');
    process.env.LAZYCOP_TEST_B = "already";
    loadEnvFile(file);
    expect(process.env.LAZYCOP_TEST_A).toBe("quoted");
    expect(process.env.LAZYCOP_TEST_B).toBe("already");
    loadEnvFile("/nope/.env");
  });
});

describe("Bob's own alternatives (option A)", () => {
  it("become one-click options right away", async () => {
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m", text: "skip the pause", channel: "context" });
    await onMcp(store, "declare_step", {
      intent: "add expiry", files: ["coupon.js"], assumption: "expiresAt is a timestamp",
      alternatives: ["expires at the end of the local day.", "Expires at the end of the local day", "expiresAt is a timestamp", " ", 7, "expires 30 days after issue", "a", "b"],
    }, (e) => events.push(e));
    await flush();
    const [card, ...updates] = cards(events);
    expect(card!.options.map((o) => o.text)).toEqual([
      "expiresAt is a timestamp", "expires at the end of the local day", "expires 30 days after issue", "a", "Something else…", "Ask Bob why",
    ]);
    expect(updates).toHaveLength(0);
  });
});

describe("end_session never drops an answer still on its way to Bob", () => {
  it("a correction queued for Bob's next step keeps the task open and reaches him", async () => {
    const store = watchedStore();
    const events: SseEventInput[] = [];
    await onMcp(store, "declare_step", { intent: "add expiry", files: ["coupon.js"], assumption: "an expired coupon returns cart.total" }, (e) => events.push(e));
    const card = cards(events)[0]!;
    recordAnswer(store, card, { kind: "answer", card: card.id, pick: "alt-2", text: "an expired coupon should throw an error" }, "block");
    const result = await onMcp(store, "end_session", {}, vi.fn());
    expect(result).toContain("an expired coupon should throw an error");
    expect(result).toContain("call end_session again");
    expect(store.session).not.toBeNull();
    expect(store.pending).toHaveLength(0);
    expect(store.confirmFor).toBe(card.id);
  });
});

describe("spec findings", () => {
  it("a passage that only repeats Bob's assumption is not a finding", async () => {
    const { parseFinding } = await import("../writer.js");
    const base = { path: "SPEC.md", quote: "A coupon without an expiry date is rejected", reading: "rejected" };
    expect(parseFinding(JSON.stringify({ relation: "same", ...base }))).toBeNull();
    expect(parseFinding(JSON.stringify({ relation: "contradicts", ...base }))).toMatchObject(base);
    expect(parseFinding(JSON.stringify({ relation: "adds_detail", ...base }))).toMatchObject(base);
  });
});
