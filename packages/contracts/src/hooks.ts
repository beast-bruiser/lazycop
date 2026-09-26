/**
 * Shared fields present in every Bob hook payload.
 * Source: Bob IDE 1.126.0+bob2.2.0 bundled source + spike/README.md.
 */
export interface HookPayloadBase {
  session_id: string;
  cwd: string;
  hook_event_name: HookEventName;
}

/** The seven hook events Bob 2.2.0 fires. */
export type HookEventName =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PreCompact"
  | "PostCompact"
  | "Stop";

/** SessionStart payload. */
export interface SessionStartPayload extends HookPayloadBase {
  hook_event_name: "SessionStart";
  source: string;
}

/** UserPromptSubmit payload. */
export interface UserPromptSubmitPayload extends HookPayloadBase {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

/** PreToolUse payload. */
export interface PreToolUsePayload extends HookPayloadBase {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
}

/** PostToolUse payload — tool_response is a string (Bob 2.2.0). */
export interface PostToolUsePayload extends HookPayloadBase {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: unknown;
  tool_use_id: string;
  tool_response: string;
}

/** PreCompact payload. */
export interface PreCompactPayload extends HookPayloadBase {
  hook_event_name: "PreCompact";
  trigger: string;
  custom_instructions: string;
}

/** PostCompact payload. */
export interface PostCompactPayload extends HookPayloadBase {
  hook_event_name: "PostCompact";
  trigger: string;
  compact_summary: string;
}

/** Stop payload. */
export interface StopPayload extends HookPayloadBase {
  hook_event_name: "Stop";
  last_assistant_message: string | null;
}

/** Union of all concrete hook payload types. */
export type HookPayload =
  | SessionStartPayload
  | UserPromptSubmitPayload
  | PreToolUsePayload
  | PostToolUsePayload
  | PreCompactPayload
  | PostCompactPayload
  | StopPayload;
