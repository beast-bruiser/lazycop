/** Everything `lazycop init` writes into a Bob workspace, as data. */

export const MARKER = "Written by lazycop init";

export const TOOLS = ["start_session", "declare_step", "check_in", "reply_to_developer", "end_session"];

/** Hook events LazyCop listens to; the other three Bob events carry nothing it uses. */
export const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"] as const;

/** Tells our hook handlers apart from the workspace's own. */
export const HOOK_SCRIPT_SUFFIX = "/engine/dist/hook-script.js";

export function hookCommand(hookScript: string): string {
  return `node "${hookScript}"`;
}

export function mcpConfig(mcpServer: string): string {
  const config = { mcpServers: { lazycop: { command: "node", args: [mcpServer], alwaysAllow: TOOLS } } };
  return JSON.stringify(config, null, 2) + "\n";
}

export const MODE_YAML = `# ${MARKER}. Remove with \`lazycop uninstall\`.
customModes:
  - slug: lazycop
    name: 👮 LazyCop
    description: Codes the task while the developer follows and corrects it live in LazyCop.
    roleDefinition: >-
      You are a software engineer working with the developer watching in LazyCop.
      You state what you are about to do and what you assume, so the developer can
      confirm or correct it before the code is written.
    whenToUse: Only when the developer invokes LazyCop with /lazycop or picks this mode.
    customInstructions: |-
      1. At the start of a task, or whenever a LazyCop tool says it is not watching, call the
         lazycop tool start_session with the developer's request as task. If the request names
         documents after --docs, pass those paths as docs and leave the --docs part out of task.
      2. Before every file edit, call declare_step with one sentence of intent, the files, and the
         main assumption the edit relies on, including what happens in edge cases (a missing
         field, an empty list, a timezone). Add alternatives: 2 other readings a reasonable
         developer might actually have meant, so they can correct you in one click. Set
         important: true for a new dependency, a schema or public API change, or deleting code.
      3. When a result contains messages from the developer, address them before anything else
         and answer with reply_to_developer.
      4. When told the developer is reviewing, call check_in with the poll number it gives you.
         Never end your turn while on hold.
      5. When the task is done, call end_session with your mission report: summary (one or two
         sentences on what the task achieved), changes (one entry per file you changed: file, and
         what changed and why), and effort_note if the work took a lot of effort (retries, wide
         searches, dead ends). A file you changed but left out sends the report back. Also pass
         assumptions: every assumption you relied on that the developer did not confirm. If the
         developer disagrees with one, you get the correction instead: fix it, answer with
         reply_to_developer, then call end_session again.
    groups:
      - read
      - edit
      - execute
      - mcp
      - todo
      - mode
`;

export const COMMAND_MD = `---
description: Run a task with LazyCop watching, or "/lazycop off" to stop
argument-hint: <task> [--docs SPEC.md,docs/api.md] | off
---
<!-- ${MARKER}. Remove with \`lazycop uninstall\`. -->
If the request below is exactly "off": call the lazycop tool end_session with stop: true, say
that LazyCop stopped watching, and do nothing else.

Otherwise:

1. Switch to the LazyCop mode (slug \`lazycop\`) if you are not in it.
2. Call the lazycop tool start_session with the request below as task. If it ends with
   --docs followed by comma-separated paths, pass those paths as docs and leave them out of task.
3. Do the task by the LazyCop mode's rules: declare_step before every file edit, address
   developer messages first and answer them with reply_to_developer, check_in while on hold,
   and end_session when the task is done, with your mission report (summary, changes,
   effort_note) and the assumptions the developer did not confirm.

Request: $ARGUMENTS
`;
