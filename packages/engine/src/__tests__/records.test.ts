import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookPayload } from "@lazycops/contracts";
import { watchedStore } from "./helpers.js";
import { onHook } from "../hook.js";
import { setRecordDir } from "../logger.js";

afterEach(() => setRecordDir(null));

describe("records", () => {
  it("each tool call is recorded once, after it runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "lazycop-rec-"));
    setRecordDir(dir);
    const store = watchedStore();
    const base = { session_id: "s-1", cwd: ".", tool_name: "apply_diff", tool_input: { path: "coupon.js" }, tool_use_id: "t" };
    onHook(store, { ...base, hook_event_name: "PreToolUse" } as HookPayload);
    onHook(store, { ...base, hook_event_name: "PostToolUse", tool_response: "Edited" } as HookPayload);
    const lines = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: "event", tool: "apply_diff", path: "coupon.js" });
  });
});
