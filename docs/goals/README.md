# Goals

A goal is a transfer between states. Each file here is the append-only log of
one transfer — one JSON object per line, newest last.

**Reach a log only through `scripts/goal`.** Append-only is a convention:
`scripts/goal` is the only writer, the `implementer` mode cannot edit this
directory, and gate 0 in `cook` voids an attempt that touched it. Correct a wrong
state by appending (`goal amend`), never by rewriting a line.

```
scripts/goal new <slug> "<title>"
scripts/goal add "<outcome>" [--forbid "..."] [--plane engine|panel] [--head]
scripts/goal reached <s> "<evidence>"   scripts/goal failed <s> "<why>"
scripts/goal now     the open state + its forbids — the brief for the next attempt
scripts/goal show    the whole transfer
```

A state is **a condition the repo is in**, never a step someone takes. `goal add`
refuses an outcome that opens with an imperative; `--force` overrides it if you
are sure. `_EXAMPLE.jsonl` is a worked log — read it for shape, not domain.

One goal is open per working copy: a file is open until it carries a `closed`
record. Two people means two branches, each with its own goal file.
