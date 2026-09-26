import { describe, it, expect, vi, beforeAll } from "vitest";
import { execSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import type { HookPayload } from "@lazycops/contracts";
import { createStore, setHold } from "../store.js";
import type { StoreState } from "../store.js";
import { onHook } from "../hook.js";
import { onMcp } from "../mcp.js";

const edit = (session_id: string): HookPayload => ({
  hook_event_name: "PreToolUse", session_id, cwd: "/work", tool_name: "apply_diff", tool_input: {}, tool_use_id: "t-1",
});
const afterRead = (session_id: string): HookPayload => ({
  hook_event_name: "PostToolUse", session_id, cwd: "/work", tool_name: "read_file", tool_input: {}, tool_use_id: "t-2", tool_response: "x",
});
const startHook = (session_id: string): HookPayload => ({
  hook_event_name: "PreToolUse", session_id, cwd: "/work", tool_name: "mcp__lazycop__start_session", tool_input: { task: "t" }, tool_use_id: "t-0",
});

async function invoke(store: StoreState, sessionId: string, task = "Add coupon expiry"): Promise<string> {
  onHook(store, startHook(sessionId));
  return onMcp(store, "start_session", { task }, vi.fn());
}

describe("LazyCop is dormant unless invoked (invariant 7)", () => {
  it("hooks act on nothing when no task is being watched", () => {
    const store = createStore();
    store.hold = true;
    store.pending.push({ id: "m-1", text: "stop", channel: "block" }, { id: "m-2", text: "note", channel: "context" });
    expect(onHook(store, edit("s-1"))).toEqual({});
    expect(onHook(store, afterRead("s-1"))).toEqual({});
    expect(store.pending).toHaveLength(2);
  });

  it("LazyCop tools answer without creating cards while dormant", async () => {
    const store = createStore();
    const result = await onMcp(store, "declare_step", { intent: "x", files: ["a"], assumption: "A1" }, vi.fn());
    expect(result).toContain("not watching");
    expect(store.cards.size).toBe(0);
  });

  it("start_session binds the invoking task through its hook", async () => {
    const store = createStore();
    const reply = await invoke(store, "s-1");
    expect(reply).toContain("watching this task");
    expect(store.session).toMatchObject({ id: "s-1", task: "Add coupon expiry" });
    setHold(store, true);
    expect(onHook(store, edit("s-1")).block).toContain("reviewing");
  });

  it("other tasks stay untouched while one is watched", async () => {
    const store = createStore();
    await invoke(store, "s-1");
    setHold(store, true);
    expect(onHook(store, edit("s-2"))).toEqual({});
  });

  it("the latest invocation wins and the previous task goes dormant", async () => {
    const store = createStore();
    await invoke(store, "s-1");
    await invoke(store, "s-2", "Fix rounding");
    setHold(store, true);
    expect(onHook(store, edit("s-1"))).toEqual({});
    expect(onHook(store, edit("s-2")).block).toBeDefined();
    expect(store.session?.task).toBe("Fix rounding");
  });

  it("end_session returns every hook to dormant and releases the hold", async () => {
    const store = createStore();
    await invoke(store, "s-1");
    setHold(store, true);
    store.pending.push({ id: "m-1", text: "stop", channel: "block" });
    expect(await onMcp(store, "end_session", { stop: true }, vi.fn())).toContain("stopped watching");
    expect(store.session).toBeNull();
    expect(store.hold).toBe(false);
    expect(onHook(store, edit("s-1"))).toEqual({});
  });
});

describe("the MCP process starts the server itself", () => {
  const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
  const mcpServer = fileURLToPath(new URL("../../dist/mcp-server.js", import.meta.url));

  beforeAll(() => {
    execSync("npx tsc --build", { cwd: repoRoot, stdio: "ignore" });
  }, 60_000);

  function unusedPort(): Promise<number> {
    return new Promise((resolve) => {
      const probe = createServer().listen(0, "127.0.0.1", () => {
        const { port } = probe.address() as { port: number };
        probe.close(() => resolve(port));
      });
    });
  }

  it("no server is started by hand, yet the page and tools work", async () => {
    const port = await unusedPort();
    const child = spawn(process.execPath, [mcpServer], {
      env: { ...process.env, LAZYCOP_PORT: String(port), LAZYCOP_NO_OPEN: "1" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    try {
      const replies = createInterface({ input: child.stdout! });
      const reply = new Promise<string>((resolve) => replies.once("line", resolve));
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "start_session", arguments: { task: "t" } } }) + "\n");
      expect(await reply).toContain("watching this task");
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.status).toBe(200);
    } finally {
      child.kill();
    }
  }, 20_000);

  it("exits with its server when Bob closes the MCP connection", async () => {
    const port = await unusedPort();
    const child = spawn(process.execPath, [mcpServer], {
      env: { ...process.env, LAZYCOP_PORT: String(port), LAZYCOP_NO_OPEN: "1" },
      stdio: ["pipe", "pipe", "ignore"],
    });
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      for (let i = 0; i < 50; i++) {
        if (await fetch(`http://127.0.0.1:${port}/`).then(() => true, () => false)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      child.stdin!.end();
      expect(await exited).toBe(0);
      await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    } finally {
      child.kill();
    }
  }, 20_000);
});
