import { describe, it, expect } from "vitest";
import type { SseEvent } from "@lazycops/contracts";
import { emptyView, reduce } from "../view.js";
import { renderMissionReport } from "../mission-report.js";

const at = "2026-09-27T10:00:00.000Z";
const base = {
  summary: "Coupons expire",
  changes: [{ file: "src/coupon.ts", what: "adds expiry" }],
  stats: { toolCalls: 3, filesRead: 1, filesEdited: ["src/coupon.ts"], approxTokens: 900 },
};
const render = (report: SseEvent & { type: "report" }) => renderMissionReport(reduce(emptyView(), report));

describe("risk areas on the MISSION CLEAR screen", () => {
  it("lists each risk with its file and line, escaped", () => {
    const html = render({ type: "report", at, report: { ...base, risks: [
      { file: "src/coupon.ts", line: 12, risk: "a coupon without <expiresOn> never expires" },
      { file: "src/coupon.ts", risk: "no test covers the local day" },
    ] } });
    expect(html).toContain("RISK AREAS");
    expect(html).toContain("src/coupon.ts:12");
    expect(html).toContain("a coupon without &lt;expiresOn&gt; never expires");
    expect(html).toContain("no test covers the local day");
  });

  it("renders a report without risk areas exactly as one with an empty list", () => {
    const without = render({ type: "report", at, report: base });
    expect(without).not.toContain("RISK AREAS");
    expect(render({ type: "report", at, report: { ...base, risks: [] } })).toBe(without);
  });
});
