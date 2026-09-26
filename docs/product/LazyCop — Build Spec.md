# LazyCop — Build Spec for the IBM Bob 2.0 Hackathon

Sep 26, 2026 · @Vinh Truong

## Summary

LazyCop turns the time a developer spends waiting on an IBM Bob agent into a short, game-like review loop that catches wrong turns early and saves Bobcoins.

From planning through execution, LazyCop shows a live game map of the files Bob touches, a coin counter, and occasional one-tap cards: assumption checks, micro-quizzes and alerts. When the developer spots a mistake, their correction is injected back into the running agent through a Bob hook or the LazyCop MCP server, so the agent changes course without restarting.

It improves the code review workflow by moving review from after the run to during the run. The target outcome for the demo: fewer Bobcoins and minutes per task, and a developer who understands the change they are about to merge.

**The name.** LazyCop is the cop on duty while you would otherwise sit back and let the agent run. It watches Bob for wrong turns and runaway costs, and turns lazy waiting into short, engaging checks.

**The product form.** One engine with three front doors, and the developer picks the one they like: a **CLI** (`npx lazycop`) that installs the whole procedure into Bob and runs it, an **MCP server** that lets Bob talk to LazyCop directly, and a **Bob IDE extension** that shows the game panel next to Bob's chat. The website is only a demo for judges.

## Problem

Review happens too late. Agents now work in long unattended runs, a wrong early assumption compounds silently, and the developer only sees it when reading hundreds of finished lines.

The cost has shifted from bad output to expensive runs. In an analysis of 66,320 Reddit complaint posts, "wrong code" fell from the #1 complaint to #7, while token consumption rose from #9 to #3. "Lack of user control" was the second-fastest riser: the agent understands, proceeds, and cannot be steered while it works.

Trust has not caught up. 96% of developers do not fully trust AI code, yet only 48% always check it before committing. 66% cite answers that are "almost right, but not quite" as their top frustration.

Bob users report the same pattern:

