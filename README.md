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

**1. Install LazyCop** (once per machine):

```sh
npm i -g lazycop
```

**2. Install it into a Bob workspace:**

```sh
lazycop init ~/path/to/your-project
```

This writes four things into `your-project/.bob/`, and adds `.lazycop/` to the project's `.gitignore` if it is
a git repo:

| File | What it is |
| --- | --- |
| `plugins/lazycop/custom_modes.yaml` | The 👮 LazyCop mode and its rules |
| `plugins/lazycop/mcp.json` | The LazyCop MCP server, pointing at the installed package |
| `commands/lazycop.md` | The `/lazycop` command |
| `settings.json` | Four hooks, merged in; your existing settings and hooks are kept |

Running `init` again is safe. The workspace points at where npm installed LazyCop, so run `init` again after
reinstalling it somewhere else. Avoid `npx lazycop init`: npx runs from a cache npm may clear, which would break
the hooks (`init` warns you if it runs from there).

**3. Reload the Bob window** (Cmd/Ctrl+Shift+P → "Reload Window") and check:

- Settings → MCP: `lazycop` is **connected**
- The mode list shows **👮 LazyCop**
- Settings → Hooks: 4 LazyCop hooks

**4. Recommended: auto-approve LazyCop's tools.** In Bob's Auto-approve settings, enable **MCP** (and
**Mode**, to switch into the LazyCop mode without a prompt). Otherwise Bob asks you to approve every LazyCop call,
which interrupts the work LazyCop is meant to run alongside. `init` prints a tip when these are off; it never changes your
Bob settings itself.

## Use

In Bob, start a new task with:

```
/lazycop Add coupon expiry to coupon.js: an expired coupon gives no discount.
```

- Bob switches to the LazyCop mode and your browser opens **http://127.0.0.1:4747**.
- Before each edit Bob states his assumption, and a card keeps you up to date while he works; he never
  waits for it. Answer with one click: Bob's reading, one of the alternatives, **Something else…** (type a
  line), or **Ask Bob why**. If your answer differs, Bob gets it at his next step and changes course.
- When Bob asks you something, the page shows **Bob is waiting for your answer** with a reply box.
- **Hold Bob** stops his edits while you think; important decisions (a new dependency, an API change,
  deleted code) hold him by themselves until you answer.
- At the end Bob lists what he assumed without asking. Disagree with one and he fixes it before finishing.
- `/lazycop off` stops LazyCop early.

Tasks you start without `/lazycop` are never touched. LazyCop's records for a task are kept in
`your-project/.lazycop/`, which `init` keeps out of git.

## Optional: Granite card writer

With watsonx.ai credentials, Granite also writes a card after each edit about what the change decided that
nobody asked for (a default, an edge case, a timezone), and adds alternatives when Bob gives none.

Put your own credentials in `~/.lazycop/.env`, starting from [`.env.example`](.env.example):

```sh
mkdir -p ~/.lazycop && chmod 700 ~/.lazycop
cp .env.example ~/.lazycop/.env && chmod 600 ~/.lazycop/.env
nano ~/.lazycop/.env    # set IBM_CLOUD_API_KEY and WATSONX_PROJECT_ID; WATSONX_URL is the API address of your region
```

`LAZYCOP_ENV_FILE=/some/other/file` points elsewhere, and variables already set in the environment win over the
file. Credentials stay on your machine, never in your project. Reload the Bob window after changing them.
Without them, everything else works the same.

With credentials set, LazyCop sends your task text, Bob's assumptions, the docs you name with `--docs` and
Bob's diffs to IBM watsonx.ai under your account, for Granite to check and review them. Nothing is sent
without credentials.

## Security

This repository follows the [IBM hackathon template](https://github.com/watsonxhackathon/ibm-hackathon-template):
[`.gitignore`](.gitignore) keeps credentials and live session files out of git, [`.bobignore`](.bobignore) keeps
Bob from reading or logging them, and [`.env.example`](.env.example) lists the variables. Read
[SECURITY.MD](SECURITY.MD) for the full guidelines.

**What leaves your machine.** The LazyCop server listens on `127.0.0.1` only. The page it serves loads its font
from Google Fonts (`fonts.googleapis.com`) and its artwork from the Uploadcare CDN (`ucarecdn.com`), so opening the
page sends your IP address to those two services. With watsonx credentials set, the card writer also calls IBM
watsonx.ai (see [Optional: Granite card writer](#optional-granite-card-writer)); without them, nothing else goes out.

Check that credentials stay out of git:

```bash
git status                 # must NOT show a .env file
git check-ignore -v .env   # must print the rule that ignores it
```

Before every commit:

- [ ] Reviewed `git diff` for sensitive data
- [ ] No hardcoded API keys or passwords
- [ ] `.env` file is NOT in staged changes
- [ ] No files with "credential" or "secret" in name
- [ ] Used environment variables for all credentials

## Uninstall

```sh
lazycop uninstall ~/path/to/your-project
npm rm -g lazycop       # once no workspace uses it
```

This removes only what `init` added to `.bob/`; your own settings and hooks stay as they were, and so does
your `.gitignore`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `lazycop` MCP server not connected | Run `lazycop init` again (LazyCop moved or was reinstalled), then reload the Bob window |
| The page says "not built" | From a clone: run `npm run build` in `lazycops` |
| The page does not open by itself | Open http://127.0.0.1:4747 yourself |
| "LazyCop is already running on this port" | Another LazyCop is using 4747: `lsof -nP -iTCP:4747 -sTCP:LISTEN` shows it |
| Bob asks approval for every LazyCop call | Enable MCP in Bob's Auto-approve settings (step 4) |

## Development

To run LazyCop from a clone instead of npm:

```sh
git clone https://github.com/beast-bruiser/lazycops.git && cd lazycops
npm install && npm run build
npx lazycop init ~/path/to/your-project    # points the workspace at this clone
```

```sh
npm run typecheck    # builds every package
npm test             # vitest; needs Node 22.18+ for the hook-script test
```

- `packages/contracts`: shared types for every message between Bob, the server and the page
- `packages/engine`: the local server, the hook script and the MCP server
- `packages/page`: the browser page
- `packages/cli`: `lazycop init` and `uninstall`; the one package published to npm

To publish, from `packages/cli`: `npm pack` builds everything and bundles the engine and page into one tarball
(check its contents), then `npm publish`. Only `lazycop` is public; the `@lazycops/*` packages ship inside it.

Design: [`docs/product/LazyCop — Two-Way Quiz Design.md`](docs/product/LazyCop%20%E2%80%94%20Two-Way%20Quiz%20Design.md).
Rules the code must keep: [`docs/reference/architecture.md`](docs/reference/architecture.md).

## Credits

The page's music ([`packages/page/assets/audio/`](packages/page/assets/audio/): `preparation.mp3` and
`action.mp3`) was generated with [Suno AI](https://suno.com) on a paid plan, which grants the commercial use
rights needed to redistribute it with this package.

The artwork (the soldier, portrait, unit and map images in [`packages/page/assets/`](packages/page/assets/) and
the logo in [`packages/page/img/`](packages/page/img/)) was generated with an AI image generator.
