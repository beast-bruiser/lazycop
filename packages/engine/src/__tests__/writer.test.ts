import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CardRecord, HookPayload, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp, HOLD_WAIT_MS } from "../mcp.js";
import { resolveCard } from "../cards.js";
import { recordAnswer, reviewEdit } from "../review.js";
import { parseList, setCardWriter } from "../writer.js";
import type { CardWriter } from "../writer.js";
import { loadEnvFile } from "../env.js";

const fakeWriter = (over: Partial<CardWriter> = {}): CardWriter => ({
  alternatives: async () => ["expires at the end of the local day", "expires after a fixed number of days"],
  hiddenAssumption: async () => "a coupon without expiresOn never expires",
  ...over,
});
const cards = (events: SseEventInput[]) => events.filter((e): e is Extract<SseEventInput, { type: "card" }> => e.type === "card").map((e) => e.card);
const flush = () => new Promise((r) => setImmediate(r));

afterEach(() => setCardWriter(null));

describe("the card writer", () => {
  it("adds its readings to an open card, between Bob's option and Something else", async () => {
    setCardWriter(fakeWriter());
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m", text: "skip the pause", channel: "context" });
    await onMcp(store, "declare_step", { intent: "add expiry", files: ["coupon.js"], assumption: "expiresAt is a Date" }, (e) => events.push(e));
    await flush();
    const updated = cards(events).at(-1)!;
    expect(updated.options.map((o) => o.id)).toEqual(["bob", "alt-1", "alt-2", "other", "ask_why"]);
    expect(updated.options[1]!.text).toBe("expires at the end of the local day");
  });

  it("leaves a card alone once it has been answered", async () => {
    let release!: (v: string[]) => void;
    setCardWriter(fakeWriter({ alternatives: () => new Promise((r) => (release = r)) }));
    const events: SseEventInput[] = [];
    const store = watchedStore();
    await onMcp(store, "declare_step", { intent: "x", files: ["a"], assumption: "A1" }, (e) => events.push(e));
    const first = cards(events)[0]!;
    recordAnswer(store, first, { kind: "answer", card: first.id, pick: "bob" }, "block");
    release(["too late"]);
    await flush();
    expect(cards(events)).toHaveLength(1);
  });

  it("works without an LLM: cards keep Bob's option only", async () => {
    setCardWriter(fakeWriter({ alternatives: async () => [] }));
    const events: SseEventInput[] = [];
    const store = watchedStore();
    store.pending.push({ id: "m", text: "skip", channel: "context" });
    await onMcp(store, "declare_step", { intent: "x", files: ["a"], assumption: "A1" }, (e) => events.push(e));
    await flush();
    expect(cards(events)).toHaveLength(1);
  });

  it("turns what an edit decided into a card, without delaying Bob", async () => {
    setCardWriter(fakeWriter());
    const events: SseEventInput[] = [];
    const store = watchedStore();
    const edit = { hook_event_name: "PostToolUse", session_id: "s-1", cwd: ".", tool_name: "apply_diff", tool_input: { path: "coupon.js" }, tool_use_id: "t",
      tool_response: "Edited file: coupon.js\n<patch>\n@@ -1,4 +1,6 @@\n+  if (coupon.expiresOn) {" } as HookPayload;
    await reviewEdit(store, edit, (e) => events.push(e));
    const card = cards(events)[0] as CardRecord;
    expect(card).toMatchObject({ type: "hidden_assumption", source: "diff", claim: "a coupon without expiresOn never expires" });
    expect(card.question).toBe("Bob's change decides: a coupon without expiresOn never expires. Is that what you want?");
  });

  it("parses a model's list reply, tolerating prose around it", () => {
    expect(parseList('Sure! ["a", "b"] hope that helps')).toEqual(["a", "b"]);
    expect(parseList("[]")).toEqual([]);
    expect(parseList("no list here")).toEqual([]);
  });
});

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
  it("become one-click options right away, and the card writer is not asked", async () => {
    let asked = false;
    setCardWriter(fakeWriter({ alternatives: async () => ((asked = true), ["from granite"]) }));
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
    expect(asked).toBe(false);
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
