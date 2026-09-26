---
name: lazycop
description: 'Run a task with LazyCop watching, or "/lazycop off" to stop'
metadata:
  user-invocable: true
  disable-model-invocation: true
  argument-hint: <task> | off
---

<!-- Written by lazycop init. Remove with `lazycop uninstall`. -->
If the request below is exactly "off": call the lazycop tool end_session, say that LazyCop
stopped watching, and do nothing else.

Otherwise:

1. Switch to the LazyCop mode (slug `lazycop`) if you are not in it.
2. Call the lazycop tool start_session with the request below as task.
3. Do the task by the LazyCop mode's rules: declare_step before every file edit, address
   developer messages first and answer them with reply_to_developer, check_in while on hold,
   and end_session when the task is done, passing the assumptions the developer did not confirm.

Request: $ARGUMENTS
