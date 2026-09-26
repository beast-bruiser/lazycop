import { appendFileSync, mkdirSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import type { LazycopRecord } from "@lazycops/contracts";

/** Where records go: the watched task's `.lazycop/`, or nowhere while dormant. */
let recordDir: string | null = null;

/** Set while one agent's call runs, across its awaits, so each chat's records land in its own workspace. */
const scope = new AsyncLocalStorage<string | null>();

export function setRecordDir(dir: string | null): void {
  recordDir = dir;
}

/** Runs `fn` with records going to `dir` (null drops them), whatever other agents do meanwhile. */
export function withRecordDir<T>(dir: string | null, fn: () => T): T {
  return scope.run(dir, fn);
}

export function appendRecord(record: LazycopRecord): void {
  const scoped = scope.getStore();
  const dir = scoped === undefined ? recordDir : scoped;
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${record.kind}s.jsonl`), JSON.stringify(record) + "\n");
  } catch {
    // log errors must never crash the server
  }
}
