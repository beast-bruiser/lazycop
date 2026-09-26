import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../server.js";

let server: Server;
let base = "";
const post = (path: string, body: unknown) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

beforeAll(async () => {
  process.env.LAZYCOP_NO_OPEN = "1";
  server = await startServer(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await post("/hook", { session_id: "s-1", cwd: mkdtempSync(join(tmpdir(), "lazycop-hold-")), hook_event_name: "PreToolUse", tool_name: "mcp__lazycop__start_session", tool_input: {}, tool_use_id: "t" });
  await post("/mcp", { tool: "start_session", args: { task: "t" } });
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("answering the decision Bob is held on ends the hold", () => {
  it("agreeing releases Bob at once", async () => {
    const held = post("/mcp", { tool: "declare_step", args: { intent: "add date-fns", files: ["package.json"], assumption: "a library is safer", important: true } });
    await new Promise((r) => setTimeout(r, 100));
    const started = Date.now();
    expect(await post("/answer", { card: "k-1", pick: "bob" })).toEqual({ ok: true });
    expect((await held).text).toBe("No messages. Continue.");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("disagreeing releases Bob with the correction", async () => {
    const held = post("/mcp", { tool: "declare_step", args: { intent: "add date-fns", files: ["package.json"], assumption: "a library is safer", important: true } });
    await new Promise((r) => setTimeout(r, 100));
    await post("/answer", { card: "k-2", pick: "other", text: "no new dependencies" });
    const { text } = await held;
    expect(text).toContain("no new dependencies");
    expect(text).not.toContain("still reviewing");
  });
});