| Bob issue | What happened | LazyCop response |
| --- | --- | --- |
| [#3683](https://github.com/IBM/ibm-bob/issues/3683) | A formatting fix cost 150 Bobcoins ($75): 21 files, 542 searches, 61 minutes, interrupted by hand | Runaway-search guard + live coin counter |
| [#2524](https://github.com/IBM/ibm-bob/issues/2524) | "Context Exceeded" while planning after reading a few files | Context-pressure alert + narrow planning scope |
| [#102](https://github.com/IBM/ibm-bob/issues/102) | Manual approval requested for every action inside an agreed plan | Risk-triggered cards instead of per-action prompts |
| [#2486](https://github.com/IBM/ibm-bob/issues/2486) | Users ask for a cost estimator and real-time Bobcoin monitoring | Coin budget at plan time + HUD during the run |

IBM's own guidance confirms the mechanism: every message resends the whole conversation, so a long session costs more per step.

## Experience overview

Every task follows the same four-step procedure, started with `/lazycop <task>` in Bob chat: Plan, Gate, Run, Wrap-up. The game layer runs through all four, so the developer is engaged from the first minute, not only while code is being written.

**Plan (2–5 minutes).** Bob, in the "LazyCop Plan" mode, explores with parallel subagents while the map reveals the repo as they go. The developer gets planning cards: confirm each assumption, adjust the scope zone on the map, answer one question about the approach.

**Gate (under 1 minute).** Execution cannot start until every assumption is confirmed, corrected, or explicitly skipped, and a coin budget is set. Corrections here are written straight into `plan.md`, which is the cheapest possible catch: no code has been written yet.

**Run (the length of the agent task).** Bob works in the LazyCop Run mode. The map animates as the agent moves between files, the coin counter rises, and cards appear only when something is worth a look. The developer can confirm, correct, or ignore.

**Wrap-up (1 minute).** A "level complete" scorecard shows coins spent against budget, files touched against plan, catches made, and quiz score.

Design principles for "engaging but minimal":

- **Ambient by default.** The map is glanceable; nothing interrupts unless a trigger fires.
- **One card at a time,** never modal, dismissable with one key, and at most one card every 2 minutes unless it is an alert.
- **Reward catches, not clicks.** Points come from correct quiz answers and confirmed corrections, never from speed or volume.
- **Motion with meaning.** Every animation maps to a real event: a tool call, a coin spent, a scope breach. No decorative motion.
- **Sound off by default,** reduced-motion respected, and the whole panel usable by keyboard.

## Feature 1: Interactive planning and gate

The planning phase narrows what the agent may read and edit before any coins are spent on coding, and writes that scope to files the rest of the system enforces.

1. **Grounding.** The developer gives the task and, optionally, a spec (`.docx` or `.pdf`), which Bob reads natively with document understanding.
2. **Parallel exploration.** Bob spawns 2–3 explore subagents in parallel, each with a focused question: where the feature lives, what depends on it, which tests cover it. Each spawn needs the developer's approval, which also keeps exploration intentional.
3. **The plan.** Plan mode writes `plan.md` with numbered steps, in-scope files, off-limits paths, acceptance checks, and an explicit list of assumptions. The assumptions list is what later cards check against.
4. **The baseline.** A script converts the plan and subagent findings into `baseline.json`: scope, blast radius (files that depend on the change), and the coin budget.
5. **Budget.** The developer sets a coin budget, pre-filled with a suggestion. The suggestion is a simple heuristic from plan size, calibrated on practice runs during the hackathon; it is labelled as an estimate.
6. **Handoff.** At the gate the developer clicks Start, the gate lock lifts, and Bob switches to LazyCop Run, which re-reads plan.md before its first edit. The SessionStart hook only injects the procedure rules at the very start, since it fires before any plan exists.

Two custom Bob modes carry the procedure. **"LazyCop Plan"** may only read files and spawn explore subagents, and must write `plan.md` in the Skill's template, assumptions included. **"LazyCop Run"** re-reads `plan.md` before its first edit, reads files in ranges, stays in scope, and stops to ask when a plan assumption turns out false.

**Planning cards.** The same game panel runs during planning:

| Card | When | Example | Effect |
| --- | --- | --- | --- |
| Explorers | Subagents are exploring | Three explorer avatars clear fog on the map in parallel | Visual only |
| Assumption check | Each assumption in the draft plan | "A1: coupons expire at midnight UTC. Right?" | Confirm, or correct and it is rewritten in `plan.md`; +50 per correction |
| Scope zone | Draft scope is ready | Click tiles into or out of the glowing zone | Updates in-scope and off-limits paths |
| Approach quiz | Plan is ready | "Which file will hold the expiry logic?" | +10 if right; shows the developer read the plan |
| Budget | At the gate | Slider pre-filled with the estimate | Sets the coin budget |

**Gate lock.** Until the gate is passed, the PreToolUse hook blocks every edit tool with the message "Gate not passed: the developer is reviewing the plan in LazyCop." This makes the procedure enforceable, not just recommended. When the developer clicks Start, the lock lifts and Bob switches to LazyCop Run.

Corrections made during exploration, before the gate, travel the same inbox, PreToolUse and MCP check\_in paths as run-time corrections. This depends on hooks firing in Plan mode and inside subagents, which must be checked in the spike.

## Feature 2: Runtime guards

Five guards watch the event stream and raise an alert card when the run goes wrong; only the scope and budget guards can block the agent directly.

| Guard | Signal (starting threshold, tuned on practice runs) | Response | Where it runs |
| --- | --- | --- | --- |
| Runaway search | 15+ consecutive read/search calls with no edit, or the same file read 4+ times in overlapping ranges | Alert card: keep going, nudge ("you have enough, edit X"), or stop and redirect | Companion |
| Out of scope | Edit to an off-limits path | Blocked immediately; agent told to ask the developer | PreToolUse hook |
| Unplanned file | Edit to a file not in the plan but not forbidden | Allowed; assumption card asks if it is intended | Companion |
| Context pressure | Estimated context passes 50% and 70% of the window | Card suggests a checkpoint: write session notes, start a fresh task | Companion |
| Budget burn | Estimated coins pass 80% of budget; at 100% | Warning at 80%; at 100% all tools blocked until the developer raises the cap | Companion + PreToolUse |

The runaway rule comes straight from issue #3683, where Bob re-read the same HTML file in overlapping line ranges dozens of times. That transcript is the first test fixture.

Coins and context are estimates. Hook inputs are assumed not to include token counts (verify in the spike), so LazyCop approximates tokens from the characters read and written. The estimate is reconciled with Bob's task consumption summary at Wrap-up, and the demo reports Bob's real figure.

The PreToolUse checks read only local files (`baseline.json`, `inbox.jsonl`, a budget flag) and return in milliseconds, well inside Bob's 10-second hook timeout.

## Feature 3: The Map

The Map shows the repository as a game world the agent walks through, so a developer can see at a glance where the agent is, where it has been, and what it costs.

**Layout.** The repo is drawn as a squarified treemap: directories are regions, files are tiles sized by line count. For large repos, only the top two levels and the in-scope subtree are expanded. The layout is computed once from `baseline.json`, so tiles never jump during a run.

**World states.** Unvisited tiles sit under fog. The in-scope zone has a glowing border, and off-limits paths are hatched red. Tiles in the blast radius get a faint outline.

**HUD.** The top bar holds the coin counter and a budget bar that shifts green, amber, red. A quest log on the side lists the plan steps and ticks them off as their files are edited.

| Event | Animation |
| --- | --- |
| Agent reads a file | Avatar moves to the tile; fog clears; light footprint left |
| Agent searches | Short ripple over matched tiles |
| Agent edits a file | Tile turns gold ("claimed"); coin pops from HUD |
| Coins spent | Counter ticks up; budget bar fills |
| Runaway search | Footprints loop; tile pulses amber; alert card slides in |
| Scope breach blocked | Avatar bumps off a red wall |
| Correction delivered | Avatar pauses, then turns toward the new target |
| Task complete | Map zooms out; "level complete" scorecard |

The same component runs in replay mode, driven by a recorded session file with a timeline scrubber. That powers the hosted judge demo.

The visual target is a clean 2D board with a small avatar and simple easing, not a full game engine. SVG plus CSS transitions is enough.

## Feature 4: Interaction cards

Five card types keep the developer engaged while waiting; only the Assumption card and alerts are about catching errors, the rest build understanding.

| Card | Triggered when | Example | Actions | Points |
| --- | --- | --- | --- | --- |
| Assumption | An edit touches an unplanned file, adds a dependency, or conflicts with a plan assumption | "Bob is changing `session.ts` assuming tokens never expire. Correct?" | Yes / No, and here's why | +50 per correction delivered |
| Alert | A runtime guard fires | "18 searches, no edits. Bob may be stuck." | Keep going / Nudge / Stop and redirect | none |
| Predict | The agent is about to edit a planned file | "Bob is heading to `cart.ts`. Which function will it change?" | Pick 1 of 3 | +15 if right |
| Micro-quiz | No card for 3+ minutes | "Which module validates the coupon code?" | Pick 1 of 3; one-line explanation after | +10 if right |
| Note | After each completed plan step | "Step 2 done: price rounding moved into `pricing.ts`." | Dismiss | none |

**Rate limit.** At most one non-alert card every 2 minutes, one on screen at a time, never modal. Unanswered cards fade after 60 seconds and are logged as skipped, with no penalty.

**Generation.** Predict cards and part of the quizzes are built deterministically from event data, for example options drawn from real functions in the target file. This keeps answer keys correct. Assumption cards, notes, and the remaining quizzes are written by Granite on watsonx.ai from the diff, `plan.md` and the spec.

**Scoring.** The level score is shown on the scorecard with a small streak counter. Corrections are worth the most because catching a wrong turn is the point. There is no penalty for skipping or for a correction that turns out unnecessary, so developers are not discouraged from speaking up.

## Feature 5: Steering loop and scorecard

A correction reaches the running agent at its next tool call, typically within seconds, without restarting the task.

**Steering loop.**

1. The developer answers "No" on a card and types a short reason, or picks a suggested one.
2. Granite turns it into a precise directive, e.g. "Stop. Per spec 3.2, tokens expire after 15 minutes. Add an expiry check in `session.ts`."
3. The companion appends it to `inbox.jsonl` with an ID and `delivered: false`.
4. The next PreToolUse hook finds it, blocks that tool call with exit code 2 and the directive as the reason, and marks it delivered.
5. The agent re-plans. The map shows the avatar pausing and turning.

**Fallback if step 4 fails.** It is unverified whether Bob passes a block reason to the model; this is the first thing tested in the spike. If it does not, a UserPromptSubmit hook injects the pending directive when the developer sends any short message in Bob chat, since that hook's output becomes model context. The card then shows "Send any message in Bob to deliver."

**Second path: MCP check-in.** The LazyCop Run mode tells Bob to call the `check_in` MCP tool before each edit. The tool returns any pending correction plus budget status, and a tool result always reaches the model. This path costs a few tokens per call, so it complements the hook rather than replacing it; the spike decides which one leads.

**Scorecard.** When the Stop hook fires, the companion builds `report.md`:

- Coins spent against budget (estimate, then Bob's reported figure)
- Minutes and tool calls
- Files touched: planned, unplanned, blocked
- Guards fired and how each was resolved
- Corrections delivered and minutes into the run each was caught
- Quiz and prediction accuracy, and level score

The report is saved in the repo next to the `bob_sessions` exports, so the judging evidence and the product output match.

## Architecture

LazyCop sits beside Bob, not inside it: four hooks read and write small local files, an MCP server gives Bob a direct line to LazyCop, and everything slow runs in a separate companion process.

&#91;embedded content: runtime data flow · 10 components\]

The main agent never waits on LazyCop, because hooks only append to or read small files. SessionStart injects only the procedure rules, because no plan exists yet; after the gate, LazyCop Run reads the scope files itself. The Stop hook (not drawn) triggers the scorecard, and the PreToolUse gate, scope and budget checks also read `baseline.json`.

The companion is a separate process, not a Bob subagent. Bob subagents are spawned by the main agent and return a summary to it, so they cannot run alongside it and talk to the developer.

The MCP server and the companion share one process and one state, so a correction queued from the panel is visible to both the PreToolUse hook and the `check_in` tool. The panel is the same frontend whether it runs in the Bob IDE extension or a browser tab.

All four files live in `.lazycop/` in the project. That makes every step easy to debug, easy to show on screen, and replayable for the hosted demo.

## Data contracts

Four files in `.lazycop/` connect every component; the JSONL files are append-only so the hooks and the companion never overwrite each other.

**`plan.md`** is written by Plan mode using a Skill template, so its sections parse reliably: Steps (numbered, each listing its files), Scope, Off-limits, Assumptions (each with an ID like A1), and Acceptance checks.

**`baseline.json`** is generated from the plan and the explore subagents' findings:

```json
{
  "task": "Add coupon expiry check",
  "in_scope": ["src/cart/coupon.ts", "src/cart/coupon.test.ts"],
  "off_limits": ["src/payments/**", "package-lock.json"],
  "blast_radius": ["src/cart/checkout.ts"],
  "assumptions": [{"id": "A1", "text": "Coupons expire at midnight UTC"}],
  "steps": [{"id": 1, "text": "Add isExpired()", "files": ["src/cart/coupon.ts"]}],
  "budget_coins": 12
}
```

**`events.jsonl`** gets one line per tool call from the PostToolUse hook, normalized from whatever Bob sends:

```json
{"seq": 42, "ts": "2026-09-26T16:04:11Z", "tool": "<bob tool name>", "kind": "read", "path": "src/cart/coupon.ts", "range": [120, 180], "chars_in": 2400, "chars_out": 0}
```

`kind` is one of read, search, edit or command; edits also carry a unified `diff`. Bob's exact hook input fields are not documented in what we have seen, so the hook maps them to this schema; confirm the field names in the spike.

**`inbox.jsonl`** holds corrections. The companion appends a directive; the PreToolUse hook appends a delivery record with the same ID. The latest record per ID wins.

```json
{"id": "c-003", "source": "assumption:A1", "directive": "Stop. Per spec 3.2, coupons expire at the end of the local day, not midnight UTC. Update isExpired() in src/cart/coupon.ts."}
{"id": "c-003", "delivered": true, "ts": "2026-09-26T16:05:02Z"}
```

## Tech stack

Bob IDE is the core; watsonx.ai Granite powers the companion so Bobcoins are spent only on the main agent. watsonx Orchestrate is not used.

| Component | Built with | Bob or IBM feature shown |
| --- | --- | --- |
| Procedure | A Skill, two custom modes (LazyCop Plan, LazyCop Run) and a /lazycop command, installed by the CLI | Skills, custom modes, slash commands, Plan mode, parallel subagents, document understanding |
| Hooks | 4 small Node scripts registered in Bob's hook config | Lifecycle hooks: SessionStart, PreToolUse, PostToolUse, Stop |
| Companion | Node service tailing `events.jsonl`; guard rules in plain code | Granite on watsonx.ai via the Node SDK |
| MCP server | TypeScript MCP server inside the companion process: `check_in`, `report_assumption`, `get_plan` | MCP integration |
| CLI | `npx lazycop` with `init`, `start`, `panel`, `report` | Installs into Bob |
| Bob IDE extension | VS Code extension with a webview panel, loaded into Bob IDE | Bob IDE |
| Panel frontend | One HTML/SVG app with CSS transitions and a d3-hierarchy treemap, shared by the extension, the browser panel and the web demo | none |
| Web demo | Static site on Vercel plus one server-side Granite function | watsonx.ai |
| Demo project | Small sample shop app with a one-page spec | Bob document understanding |

Everything is TypeScript in one repo, so the extension, CLI, MCP server and web demo share the same types and panel code.

The companion's LLM cost is tracked separately, to show it is far smaller than the coins it saves. watsonx.ai inference costs $0.0001 per 1,000 tokens under the May 2026 hackathon guide.

## Product surfaces and web demo

Developers choose between three surfaces over one engine; the website exists only so judges can try the idea without installing anything.

| Surface | What it does | Best for |
| --- | --- | --- |
| CLI | `npx lazycop init` installs the Skill, both modes, the /lazycop command, hook config, MCP config and `.lazycop/`. `start` runs the companion, `panel` opens the browser panel, `report` prints the scorecard | Terminal-first developers; setup for every other surface |
| MCP server | Exposes `check_in` (pending corrections, budget status), `report_assumption` (Bob declares an assumption before acting, which becomes a card) and `get_plan` | Steering without relying on hooks; works from Bob IDE and Bob Shell |
| Bob IDE extension | The game panel inside Bob IDE beside the chat; starts the companion automatically | Developers who want everything in one window |

**Install.** The hero path is "ask Bob to install it": the developer types "Install LazyCop from github.com/\<team>/lazycop" in Bob chat, Bob follows an install Skill in the repo, runs `npx lazycop init`, and starts a tutorial level on a bundled sample app. The manual path is the same command typed by hand.

**Web demo for judges.** A judge opens one link and plays one task as the developer, in about 5 minutes with no login.

1. Pick a scenario: "Coupon expiry" (wrong assumption) or "Runaway search" (a #3683-style loop).
2. Plan: watch the recorded Bob planning, sped up, with explorer avatars clearing fog. Confirm or correct the assumption cards in your own words, adjust scope, set a budget, press Start.
3. Run: the recorded Bob run plays on the map with Bob's real coin figures. A mid-run assumption card appears if the gate let the mistake through.
4. Steer: a correction switches playback to the real recording where Bob received that correction at that moment.
5. Scorecard: your path's real numbers beside plain Bob, with a "Try the other path" button.

Agent actions are recorded from real Bob runs, and the page says so. Card wording, quiz text, the interpretation of typed corrections, and an "Ask the map" box are generated live by Granite. Two fallback buttons under each correction box keep the judge moving if Granite misreads their wording. An Evidence tab shows the raw events, delivered directives and `bob_sessions` screenshots.

The Granite API key lives only in a Vercel server-side function, with a per-visitor rate limit, a daily cap well below the $80 credit, and a kill switch. The May guide says the account is suspended at 100% usage, with alerts only hourly.

## Constraints and risks

The biggest risk is the steering channel; everything else has a cheap fallback.

| Risk | Mitigation | Check by |
| --- | --- | --- |
| A PreToolUse block reason may not reach the model | MCP `check_in` path, then the UserPromptSubmit fallback; test both in the spike | Spike |
| Hook input fields and Bob tool names are unknown | First hook logs raw input to a file; map fields after seeing real data | Spike |
| Bob IDE may not load a VS Code extension | Install any `.vsix` in the spike; if it fails, the panel opens in a browser beside Bob | Spike |
| Hooks may not fire in Plan mode or inside subagents | Pre-gate corrections go through MCP `check_in` or wait for the gate | Spike |
| MCP check-ins add token cost | Call only before edits, return a few lines; measure in practice runs | Core loop |
| Only 40 Bobcoins per account (May guide) | Companion on Granite, small spike tasks, pooled coins, demo recorded early | Ongoing |
| Coin and context figures are estimates | Label as estimates; report Bob's consumption summary as the real number | Wrap-up |
| Too many cards annoy the developer | Rate limit, risk-only triggers, fade-out without penalty | Surfaces |
| LLM-written quizzes with wrong answer keys | Predict cards and some quizzes generated from event data | Core loop |
| Web demo drains watsonx credits | Server-side key, per-visitor limit, daily cap, kill switch | Demo |
| Credentials leak into the repo or `bob_sessions` exports | Env vars, `.env` in `.gitignore`, scan exports before commit | Submission |

The hook facts here come from an August 2026 walkthrough of Bob 2.0.2 hooks, not official docs. Re-check them against the current Bob docs in the spike.

## Demo scenario and metrics

The demo runs the same task plain (Run A) and with LazyCop along each of its three paths, and compares Bob's own consumption figures.

**Setup.** A small sample shop app with a cart and coupons, plus a one-page spec (`.docx`). The spec says coupons expire at the end of the store's local day. The task prompt only says "add coupon expiry," so the natural assumption, midnight UTC, is wrong.

**Run A, plain Bob.** Agent mode, no LazyCop. The developer reviews at the end, finds the timezone bug, and asks Bob to fix it.

**Run B, LazyCop.** The plan lists assumption A1, "coupons expire at midnight UTC." When the agent edits `coupon.ts`, an assumption card fires, the developer corrects it from the spec, and the agent adjusts mid-run.

| Metric | Measured from |
| --- | --- |
| Bobcoins per task | Bob's task consumption summary (also required for `bob_sessions`) |
| Minutes and tool calls | Wall clock; `events.jsonl` |
| Rework edits | Edits to lines already edited in the same run |
| Minutes to catch the wrong assumption | Card and delivery timestamps |
| Understanding after the task | 5-question check, for the developer who used LazyCop vs one who did not |
| Companion cost | watsonx.ai usage, in dollars |

The three LazyCop paths are: corrected at the gate, corrected mid-run, and never corrected. Record Run A and each path once. With so few runs, present results as illustrative, not statistical, and say openly that the ambiguity was seeded.

**Runaway guard clip.** If no runaway happens naturally, show the guard in replay on a synthetic fixture shaped like issue #3683, labelled as synthetic.

**Video outline (about 3 minutes).** Problem, anchored on #3683 (30 s). Plan phase and map (30 s). Run B with a card and a correction (75 s). Scorecard against Run A (30 s). Architecture and Bob features used (15 s).

## Build plan and Bobcoin budget

Submissions close Sunday, September 27, 15:00 UTC. The time boxes assume about 24 hours left for two people; with less, shrink them proportionally and drop the stretch row first.

| Phase | Time box | Person 1: Bob side | Person 2: visual side | Done when |
| --- | --- | --- | --- | --- |
| Spike | 2 h | Exit-2 test, raw hook logging, MCP `check_in` test, hooks in Plan mode | Install any `.vsix` in Bob IDE; repo scaffold and panel shell | Steering path and panel host chosen |
| Core loop | 8 h | Hooks, companion guards, MCP server, Skill, two modes, /lazycop, gate lock, Granite cards | Treemap map, fog, avatar, HUD, cards, live events from the companion | One real Bob run drives the panel end to end |
| Surfaces | 5 h | CLI `init`, `start`, `report`; install Skill for "ask Bob to install it" | Extension wrapper, scorecard view, web demo shell and branch player | All three surfaces work on the sample app |
| Demo | 6 h | Record Run A and the three LazyCop paths; export `bob_sessions` | Granite function with limits, Evidence tab, deploy to Vercel | Web demo live |
| Submit | 3 h | README, video voice-over | Slides, video edit | Submitted |
| Stretch | If ahead | Runaway fixture clip | Predict cards, sound | Optional |

The product itself should be built with Bob IDE, which also consumes coins. Split the team's pooled coins by share, since the per-run cost is unknown until the spike:

| Use | Share of pool |
| --- | --- |
| Building LazyCop with Bob | 40% |
| Final demo recordings (Run A plus the three LazyCop paths) | 25% |
| Practice runs and threshold tuning | 20% |
| Spike tests | 10% |
| Reserve | 5% |

After the spike, measure one practice run's cost and re-check that four recordings fit in the 25%; if not, skip the never-corrected path and let Run A stand in for it.

## Submission checklist

The items below follow the May 2026 guide and last round's winning submissions; confirm against the Bob 2.0 guide.

- [ ] Public GitHub repo with README: problem, setup, architecture diagram, Bob features used
- [ ] `bob_sessions/` folder: consumption summary screenshot and exported task history for every related task, from every team member
- [ ] No credentials anywhere, including inside the exported session files
- [ ] Demo video, about 3 minutes, following the outline above
- [ ] Slide deck
- [ ] CLI runnable with `npx` from the repo, MCP config included, extension `.vsix` with install steps
- [ ] Hosted interactive replay link, plus install steps for judges who have Bob
- [ ] `report.md` from Runs A and B committed as evidence

## Open questions

- [ ] Does a PreToolUse exit-2 reason reach the model? Decides the steering path.
- [ ] What fields does Bob send to each hook, and what are its tool names?
- [ ] Do hooks fire in Plan mode and inside subagents? Decides whether corrections work before the gate.
- [ ] Does Bob IDE load a VS Code extension (`.vsix`)? Decides whether the panel lives in the IDE or a browser.
- [ ] Does the Bob 2.0 guide change the coin allowance, rules, or judging criteria?
- [ ] Which teammate takes the Bob side and which takes the visual side?

## Sources

Pages opened:

- [IBM Bob 2.0 hackathon page](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon) and [live dashboard](https://lablab.ai/ai-hackathons/ibm-bob-2-hackathon/live)
- [May 2026 IBM Bob hackathon results](https://lablab.ai/ai-hackathons/ibm-bob-hackathon/live), [Pedigree](https://lablab.ai/ai-hackathons/ibm-bob-hackathon/ctrlcats/pedigree), [Sandbox](https://lablab.ai/ai-hackathons/ibm-bob-hackathon/404/sandbox-castles-crumble-fix-them-first)
- [IBM Bob hackathon guide, May 2026](https://watsonx-hackathons-2026.s3.us.cloud-object-storage.appdomain.cloud/Lablab-IBM-Bob-hackathon-guide-May-2026.pdf)
- [OpenChamber: a year of AI coding complaints](https://openchamber.dev/blog/ai-coding-complaints/) (from a competing tool vendor)
- [IBM/ibm-bob issue #2524](https://github.com/IBM/ibm-bob/issues/2524)

Seen in search results only; open before quoting publicly:

- IBM/ibm-bob issues [#3683](https://github.com/IBM/ibm-bob/issues/3683), [#102](https://github.com/IBM/ibm-bob/issues/102), [#2486](https://github.com/IBM/ibm-bob/issues/2486)
- [Bob subagents docs](https://bob.ibm.com/docs/ide/features/subagents), [Get more out of every Bobcoin](https://bob.ibm.com/blog/token-efficiency/), [IBM Bob lifecycle hooks walkthrough](https://www.the-main-thread.com/p/ibm-bob-lifecycle-hooks-agentic-development)
- Survey figures: [Hyrax on Sonar 2026](https://hyrax.dev/blog/sonar-2026-ai-code-trust-behavior-gap), [byteiota on Stack Overflow](https://byteiota.com/stack-overflow-dev-survey-2026-ai-at-84-trust-at-3/)
