import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookPayload, SseEventInput } from "@lazycops/contracts";
import { afterStop, createSquad, isWatching, routeHook, runMcp } from "../squad.js";
import type { Squad } from "../squad.js";
import { setRecordDir } from "../logger.js";

afterEach(() => {
  setRecordDir(null);
  vi.useRealTimers();
});

const stop = (cwd: string): HookPayload => ({ hook_event_name: "Stop", session_id: "chat", cwd, last_assistant_message: "Done." });

async function watched(): Promise<{ squad: Squad; cwd: string }> {
  const squad = createSquad();
  const cwd = mkdtempSync(join(tmpdir(), "lazycop-stop-"));
  const args = { task: "Mute button" };
  routeHook(squad, { hook_event_name: "PreToolUse", session_id: "chat", cwd, tool_name: "mcp__lazycop__start_session", tool_input: args, tool_use_id: "t" });
  await runMcp(squad, "start_session", args, () => {});
  return { squad, cwd };
}

/** The Stop hook as the server handles it. */
function hitStop(squad: Squad, cwd: string, events: SseEventInput[], graceMs?: number) {
  const { agent, result } = routeHook(squad, stop(cwd));
  if (agent) afterStop(agent, result.end === true, (e) => events.push(e), graceMs);
  return result;
}

describe("Bob ends his turn without end_session", () => {
  it("is told to call end_session the first time, and the task stays watched", async () => {
    const { squad, cwd } = await watched();
    const events: SseEventInput[] = [];
    expect(hitStop(squad, cwd, events).block).toContain("end_session");
    expect(isWatching(squad.agents.get("chat")!)).toBe(true);
    expect(events).toEqual([]);
  });

  it("has his task closed when he stops again, and the page is told", async () => {
    const { squad, cwd } = await watched();
    const events: SseEventInput[] = [];
    hitStop(squad, cwd, events);
    expect(hitStop(squad, cwd, events).block).toBeUndefined();
    expect(isWatching(squad.agents.get("chat")!)).toBe(false);
    expect(events).toContainEqual({ type: "session", on: false, agent: "chat" });
    const sessions = readFileSync(join(cwd, ".lazycop", "sessions.jsonl"), "utf8");
    expect(sessions).toContain('"on":false');
  });

  it("has his task closed once he stays quiet after the reminder", async () => {
    vi.useFakeTimers();
    const { squad, cwd } = await watched();
    const events: SseEventInput[] = [];
    hitStop(squad, cwd, events, 1000);
    vi.advanceTimersByTime(1000);
    expect(isWatching(squad.agents.get("chat")!)).toBe(false);
    expect(events).toContainEqual({ type: "session", on: false, agent: "chat" });
  });

  it("keeps the task open when he acts on the reminder", async () => {
    vi.useFakeTimers();
    const { squad, cwd } = await watched();
    const events: SseEventInput[] = [];
    hitStop(squad, cwd, events, 1000);
    vi.advanceTimersByTime(10);
    routeHook(squad, { hook_event_name: "PreToolUse", session_id: "chat", cwd, tool_name: "read_file", tool_input: {}, tool_use_id: "t" });
    vi.advanceTimersByTime(1000);
    expect(isWatching(squad.agents.get("chat")!)).toBe(true);
    expect(events).toEqual([]);
  });
});
