import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { HookPayload, QueueBody, HoldBody, AnswerBody, SseEvent, SseEventInput, SseStateEvent, PendingMessage } from "@lazycops/contracts";
import { createStore, setHold, wake, isWatched } from "./store.js";
import { onHook } from "./hook.js";
import { onMcp, pageUrl } from "./mcp.js";
import { recordAnswer, reviewEdit } from "./review.js";
import { loadEnvFile } from "./env.js";
import { resolveCard } from "./cards.js";

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

const store = createStore();
const clients = new Set<http.ServerResponse>();

const HISTORY_LIMIT = 500;

function push(input: SseEventInput): void {
  const event: SseEvent = { ...input, at: new Date().toISOString() };
  store.history.push(event);
  if (store.history.length > HISTORY_LIMIT) store.history.splice(0, store.history.length - HISTORY_LIMIT);
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

    if (req.method === "GET" && url.pathname === "/stream") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const snapshot: SseStateEvent = {
        type: "state",
        at: new Date().toISOString(),
        session: store.session ? { task: store.session.task } : null,
        hold: store.hold,
        pending: [...store.pending],
        history: [...store.history],
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
        const result = onHook(store, payload);
        // The page only uses what happened, so tools are shown once, after they run.
        if (isWatched(store, payload.session_id) && payload.hook_event_name !== "PreToolUse") {
          push({ type: "hook", seq: ++store.seq, payload });
          void reviewEdit(store, payload, push);
        }
        return json(res, result);
      }
      case "/mcp": {
        const { tool, args } = body as { tool: string; args: Record<string, unknown> };
        const text = await onMcp(store, tool, args ?? {}, push);
        if (tool === "start_session") openPage();
        return json(res, { text });
      }
      case "/queue": {
        if (!store.session) return json(res, { error: "LazyCop is not watching a task" }, 409);
        const q = body as QueueBody;
        if (typeof q.text !== "string" || !q.text.trim()) {
          return json(res, { error: "text required" }, 400);
        }
        const msg: PendingMessage = {
          id: `m-${Date.now()}`,
          text: q.text.trim(),
          channel: q.channel === "block" ? "block" : "context",
          ...(typeof q.card === "string" ? { card: q.card } : {}),
        };
        store.pending.push(msg);
        push({ type: "queued", id: msg.id, text: msg.text, channel: msg.channel, ...(msg.card ? { card: msg.card } : {}) });
        wake(store);
        return json(res, msg);
      }
      case "/hold": {
        if (!store.session) return json(res, { error: "LazyCop is not watching a task" }, 409);
        const h = body as HoldBody;
        setHold(store, Boolean(h.on));
        push({ type: "hold", on: store.hold, reason: "developer" });
        return json(res, { hold: store.hold });
      }
      case "/answer": {
        const a = body as AnswerBody;
        if (!a.card || !a.pick) return json(res, { error: "card and pick required" }, 400);
        const card = store.cards.get(a.card);
        if (!card) return json(res, { error: "card not found" }, 404);
        const answer = {
          kind: "answer" as const,
          card: a.card,
          pick: a.pick,
          text: a.text,
        };
        push({ type: "answer", answer });
        const endsHold = store.hold && store.holdCard === card.id;
        if (!resolveCard(a.card, answer)) {
          // The pause is over: queue the answer so Bob gets it at its next tool call.
          recordAnswer(store, card, answer, "block");
          for (const m of store.pending.filter((p) => p.card === card.id)) {
            push({ type: "queued", id: m.id, text: m.text, channel: m.channel, card: card.id, fromAnswer: true });
          }
          wake(store);
        }
        // Answering the decision Bob is held on is the review it was waiting for, whatever the answer.
        if (endsHold) {
          setHold(store, false);
          push({ type: "hold", on: false, reason: "answered" });
        }
        return json(res, { ok: true });
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
