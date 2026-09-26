import { describe, it, expect, vi, afterEach } from "vitest";
import type { CardRecord, SseEventInput } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp } from "../mcp.js";
import { recordAnswer } from "../review.js";
import { setCardWriter } from "../writer.js";

const silent = { alternatives: async () => [], hiddenAssumption: async () => null };
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
