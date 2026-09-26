import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { HookPayload, SseEvent, SseEventInput, SseStateEvent } from "@lazycops/contracts";
import { pageUrl } from "./mcp.js";
import { agentsInfo, createSquad, isWatching, latest, routeHook, runMcp, tagged, watching, withRecords } from "./squad.js";
import { reviewEdit } from "./review.js";
import { loadEnvFile } from "./env.js";
import { onDeveloper } from "./developer.js";
import { addDoc, fileText, isDocPath } from "./docs.js";

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);

// watsonx.ai credentials live in the lazycop repo's own .env, never in a Bob workspace.
loadEnvFile(process.env.LAZYCOP_ENV_FILE ?? join(dirname(fileURLToPath(import.meta.url)), "../../../.env"));

// The page lives in @lazycops/page: index.html plus its compiled modules in dist/.
const pageDir = dirname(createRequire(import.meta.url).resolve("@lazycops/page/package.json"));

function servePage(res: http.ServerResponse, path: string): void {
  const file = path === "/" ? join(pageDir, "index.html") : join(pageDir, "dist", path.slice(1));
  try {
    const body = readFileSync(file);
    res.writeHead(200, { "content-type": path === "/" ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" });
    res.end(body);
  } catch {
    const built = existsSync(join(pageDir, "dist", "app.js"));
    res.writeHead(built ? 404 : 503, { "content-type": "text/plain" });
    res.end(built ? "not found" : "LazyCop's page is not built: run `npm run build` in the lazycop repo.");
  }
}

/** Optional art the developer drops into packages/page/assets; the page falls back to its own when absent. */
function serveAsset(res: http.ServerResponse, path: string): void {
  try {
    const body = readFileSync(join(pageDir, path.slice(1)));
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}

const squad = createSquad();
const clients = new Set<http.ServerResponse>();

/** Documents Bob opens become part of the task's knowledge, as he read them. */
function keepDocBobRead(agent: { store: Parameters<typeof addDoc>[0] }, payload: HookPayload, send: typeof push): void {
  if (payload.hook_event_name !== "PostToolUse" || payload.tool_name !== "read_file") return;
  const path = (payload.tool_input as { path?: unknown } | null)?.path;
  if (typeof path === "string" && isDocPath(path)) addDoc(agent.store, path, fileText(payload.tool_response), "bob", send);
}

const HISTORY_LIMIT = 1500;

function push(input: SseEventInput): void {
  const event = { ...input, at: new Date().toISOString() } as SseEvent;
  squad.history.push(event);
  if (squad.history.length > HISTORY_LIMIT) squad.history.splice(0, squad.history.length - HISTORY_LIMIT);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(line);
}

/** Opens the page in the developer's browser; LAZYCOP_NO_OPEN=1 turns this off. */
function openPage(): void {
  if (process.env.LAZYCOP_NO_OPEN === "1") return;
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [pageUrl()]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", pageUrl()]]
    : ["xdg-open", [pageUrl()]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // no browser to open; the developer can still visit the page
  }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c: Buffer) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
  });
}

function json(res: http.ServerResponse, body: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && (url.pathname === "/" || /^\/[a-z-]+\.js$/.test(url.pathname))) {
      return servePage(res, url.pathname);
    }
    // Only kebab-case .png files directly in assets/: the pattern leaves no room for another path.
    if (req.method === "GET" && /^\/assets\/[a-z-]+\.png$/.test(url.pathname)) {
      return serveAsset(res, url.pathname);
    }

    if (req.method === "GET" && url.pathname === "/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const current = latest(squad);
      const snapshot: SseStateEvent = {
        type: "state",
        at: new Date().toISOString(),
        session: current ? { task: current.task } : null,
        hold: watching(squad).some((a) => a.store.hold),
        agents: agentsInfo(squad),
        pending: watching(squad).flatMap((a) => a.store.pending),
        history: [...squad.history],
      };
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method !== "POST") return json(res, { error: "not found" }, 404);

    const body = await readBody(req);
    if (body === null) return json(res, { error: "invalid json" }, 400);

    switch (url.pathname) {
      case "/hook": {
        const payload = body as HookPayload;
        const { agent, result } = routeHook(squad, payload);
        // The page only uses what happened, so tools are shown once, after they run.
        if (agent && isWatching(agent) && payload.hook_event_name !== "PreToolUse") {
          const send = tagged(push, agent);
          send({ type: "hook", seq: ++squad.seq, payload });
          void withRecords(agent, () => reviewEdit(agent.store, payload, send));
          keepDocBobRead(agent, payload, send);
        }
        return json(res, result);
      }
      case "/mcp": {
        const { tool, args } = body as { tool: string; args: Record<string, unknown> };
        const text = await runMcp(squad, tool, args ?? {}, push);
        if (tool === "start_session") openPage();
        return json(res, { text });
      }
      case "/queue":
      case "/hold":
      case "/answer": {
        const [status, reply] = onDeveloper(squad, url.pathname, body, push);
        return json(res, reply, status);
      }
      default:
        return json(res, { error: "not found" }, 404);
    }
  });
}

/** Rejects with EADDRINUSE when another LazyCop server already has the port. */
export function startServer(port = PORT): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.error(`LazyCop engine on http://127.0.0.1:${port}`);
      resolve(server);
    });
  });
}
