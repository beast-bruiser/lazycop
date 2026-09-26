#!/usr/bin/env node
// Minimal stdio MCP server (JSON-RPC 2.0, no SDK).
// Starts the LazyCop engine server if none is running, then forwards tool calls to it.
import { createInterface } from "node:readline";
import { startServer } from "./server.js";

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);

let serverReady: Promise<void> | null = null;

/** Makes sure a LazyCop server listens on the port; if another process got it first, use that one. */
function ensureServer(): Promise<void> {
  serverReady ??= fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(500) })
    .then(() => undefined)
    .catch(() => startServer(PORT).then(() => undefined, () => undefined));
  return serverReady;
}

const tools = [
  {
    name: "start_session",
    description:
      "Call first, and only when the developer invokes LazyCop (/lazycop or the LazyCop mode). LazyCop then watches this task and opens the developer's page.",
    inputSchema: {
      type: "object",
      properties: { task: { type: "string", description: "The developer's request, in their words." } },
      required: ["task"],
    },
  },
  {
    name: "end_session",
    description:
      "Call when the task LazyCop is watching is done, or when the developer says /lazycop off. Pass every assumption you relied on that the developer did not confirm; if the developer disagrees with one, you get the correction instead and must fix it, then call end_session again.",
    inputSchema: {
      type: "object",
      properties: {
        assumptions: { type: "array", items: { type: "string" }, description: "Assumptions you relied on without the developer confirming them. Empty on /lazycop off." },
      },
    },
  },
  {
    name: "declare_step",
    description:
      "While LazyCop is watching the task, call before every file edit. States what you are about to do so the developer can follow along. Returns any messages from the developer, which you must address first.",
    inputSchema: {
      type: "object",
      properties: {
        intent: { type: "string", description: "One sentence: what this edit does and why." },
        assumption: { type: "string", description: "The main assumption this edit relies on, if any." },
        alternatives: {
          type: "array",
          items: { type: "string" },
          description: "With an assumption: 2 other readings a reasonable developer might actually have meant instead, each under 15 words and stated positively. They become one-click options for the developer.",
        },
        files: { type: "array", items: { type: "string" } },
        important: {
          type: "boolean",
          description: "True for decisions costly to undo: new dependency, schema or public API change, deleting code.",
        },
      },
      required: ["intent", "files"],
    },
  },
  {
    name: "check_in",
    description:
      "Waits for and returns messages from the developer. Call when told the developer is reviewing; call again with the poll number it gives you while it says HOLD.",
    inputSchema: {
      type: "object",
      properties: {
        poll: { type: "integer", description: "1 on the first call, then the number the previous result asks for." },
      },
      required: ["poll"],
    },
  },
  {
    name: "reply_to_developer",
    description: "Answer a question or disagreement the developer sent you.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

const send = (msg: Record<string, unknown>): void => {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
};

async function post(name: string, args: Record<string, unknown>): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool: name, args }),
    signal: AbortSignal.timeout(55000),
  });
  return ((await res.json()) as { text: string }).text;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  await ensureServer();
  try {
    return await post(name, args);
  } catch {
    // The server we forwarded to may have gone with its Bob window: start our own and retry once.
    serverReady = null;
    await ensureServer();
    try {
      return await post(name, args);
    } catch {
      return "LazyCop is not running. Continue.";
    }
  }
}

void ensureServer();

// Bob closes stdin when its window goes away; the HTTP server would otherwise keep this process alive.
process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));

createInterface({ input: process.stdin }).on("line", async (line: string) => {
  let req: { id: unknown; method: string; params?: Record<string, unknown> };
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  if (id === undefined) return;
  if (method === "initialize") {
    return send({
      id,
      result: {
        protocolVersion: (params?.["protocolVersion"] as string) ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "lazycop", version: "0.1.0" },
      },
    });
  }
  if (method === "tools/list") return send({ id, result: { tools } });
  if (method === "tools/call") {
    const text = await callTool(
      params?.["name"] as string,
      (params?.["arguments"] as Record<string, unknown>) ?? {},
    );
    return send({ id, result: { content: [{ type: "text", text }] } });
  }
  if (method === "ping") return send({ id, result: {} });
  send({ id, error: { code: -32601, message: `unknown method ${method}` } });
});
