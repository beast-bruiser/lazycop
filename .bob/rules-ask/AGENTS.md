# AGENTS.md — Ask mode

This file provides guidance to agents when working with code in this repository.

## Where things actually live

- Product spec: `docs/product/LazyCop — Build Spec.md` — the canonical intent doc; read only the section relevant to the question
- Invariants: `docs/reference/architecture.md` — does not exist yet (create when first invariant is discovered)
- Goal history: `docs/goals/<YYMMDD-HHMM-slug>.jsonl` — `scripts/goal show` to read it
- Research and debug notes: `docs/research/`

## "Engine" vs "panel" — the one architectural split

All components fall into one of two planes:
- **Engine**: hooks (PreToolUse, PostToolUse, SessionStart, Stop), companion process, MCP server (`check_in`, `report_assumption`, `get_plan`), CLI
- **Panel**: treemap frontend, VS Code extension webview, web demo

The companion process and MCP server **share one process and one state**. That is intentional — a correction queued from the panel is visible to both the PreToolUse hook and the `check_in` tool without IPC.

## Hook input fields are unverified

The build spec explicitly flags that Bob's hook input field names and tool names are not confirmed from docs — they were inferred. The first hook in a spike logs raw input to a file to confirm the schema before any logic is built on it.

## Steering channel uncertainty

Whether a PreToolUse exit-2 block reason reaches the model is unverified. Two fallback paths exist: UserPromptSubmit hook injection, and the MCP `check_in` tool (Bob calls it before edits; a tool result always reaches the model). The spec says "spike decides which one leads."
