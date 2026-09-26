#!/usr/bin/env bash
# SessionStart hook: put the open goal state in front of Bob. An instruction to
# "check the goal first" degrades under context pressure; a hook does not.
# The only hook in this harness — it injects context and never blocks.
cat >/dev/null   # drain hook stdin

[ -x scripts/goal ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

state=$(scripts/goal now 2>/dev/null) || exit 0
[ -z "$state" ] && exit 0

echo "Open goal — the state this session is transferring to (scripts/goal):"
printf '%s\n' "$state" | sed 's/^/  /'
echo "  \`scripts/goal reached <s> \"<evidence>\"\` when it is true; \`scripts/goal failed <s> \"<why>\"\` when an attempt does not get there."
exit 0
