# AGENTS.md — Agent / Implementer mode

This file provides guidance to agents when working with code in this repository.

## Before touching code

Run `scripts/goal now` first. That is the only brief. `scripts/goal show` lists failed attempts — do not retry them.

Read `docs/reference/architecture.md` before any change that comes near an invariant.

## What the implementer mode cannot touch

`fileRegex` blocks writes to `docs/goals/`, `scripts/goal`, and `.bob/`. Gate 0 catches any other write to those paths. Do not touch them; report `infeasible` instead.

## Infeasible outcomes (stop, don't work around)

- `contract_contradiction` — two forbids or invariants conflict
- `state_unreachable` — the state cannot be reached as written
- `scope_too_narrow` — the change needs something a forbid rules out
- `missing_context` — goal assumes something not in the repo
- `environment` — cannot build or run here

## Never do to go green

Editing a test · widening to `any` · `@ts-ignore` / `@ts-expect-error` · swallowing an exception. Report `infeasible` instead.

## Handoff format (switch back to Agent mode with)

```
outcome: completed | partial | infeasible
files_changed: …
approach: two or three sentences
uncertainties: dead ends, surprises, what the next round should know
blocked_by: required when infeasible
```

## Shared contracts — import, never redeclare

Types for `plan.md`, `baseline.json`, `events.jsonl`, `inbox.jsonl` live in one shared place. Redeclaring them in a surface is forbidden.
