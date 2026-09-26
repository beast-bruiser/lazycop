---
name: post-plan-gap-audit
description: Audit a just-implemented goal state against its production entry points to surface unreachable code, wiring gaps, and silent divergences. Use after implementing a goal that touched 5 or more code files — before declaring "done" and before commit. Invoked from cook step 9.
---

# Post-Plan Gap Audit

No hook enforces this in Bob — `cook` step 9 calls it when 5 or more code files changed. Skip it for a refactor, doc tweak or simple fix, and say so in the report.

## The 6 gap classes

Walk every class. Each one is a real failure mode where unit tests stay green and production breaks.

### 1. Unreachable / unwired

New code that compiles, passes its tests, but no production path executes it. Two flavors:

- **Type/method never called.** Grep for every NEW export (function, type, field, MCP tool, CLI command). Exclude `*.test.ts`. If hits are only definitions and tests → gap.
- **Construction site missing.** Every new component needs a construction site in a real entry point: the CLI command, the companion's startup, the MCP server's tool registry, a hook script, or the panel's root.

```bash
grep -rn "myThing\|MyField" --include="*.ts" --include="*.tsx" --exclude="*.test.ts" --exclude-dir=node_modules .
```

### 2. Silent divergence from canonical helpers

A new package reimplements an existing helper (slug, hash, format, parse) with subtly different rules. Both sides of new code agree; old callers diverge.

For every helper added, grep for siblings and confirm byte-for-byte parity OR justify with a comment AND a parity test. Common offenders: `slugify`, `normalize`, `hash`, `canonicalize`, `parse*TS`.

### 3. Filter applied once, bypassed elsewhere

Plan adds policy X to component A. Component B re-derives the same data from upstream state and bypasses the filter.

For every filter/transform, find ALL consumers of the upstream source — not just the one the plan modified. Each must apply the filter, read pre-filtered data, or document the exemption.

### 4. Recency/window queries that starve under concurrency

`Tail(n)` or `Recent(k)` followed by filtering. If multiple partitions (session/user/workspace) write to the same log, the window fills with other partitions' data and the filtered result is empty.

Rule: `Tail(N × active_partitions)` then filter and cap.

### 5. Format/schema mismatches across boundaries

Producer writes an ISO timestamp with milliseconds; consumer parses without. A hook writes a field the companion reads under another name. Or `null` vs `[]` for empty collections. Records silently dropped.

For every serialization format, find the deserializer. Symmetric handling required for: timestamps, optional fields, empty collections, enum case.

### 6. Tests cover units but not seams

Every package has a unit test; no test traces input through ≥2 packages. The bugs from classes 1–5 never trip a test.

For the headline behavior change, is there ≥1 test that runs through the actual production path (real infra registry/store, not mocks)? If everything is pure-function tests → gap. Add at least one seam-level test.

## Procedure

1. **Read the goal.** `scripts/goal show` — the reached state, its forbids, and the headline behaviour.
2. **Walk classes 1–6.** Record gaps in a table with severity (Critical / Important / Minor).
3. **Verify every `forbid` on the state.** Each one — was it actually respected?
4. **Production-entry trace.** Pick the real entry point (a Bob hook firing, an MCP tool call, a CLI command, a panel event). Does the new code execute? At what depth?
5. **Fix Critical inline; punch-list Important/Minor.** Re-run build + tests after each fix.

## Output

```markdown
## Audit results

| # | Gap | Severity | Status |
|---|---|---|---|
| 1 | <one-line with file:line> | Critical | ✅ Fixed |

## What's now wired end-to-end

<entry point → ... → effect>

## Feature gate

<how it's gated, what flips it on>

## Remaining gaps (deferred)

- <gap>: <why deferred + when to revisit>
```

## Reference

Worked example from a previous project (Go, but the classes are language-neutral). Implementation passed its tests cleanly and looked complete. This audit caught:

- **Class 1** — assembler `FocusScope` field added but `artist.go:129` never populated it. Feature unreachable.
- **Class 1** — `cmd/agent.go` never constructed the event registry. Wiring nil-safe-fallback to legacy.
- **Class 2** — local `entityNameKey` diverged from canonical `Slugify` for punctuation. Lookups silently missed entities like "Mr. Smith".
- **Class 3** — assembler filtered the text prompt; `artist.go:155` re-attached refs from `job.ReferenceImages` directly.
- **Class 4** — `Tail(6)` starved out the requesting session under concurrent workspace sessions.

Four Critical gaps in a feature that "looked done."
