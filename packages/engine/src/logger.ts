import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LazycopRecord } from "@lazycops/contracts";

/** Where records go: the watched task's `.lazycop/`, or nowhere while dormant. */
let recordDir: string | null = null;

export function setRecordDir(dir: string | null): void {
  recordDir = dir;
}

export function appendRecord(record: LazycopRecord): void {
  if (!recordDir) return;
  try {
    mkdirSync(recordDir, { recursive: true });
    appendFileSync(join(recordDir, `${record.kind}s.jsonl`), JSON.stringify(record) + "\n");
  } catch {
    // log errors must never crash the server
  }
}
