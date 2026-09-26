# AGENTS.md — Plan mode

This file provides guidance to agents when working with code in this repository.

## Plan mode cannot run `scripts/goal`

`scripts/goal` requires `execute` permission. Plan mode does not have it. Use Agent mode to create or advance a goal.

## The two forbidden architectural shortcuts

1. **Companion is NOT a Bob subagent.** Bob subagents return summaries to the main agent and cannot run alongside it. The companion is a separate process that tails `events.jsonl`. Plans that make the companion a subagent are architecturally wrong.
2. **PreToolUse hooks must be synchronous and fast** (≤10s Bob timeout). They read only local files (`baseline.json`, `inbox.jsonl`, a budget flag) and never call external services. Plans that put slow logic in a hook are wrong.

## Append-only invariant for `.lazycop/` files

`events.jsonl` and `inbox.jsonl` are append-only so hooks and the companion never overwrite each other. Plans that involve overwriting or truncating them will fail.

## `baseline.json` layout is computed once

The treemap layout derives from `baseline.json` at session start so tiles never jump. Plans that regenerate or update `baseline.json` mid-run will break the map.

## Correction delivery: latest record per ID wins

`inbox.jsonl` can have multiple records for the same `id`. The latest record wins. A delivered correction appends `{"id": "c-003", "delivered": true, "ts": "..."}` alongside, not replacing, the original directive.

## Gate 0 is always first

Any plan that proposes editing `docs/goals/`, `scripts/goal`, `.bob/harness.conf`, or `.bob/custom_modes.yaml` will have its attempt voided by gate 0, regardless of whether anything else passes.
