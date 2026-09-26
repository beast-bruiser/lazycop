import { describe, it, expect, vi, beforeEach } from "vitest";
import { watchedStore } from "./helpers.js";
import type { SseEventInput } from "@lazycops/contracts";
import { onMcp, HOLD_WAIT_MS } from "../mcp.js";

describe("hold timeout after 3 waits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("releases Bob automatically after MAX_HOLD_POLLS waits and returns the timeout message", async () => {
    const store = watchedStore();
    const pushEvents: SseEventInput[] = [];
    const push = (event: SseEventInput) => pushEvents.push(event);

    // Trigger a hold via declare_step important:true — this counts as poll 1
    const declare = onMcp(
      store,
      "declare_step",
      { intent: "add expiry check", files: ["coupon.js"], important: true },
      push,
    );
    await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS + 10);
    const r1 = await declare;
    expect(r1).toContain("HOLD");

    // poll 2
    const ci1 = onMcp(store, "check_in", { poll: 1 }, push);
    await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS + 10);
    const r2 = await ci1;
    expect(r2).toContain("HOLD");

    // poll 3 — hits MAX_HOLD_POLLS, releases
    const ci2 = onMcp(store, "check_in", { poll: 2 }, push);
    await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS + 10);
    const result = await ci2;

    expect(result).toContain("did not respond in time");
    expect(store.hold).toBe(false);
    // Should have pushed a hold:off event
    const holdOffEvent = pushEvents.find((e) => e.type === "hold" && !e.on);
    expect(holdOffEvent).toBeDefined();
  });

  it("releases Bob immediately when developer queues a message during hold", async () => {
    const store = watchedStore();
    const push = vi.fn();

    const mcpPromise = onMcp(
      store,
      "declare_step",
      { intent: "refactor", files: ["a.ts"], important: true },
      push,
    );

    // Developer queues a message mid-hold
    await vi.advanceTimersByTimeAsync(1000);
    store.pending.push({ id: "m-1", text: "Please use the other approach", channel: "context" });
    // Wake the waiter as the server would
    for (const done of store.waiters) done();
    store.waiters.clear();

    const result = await mcpPromise;

    expect(result).toContain("Please use the other approach");
  });
});
