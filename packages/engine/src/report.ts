// Bob's mission report: what LazyCop measures itself during a session, the check that his
// report at end_session names every file the hooks saw him edit, and the reviewer's risk areas.
import type { HookPayload, MissionStats, ReportedChange, ReportRecord, RiskArea } from "@lazycops/contracts";
import { EDIT_TOOLS } from "./review.js";
import { cardWriter } from "./writer.js";

const READ_TOOLS = ["read_file", "list_code_definition_names"];

/** Running tallies for one session, kept in the store and reset with it. */
export interface Usage {
  toolCalls: number;
  chars: number;
  read: Set<string>;
  edited: Set<string>;
  /** Every patch an edit produced, in order, for the risk review. */
  diffs: { file: string; patch: string }[];
}

export const emptyUsage = (): Usage => ({ toolCalls: 0, chars: 0, read: new Set(), edited: new Set(), diffs: [] });

/** One way to write a path, so "./a.ts", "/repo/a.ts" and "a.ts" match. */
export function normalizePath(path: string, cwd?: string): string {
  const root = (cwd ?? "").replace(/\/+$/, "");
  const rel = root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
  return rel.replace(/^(\.\/)+/, "");
}

const size = (value: unknown): number => {
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0; // a payload that cannot be measured counts as nothing, never as a crash
  }
};

/** Counts one finished tool call. LazyCop's own tools are Bob talking to the developer, not work. */
export function countToolCall(usage: Usage, payload: HookPayload): void {
  if (payload.hook_event_name !== "PostToolUse" || payload.tool_name.startsWith("mcp__lazycop__")) return;
  usage.toolCalls += 1;
  usage.chars += size(payload.tool_input) + size(payload.tool_response);
  const p = payload.tool_input && typeof payload.tool_input === "object" ? (payload.tool_input as Record<string, unknown>)["path"] : undefined;
  if (typeof p !== "string") return;
  const path = normalizePath(p, payload.cwd);
  if (EDIT_TOOLS.includes(payload.tool_name)) {
    usage.edited.add(path);
    if (typeof payload.tool_response === "string" && payload.tool_response.includes("@@")) usage.diffs.push({ file: path, patch: payload.tool_response });
  } else if (READ_TOOLS.includes(payload.tool_name)) usage.read.add(path);
}

export function statsOf(usage: Usage): MissionStats {
  return {
    toolCalls: usage.toolCalls,
    filesRead: usage.read.size,
    filesEdited: [...usage.edited],
    approxTokens: Math.round(usage.chars / 4),
  };
}

/** Bob's changes as given, keeping only well-formed entries: MCP input is untrusted. */
export function parseChanges(value: unknown): ReportedChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const { file, what } = c as Record<string, unknown>;
    return typeof file === "string" && file.trim() ? [{ file: file.trim(), what: typeof what === "string" ? what.trim() : "" }] : [];
  });
}

/** Files the hooks saw Bob edit that his report leaves out. */
export function unreportedFiles(usage: Usage, changes: ReportedChange[], cwd?: string): string[] {
  const reported = new Set(changes.map((c) => normalizePath(c.file, cwd)));
  return [...usage.edited].filter((f) => !reported.has(f));
}

export function sendBack(missing: string[]): string {
  return `Your mission report leaves out files you changed:\n- ${missing.join("\n- ")}\nAdd each one to changes (file, and what changed and why), then call end_session again.`;
}

/**
 * Asks the reviewer where the session's change could break or surprise. A risk in a file the hooks
 * did not see Bob edit is dropped, so the report never points somewhere the change did not touch.
 */
export async function reviewRisks(usage: Usage, task: string, summary: unknown, cwd?: string): Promise<RiskArea[]> {
  if (usage.diffs.length === 0) return [];
  const risks = await cardWriter()
    .reviewRisks({ task, summary: typeof summary === "string" ? summary : "", diffs: usage.diffs })
    .catch(() => []); // the report simply goes without a review
  return risks.map((r) => ({ ...r, file: normalizePath(r.file, cwd) })).filter((r) => usage.edited.has(r.file)).slice(0, 3);
}

export function buildReport(usage: Usage, args: { summary?: unknown; effort_note?: unknown }, changes: ReportedChange[], risks: RiskArea[] = []): Omit<ReportRecord, "kind" | "ts"> {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const effort = text(args.effort_note);
  return { summary: text(args.summary), changes, ...(effort ? { effort_note: effort } : {}), stats: statsOf(usage), ...(risks.length ? { risks } : {}) };
}
