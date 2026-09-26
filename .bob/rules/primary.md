# How to work here

Always loaded. This is behaviour, not procedure — the procedure for building a
feature is the **`cook` skill** (`/cook <what to build>`).

## 1. Think before coding

State the assumption instead of proceeding on an unclear one. If a request has
two readings that lead to different work, say both and pick one — don't silently
choose. Surface confusion early; a clarifying sentence before the edit is cheaper
than a rewrite after it.

## 2. Simplicity first

Write the least code that satisfies the request. No speculative features, no
premature abstraction, no flexibility nobody asked for.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical changes

Edit existing files; never a parallel `*-v2` or `*-enhanced`. Match the
surrounding style. Remove only what *your* change made dead — pre-existing dead
code stays unless removing it was the ask. Comments are a last resort: the code
should speak for itself.

## 4. Load context on demand

Nothing is an always-read. Open `docs/reference/architecture.md` when you need
an invariant, and for product intent read only the one section of
`docs/product/LazyCop — Build Spec.md` your task touches — and only when the code
alone is not enough leverage.

## 5. Goal-driven: work is a transfer between states

A goal is one transfer: the repo as it stands → the repo as the user wants it.

- A **state** is one line saying what the user wants, in their own words — an
  outcome, never a task list and never a diff. The first one must be true at HEAD
  and the last one is where the repo stands.
- The log is **append-only JSONL**: `docs/goals/<id>.jsonl`, one record
  per line. What the goal must not touch rides on the state as `forbid`; an
  approach that failed is its own record, so nobody retries it.
- **Reach the log only through `scripts/goal`** (`now`, `show`, `add`,
  `reached`, `failed`, `amend`, `close`). Nothing else writes it: the
  `implementer` mode cannot edit it and gate 0 voids an attempt that touched it.
  Correct by appending — `amend` re-states the last one; an earlier one that
  turned out wrong gets a new state saying so.
- One open goal per working copy — two people means two branches, each with its
  own goal file. A file is open until it carries a `closed` record. A
  SessionStart hook puts the open state in front of you.
- `scripts/goal` needs Agent mode or a mode with `execute`. Built-in Plan mode
  cannot run it.
- A state that can only be reached by breaking an invariant in
  `docs/reference/architecture.md` is a deadlock you built, not a goal. Change
  the invariant there first, deliberately, or drop the goal.

Running the transfer — claiming the goal, investigating, writing the forbids,
implementing, measuring — is the **`cook` skill**. Use it for anything bigger
than a local fix.

## 6. Measure, never claim

A gate you did not run is not a gate. The gates in `.bob/harness.conf` are the
evidence; a report that it worked is not. Never say done with a failing or unrun
gate — name it instead. Green gates are not the same as the feature working:
read the diff.

## 7. Debug to root cause

Read the error, trace the path, form a hypothesis before touching code. Inspect
real behaviour — the live companion and `.lazycop/*.jsonl` — not your memory of
it. Fix the cause, not the symptom, and never reach green by editing a test,
widening a type to `any`, adding an ignore pragma, or swallowing an exception.

## 8. Write findings where they are read

`docs/reference/architecture.md` holds the invariants the code cannot enforce
for itself. A decision that changes one edits that rule **in place**; git is the
history. Research digests and debug notes go to `docs/research/`.

## 9. Spend Bobcoins deliberately

Prefer one `grep` over reading whole files, and never re-read a file already in
context. Stop and ask rather than loop more than twice on the same failure.
Before a large operation, give a one-line cost estimate (files × steps).
