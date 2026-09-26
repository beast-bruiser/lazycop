# @lazycops/engine

The local LazyCop server, the Bob hook script and the stdio MCP server.

Build once from the repo root: `npm run build -w @lazycops/engine` (or `npm run typecheck`).

Nobody starts the server by hand: the MCP server process Bob spawns starts it on
`127.0.0.1:4747` (`LAZYCOP_PORT` to change), or reuses one already running. To run it alone
for debugging: `node <lazycops>/packages/engine/dist/main.js`.

LazyCop stays dormant until a task calls `start_session` (invariant 7). Records then go to
that task's own `<workspace>/.lazycop/`; dormant tasks leave no trace.

To install LazyCop into a workspace, use `npx lazycop init` (see the root README). By hand, point
the Bob workspace at the other two entry points:

- Hooks, in `<bob-workspace>/.bob/settings.json`, for every event:
  `{ "type": "command", "command": "node <lazycops>/packages/engine/dist/hook-script.js", "timeout": 5 }`
- MCP, in `<bob-workspace>/.bob/mcp.json`:
  `{ "mcpServers": { "lazycop": { "command": "node", "args": ["<lazycops>/packages/engine/dist/mcp-server.js"],
  "alwaysAllow": ["start_session", "declare_step", "check_in", "reply_to_developer", "end_session"] } } }`

`spike/sandbox/.bob/` is a working example of both files.
