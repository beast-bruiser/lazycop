#!/usr/bin/env node
// lazycop init | uninstall [workspace] — installs LazyCop into a Bob workspace.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { approvalTips, install, uninstall } from "./install.js";

const USAGE = `Usage:
  lazycop init [workspace]       install LazyCop into a Bob workspace (default: current folder)
  lazycop uninstall [workspace]  remove everything init added

Then, in Bob: /lazycop <task>   and   /lazycop off`;

function enginePaths() {
  const engineDir = dirname(createRequire(import.meta.url).resolve("@lazycops/engine/package.json"));
  return {
    hookScript: join(engineDir, "dist", "hook-script.js"),
    mcpServer: join(engineDir, "dist", "mcp-server.js"),
  };
}

const [command, target] = process.argv.slice(2);
const workspace = resolve(target ?? ".");

try {
  if (command === "init") {
    const written = install(workspace, enginePaths());
    console.log(`LazyCop installed in ${workspace}:\n${written.map((f) => `  ${f}`).join("\n")}`);
    console.log("\nReload the Bob window, check that the lazycop MCP server is connected, then type /lazycop <task>.");
    for (const tip of approvalTips(join(homedir(), ".bob", "settings", "settings.json"))) console.log(`Tip: ${tip}`);
  } else if (command === "uninstall") {
    const removed = uninstall(workspace);
    console.log(removed.length ? `Removed from ${workspace}:\n${removed.map((f) => `  ${f}`).join("\n")}` : "LazyCop was not installed here.");
  } else {
    console.log(USAGE);
    process.exit(command === undefined || command === "help" || command === "--help" ? 0 : 1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
