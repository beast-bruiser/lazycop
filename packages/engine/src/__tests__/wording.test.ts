import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watchedStore } from "./helpers.js";
import { onMcp, PAUSE_MS } from "../mcp.js";
import { resolveCard } from "../cards.js";

describe("answer → message wording (Core mechanic table)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function runDeclareAndAnswer(
    pick: string,
    text?: string,
  ): Promise<string> {
    const store = watchedStore();
    const push = vi.fn();

    const mcpPromise = onMcp(
      store,
      "declare_step",
      { intent: "add check", files: ["coupon.js"], assumption: "expiresAt is a Date compared to now" },
      push,
    );

    // Find the card that was created
    await Promise.resolve(); // flush microtasks
    const cardId = [...store.cards.keys()][0];
    expect(cardId).toBeDefined();

    resolveCard(cardId!, { kind: "answer", card: cardId!, pick, text });

    return mcpPromise;
  }

  it("bob (agree) → Bob receives 'No messages. Continue.'", async () => {
    const result = await runDeclareAndAnswer("bob");
    expect(result).toBe("No messages. Continue.");
  });

  it("other (something else with typed text) → message contains claim and typed expectation", async () => {
    const result = await runDeclareAndAnswer("other", "End of local day in customer timezone");
    expect(result).toContain("disagrees with: expiresAt is a Date compared to now");
    expect(result).toContain("End of local day in customer timezone");
    expect(result).toContain("Reply, then adjust.");
  });

  it("ask_why → message asks Bob to explain before editing", async () => {
    const result = await runDeclareAndAnswer("ask_why");
    expect(result).toContain("asks why: expiresAt is a Date compared to now");
    expect(result).toContain("reply_to_developer");
    expect(result).toContain("before editing");
  });

  it("alt id (disagree, chose an option) → message contains claim and option text", async () => {
    const result = await runDeclareAndAnswer("alt-1", "End of the expiry day in the customer's timezone");
    expect(result).toContain("disagrees with: expiresAt is a Date compared to now");
    expect(result).toContain("End of the expiry day in the customer's timezone");
  });

  it("pause timeout (no answer in 20 s) → Bob continues normally", async () => {
    const store = watchedStore();
    const push = vi.fn();

    const mcpPromise = onMcp(
      store,
      "declare_step",
      { intent: "add check", files: ["coupon.js"], assumption: "expiresAt is a Date" },
      push,
    );

    await vi.advanceTimersByTimeAsync(PAUSE_MS + 10);
    const result = await mcpPromise;
    expect(result).toBe("No messages. Continue.");
  });
});
