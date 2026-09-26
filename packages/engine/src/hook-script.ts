#!/usr/bin/env node
// Bob command hook — runs on every hook event. Fails open, and writes nothing itself:
// the server records events only for the task LazyCop is watching.

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);

let raw = "";
for await (const chunk of process.stdin as AsyncIterable<Buffer>) raw += chunk;

let payload: Record<string, unknown> | null = null;
try {
  payload = JSON.parse(raw) as Record<string, unknown>;
} catch {
  process.exit(0);
}

if (!payload) process.exit(0);

let answer: { block?: string; context?: string } = {};
try {
  const res = await fetch(`http://127.0.0.1:${PORT}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
    signal: AbortSignal.timeout(4000),
  });
  answer = (await res.json()) as typeof answer;
} catch {
  process.exit(0);
}

if (answer.block && payload["hook_event_name"] === "PreToolUse") {
  process.stderr.write(answer.block);
  process.exit(2);
}
if (answer.context) {
  process.stdout.write(answer.context);
}

export {};
