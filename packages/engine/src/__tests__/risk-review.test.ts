import { afterEach, describe, expect, it, vi } from "vitest";
import type { HookPayload, RiskArea, SseEventInput } from "@lazycops/contracts";
import { onHook } from "../hook.js";
import { onMcp, HOLD_WAIT_MS } from "../mcp.js";
import { setCardWriter } from "../writer.js";
import type { CardWriter } from "../writer.js";
import { watchedStore } from "./helpers.js";

const post = (tool_name: string, path: string, tool_response: string): HookPayload =>
  ({ hook_event_name: "PostToolUse", session_id: "s-1", cwd: "/repo", tool_name, tool_input: { path }, tool_use_id: "t", tool_response });

const reviewer = (risks: RiskArea[] | (() => Promise<RiskArea[]>)) => {
  const calls: Parameters<CardWriter["reviewRisks"]>[0][] = [];
  const writer: CardWriter = {
    specCheck: async () => null,
    reviewRisks: async (input) => (calls.push(input), typeof risks === "function" ? risks() : risks),
  };
  setCardWriter(writer);
  return calls;
};

const reportOf = (events: SseEventInput[]) => {
  const e = events.find((x) => x.type === "report");
  return e && e.type === "report" ? e.report : undefined;
};

const PATCH = "Edited file\n<patch>\n@@ -1,3 +1,5 @@\n+  if (!coupon.expiresOn) return true;";
const done = { summary: "Coupons expire", changes: [{ file: "src/coupon.ts", what: "adds expiry" }] };

afterEach(() => setCardWriter(null));

describe("the risk review in Bob's mission report", () => {
  it("adds at most 3 risk areas, only in files Bob edited, after one review of the whole change", async () => {
    const calls = reviewer([
      { file: "/repo/src/coupon.ts", line: 4, risk: "a coupon without expiresOn never expires" },
      { file: "src/other.ts", risk: "not touched by Bob" },
      { file: "src/coupon.ts", risk: "b" },
      { file: "./src/coupon.ts", risk: "c" },
      { file: "src/coupon.ts", risk: "d" },
    ]);
    const store = watchedStore();
    store.session!.cwd = "/repo";
    const events: SseEventInput[] = [];
    onHook(store, post("apply_diff", "src/coupon.ts", PATCH));
    onHook(store, post("apply_diff", "src/coupon.ts", PATCH));
    onHook(store, post("read_file", "src/cart.ts", "@@ not an edit"));
    await onMcp(store, "end_session", done, (e) => events.push(e));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ task: "Add coupon expiry", summary: "Coupons expire" });
    expect(calls[0]!.diffs).toEqual([{ file: "src/coupon.ts", patch: PATCH }, { file: "src/coupon.ts", patch: PATCH }]);
    expect(reportOf(events)?.risks).toEqual([
      { file: "src/coupon.ts", line: 4, risk: "a coupon without expiresOn never expires" },
      { file: "src/coupon.ts", risk: "b" },
      { file: "src/coupon.ts", risk: "c" },
    ]);
  });

  it("leaves the report without risk areas when there is no reviewer, or nothing risky", async () => {
    for (const setup of [() => setCardWriter(null), () => reviewer([])]) {
      setup();
      const store = watchedStore();
      const events: SseEventInput[] = [];
      onHook(store, post("apply_diff", "src/coupon.ts", PATCH));
      await onMcp(store, "end_session", done, (e) => events.push(e));
      expect(reportOf(events)).toBeDefined();
      expect(reportOf(events)).not.toHaveProperty("risks");
    }
  });

  it("does not ask the reviewer when Bob edited nothing, or his report is sent back", async () => {
    const calls = reviewer([{ file: "src/coupon.ts", risk: "x" }]);
    await onMcp(watchedStore(), "end_session", { summary: "Nothing to change", changes: [] }, vi.fn());
    const store = watchedStore();
    onHook(store, post("apply_diff", "src/coupon.ts", PATCH));
    expect(await onMcp(store, "end_session", { summary: "s", changes: [] }, vi.fn())).toContain("call end_session again");
    expect(calls).toHaveLength(0);
  });

  it("runs during the final review's wait, so end_session never waits for both in turn", async () => {
    vi.useFakeTimers();
    try {
      const calls = reviewer(() => new Promise((r) => setTimeout(() => r([{ file: "src/coupon.ts", risk: "x" }]), 20_000)));
      const store = watchedStore();
      const events: SseEventInput[] = [];
      onHook(store, post("apply_diff", "src/coupon.ts", PATCH));
      const ending = onMcp(store, "end_session", { ...done, assumptions: ["A1"] }, (e) => events.push(e));
      expect(calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(HOLD_WAIT_MS + 10);
      expect(await ending).toContain("stopped watching");
      expect(reportOf(events)?.risks).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
