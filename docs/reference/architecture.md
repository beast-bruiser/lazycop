Edit an invariant in place when a decision changes it; git is the history. No ADRs.

## Invariants

- **Hooks never block on slow work.** Hooks only append to or read small files in `.lazycop/`; all slow logic runs in the companion process. Why: the main agent must never wait on LazyCop.

- **Append-only JSONL.** `events.jsonl` and `inbox.jsonl` are append-only; no component rewrites another component's lines. In `inbox.jsonl`, the latest record per `id` wins. Why: concurrent writers (hook + companion) never conflict.

- **One process, one state.** The MCP server and the companion share one process and one in-memory state. Why: a correction queued from the panel is then visible to both `check_in` and the PreToolUse hook without inter-process messaging.

- **Companion is not a subagent.** The companion is a separate process, not a Bob subagent. Why: Bob subagents return a summary to the main agent and cannot run alongside it or talk to the developer independently.

- **Contracts are shared types.** `plan.md` sections, `baseline.json`, `events.jsonl`, and `inbox.jsonl` are the contracts between all components. Their TypeScript types live in one shared place and are imported by every surface; never redeclared. Why: a shape change propagates everywhere at once and the compiler catches every consumer.

- **One panel.** The panel is one frontend component, shared by the VS Code extension, the browser panel, and the web demo. Why: no three-way drift; a fix or feature lands everywhere.

- **Hook field names come from real data.** Bob hook field names and tool names are mapped from observed hook input, never assumed from docs. Why: the spec notes hook inputs are undocumented; guessing them produces silent mismatches.

- **Credentials never in the repo.** No credentials anywhere in the repo or in `bob_sessions/` exports. The watsonx key is server-side only (Vercel function). Why: the repo is public and `bob_sessions` are committed as judging evidence.

- **Dev harness vs product.** This repo's `.bob/` is the dev harness for building LazyCop. LazyCop's own product hooks are never registered here; they are developed and tested against the sample shop app. Why: keeps dev tooling and product artefacts from colliding.

- **PreToolUse reads only local files.** The PreToolUse hook reads only `baseline.json`, `inbox.jsonl`, and a budget flag from `.lazycop/`. It must return within Bob's 10-second hook timeout. Why: a slow or network-dependent hook stalls every agent tool call.

- **SessionStart injects only procedure rules.** The SessionStart hook injects only the LazyCop procedure rules because no plan exists at session start. After the gate, `plan.md` and `baseline.json` are read by the LazyCop Run mode directly. Why: SessionStart fires before any plan exists; injecting stale or absent plan data would mislead the model.

- **Gate lock is enforced, not recommended.** Until the developer passes the planning gate, the PreToolUse hook blocks every edit tool. Why: the procedure must be enforceable, not just a convention the model can ignore.

- **Coin and context figures are estimates.** Characters read/written are used to approximate token counts because hook inputs are not documented to include token counts. The estimate is labelled as such; Bob's task consumption summary is the authoritative figure. Why: silent overconfidence in an estimate misleads both the developer and the scorecard.
