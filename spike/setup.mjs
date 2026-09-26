// Writes sandbox/.bob/mcp.json with this machine's absolute path to mcp.mjs.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const mcp = fileURLToPath(new URL("./mcp.mjs", import.meta.url));
const config = { mcpServers: { lazycop: { command: "node", args: [mcp], alwaysAllow: ["declare_step", "check_in", "reply_to_developer"] } } };
writeFileSync(new URL("./sandbox/.bob/mcp.json", import.meta.url), JSON.stringify(config, null, 2) + "\n");
console.log(`wrote sandbox/.bob/mcp.json -> ${mcp}`);
