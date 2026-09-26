import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../hook-script.ts", import.meta.url));

function unusedPort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

describe("hook fails open when server is down (invariant 1)", () => {
  it("the real hook script exits 0 and blocks nothing when no server listens", async () => {
    const port = await unusedPort();
    const payload = { session_id: "s-1", cwd: ".", hook_event_name: "PreToolUse", tool_name: "apply_diff", tool_input: {}, tool_use_id: "t-1" };
    const run = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      cwd: mkdtempSync(join(tmpdir(), "lazycop-hook-")),
      env: { ...process.env, LAZYCOP_PORT: String(port) },
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).not.toContain("LazyCop");
  });
});
