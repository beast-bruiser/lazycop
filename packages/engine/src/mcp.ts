import type { StartSessionInput, EndSessionInput, DeclareStepInput, CheckInInput, ReplyToDeveloperInput, SseEventInput } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import { setHold, waitForDeveloper } from "./store.js";
import { appendRecord } from "./logger.js";
import { startSession, endSession } from "./session.js";
import { makeCard, noteDelivered, reviewBeforeEnd, specCheck } from "./review.js";
import { loadNamedDocs } from "./docs.js";
import { definedSkills } from "./skills.js";
import { buildReport, parseChanges, reviewRisks, sendBack, unreportedFiles } from "./report.js";

export const HOLD_WAIT_MS = 45_000;
export const MAX_HOLD_POLLS = 3;

export type Push = (event: SseEventInput) => void;

export function pageUrl(): string {
  return `http://127.0.0.1:${Number(process.env.LAZYCOP_PORT ?? 4747)}`;
}

export async function onMcp(
  store: StoreState,
  tool: string,
  args: Record<string, unknown>,
  push: Push,
): Promise<string> {
  if (tool === "start_session") {
    const { task, docs } = args as unknown as StartSessionInput;
    startSession(store, String(task ?? ""));
    push({ type: "session", on: true, task: store.session!.task, skills: definedSkills(store.session!.cwd) });
    const loaded = loadNamedDocs(store, store.session!.cwd, docs, push);
    const named = loaded.length ? ` LazyCop checks your assumptions against: ${loaded.join(", ")}.` : "";
    return `LazyCop is watching this task. The developer follows along at ${pageUrl()}. Call declare_step before every file edit.${named}`;
  }

  if (!store.session) return "LazyCop is not watching this task. Continue without it.";

  if (tool === "end_session") {
    const { assumptions, stop, summary, effort_note } = args as unknown as EndSessionInput;
    if (stop === true) {
      endSession(store);
      push({ type: "session", on: false });
      return "LazyCop stopped watching.";
    }
    // The report comes first: a file Bob changed but did not report sends it straight back.
    const changes = parseChanges((args as { changes?: unknown }).changes);
    const missing = unreportedFiles(store.usage, changes, store.session.cwd);
    if (missing.length) return sendBack(missing);
    // The risk review runs during the final review's wait, so end_session stays inside Bob's MCP timeout.
    const risks = reviewRisks(store.usage, store.session.task, summary, store.session.cwd);
    const list = (Array.isArray(assumptions) ? assumptions : []).filter((a): a is string => typeof a === "string" && a.trim() !== "").slice(0, 5);
    const objections = await reviewBeforeEnd(store, list, HOLD_WAIT_MS, push);
    // Answers still waiting for Bob's next step would be lost if the task closed now: that step is this one.
    const waiting = store.pending.splice(0).map((m) => {
      noteDelivered(store, m);
      appendRecord({ kind: "message", id: m.id, ...(m.card ? { card: m.card } : {}), text: m.text, delivered_via: "mcp", ts: new Date().toISOString() });
      push({ type: "delivered", id: m.id, via: "mcp" });
      return m.text;
    });
    if (objections.length) noteDelivered(store, objections[0]!);
    const toFix = [...waiting, ...objections.map((o) => o.text)];
    if (toFix.length) {
      return `Before you finish, the developer disagrees:\n- ${toFix.join("\n- ")}\nFix these, answer with reply_to_developer, then call end_session again.`;
    }
    const report = buildReport(store.usage, { summary, effort_note }, changes, await risks);
    appendRecord({ kind: "report", ts: new Date().toISOString(), ...report });
    push({ type: "report", report });
    endSession(store);
    push({ type: "session", on: false });
    return "LazyCop stopped watching.";
  }

  push({ type: "mcp", tool, args });

  if (tool === "reply_to_developer") {
    const { text } = args as unknown as ReplyToDeveloperInput;
    const card = store.lastMessageCard;
    store.lastReplyCard = card;
    appendRecord({ kind: "reply", ...(card ? { card } : {}), text });
    push({ type: "reply", text, ...(card ? { card } : {}) });
    return "Delivered to the developer.";
  }

  if (tool !== "declare_step" && tool !== "check_in") {
    return "Delivered to the developer.";
  }

  const declareArgs = args as unknown as DeclareStepInput;
  let createdCard: string | undefined;

  if (tool === "declare_step" && declareArgs.assumption) {
    // The first assumption after Bob received a correction restates it: ask whether he got it right.
    const confirms = store.confirmFor;
    store.confirmFor = undefined;
    const card = confirms
      ? { ...makeCard(declareArgs.assumption, "assumption", "confirm", declareArgs.alternatives), confirms }
      : makeCard(declareArgs.assumption, "assumption", "declare_step", declareArgs.alternatives);
    createdCard = card.id;
    store.cards.set(card.id, card);
    appendRecord(card);
    // Cards run alongside Bob's work: he never waits for one. An answer reaches him at his next step.
    push({ type: "card", card });
    void specCheck(store, card, push);
  }

  if (tool === "declare_step" && declareArgs.important && !store.hold) {
    setHold(store, true);
    store.holdCard = createdCard;
    push({ type: "hold", on: true, reason: declareArgs.intent, ...(createdCard ? { card: createdCard } : {}) });
  }

  // Outside a hold, check_in means Bob is waiting on the developer: wait once instead of letting it poll.
  if (tool === "check_in" && !store.hold && store.pending.length === 0) {
    const card = store.lastReplyCard;
    push({ type: "waiting", on: true, until: new Date(Date.now() + HOLD_WAIT_MS).toISOString(), ...(card ? { card } : {}) });
    await waitForDeveloper(store, HOLD_WAIT_MS);
    push({ type: "waiting", on: false });
    if (!store.hold && store.pending.length === 0) {
      return "The developer has not answered yet. Continue with your stated assumption, and name it in your final message.";
    }
  }

  if (store.hold && store.pending.length === 0) {
    await waitForDeveloper(store, HOLD_WAIT_MS);
    if (store.hold && store.pending.length === 0) {
      if (++store.holdPolls >= MAX_HOLD_POLLS) {
        setHold(store, false);
        push({ type: "hold", on: false, reason: "timed out" });
        return "The developer did not respond in time. Continue with your plan, and state the assumption you relied on in your final message.";
      }
    }
  }

  const msgs = store.pending.splice(0).map((m) => {
    noteDelivered(store, m);
    appendRecord({
      kind: "message",
      id: m.id,
      ...(m.card ? { card: m.card } : {}),
      text: m.text,
      delivered_via: "mcp",
      ts: new Date().toISOString(),
    });
    push({ type: "delivered", id: m.id, via: "mcp" });
    return m.text;
  });

  const poll = (Number((args as unknown as CheckInInput).poll) || 0) + 1;
  const next = `call check_in again with poll: ${poll}`;
  const stillHeld = store.hold
    ? `\nThe developer is still reviewing. Do not edit anything; ${next}.`
    : "";

  if (msgs.length) {
    return `Developer messages:\n- ${msgs.join("\n- ")}\nAddress these first and answer with reply_to_developer.${stillHeld}`;
  }
  return store.hold
    ? `HOLD: the developer is still reviewing this decision (wait ${store.holdPolls} of ${MAX_HOLD_POLLS}). ${next}; do not end your turn.`
    : "No messages. Continue.";
}
