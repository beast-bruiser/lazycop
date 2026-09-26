# LazyCop — Two-Way Quiz Design

Sep 26, 2026 · @Tran Phi Long NAVER VIETNAM

## Summary

LazyCop turns a running Bob task into a two-way quiz. Bob states what it understands, the developer says whether they share that understanding, and every disagreement is resolved before Bob writes the code.

The quiz serves two goals with one mechanic:

- **Understanding.** The developer follows the change as it happens, so they do not have to reverse-engineer it later.
- **Catching.** A mismatch between the developer's intent and Bob's interpretation is caught at the next tool call, not after a long run.

There is no answer key. A card verifies shared knowledge between Bob and the developer; when they differ, the developer asks Bob to clarify or corrects it.

> Pitch: every disagreement is either something you learn or a mistake you catch before it costs more coins.

The spike on Bob IDE 2.2.0 confirmed the key technical bet: a correction sent from a browser page reaches Bob mid-task through MCP, and Bob changes its code accordingly.

## Spike results

Bob 2.2.0 can talk both ways with LazyCop: hooks report every tool call, and MCP carries developer messages back into the running task. Facts come from reading Bob's bundled source (Bob IDE `1.126.0+bob2.2.0`) and four live runs on a sandbox coupon task. The harness is in `spike/`.

| Question | Result | Evidence |
| --- | --- | --- |
| Hook events and payload | 7 events; every payload has `session_id`, `cwd`, `hook_event_name`; tool events add `tool_name`, `tool_input`, `tool_use_id`, and PostToolUse adds `tool_response` | Bob source + run 1 log |
| Tool names | `glob`, `read_file`, `apply_diff`, MCP tools as `mcp__lazycop__<tool>` | Run 1 log |
| Diff available | `apply_diff` input has search/replace blocks; PostToolUse response contains a unified patch | Run 1 log |
| PreToolUse exit-2 reason reaches the model | Yes in 2.2.0: returned as the tool's error result | Bob source |
| PostToolUse stdout reaches the model | Yes: added beside the tool result | Bob source |
| Hooks inside subagents | Yes: subagents inherit the parent's hook handlers | Bob source |
| Bob calls `declare_step` before edits | Yes, unprompted, with a stated assumption | Run 1 |
| Hold keeps Bob waiting | Yes, once LazyCop's own tools were exempt and `check_in` waits on the server | Runs 2–4 |
| Correction changes the code | Yes: Bob replied, re-declared the corrected assumption, then coded to it | Run 4, Test A |

Run 4 in one line: same prompt as run 1, but a correction sent while Bob was held turned `coupon.expiresAt < new Date()` into a local-day comparison on `expiresOn`, in 66 seconds and with no rework.

Lessons that shaped this design:

- **Bob is faster than the developer.** In run 1 the edit landed seconds after `declare_step`, so an unpaused card is stale before anyone reads it.
- **The riskiest assumption is often undeclared.** In runs 1 and 4, "no expiry field means the coupon never expires" appeared only in Bob's final message.
- **Each correction reveals the next assumption.** After run 4's fix, Bob used the server's timezone as "the customer's local day".
- **A hold must end.** An open-ended hold made Bob poll `check_in` until Bob's own repeated-call warning fired; each poll is a full model request.

Not tested yet: the PreToolUse block and PostToolUse note channels live, hooks in Plan mode, and the coin cost of `declare_step`.

## Core mechanic

Every card is a claim from Bob's side, answered from the developer's side: "Bob thinks X. Do you?" Neither side holds the right answer; the card only checks whether their knowledge matches.

Bob's side of a card always comes from Bob itself: what it declared, what its diff does, or what it said at the end. LazyCop never invents an answer key, so the game cannot mark a developer wrong when they are right.

Each card is a short multiple-choice question. Bob's claim is always one option, shown next to 2–3 alternative readings, plus Something else and Ask why:

