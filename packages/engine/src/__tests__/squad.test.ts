import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HookPayload, SseEventInput } from "@lazycops/contracts";
import { agentsInfo, createSquad, routeHook, runMcp, SOLO } from "../squad.js";
import type { Squad } from "../squad.js";
import { onDeveloper } from "../developer.js";
import { setRecordDir } from "../logger.js";

afterEach(() => setRecordDir(null));

const pre = (session_id: string, cwd: string, tool_name: string, tool_input: unknown = {}): HookPayload =>
  ({ hook_event_name: "PreToolUse", session_id, cwd, tool_name, tool_input, tool_use_id: "t" });
const post = (session_id: string, cwd: string, path: string): HookPayload =>
  ({ hook_event_name: "PostToolUse", session_id, cwd, tool_name: "apply_diff", tool_input: { path }, tool_use_id: "t", tool_response: "ok" });

/** Bob's own-tool call as it really arrives: its PreToolUse hook, then the MCP call. */
function call(squad: Squad, chat: string, cwd: string, tool: string, args: Record<string, unknown>, events: SseEventInput[] = []) {
  routeHook(squad, pre(chat, cwd, `mcp__lazycop__${tool}`, args));
  return runMcp(squad, tool, args, (e) => events.push(e));
}

describe("several Bob chats at once", () => {
  it("watches each chat that runs /lazycop as its own agent", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    expect(agentsInfo(squad)).toEqual([
      { id: "chat-a", n: 1, task: "Coupons", watching: true, hold: false },
      { id: "chat-b", n: 2, task: "Rounding", watching: true, hold: false },
    ]);
    expect(routeHook(squad, pre("chat-c", "/c", "apply_diff")).result).toEqual({});
  });

  it("holds one agent without touching the other", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    expect(onDeveloper(squad, "/hold", { on: true, agent: "chat-b" }, () => {})[0]).toBe(200);
    expect(routeHook(squad, pre("chat-a", "/a", "apply_diff")).result).toEqual({});
    expect(routeHook(squad, pre("chat-b", "/b", "apply_diff")).result.block).toContain("reviewing");
  });

  it("lands each MCP call on the chat whose hook announced it, and tags its events", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    // Chat B's hook fires, then chat A's; their MCP calls arrive in the other order.
    const stepA = { intent: "check expiry", files: ["coupon.js"] };
    const stepB = { intent: "round half up", files: ["money.js"], important: false };
    routeHook(squad, pre("chat-b", "/b", "mcp__lazycop__declare_step", stepB));
    routeHook(squad, pre("chat-a", "/a", "mcp__lazycop__declare_step", stepA));
    const events: SseEventInput[] = [];
    await runMcp(squad, "declare_step", { files: ["coupon.js"], intent: "check expiry" }, (e) => events.push(e));
    await runMcp(squad, "declare_step", stepB, (e) => events.push(e));
    expect(events.filter((e) => e.type === "mcp").map((e) => (e as { agent?: string }).agent)).toEqual(["chat-a", "chat-b"]);
  });

  it("routes a card answer to the agent that raised the card", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    const events: SseEventInput[] = [];
    const held = call(squad, "chat-b", "/b", "declare_step", { intent: "add lib", files: ["package.json"], assumption: "a lib is fine", important: true }, events);
    await new Promise((r) => setTimeout(r, 20));
    const card = events.find((e) => e.type === "card") as { card: { id: string } };
    expect(onDeveloper(squad, "/answer", { card: card.card.id, pick: "bob" }, (e) => events.push(e))[0]).toBe(200);
    expect(await held).toBe("No messages. Continue.");
    expect(squad.agents.get("chat-a")!.store.cards.size).toBe(0);
    expect(events.find((e) => e.type === "answer")).toMatchObject({ agent: "chat-b" });
  });

  it("writes each agent's records into its own workspace", async () => {
    const [a, b] = [mkdtempSync(join(tmpdir(), "lazycop-a-")), mkdtempSync(join(tmpdir(), "lazycop-b-"))];
    const squad = createSquad();
    await call(squad, "chat-a", a, "start_session", { task: "Coupons" });
    await call(squad, "chat-b", b, "start_session", { task: "Rounding" });
    routeHook(squad, post("chat-a", a, "coupon.js"));
    routeHook(squad, post("chat-b", b, "money.js"));
    const events = (dir: string) => readFileSync(join(dir, ".lazycop", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).path);
    expect(events(a)).toEqual(["coupon.js"]);
    expect(events(b)).toEqual(["money.js"]);
  });

  it("keeps the others watched when one agent ends", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    expect(await call(squad, "chat-a", "/a", "end_session", {})).toContain("stopped watching");
    expect(agentsInfo(squad).map((i) => [i.id, i.watching])).toEqual([["chat-a", false], ["chat-b", true]]);
    expect(routeHook(squad, pre("chat-a", "/a", "apply_diff")).result).toEqual({});
  });

  it("starts a fresh squad once every agent has ended", async () => {
    const squad = createSquad();
    await call(squad, "chat-a", "/a", "start_session", { task: "Coupons" });
    squad.history.push({ type: "hold", at: "t", on: true, reason: "developer" });
    await call(squad, "chat-a", "/a", "end_session", {});
    await call(squad, "chat-b", "/b", "start_session", { task: "Rounding" });
    expect(agentsInfo(squad).map((i) => i.id)).toEqual(["chat-b"]);
    expect(squad.history).toEqual([]);
  });

  it("still works in a chat without hooks, as one solo agent", async () => {
    const squad = createSquad();
    expect(await runMcp(squad, "start_session", { task: "Coupons" }, () => {})).toContain("watching this task");
    expect(agentsInfo(squad)).toMatchObject([{ id: SOLO, watching: true }]);
  });
});
