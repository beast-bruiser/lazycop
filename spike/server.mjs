// Spike server: receives Bob hook events and MCP calls, pushes them to the page
// over SSE, and holds messages the developer queued until Bob's next tool call.
import http from "node:http";
import { readFileSync } from "node:fs";

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);
const page = readFileSync(new URL("./page.html", import.meta.url));

const clients = new Set();
const pending = []; // { id, text, channel: "context" | "block" }
let hold = false;
let seq = 0;
const waiters = new Set();
const HOLD_WAIT_MS = 45000; // under the MCP SDK's 60 s request timeout
const MAX_HOLD_POLLS = 3; // each poll is a full model request, so a hold must end
let holdPolls = 0;

function setHold(on, reason) {
  hold = on;
  holdPolls = 0;
  push("hold", { on, reason });
  wake();
}

function wake() {
  for (const done of waiters) done();
  waiters.clear();
}

function waitForDeveloper(ms) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { waiters.delete(done); resolve(); }, ms);
    waiters.add(done);
  });
}

function push(type, data) {
  const line = `data: ${JSON.stringify({ type, at: new Date().toISOString(), ...data })}\n\n`;
  for (const res of clients) res.write(line);
}

function takePending(channel) {
  const i = pending.findIndex((m) => m.channel === channel);
  if (i === -1) return null;
  const [msg] = pending.splice(i, 1);
  push("delivered", { id: msg.id, via: channel });
  return msg;
}

function onHook(payload) {
  push("hook", { seq: ++seq, payload });
  const event = payload.hook_event_name;
  if (String(payload.tool_name).startsWith("mcp__lazycop__")) return {};
  if (event === "PreToolUse") {
    if (hold) return { block: "LazyCop: the developer is reviewing an important decision. Call the lazycop check_in tool; it waits for the developer's answer. Do not end your turn." };
    const msg = takePending("block");
    if (msg) return { block: `Message from the developer (via LazyCop): ${msg.text}` };
  }
  if (event === "PostToolUse" || event === "UserPromptSubmit") {
    const msg = takePending("context");
    if (msg) return { context: `Message from the developer (via LazyCop): ${msg.text}` };
  }
  return {};
}

async function onMcp(tool, args) {
  push("mcp", { tool, args });
  if (tool !== "declare_step" && tool !== "check_in") return "Delivered to the developer.";
  if (tool === "declare_step" && args.important && !hold) setHold(true, args.intent);
  if (hold && pending.length === 0) {
    await waitForDeveloper(HOLD_WAIT_MS);
    if (hold && pending.length === 0 && ++holdPolls >= MAX_HOLD_POLLS) {
      setHold(false, "timed out");
      return "The developer did not respond in time. Continue with your plan, and state the assumption you relied on in your final message.";
    }
  }
  const msgs = pending.splice(0).map((m) => (push("delivered", { id: m.id, via: "mcp" }), m.text));
  const next = `call check_in again with poll: ${(Number(args.poll) || 0) + 1}`;
  const stillHeld = hold ? `\nThe developer is still reviewing. Do not edit anything; ${next}.` : "";
  if (msgs.length) return `Developer messages:\n- ${msgs.join("\n- ")}\nAddress these first and answer with reply_to_developer.${stillHeld}`;
  return hold ? `HOLD: the developer is still reviewing this decision (wait ${holdPolls} of ${MAX_HOLD_POLLS}). ${next}; do not end your turn.` : "No messages. Continue.";
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve(null); }
    });
  });
}

function json(res, body, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(page);
  }
  if (req.method === "GET" && url.pathname === "/stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${JSON.stringify({ type: "state", hold, pending })}\n\n`);
    clients.add(res);
    return req.on("close", () => clients.delete(res));
  }
  if (req.method !== "POST") return json(res, { error: "not found" }, 404);

  const body = await readBody(req);
  if (body === null) return json(res, { error: "invalid json" }, 400);

  switch (url.pathname) {
    case "/hook": return json(res, onHook(body));
    case "/mcp": return json(res, { text: await onMcp(body.tool, body.args ?? {}) });
    case "/queue": {
      if (typeof body.text !== "string" || !body.text.trim()) return json(res, { error: "text required" }, 400);
      const msg = { id: `m-${Date.now()}`, text: body.text.trim(), channel: body.channel === "block" ? "block" : "context" };
      pending.push(msg);
      push("queued", msg);
      wake();
      return json(res, msg);
    }
    case "/hold":
      setHold(Boolean(body.on), "developer");
      return json(res, { hold });
    default: return json(res, { error: "not found" }, 404);
  }
}).listen(PORT, "127.0.0.1", () => console.error(`LazyCop spike on http://127.0.0.1:${PORT}`));
