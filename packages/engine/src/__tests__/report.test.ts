import { describe, expect, it, vi } from "vitest";
import type { HookPayload, SseEventInput } from "@lazycops/contracts";
import { onHook } from "../hook.js";
import { onMcp } from "../mcp.js";
import { normalizePath } from "../report.js";
import { watchedStore } from "./helpers.js";

const post = (tool_name: string, path: string, tool_response = "ok"): HookPayload =>
  ({ hook_event_name: "PostToolUse", session_id: "s-1", cwd: "/repo", tool_name, tool_input: { path }, tool_use_id: "t", tool_response });

describe("Bob's mission report at end_session", () => {
  it("is sent back naming each file Bob edited but left out, and the session stays open", async () => {
    const store = watchedStore();
    onHook(store, post("apply_diff", "src/coupon.ts"));
    onHook(store, post("write_file", "/repo/src/cart.ts"));
    const result = await onMcp(store, "end_session", { summary: "Coupons expire", changes: [{ file: "./src/coupon.ts", what: "adds expiry" }] }, vi.fn());
    expect(result).toContain("src/cart.ts");
    expect(result).not.toContain("src/coupon.ts");
    expect(result).toContain("call end_session again");
    expect(store.session).not.toBeNull();
  });

  it("once complete, reaches the page with LazyCop's own measured stats, then the session ends", async () => {
    const store = watchedStore();
    const events: SseEventInput[] = [];
    onHook(store, post("read_file", "src/coupon.ts", "x".repeat(400)));
    onHook(store, post("read_file", "src/coupon.ts"));
    onHook(store, post("apply_diff", "src/coupon.ts"));
    onHook(store, post("mcp__lazycop__declare_step", "ignored"));
    const result = await onMcp(store, "end_session", {
      summary: "Coupons expire",
      changes: [{ file: "src/coupon.ts", what: "adds expiry, because the task asked for it" }],
      effort_note: "one retry on a failing test",
    }, (e) => events.push(e));
    expect(result).toContain("stopped watching");
    const report = events.find((e) => e.type === "report");
    expect(report).toMatchObject({
      report: {
        summary: "Coupons expire",
        changes: [{ file: "src/coupon.ts", what: "adds expiry, because the task asked for it" }],
        effort_note: "one retry on a failing test",
        stats: { toolCalls: 3, filesRead: 1, filesEdited: ["src/coupon.ts"] },
      },
    });
    expect(report && report.type === "report" && report.report.stats.approxTokens).toBeGreaterThan(100);
    expect(events.findIndex((e) => e.type === "report")).toBeLessThan(events.findIndex((e) => e.type === "session"));
    expect(store.session).toBeNull();
  });

  it("ignores malformed changes rather than crashing", async () => {
    const store = watchedStore();
    onHook(store, post("apply_diff", "a.ts"));
    const result = await onMcp(store, "end_session", { changes: ["a.ts", null, { what: "no file" }] }, vi.fn());
    expect(result).toContain("a.ts");
    expect(store.session).not.toBeNull();
  });

  it("needs no report when Bob edited nothing", async () => {
    const store = watchedStore();
    expect(await onMcp(store, "end_session", {}, vi.fn())).toContain("stopped watching");
  });

  it("matches a path however Bob writes it", () => {
    expect(normalizePath("/repo/src/a.ts", "/repo")).toBe("src/a.ts");
    expect(normalizePath("./src/a.ts", "/repo")).toBe("src/a.ts");
    expect(normalizePath("src/a.ts")).toBe("src/a.ts");
  });
});
