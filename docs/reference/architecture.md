# LazyCop — Architecture Invariants

These are the constraints the code must never violate. A goal that can only be
reached by bending one is invalid; change the invariant here first, deliberately.

## Invariants

**1. Hooks fail open and never block on the server.**
Bob hooks run with a short timeout (10 s per Bob 2.2.0) and must exit 0 if the
LazyCop server is unreachable. No hook may wait on I/O beyond that timeout. The
main Bob agent must never be held by a LazyCop server failure.

**2. LazyCop's own MCP tools are never blocked by LazyCop's hooks.**
`mcp__lazycop__*` tool calls (declare_step, check_in, reply_to_developer) are
exempt from PreToolUse blocks and PostToolUse delays. Blocking them would
deadlock Bob mid-hold.

**3. Every wait on the developer ends.**
- Assumption cards never make Bob wait: an answer reaches him at his next step.
- A hold (declare_step with important: true, or the Hold button): each check_in
  waits at most 45 s, at most 3 waits per hold, then Bob is released automatically.
- The 45 s per-wait ceiling stays under Bob's MCP client default request timeout
  of 60 s.

**4. The browser page is only a view; all state lives in the local server.**
The page receives cards over server-sent events and posts answers back. Closing
or reloading the page loses nothing. The page holds no authoritative state.

**5. LazyCop binds only to localhost.**
The server listens on `127.0.0.1` only. Bob's HTTP hooks are not used because
they require a trusted HTTPS endpoint; command hooks that call localhost are used
instead. The only outbound traffic is the companion's call to its card-writing
LLM (Granite on watsonx.ai), and the page loading its art from the CDN URLs the
developer sets in `packages/page/src/art-urls.ts` (image GETs only; nothing is sent).
Bob-facing channels never leave localhost.

**6. Contract types live only in the shared package.**
The type definitions for all data contracts (`DeclareStepInput`, `CheckInInput`, `EndSessionInput`,
`ReplyToDeveloperInput`, hook payloads, and `.lazycop/` record kinds) are declared
once in `packages/contracts` and imported everywhere; they are never re-declared
in a surface package.

**7. LazyCop is dormant unless the developer invokes it, and each invoking chat is its own agent.**
With no active session, hooks exit at once with no output and block nothing, and no
rule tells Bob to call LazyCop's tools. A session starts only through `start_session`
in a task the developer opened with `/lazycop` or the LazyCop mode. Every Bob chat
that does so is watched as a separate agent, keyed by its hook `session_id`, with its
own cards, messages, hold and `.lazycop/` records; starting in one chat never ends
another. Cards, pauses and holds apply only to hook events whose `session_id` is a
watched agent's. MCP calls carry no `session_id`, so each is matched to the PreToolUse
hook Bob fired for it; a chat without hooks is one "solo" agent. Bob subtasks and
subagents share their root chat's `session_id` (Bob 2.2.0), so they act as that chat's
agent. The `declare_step` rule lives in the LazyCop mode, never in always-loaded rules.

**8. A task closes with Bob's mission report, and LazyCop measures the numbers itself.**
`end_session` carries Bob's report: `summary`, one `changes` entry per file he
changed (file, and what changed and why), and an optional `effort_note` when the
work took a lot of effort. A file the PostToolUse hooks saw him edit but the report
leaves out sends the report back, and the session stays open. Tool calls, files read,
files edited and approximate tokens (tool input and output characters ÷ 4) are
counted by LazyCop from its own hook events, never taken from Bob, and are shown for
information only: there is no budget and no pass/fail. When watsonx credentials are set,
Granite reviews the session's diffs once, during the final review's wait, and the report
carries at most 3 `risks`, each in a file the hooks saw Bob edit; any other is dropped.
The accepted report is appended as a `report` record and pushed to the page before the session ends.
