# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project

LazyCop — an IBM Bob hackathon project. The repo is currently in scaffold phase: no `src/`, no `package.json` yet. All actual product code is yet to be written.

## Gates (`.bob/harness.conf`)

```
npm run typecheck   # tsc across the workspace
npm test            # vitest
```

Gates don't run until the scaffold exists — name them as unrun, never skip silently. Gate 0 (always first): `git diff --name-only -- docs/goals scripts/goal .bob/harness.conf .bob/custom_modes.yaml` — any output voids the attempt.

## Goal workflow

Every non-trivial change uses the **cook skill** (`/cook <what to build>`) in **Agent mode** (Plan/Ask cannot run `scripts/goal`).

- `scripts/goal now` — open state + forbids (the brief)
- `scripts/goal show` — full history including failed attempts
- `scripts/goal new <slug> "<title>"` — claim a new goal
- `scripts/goal add "<outcome>" [--forbid "..."] [--plane engine|panel] [--head]`
- `scripts/goal reached <s> "<evidence>"` / `scripts/goal failed <s> "<why>"`
- `scripts/goal close "<disposition>"`

**Never write to `docs/goals/` or `scripts/goal` directly** — only `scripts/goal` appends to the log. The `implementer` mode's `fileRegex` blocks it, and gate 0 catches any other write.

A state is a **condition the repo is in**, not a task. `goal add` rejects outcomes opening with an imperative verb (locate, find, add, create, implement, fix, etc.). Use `--force` only for genuine false positives.

One goal open per working copy. Correct by appending (`goal amend`), never by rewriting a line.

## Planes

The repo has one deliberate parallel split. Tag states with `--plane`:
- `engine` — hooks, companion, MCP server, CLI
- `panel` — panel frontend, VS Code extension, web demo

## Code style (from implementer contract)

- File naming: **kebab-case**
- File size: **≤ ~200 lines** — split by responsibility
- Shared contracts for `plan.md`, `baseline.json`, `events.jsonl`, `inbox.jsonl` live in **one shared place** — import them, never redeclare
- Handle errors at boundaries: hook stdin, file reads, MCP input, network calls
- Type-check after each file: `npx tsc --noEmit` in the package you touched
- **Never** edit a test, widen to `any`, add `@ts-ignore`/`@ts-expect-error`, or swallow an exception to go green — report `infeasible` instead

## Architecture reference

`docs/reference/architecture.md` holds invariants the code cannot enforce. A state that requires breaking an invariant is invalid — change the invariant there first, deliberately. (File does not exist yet; create it when the first invariant is discovered.)

## Data contracts (`.lazycop/` in each project)

Four append-only files connect all components — hooks, companion, MCP server, panel:
- `plan.md` — structured: Steps, Scope, Off-limits, Assumptions (IDs like A1), Acceptance checks
- `baseline.json` — scope, blast radius, budget; generated from plan + explore findings
- `events.jsonl` — one line per Bob tool call (PostToolUse hook); fields: `seq`, `ts`, `tool`, `kind` (read/search/edit/command), `path`, `range`, `chars_in`, `chars_out`
- `inbox.jsonl` — corrections; companion appends directive, PreToolUse hook appends delivery record with same ID; latest record per ID wins

## Docs discipline

Only a breaking change earns a doc edit: a data contract shape, an MCP tool signature, a hook input mapping, or an invariant. Research digests and debug notes go to `docs/research/`.
