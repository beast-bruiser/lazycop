# Spike: can LazyCop talk to Bob both ways?

Throwaway. Answers the build spec's open questions before the core loop is built.

## Already answered from Bob 2.2.0's source

Read from `IBM Bob.app/.../extensions/bob-code/dist/extension.js` (Bob IDE `1.126.0+bob2.2.0`), including
Bob's built-in "Configure Hooks" skill text.

| Question | Answer |
|---|---|
| Hook events | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PreCompact`, `PostCompact`, `Stop` |
| Payload fields | All: `session_id`, `cwd`, `hook_event_name`. Tool events: `tool_name`, `tool_input`, `tool_use_id`; PostToolUse adds `tool_response` (string). `SessionStart.source`, `UserPromptSubmit.prompt`, `Stop.last_assistant_message` |
| Does a PreToolUse exit-2 reason reach the model? | **Yes, in 2.2.0.** The reason (stderr, else stdout) becomes the tool's error result (`contextFromTool`, `isError: true`). The 2.0.2 walkthrough saying otherwise is out of date |
| Can a hook add model context mid-run? | **Yes. PostToolUse stdout is added beside the tool result.** Skipped when the tool errored |
| Structured output | PreToolUse: `hookSpecificOutput.permissionDecision: "deny"` + reason, or `updatedInput` to rewrite the call. SessionStart/UserPromptSubmit/PostToolUse: `additionalContext` |
| Hooks inside subagents? | **Yes.** Subagents inherit the parent's `onPreToolUse` / `onToolResult` |
| HTTP hooks | `type: "http"` exists but needs a trusted **HTTPS** URL, so no plain `http://localhost`. We use command hooks that call localhost |
| Timeout | Default 10 s; failures, timeouts and other non-zero exits fail open |
| MCP config | Workspace `.bob/mcp.json`, `{"mcpServers": {name: {command, args}}}`. Tools match hooks as `mcp__<server>__<tool>` |

So there are three delivery channels from the developer to Bob, all at Bob's next tool call:

1. **PostToolUse context**: the softest; Bob just sees a note beside the result.
2. **PreToolUse block**: Bob's next call fails with our message as the error.
3. **MCP result**: `declare_step` / `check_in` return pending messages.

## Still needs a live run

These are about model behaviour, which the code cannot tell us.

| # | Check | How | Pass when |
|---|---|---|---|
| L1 | Real payloads and tool names | Any small task; read `sandbox/.lazycop/raw-hooks.jsonl` | Edit/read/search tool names recorded |
| L2 | Bob acts on PostToolUse context | Queue "context" mid-run | Bob changes course or replies |
| L3 | Bob acts on a PreToolUse block | Queue "block" mid-run | Bob addresses it instead of blindly retrying |
| L4 | Bob calls `declare_step` before edits, unprompted | Rule in `sandbox/.bob/rules/lazycop.md` | Cards appear before each edit |
| L5 | Hold works | Toggle Hold, then off | Bob waits / polls `check_in`, then continues |
| L6 | Hooks fire in Plan mode and in subagents | Run in Plan mode; ask for a subagent | Events appear in the feed |
| L7 | Cost of `declare_step` | Compare coins of the same task with and without the rule | Overhead is small enough to keep |

## Run it

```sh
node spike/setup.mjs        # writes sandbox/.bob/mcp.json with your absolute path
node spike/server.mjs       # keep running; open http://127.0.0.1:4747
```

Open `spike/sandbox/` as the workspace in Bob IDE (hooks load from the workspace's `.bob/`), check the
`lazycop` MCP server is connected, and give Bob the seeded ambiguous task:

> Add coupon expiry to `coupon.js`: an expired coupon gives no discount.

Bob will have to assume what "expired" means. Disagree on the card, and try each channel.
