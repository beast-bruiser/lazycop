---
description: Run a task with LazyCop watching, or "/lazycop off" to stop
argument-hint: <task> [--docs SPEC.md,docs/api.md] | off
---
<!-- Written by lazycop init. Remove with `lazycop uninstall`. -->
If the request below is exactly "off": call the lazycop tool end_session with stop: true, say
that LazyCop stopped watching, and do nothing else.

Otherwise:

1. Switch to the LazyCop mode (slug `lazycop`) if you are not in it.
2. Call the lazycop tool start_session with the request below as task. If it ends with
   --docs followed by comma-separated paths, pass those paths as docs and leave them out of task.
3. Do the task by the LazyCop mode's rules: declare_step before every file edit, address
   developer messages first and answer them with reply_to_developer, check_in while on hold,
   and end_session when the task is done, with your mission report (summary, changes,
   effort_note) and the assumptions the developer did not confirm.

Request: $ARGUMENTS
