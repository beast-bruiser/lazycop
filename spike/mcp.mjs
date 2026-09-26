// Minimal stdio MCP server (JSON-RPC, no SDK) that forwards tool calls to the
// spike server, so hooks, MCP and the page share one state.
import { createInterface } from "node:readline";

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);

const tools = [
  {
    name: "declare_step",
    description: "Call before every file edit. States what you are about to do so the developer can follow along. Returns any messages from the developer, which you must address first.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "One sentence: what this edit does and why." },
        assumption: { type: "string", description: "The main assumption this edit relies on, if any." },
        files: { type: "array", items: { type: "string" } },
        important: { type: "boolean", description: "True for decisions costly to undo: new dependency, schema or public API change, deleting code." },
      },
      required: ["intent", "files"],
    },
  },
  {
    name: "check_in",
    description: "Waits for and returns messages from the developer. Call when told the developer is reviewing; call again with the poll number it gives you while it says HOLD.",
    inputSchema: { type: "object", properties: { poll: { type: "integer", description: "1 on the first call, then the number the previous result asks for." } } },
  },
  {
    name: "reply_to_developer",
    description: "Answer a question or disagreement the developer sent you.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

async function callTool(name, args) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: name, args }),
      signal: AbortSignal.timeout(55000),
    });
    return (await res.json()).text;
  } catch {
    return "LazyCop is not running. Continue.";
  }
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  if (id === undefined) return;
  if (method === "initialize") {
    return send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "lazycop", version: "0.0.1" } } });
  }
  if (method === "tools/list") return send({ id, result: { tools } });
  if (method === "tools/call") {
    const text = await callTool(params.name, params.arguments ?? {});
    return send({ id, result: { content: [{ type: "text", text }] } });
  }
  if (method === "ping") return send({ id, result: {} });
  send({ id, error: { code: -32601, message: `unknown method ${method}` } });
});
