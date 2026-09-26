# LazyCop — Hackathon Submission

Sep 26, 2026 · @Vinh Truong

Copy each section into the matching form field. Character limits are noted per field.

## Submission Title

*(max 50 characters)*

```
LazyCop: Steer IBM Bob While It Works
```

## Short Description

*(max 255 characters)*

```
Stop waiting on your AI agent. LazyCop turns Bob's run into a quick two-way quiz: Bob says what it assumes, you agree or fix it in one tap, and Bob changes course mid-task, before a wrong guess eats your Bobcoins.
```

## Long Description

*(max 4000 characters, 500 words)*

```
THE PROBLEM: YOU FIND THE MISTAKE TOO LATE
You give an AI agent a task and wait. Early on it guesses wrong, and every step after builds on that bad guess. You only see it when you read hundreds of finished lines.

That waiting is expensive. One IBM Bob user watched a simple formatting fix burn 150 Bobcoins (about $75), 542 searches and 61 minutes before stopping it by hand (ibm-bob issue #3683).

The real problem isn't that agents make mistakes. It's that we catch them after they're paid for.

THE IDEA: REVIEW WHILE BOB WORKS, NOT AFTER
LazyCop is the cop on duty while you wait. It turns dead time into a short, two-way quiz.

Before Bob edits code, it says what it's about to do and what it's assuming. LazyCop shows that as a card:

"Bob thinks an expired coupon means its timestamp is before now. Do you?"

Bob's answer is one option. Next to it are two or three other ways to read the task, plus "Something else" and "Ask Bob why." One tap is enough.

- Agree, and you both know you're on the same page.
- Pick another answer, and Bob gets your correction at its very next step. No restart, no lost work.
- Ask why, and Bob explains before it writes a line.

There's no answer key and no way to be "wrong." Every disagreement is a win: either you learn something about your own code, or you catch a mistake before it costs more.

WHO IT'S FOR AND HOW IT FEELS
LazyCop is for any developer who hands real tasks to IBM Bob. A panel next to Bob's chat shows the files Bob is visiting and a live Bobcoin counter against your budget. Cards show up one at a time, never block your screen, and skipping costs nothing. Bob only waits when it matters: never for small things, a few seconds for an assumption, and a bit longer for big decisions.

WHY IT'S DIFFERENT
Most tools review code after the agent is done. LazyCop moves review into the run, and makes it feel like a game instead of a chore. It doesn't grade you or Bob. It checks one thing: do you and your agent understand the task the same way?

Every card comes from Bob's own words: what it declared, what its diff does, what it said at the end. Nothing is made up. LazyCop also finds "hidden assumptions," rules Bob quietly applied but never said out loud. In our tests, those mattered most.

IT ALREADY WORKS
LazyCop sits next to Bob, not inside it. Bob's own hooks report each step, and a small LazyCop MCP server carries your answers back into the running task.

In our test on Bob 2.2.0, a one-tap correction sent from a browser page reached Bob mid-task. Bob replied, updated its assumption and rewrote its logic in 66 seconds, with no rework.

Less waiting. Fewer wasted coins. Code you understand before you merge.
```

## IBM Bob Usage Statement

*(max 4000 characters)*

```
Bob isn't just a tool we used. Bob is the platform LazyCop is built for and the teammate that helped build it.

1. BOB IS WHAT LAZYCOP EXTENDS
LazyCop plugs straight into Bob's own extension points:

- Hooks. We read the source bundled with Bob IDE 2.2.0 to map all 7 hook events and exactly what each one carries. We confirmed that a message from a PreToolUse or PostToolUse hook reaches the model, and that subagents inherit their parent's hooks. LazyCop's hooks log every Bob tool call to .lazycop/events.jsonl and deliver the developer's corrections at Bob's next step.
- MCP. A LazyCop MCP server, set up in .bob/mcp.json, gives Bob two tools. declare_step lets Bob say what it's about to change and what it's assuming. check_in hands Bob any correction waiting for it, and can hold Bob while the developer decides.
- Custom rules. A Bob rule asks Bob to call declare_step before it edits. Planned "LazyCop Plan" and "LazyCop Run" modes build on this.
- Live testing. We ran four Bob sessions on a small coupon-expiry task (see spike/ in the repo). Bob called declare_step on its own. In run 4, a correction sent from a browser page made Bob reply, update its assumption and rewrite its logic in 66 seconds. Those runs shaped the design: Bob moves fast, so cards pause it briefly, and every wait now ends on its own so Bob never gets stuck.

2. BOB BUILT LAZYCOP
We built LazyCop inside Bob, using a goal-driven setup in .bob/:

- A custom "implementer" mode that can't edit its own goal log, scripts or settings. Bob enforces that rule itself.
- A /cook command that turns every change into a goal. Bob writes down what "done" looks like, does the work in Agent mode, then marks each result as reached or failed, with proof.
- Quality gates: TypeScript type checks and vitest tests. Any attempt that edits its own grading rules is thrown out.
- A SessionStart hook that reminds Bob of the current goal at the start of every session.
- Skills Bob loads when it needs them: test-driven development, systematic debugging, plan gap checks and web design guidelines.

With this setup Bob built LazyCop's shared TypeScript contracts, with tests. The goal logs in docs/goals/ show every goal, every step and every failed attempt.

3. WATSONX.AI (PLANNED)
We plan to use Granite on watsonx.ai to write card text: the other ways to read Bob's claim, and the hidden-assumption cards drawn from Bob's diff and final message. Facts we can compute, like which function a change touches, are computed, not generated, so every card stays tied to what Bob actually did.
```

## Categories

*(Pick from the form's options)*

## Technologies Used

IBM Bob, Model Context Protocol (MCP), TypeScript, Node.js, Vitest. Add watsonx.ai / Granite once it's wired in.
