# .bob/

Bob config for this repo — the goal-driven dev harness. LazyCop's own product
hooks are never registered here; they are tested against the sample shop app.

| Path | Purpose |
|------|---------|
| **rules/** | Injected into every mode, every turn. Behaviour only (`primary.md`); the procedure lives in the `cook` skill. |
| **rules-implementer/** | Loaded only in `implementer` mode: the contract and coding standards. |
| **custom_modes.yaml** | The `implementer` mode. Its `fileRegex` stops it editing the goal log, `scripts/goal` and `.bob/`. |
| **commands/** | `/cook <what to build>` — starts the goal-driven workflow. |
| **skills/** | Loaded on demand by description: `cook`, `tdd-workflow`, `systematic-debugging`, `post-plan-gap-audit`, `web-design-guidelines`. |
| **settings.json** + **hooks/** | One hook: `inject-goal-state.sh` on SessionStart puts the open goal state in context. It never blocks. |
| **harness.conf** | The gates `cook` runs, in order. |
| **_archive/** | Not loaded. Skills and agent definitions from earlier projects, kept for reference. |

## What actually binds

- **Gates** (`harness.conf`) — typecheck and tests; `cook` never reports done with one failing or unrun.
- **Gate 0** — `git diff --name-only` on the goal log and harness voids an attempt that edited its own grading criteria.
- **`implementer` mode's `fileRegex`** — the one structural restriction, enforced by Bob itself.

Everything else is prose, and prose degrades under context pressure.

## Goal log

`scripts/goal` writes `docs/goals/<id>.jsonl` — see the README there.
