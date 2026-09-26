import { describe, it, expect, vi } from "vitest";
import type { CardRecord, HookPayload } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onMcp } from "../mcp.js";
import { onHook } from "../hook.js";
import { recordAnswer } from "../review.js";

const nextEdit: HookPayload = { hook_event_name: "PreToolUse", session_id: "s-1", cwd: ".", tool_name: "apply_diff", tool_input: {}, tool_use_id: "t" };

/** Bob declares and moves on at once; the developer answers later; Bob's next action carries it. */
async function answerAfterBobMovedOn(pick: string, text?: string) {
  const store = watchedStore();
  const cards: CardRecord[] = [];
  const result = await onMcp(store, "declare_step",
    { intent: "add check", files: ["coupon.js"], assumption: "expiresAt is a Date compared to now" },
    (e) => { if (e.type === "card") cards.push(e.card); });
  recordAnswer(store, cards[0]!, { kind: "answer", card: cards[0]!.id, pick, ...(text ? { text } : {}) }, "block");
  return { result, next: onHook(store, nextEdit).block };
}

describe("cards run alongside Bob: the answer reaches him at his next step", () => {
  it("declare_step never waits for the developer", async () => {
    vi.useFakeTimers();
    const store = watchedStore();
    let done = false;
    void onMcp(store, "declare_step", { intent: "x", files: ["a"], assumption: "A1" }, vi.fn()).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it("bob (agree) sends Bob nothing", async () => {
    const { result, next } = await answerAfterBobMovedOn("bob");
    expect(result).toBe("No messages. Continue.");
    expect(next).toBeUndefined();
  });

  it("other (typed) → Bob's next action is stopped with the claim and the developer's words", async () => {
    const { next } = await answerAfterBobMovedOn("other", "End of local day in customer timezone");
    expect(next).toContain("disagrees with: expiresAt is a Date compared to now");
    expect(next).toContain("End of local day in customer timezone");
    expect(next).toContain("Reply, then adjust.");
  });

  it("ask_why → Bob explains before editing", async () => {
    const { next } = await answerAfterBobMovedOn("ask_why");
    expect(next).toContain("asks why: expiresAt is a Date compared to now");
    expect(next).toContain("before editing");
  });

  it("alt id (chose an option) → the option's text is the expectation", async () => {
    const { next } = await answerAfterBobMovedOn("alt-1", "End of the expiry day in the customer's timezone");
    expect(next).toContain("End of the expiry day in the customer's timezone");
  });
});
