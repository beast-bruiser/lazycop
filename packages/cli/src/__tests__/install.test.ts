import { describe, it, expect, beforeEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvalTips, install, uninstall } from "../install.js";
import type { EnginePaths } from "../install.js";

let ws: string;
let engine: EnginePaths;

const settings = () => JSON.parse(readFileSync(join(ws, ".bob", "settings.json"), "utf8"));
const ourHandlers = (s: { hooks?: Record<string, { hooks: { command?: string }[] }[]> }) =>
  Object.values(s.hooks ?? {}).flat().flatMap((g) => g.hooks).filter((h) => h.command?.includes("/engine/dist/hook-script.js"));

beforeEach(() => {
  ws = mkdtempSync(join(tmpdir(), "lazycop-ws-"));
  const dist = join(mkdtempSync(join(tmpdir(), "lazycop-repo-")), "packages", "engine", "dist");
  mkdirSync(dist, { recursive: true });
  engine = { hookScript: join(dist, "hook-script.js"), mcpServer: join(dist, "mcp-server.js") };
  writeFileSync(engine.hookScript, "");
  writeFileSync(engine.mcpServer, "");
});

describe("lazycop init", () => {
  it("writes the mode, the MCP server, the command and four hooks", () => {
    install(ws, engine);
    const mode = readFileSync(join(ws, ".bob/plugins/lazycop/custom_modes.yaml"), "utf8");
    expect(mode).toContain("slug: lazycop");
    expect(mode).toContain("- mcp");
    const mcp = JSON.parse(readFileSync(join(ws, ".bob/plugins/lazycop/mcp.json"), "utf8"));
    expect(mcp.mcpServers.lazycop.args).toEqual([engine.mcpServer]);
    expect(mcp.mcpServers.lazycop.alwaysAllow).toHaveLength(5);
    expect(readFileSync(join(ws, ".bob/commands/lazycop.md"), "utf8")).toContain("$ARGUMENTS");
    expect(Object.keys(settings().hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "Stop", "UserPromptSubmit"]);
    expect(settings().hooks.PreToolUse[0].matcher).toBe("*");
    expect(ourHandlers(settings())[0].command).toBe(`node "${engine.hookScript}"`);
  });

  it("keeps the workspace's own hooks and settings", () => {
    mkdirSync(join(ws, ".bob"), { recursive: true });
    const own = { theme: "dark", hooks: { SessionStart: [{ hooks: [{ type: "command", command: "bash .bob/hooks/goal.sh" }] }] } };
    writeFileSync(join(ws, ".bob", "settings.json"), JSON.stringify(own));
    install(ws, engine);
    expect(settings().theme).toBe("dark");
    expect(settings().hooks.SessionStart).toEqual(own.hooks.SessionStart);
  });

  it("can run twice without duplicating hooks", () => {
    install(ws, engine);
    install(ws, engine);
    expect(ourHandlers(settings())).toHaveLength(4);
  });

  it("refuses to touch an unreadable settings.json", () => {
    mkdirSync(join(ws, ".bob"), { recursive: true });
    writeFileSync(join(ws, ".bob", "settings.json"), "{ not json");
    expect(() => install(ws, engine)).toThrow(/not valid JSON/);
    expect(readFileSync(join(ws, ".bob", "settings.json"), "utf8")).toBe("{ not json");
    expect(existsSync(join(ws, ".bob/plugins/lazycop"))).toBe(false);
  });

  it("refuses to overwrite a /lazycop command it did not write", () => {
    mkdirSync(join(ws, ".bob", "commands"), { recursive: true });
    writeFileSync(join(ws, ".bob/commands/lazycop.md"), "my own command");
    expect(() => install(ws, engine)).toThrow(/not written by LazyCop/);
  });

  it("stops when the engine is not built", () => {
    expect(() => install(ws, { hookScript: "/nope/hook-script.js", mcpServer: "/nope/mcp-server.js" })).toThrow(/not built/);
  });
});

describe("lazycop uninstall", () => {
  it("removes only what init added", () => {
    mkdirSync(join(ws, ".bob"), { recursive: true });
    const own = { hooks: { PreToolUse: [{ matcher: "^execute_command$", hooks: [{ type: "command", command: "node guard.mjs" }] }] } };
    writeFileSync(join(ws, ".bob", "settings.json"), JSON.stringify(own));
    install(ws, engine);
    uninstall(ws);
    expect(existsSync(join(ws, ".bob/plugins/lazycop"))).toBe(false);
    expect(existsSync(join(ws, ".bob/commands/lazycop.md"))).toBe(false);
    expect(settings()).toEqual(own);
  });

  it("does nothing where LazyCop was never installed", () => {
    expect(uninstall(ws)).toEqual([]);
  });
});

describe("approval tips", () => {
  const settingsWith = (approval: unknown) => {
    const path = join(mkdtempSync(join(tmpdir(), "bob-home-")), "settings.json");
    writeFileSync(path, JSON.stringify({ approval }));
    return path;
  };

  it("explains the prompts when MCP and Mode are not auto-approved", () => {
    const tips = approvalTips(settingsWith({ allowed_permissions: ["read", "edit"] }));
    expect(tips).toHaveLength(2);
    expect(tips[0]).toContain("enable MCP");
    expect(tips[1]).toContain("enable Mode");
  });

  it("says nothing when both are auto-approved, or the settings cannot be read", () => {
    expect(approvalTips(settingsWith({ allowed_permissions: ["mcp", "mode"] }))).toEqual([]);
    expect(approvalTips("/nope/settings.json")).toEqual([]);
  });
});
