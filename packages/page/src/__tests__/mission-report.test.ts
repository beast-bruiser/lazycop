import { describe, it, expect } from "vitest";
import type { SseEvent } from "@lazycops/contracts";
import { emptyView, reduce } from "../view.js";
import { approx, renderMissionReport } from "../mission-report.js";

const at = "2026-09-27T10:00:00.000Z";
const report: SseEvent = {
  type: "report", at,
  report: {
    summary: "Coupons expire",
    changes: [{ file: "src/coupon.ts", what: "adds <expiry>" }],
    effort_note: "one retry",
    stats: { toolCalls: 12, filesRead: 4, filesEdited: ["src/coupon.ts"], approxTokens: 23456 },
  },
};

describe("the mission report on the MISSION CLEAR screen", () => {
  it("is folded from the report event, and survives the session ending after it", () => {
    const view = [report, { type: "session", at, on: false } as SseEvent].reduce(reduce, { ...emptyView(), task: "t" });
    expect(view.report?.summary).toBe("Coupons expire");
    expect(view.ended).toBe(true);
  });

  it("shows Bob's changes, LazyCop's stats and the effort note, escaped", () => {
    const html = renderMissionReport(reduce(emptyView(), report));
    expect(html).toContain("src/coupon.ts");
    expect(html).toContain("adds &lt;expiry&gt;");
    expect(html).toContain("23.5k");
    expect(html).toContain("WHY IT TOOK THIS MUCH");
  });

  it("says so when no report was filed", () => {
    expect(renderMissionReport(emptyView())).toContain("No report filed");
  });

  it("rounds the token estimate", () => {
    expect(approx(950)).toBe("950");
    expect(approx(123_456)).toBe("123k");
  });
});
