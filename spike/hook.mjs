// Bob command hook for every event. Logs the raw payload, asks the spike server
// what to do, and translates its answer into Bob's hook contract. Fails open.
import { appendFileSync, mkdirSync } from "node:fs";

const PORT = Number(process.env.LAZYCOP_PORT ?? 4747);

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

mkdirSync(".lazycop", { recursive: true });
let payload;
try { payload = JSON.parse(raw); } catch { process.exit(0); }

appendFileSync(".lazycop/raw-hooks.jsonl", JSON.stringify({ _ts: new Date().toISOString(), ...payload }) + "\n");

let answer = {};
try {
  const res = await fetch(`http://127.0.0.1:${PORT}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
    signal: AbortSignal.timeout(2000),
  });
  answer = await res.json();
} catch {
  process.exit(0);
}

if (answer.block && payload.hook_event_name === "PreToolUse") {
  process.stderr.write(answer.block);
  process.exit(2);
}
if (answer.context) process.stdout.write(answer.context);