```
What should "expired" mean?
 (•) Bob: expiresAt timestamp is before now        ← Bob's claim
 ( ) End of the expiry day in the customer's timezone
 ( ) End of the expiry day in the store's timezone
 ( ) Something else… [type]
 [ Ask Bob why ]
```

| Developer picks | Meaning | Typing | What Bob receives |
| --- | --- | --- | --- |
| Bob's option | Agree: shared knowledge, verified | None | Nothing, or a release if Bob is paused on this card |
| Another option | Disagree; the chosen option is the reason | None | "The developer disagrees with: \<claim>. They expect: \<option>. Reply, then adjust." |
| Something else | Disagree, in the developer's own words | One line | The same message, with the typed line as the expectation |
| Ask why | Unsure, or the question itself seems wrong | None | "The developer asks why: \<claim>. Explain with `reply_to_developer` before editing." |

The companion's LLM writes the alternatives from the task and Bob's claim. They give the developer quick words, not an answer key: no option is marked right, and Bob's reading is always on the list. Typing is needed only when none of the options fits.

Each disagreement ends in one of two outcomes, and both are wins:

- **The developer learns.** Bob's reply explains a choice they did not know about, so the card resolves as understood.
- **The developer catches a mistake.** Bob adjusts its plan before writing more code.

The loop closes itself. After a correction, Bob re-declares the step, as it did in run 4, and that re-declaration becomes a new card: "Bob now assumes X. Did it get it right?"

## Card types

Six card types cover the task from the first prompt to the final message. Each draws on one source Bob produces, so every claim is traceable.

| Card | Fires when | Source | Example | Mostly serves |
| --- | --- | --- | --- | --- |
| Interpretation | Bob starts the task or plans | First `declare_step`, the plan | "Bob reads 'expired' as a timestamp before now. Is that what you meant?" | Catching |
| Assumption | `declare_step` states an assumption | `declare_step.assumption` | "Bob assumes `expiresAt` is a Date compared to now. Do you?" | Catching |
| Predict the move | Bob declares an edit to a file | `declare_step.files` + real functions in that file | "Bob is heading to `coupon.js`. Which function will change?" | Understanding |
| Read the hunk | An edit lands | PostToolUse unified patch | "This new line returns early when…? Bob says: the coupon is past `expiresOn`." | Understanding |
| Hidden assumption | An edit or the final message implies a rule never declared | Diff + `Stop.last_assistant_message` | "Bob made coupons without an expiry date valid forever. Agree?" | Catching |
| Decision review | `declare_step.important` is true | `declare_step` | "Bob wants to add a date library instead of 3 lines. Agree?" | Both |

The card mix leans toward understanding, about 60 to 40, but any card can become a catch when the developer picks a reading other than Bob's.

Card text is written by the companion's LLM (Granite on watsonx.ai) from these sources. Facts that can be computed, such as which function a patch touches or which files import it, are computed rather than generated.

Hidden-assumption cards matter most for catching: in both coupon runs, the rule with the biggest product impact was never declared.

## Pacing

Bob waits for the developer only in proportion to the stakes: never for understanding cards, briefly for assumptions, and longer for important decisions. Every wait ends on its own.

| Level | Triggered by | Bob's behaviour | Ends when |
| --- | --- | --- | --- |
| Flow | Predict, read-the-hunk, most cards | Keeps working; cards queue on the page | Card answered, skipped or stale |
| Pause | `declare_step` with an assumption | `declare_step` waits up to 20 s for the card's answer | Answer arrives, or 20 s pass and Bob continues |
| Hold | `declare_step` with `important: true`, or the developer's Hold button | Edit tools blocked; Bob waits inside `check_in`, 45 s per call | Developer answers or releases, or 3 waits (about 2 min) pass |

On a hold timeout, Bob is told to continue with its plan and name the assumption it relied on in its final message. That message then feeds a hidden-assumption card, so nothing is lost.

