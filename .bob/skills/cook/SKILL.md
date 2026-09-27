---
name: cook
description: Build a feature end to end under the goal-driven workflow — claim a goal, log the states the user wants with their forbids, investigate, implement in implementer mode, then measure until every gate passes. Use for /cook or any change bigger than a local fix.
---

# cook

`/cook <what to build>` — the standard procedure, so a feature is never a bare
prompt. Run it in **Agent mode**: Plan and Ask cannot execute `scripts/goal`.
You own the goal, the investigation and the measurement; the code is written in
`implementer` mode.

A goal is a transfer between states. `docs/goals/<id>.jsonl` is the
append-only log of them, one JSON record per line, written only by `scripts/goal`.

## 1. Route the context

Reference docs are **on demand, not by default**: read
`docs/reference/architecture.md` when you need an invariant, and for product
intent only the one section of `docs/product/LazyCop — Build Spec.md` the request
touches — and only when the code alone will not give you enough leverage.

## 2. Claim the goal

```bash
scripts/goal now
```

Another goal already open → **stop and ask**. That is live state; an interrupted
goal is not recoverable from intent alone. Otherwise:

```bash
scripts/goal new <slug> "<title>"
```

That creates `docs/goals/<id>.jsonl`. One goal is open per working copy
— a file stays open until `goal close` writes a `closed` record. **Reach the log
only through `scripts/goal`**: the `implementer` mode cannot edit the log, and
gate 0 catches any other write.

## 3. Log the states

A state is one line saying explicitly what the user wants, in their terms — read
off their own words, not translated into tasks. Start with where the repo stands
today, so the transfer has a from:

```bash
scripts/goal add "Bob tool calls leave no trace outside Bob." --head
scripts/goal add "Every Bob tool call appears as one line in .lazycop/events.jsonl." --plane engine \
  --forbid "no blocking work in the hook — it only appends"
```

- One state, one condition. If it says "and", it is two.
- `--head` marks the state true at HEAD. If it is not actually true, you have not
  read the code yet — go to step 4 and come back.
- `--plane engine|panel` marks which side of the repo's one parallel split the
  state falls on: `engine` (hooks, companion, MCP server, CLI) or `panel` (panel
  frontend, extension, web demo).
- Append-only: correct by appending. `goal amend` re-states the last one.
- `goal now` is the open state plus its forbids; that is what the implementer
  aims at. `goal show` is the whole transfer, failed attempts included.
- `goal add` refuses an outcome that opens with an imperative. If you are
  fighting that check, you are writing a task — rephrase it as a condition.
  `--force` exists for the rare false positive, not as the way through.

### A legal next state

You write the states; the `implementer` mode is bound by rules you do not carry.
A state it can only reach by breaking one is a deadlock you built.

- **Outcomes, not diffs.** What becomes true — never which lines change or which
  file holds them. Over-specifying that is how a goal turns back into a spec.
- **No state reachable only by a new parallel file.** Edit-don't-duplicate binds
  the implementer; `*-v2` / `*-enhanced` paths are refusals, not work.
- **No state whose cheapest route is weakening a check.** Editing a test,
  widening to `any`, an ignore pragma, swallowing an exception — all forbidden
  downstream. If the state is only reachable that way, it is the wrong state.
- **Invariants win.** A state contradicting `docs/reference/architecture.md` is
  invalid; change the invariant there first, deliberately, or drop the goal.

## 4. Investigate, then write the forbids

Read the code, trace the paths, check the contracts. There is no plan file; what
the investigation has to produce is two things:

- **`forbid` lines on the state** — what this goal must not touch, and why. This
  is the part nothing else can re-derive: which files to open is a grep, but
  *"no blocking work in the PreToolUse hook — the main agent must never wait on
  LazyCop"* is a judgment, and it is what stops a rewrite. Write it with
  `goal add --forbid`, or append a fresh state if you learn it late.
