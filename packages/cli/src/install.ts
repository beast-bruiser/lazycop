import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { COMMAND_MD, HOOK_EVENTS, HOOK_SCRIPT_SUFFIX, MARKER, MODE_YAML, hookCommand, mcpConfig } from "./templates.js";

/** Absolute paths to the built engine entry points the workspace will run. */
export interface EnginePaths {
  hookScript: string;
  mcpServer: string;
}

interface HookHandler {
  type: string;
  command?: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
}

type Settings = { hooks?: Record<string, HookGroup[]>; [key: string]: unknown };

const pluginDir = (ws: string) => join(ws, ".bob", "plugins", "lazycop");
const commandFile = (ws: string) => join(ws, ".bob", "commands", "lazycop.md");
const settingsFile = (ws: string) => join(ws, ".bob", "settings.json");

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${path} is not valid JSON; fix it first, LazyCop will not overwrite it.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${path} must hold a JSON object.`);
  }
  return parsed as Settings;
}

const isOurs = (h: HookHandler) => typeof h.command === "string" && h.command.includes(HOOK_SCRIPT_SUFFIX);

/** The settings with every LazyCop hook handler removed and emptied groups dropped. */
function withoutOurHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, HookGroup[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups
      .map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  const { hooks: _dropped, ...rest } = settings;
  return Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Installs LazyCop into a Bob workspace; running it again replaces its own files only. */
export function install(workspace: string, engine: EnginePaths): string[] {
  for (const path of [engine.hookScript, engine.mcpServer]) {
    if (!existsSync(path)) throw new Error(`LazyCop engine is not built (${path} is missing): run \`npm run build\` in the lazycop repo.`);
  }
  const command = commandFile(workspace);
  if (existsSync(command) && !readFileSync(command, "utf8").includes(MARKER)) {
    throw new Error(`${command} already exists and was not written by LazyCop; rename it first.`);
  }
  const settings = withoutOurHooks(readSettings(settingsFile(workspace)));

  const hooks = { ...(settings.hooks ?? {}) };
  for (const event of HOOK_EVENTS) {
    const handler = { type: "command", command: hookCommand(engine.hookScript), timeout: 5 };
    const group: HookGroup = event === "PreToolUse" || event === "PostToolUse" ? { matcher: "*", hooks: [handler] } : { hooks: [handler] };
    hooks[event] = [...(hooks[event] ?? []), group];
  }

  write(join(pluginDir(workspace), "custom_modes.yaml"), MODE_YAML);
  write(join(pluginDir(workspace), "mcp.json"), mcpConfig(engine.mcpServer));
  write(command, COMMAND_MD);
  write(settingsFile(workspace), JSON.stringify({ ...settings, hooks }, null, 2) + "\n");
  return [
    ".bob/plugins/lazycop/custom_modes.yaml",
    ".bob/plugins/lazycop/mcp.json",
    ".bob/commands/lazycop.md",
    ".bob/settings.json (hooks merged)",
  ];
}

/** Removes what `install` added and nothing else. */
export function uninstall(workspace: string): string[] {
  const removed: string[] = [];
  if (existsSync(pluginDir(workspace))) {
    rmSync(pluginDir(workspace), { recursive: true, force: true });
    removed.push(".bob/plugins/lazycop/");
  }
  const command = commandFile(workspace);
  if (existsSync(command) && readFileSync(command, "utf8").includes(MARKER)) {
    rmSync(command);
    removed.push(".bob/commands/lazycop.md");
  }
  const path = settingsFile(workspace);
  if (existsSync(path)) {
    const before = readSettings(path);
    const after = withoutOurHooks(before);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      writeFileSync(path, JSON.stringify(after, null, 2) + "\n");
      removed.push(".bob/settings.json (LazyCop hooks)");
    }
  }
  return removed;
}

/**
 * Reads (never writes) Bob's global approval settings and explains any setting that will make
 * Bob ask before each LazyCop tool call. alwaysAllow only applies once MCP is auto-approved.
 */
export function approvalTips(globalSettings: string): string[] {
  let permissions: unknown;
  try {
    permissions = (JSON.parse(readFileSync(globalSettings, "utf8")) as { approval?: { allowed_permissions?: unknown } }).approval?.allowed_permissions;
  } catch {
    return [];
  }
  if (!Array.isArray(permissions)) return [];
  const tips: string[] = [];
  if (!permissions.includes("mcp")) tips.push("Bob will ask before every LazyCop tool call: enable MCP in Bob's Auto-approve settings to stop it.");
  if (!permissions.includes("mode")) tips.push("Bob will ask before switching to the LazyCop mode: enable Mode in Bob's Auto-approve settings, or pick the mode yourself first.");
  return tips;
}