Rules that keep the game from becoming the per-action approval Bob users already dislike ([issue #102](https://github.com/IBM/ibm-bob/issues/102)):

- One card on screen at a time, never modal, dismissable with one key.
- At most one non-urgent card every 2 minutes; holds and alerts skip the limit.
- Stale cards drop out: a card about a step Bob has finished is archived, not shown.
- Skipping is free, with no penalty.

The numbers are starting points (20 s pause, 45 s per wait, 3 waits) to tune on practice runs. The 45 s wait stays under the 60 s default request timeout of Bob's MCP client.

## Architecture

LazyCop is one local server between Bob and a browser page. Pushing to the page is immediate; reaching Bob waits for Bob's next tool call, because Bob cannot be interrupted from outside.

```
                 tool events
┌───────────────┐ ─────────────► ┌──────────────────┐   cards (push)   ┌──────────────┐
│ Bob hooks     │                │                  │ ───────────────► │              │
│ 7 events      │ ◄───────────── │  LazyCop server  │                  │ Browser page │
└───────────────┘  block / note  │  localhost:4747  │ ◄─────────────── │ (the quiz)   │
                                 │  state + queue   │     answers      │              │
┌───────────────┐  declare_step  │                  │                  └──────────────┘
│ Bob MCP calls │ ─────────────► │                  │
│ mcp__lazycop  │ ◄───────────── │                  │
└───────────────┘ messages, hold └──────────────────┘

Bob hears LazyCop only at its next tool call: a hook result or an MCP reply.
```

- **Bob hooks** run a small command on each of the 7 events. The command posts the payload to the server and turns its answer into a block (PreToolUse exit 2) or a note beside the tool result (PostToolUse stdout). If the server is down, the hook exits 0 and Bob runs normally.
- **Bob MCP calls** go to a stdio MCP server that forwards to the same local server, so hooks, MCP and the page share one state. `check_in` can wait on the server during a hold.
- **The LazyCop server** holds the event log, the card queue and the messages waiting for Bob. It writes everything to `.lazycop/` so a run can be replayed.
- **The browser page** is only a view. It receives cards over server-sent events and posts answers back, so closing or reloading it loses nothing.

Everything runs on the developer's machine. The hosted web demo can only replay recorded runs, because hooks and MCP talk to `localhost`. Bob's HTTP hooks are not used: they require a trusted HTTPS endpoint.

## Contracts

Three MCP tools and four hook events carry the whole game. Everything else is internal to the server.

**MCP tools** (server `lazycop`, auto-approved through `alwaysAllow` in `.bob/mcp.json`):

| Tool | Bob calls it | Arguments | Returns |
| --- | --- | --- | --- |
| `declare_step` | Before every file edit | `intent`, `files`, optional `assumption`, optional `important` | Pending developer messages, or "Continue"; pauses or holds per Pacing |
| `check_in` | When told the developer is reviewing | `poll` (1, 2, 3… so calls are never identical) | Messages, "HOLD", or the timeout instruction |
| `reply_to_developer` | After a disagreement or ask-why | `text` | "Delivered to the developer" |

**Hooks** (command handlers in `.bob/settings.json`, 5 s timeout, fail open):

| Event | LazyCop uses it to | Output to Bob |
| --- | --- | --- |
| `PreToolUse` | Enforce holds and scope; deliver an urgent message | Exit 2 with the message as the tool's error |
| `PostToolUse` | Log the event and its patch; feed read-the-hunk cards | Stdout note beside the result, for non-urgent messages |
| `UserPromptSubmit` | Deliver messages when Bob has ended its turn | Stdout added to the prompt's context |
| `Stop` | Feed hidden-assumption cards and the scorecard | None |

LazyCop's own tools (`mcp__lazycop__*`) are never blocked by its hooks; the spike's first hold failed because they were.

**Records** in `.lazycop/`, append-only JSONL:

```json
{"kind":"event","ts":"2026-09-26T09:16:54Z","tool":"apply_diff","path":"coupon.js","patch":"@@ -1,4 +1,8 @@ …"}
{"kind":"card","id":"k-7","type":"assumption","question":"What should \"expired\" mean?","claim":"expiresAt timestamp is before now","source":"declare_step","options":[{"id":"bob","text":"expiresAt timestamp is before now"},{"id":"alt-1","text":"End of the expiry day in the customer's timezone"},{"id":"alt-2","text":"End of the expiry day in the store's timezone"}]}
{"kind":"answer","card":"k-7","pick":"alt-1","text":"End of the expiry day in the customer's timezone"}
{"kind":"message","id":"m-3","card":"k-7","text":"…","delivered_via":"mcp","ts":"2026-09-26T09:16:20Z"}
{"kind":"reply","card":"k-7","text":"Understood. I'll compare expiresOn…"}
```

An answer's `pick` is `bob` (agree), an alternative's id (disagree with that reading), `other` (disagree; `text` is what the developer typed) or `ask_why`. A message's `card` is absent when it comes from the free-text box or the Hold button.

These shapes are a proposal for the build. They should replace the spike's in-memory state and join the four files in the build spec (`plan.md`, `baseline.json`, `events.jsonl`, `inbox.jsonl`).

## Web app

The page is a single screen: the current card in the centre, what Bob is doing on the right, and the files on the left. It opens with `npx lazycop start` at `http://127.0.0.1:4747`.

```
┌───────────────────────────────────────────────────────────┐
│ coins 7/12 │ coverage 64% │ catches 2 │  Hold Bob          │
├────────────┬──────────────────────────────┬───────────────┤
│ Files      │ What should "expired" mean?  │ Bob now       │
│ gold=edited│ (•) Bob: timestamp before now│ declared      │
│ ✓=verified │ ( ) end of local day         │ steps, tools  │
│            │ ( ) Something else…  [Why?]  │               │
├────────────┴──────────────────────────────┴───────────────┤
│ Timeline: ● ● ● ○ ○   (scrub back to any card)             │
└───────────────────────────────────────────────────────────┘
```

A card's life on the page:

1. It slides in with Bob's claim and, for hunk cards, the 5–15 changed lines.
2. A countdown shows when Bob is paused or held on it.
3. Picking an option other than Bob's sends the disagreement in one click; Something else opens one text line; Ask why sends immediately.
4. The card stays open until Bob's `reply_to_developer` arrives, then shows the reply beside the answer.

The Hold button and a free-text box stay available for moments no card covers.

**Comprehension coverage** is the share of changed lines the developer has verified on a card, like test coverage for understanding. At the end the page shows the diff with verified hunks in green and unverified hunks flagged for review before merge.

**The change tour** is the run's export: the diff in order, annotated with Bob's declared intent, each card, the developer's answers and Bob's replies. It doubles as a PR description and as the record that saves reverse-engineering later.

## Open questions and next steps

The design rests on one verified channel (MCP). The open items below are about cost and tuning, not feasibility.

- [ ] What does `declare_step` cost per task? Run the coupon task with and without the rule and compare Bob's consumption summary.
- [ ] Should holds and pauses exist at all for small tasks, or only above a size threshold?
- [ ] Do hooks fire in Plan mode? Needed if interpretation cards should appear before the gate.
- [ ] Live test of the PreToolUse block and PostToolUse note channels (spike tests B and C).
- [ ] Tune the pacing numbers (20 s pause, 45 s wait, 3 waits) on practice runs.
- [ ] Which LLM writes card text: Granite on watsonx.ai as the build spec plans, and within what per-run budget?

Next steps, in order:

1. Agree on this design with the team.
2. Turn the spike page into the card flow: pause on assumptions, multiple-choice readings with Something else and Ask why, and replies shown on the card.
3. Generate hidden-assumption and read-the-hunk cards from the patch and the Stop message.
4. Add comprehension coverage and the change-tour export.
5. Move from `spike/` into the TypeScript workspace the build spec describes, with the shared contract types.