- **The map** — which files the change touches, which entry point constructs
  them, which invariants it comes near. This is re-derivable with a grep, so it
  is not stored anywhere. Never write it to a file that will be stale by the
  next goal.

If you cannot name the files the change touches, the investigation is not
finished.

## 5. Hand off

There is no spawn. Once `scripts/goal now` carries its forbids and you can name
the files in play, write a five-line handoff note in chat:

```
Target state: <S# and outcome, from scripts/goal now>
Forbids: <the forbid lines>
Files in play: <the map from §4, plus the entry point that constructs them>
Gates: <GATES from .bob/harness.conf>
Already tried: <failed records, or "nothing">
```

Then **switch to `implementer` mode** in the same task — no context is lost and
nothing is re-read. When implementation is done, the implementer switches back to
Agent mode with its report, and you measure.

Use a subtask only when both planes (`engine` ∥ `panel`) are in play and truly
disjoint. Anywhere else, stay in this task.

## 6. Measure

```bash
cat .bob/harness.conf      # the gates for this repo, in order
```

Gate 0, always first:

```bash
git diff --name-only -- docs/goals scripts/goal .bob/harness.conf .bob/custom_modes.yaml
```

Any output voids the attempt: it edited its own grading criteria, regardless of
what else passes. (Your own `scripts/goal` appends in steps 2–3 are expected —
compare against what you logged.) Then run each command in `GATES` in order; the
first failure ends the attempt. If a gate cannot run yet (no scaffold), say so
and record it — `goal failed` or the report — never skip it silently. The
implementer's claims about success are **ignored** — only your own reading counts.

State reached → `goal reached <s> "<what you observed>"`, and the log now carries
the transfer. Not reached → `goal failed <s> "<why>"` in those exact words, then
hand off again; the next attempt reads that record and does not repeat it. Three
attempts without progress → stop and report. Do not raise your own budget; the
cap exists to turn a silent loop into a visible decision.

If the implementer returns `infeasible`, it is telling you the goal is wrong.
`state_unreachable` and `scope_too_narrow` are the only cases where you may
restate it — and then you append a state saying what changed and why, so the
relaxation is on the record. A goal that quietly relaxes until it passes is the
same failure as an implementer editing tests, just slower.

## 7. Read the diff

Only once the gates are green. Green gates are not the same as the feature
working, and this is the only thing standing in front of green-but-wrong:

- Does it reach the state, or satisfy the letter of it by a route that misses
  the point?
- Every `forbid` on the state — respected, including the ones no command checks?
- Dead code, swallowed exceptions, a TODO where the hard part was, a value
  hardcoded to make a check pass?

A failed read is a failed attempt. Be specific about what to change.

## 8. Browser pass — panel plane only

If the change touches the `panel` plane and `BROWSER_VERIFY_SKILL` in
`.bob/harness.conf` is set, invoke that skill and look at the result. A green
build says nothing about what rendered. Empty value → skip, and say so.

## 9. Gap audit

Invoke `post-plan-gap-audit` when 5 or more code files changed — it catches code
that compiles, passes tests, and is never reached. No hook enforces this in Bob,
so it is on you.

## 10. Docs and close

**Only a breaking change earns a docs edit** — a data contract shape
(`plan.md`, `baseline.json`, `events.jsonl`, `inbox.jsonl`), an MCP tool
signature, a hook's input mapping, or an invariant. A changed invariant is edited
**in place** in `docs/reference/architecture.md` — no ADR. Nothing broke means no
doc changes.

Either way, close the goal last:

```bash
scripts/goal close "<what shipped, or why it was dropped>"
```

## 11. Report

The state trajectory, attempt by attempt; what you skipped and why; what still
needs a human. Never report done with a failing or unrun gate — name it.

---

**What this skill can and cannot do:** the gates, gate 0 and the `implementer`
mode's `fileRegex` are what actually stop bad work. Everything else here is
instructions, and instructions degrade under context pressure. If you want a
step to be truly binding, make it a gate, not a sentence.
