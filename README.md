# LazyCop

LazyCop turns the time you spend waiting on an IBM Bob agent into a short question game. While Bob works,
it shows what Bob assumes as one-click cards in your browser; when your answer differs from Bob's, your
correction reaches Bob at his next step, before he writes more code.

It is a Bob plugin you call per task: installed once in a workspace, dormant by default, and active only
for a task you start with `/lazycop`.

## Requirements

- IBM Bob IDE 2.2.0 or newer
- Node.js 20 or newer (tested on 24)
- Optional: a watsonx.ai API key and project, for Granite-written diff cards

## Install

**1. Build LazyCop** (once):

```sh
git clone https://github.com/beast-bruiser/lazycops.git
cd lazycops
npm install
npm run build
```

**2. Install it into a Bob workspace.** From the `lazycops` folder:

```sh
npx lazycop init ~/path/to/your-project
```

This writes four things into `your-project/.bob/`, and nothing else:

| File | What it is |
| --- | --- |
| `plugins/lazycop/custom_modes.yaml` | The 👮 LazyCop mode and its rules |
| `plugins/lazycop/mcp.json` | The LazyCop MCP server, pointing at this repo's build |
| `commands/lazycop.md` | The `/lazycop` command |
| `settings.json` | Four hooks, merged in; your existing settings and hooks are kept |

Running `init` again is safe. It points the workspace at this clone of the repo, so keep the clone where it is,
or run `init` again after moving it.

**3. Reload the Bob window** (Cmd/Ctrl+Shift+P → "Reload Window") and check:

- Settings → MCP: `lazycop` is **connected**
- The mode list shows **👮 LazyCop**
- Settings → Hooks: 4 LazyCop hooks

**4. Recommended: auto-approve LazyCop's tools.** In Bob's Auto-approve settings, enable **MCP** (and
**Mode**, to switch into the LazyCop mode without a prompt). Otherwise Bob asks before every LazyCop call, and
the wait eats into the time a card gives you. `init` prints a tip when these are off; it never changes your
Bob settings itself.

## Use

In Bob, start a new task with:

```
/lazycop Add coupon expiry to coupon.js: an expired coupon gives no discount.
```

- Bob switches to the LazyCop mode and your browser opens **http://127.0.0.1:4747**.
- Before each edit Bob states his assumption. Answer the card with one click: Bob's reading, one of the
  alternatives, **Something else…** (type a line), or **Ask Bob why**. Bob waits up to 30 s; a later answer
  still reaches him at his next step.
- When Bob asks you something, the page shows **Bob is waiting for your answer** with a reply box.
- **Hold Bob** stops his edits while you think; important decisions (a new dependency, an API change,
  deleted code) hold him by themselves until you answer.
- At the end Bob lists what he assumed without asking. Disagree with one and he fixes it before finishing.
- `/lazycop off` stops LazyCop early.

Tasks you start without `/lazycop` are never touched. LazyCop's records for a task are kept in
`your-project/.lazycop/`; add `.lazycop/` to that project's `.gitignore`.

## Optional: Granite card writer

With watsonx.ai credentials, Granite also writes a card after each edit about what the change decided that
nobody asked for (a default, an edge case, a timezone), and adds alternatives when Bob gives none.

```sh
cp .env.example .env    # in the lazycops folder, then fill in WATSONX_API_KEY and WATSONX_PROJECT_ID
```

`.env` is gitignored and stays in the `lazycops` folder, never in your project. Reload the Bob window after
changing it. Without it, everything else works the same.

## Uninstall

```sh
npx lazycop uninstall ~/path/to/your-project
```

This removes only what `init` added; your own settings and hooks stay as they were.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `lazycop` MCP server not connected | Run `npm run build` in `lazycops`, then reload the Bob window |
| The page says "not built" | Run `npm run build` in `lazycops` |
| The page does not open by itself | Open http://127.0.0.1:4747 yourself |
| "LazyCop is already running on this port" | Another LazyCop is using 4747: `lsof -nP -iTCP:4747 -sTCP:LISTEN` shows it |
| Bob asks approval for every LazyCop call | Enable MCP in Bob's Auto-approve settings (step 4) |

## Development

```sh
npm run typecheck    # builds every package
npm test             # vitest; needs Node 22.18+ for the hook-script test
```

- `packages/contracts`: shared types for every message between Bob, the server and the page
- `packages/engine`: the local server, the hook script and the MCP server
- `packages/page`: the browser page
- `packages/cli`: `lazycop init` and `uninstall`

Design: [`docs/product/LazyCop — Two-Way Quiz Design.md`](docs/product/LazyCop%20%E2%80%94%20Two-Way%20Quiz%20Design.md).
Rules the code must keep: [`docs/reference/architecture.md`](docs/reference/architecture.md).
