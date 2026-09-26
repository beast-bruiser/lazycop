import { describe, it, expectTypeOf } from "vitest";
import type {
  DeclareStepInput,
  CheckInInput,
  ReplyToDeveloperInput,
  HookPayloadBase,
  HookEventName,
  HookPayload,
  SessionStartPayload,
  UserPromptSubmitPayload,
  PreToolUsePayload,
  PostToolUsePayload,
  PreCompactPayload,
  PostCompactPayload,
  StopPayload,
  LazycopRecord,
  EventRecord,
  CardRecord,
  CardOption,
  AnswerRecord,
  MessageRecord,
  ReplyRecord,
} from "./index.js";

describe("contracts — type smoke tests", () => {
  it("DeclareStepInput has required fields and optional fields", () => {
    const minimal: DeclareStepInput = { intent: "add check", files: ["coupon.js"] };
    const full: DeclareStepInput = {
      intent: "add expiry check",
      files: ["coupon.js"],
      assumption: "expiresAt is a Date",
      important: true,
    };
    expectTypeOf(minimal).toMatchTypeOf<DeclareStepInput>();
    expectTypeOf(full).toMatchTypeOf<DeclareStepInput>();
  });

  it("CheckInInput has poll field", () => {
    const input: CheckInInput = { poll: 1 };
    expectTypeOf(input.poll).toBeNumber();
  });

  it("ReplyToDeveloperInput has text field", () => {
    const input: ReplyToDeveloperInput = { text: "Understood." };
    expectTypeOf(input.text).toBeString();
  });

  it("HookEventName is the exact Bob 2.2.0 set of seven events", () => {
    const events: HookEventName[] = [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PreCompact",
      "PostCompact",
      "Stop",
    ];
    expectTypeOf(events).toMatchTypeOf<HookEventName[]>();
  });

  it("HookPayloadBase has session_id, cwd, hook_event_name", () => {
    expectTypeOf<HookPayloadBase>().toHaveProperty("session_id");
    expectTypeOf<HookPayloadBase>().toHaveProperty("cwd");
    expectTypeOf<HookPayloadBase>().toHaveProperty("hook_event_name");
  });

  it("each hook payload carries its event-specific fields", () => {
    expectTypeOf<SessionStartPayload>().toHaveProperty("source");
    expectTypeOf<UserPromptSubmitPayload>().toHaveProperty("prompt");
    expectTypeOf<PreToolUsePayload>().toHaveProperty("tool_name");
    expectTypeOf<PreToolUsePayload>().toHaveProperty("tool_input");
    expectTypeOf<PreToolUsePayload>().toHaveProperty("tool_use_id");
    expectTypeOf<PostToolUsePayload>().toHaveProperty("tool_response");
    // tool_response must be string, not unknown
    expectTypeOf<PostToolUsePayload["tool_response"]>().toBeString();
    expectTypeOf<PreCompactPayload>().toHaveProperty("trigger");
    expectTypeOf<PreCompactPayload>().toHaveProperty("custom_instructions");
    expectTypeOf<PostCompactPayload>().toHaveProperty("trigger");
    expectTypeOf<PostCompactPayload>().toHaveProperty("compact_summary");
    expectTypeOf<StopPayload["last_assistant_message"]>().toEqualTypeOf<string | null>();
  });

  it("HookPayload is a union of all seven concrete payload types", () => {
    expectTypeOf<SessionStartPayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<UserPromptSubmitPayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<PreToolUsePayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<PostToolUsePayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<PreCompactPayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<PostCompactPayload>().toMatchTypeOf<HookPayload>();
    expectTypeOf<StopPayload>().toMatchTypeOf<HookPayload>();
  });

  it("CardRecord carries question, claim, source, options; 'bob' option is always present by contract", () => {
    const bobOption: CardOption = { id: "bob", text: "expiresAt timestamp is before now" };
    const card: CardRecord = {
      kind: "card",
      id: "k-7",
      type: "assumption",
      question: 'What should "expired" mean?',
      claim: "expiresAt timestamp is before now",
      source: "declare_step",
      options: [
        bobOption,
        { id: "alt-1", text: "End of the expiry day in the customer's timezone" },
      ],
    };
    expectTypeOf(card).toMatchTypeOf<LazycopRecord>();
  });

  it("AnswerRecord uses pick and optional text", () => {
    const agree: AnswerRecord = { kind: "answer", card: "k-7", pick: "bob" };
    const disagree: AnswerRecord = { kind: "answer", card: "k-7", pick: "alt-1", text: "End of the expiry day in the customer's timezone" };
    const other: AnswerRecord = { kind: "answer", card: "k-7", pick: "other", text: "End of the local day" };
    const askWhy: AnswerRecord = { kind: "answer", card: "k-7", pick: "ask_why" };
    expectTypeOf(agree).toMatchTypeOf<LazycopRecord>();
    expectTypeOf(disagree).toMatchTypeOf<LazycopRecord>();
    expectTypeOf(other).toMatchTypeOf<LazycopRecord>();
    expectTypeOf(askWhy).toMatchTypeOf<LazycopRecord>();
  });

  it("MessageRecord.card is optional (free-text and Hold button messages have no card)", () => {
    const withCard: MessageRecord = { kind: "message", id: "m-3", card: "k-7", text: "…", delivered_via: "mcp", ts: "2026-09-26T09:16:20Z" };
    const withoutCard: MessageRecord = { kind: "message", id: "m-4", text: "Hold please", delivered_via: "hook", ts: "2026-09-26T09:17:00Z" };
    expectTypeOf(withCard).toMatchTypeOf<LazycopRecord>();
    expectTypeOf(withoutCard).toMatchTypeOf<LazycopRecord>();
  });

  it("ReplyRecord has card and text", () => {
    const reply: ReplyRecord = { kind: "reply", card: "k-7", text: "Understood." };
    expectTypeOf(reply).toMatchTypeOf<LazycopRecord>();
  });

  it("EventRecord is part of LazycopRecord union", () => {
    const event: EventRecord = { kind: "event", ts: "2026-09-26T09:16:54Z", tool: "apply_diff" };
    expectTypeOf(event).toMatchTypeOf<LazycopRecord>();
  });
});
