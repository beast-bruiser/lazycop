import type { StartSessionInput, EndSessionInput, DeclareStepInput, CheckInInput, ReplyToDeveloperInput, SseEventInput } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import { setHold, waitForDeveloper } from "./store.js";
import { appendRecord } from "./logger.js";
import { waitForAnswer } from "./cards.js";
import { startSession, endSession } from "./session.js";
import { addAlternatives, makeCard, recordAnswer, reviewBeforeEnd } from "./review.js";

export const PAUSE_MS = 30_000;
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
    const { task } = args as unknown as StartSessionInput;
    startSession(store, String(task ?? ""));
    push({ type: "session", on: true, task: store.session!.task });
    return `LazyCop is watching this task. The developer follows along at ${pageUrl()}. Call declare_step before every file edit.`;
  }

  if (!store.session) return "LazyCop is not watching this task. Continue without it.";

  if (tool === "end_session") {
    const { assumptions } = args as unknown as EndSessionInput;
    const list = (Array.isArray(assumptions) ? assumptions : []).filter((a): a is string => typeof a === "string" && a.trim() !== "").slice(0, 5);
    const objections = await reviewBeforeEnd(store, list, HOLD_WAIT_MS, push);
    if (objections.length) {
      store.lastMessageCard = objections[0]!.card;
      return `Before you finish, the developer disagrees:\n- ${objections.map((o) => o.text).join("\n- ")}\nFix these, answer with reply_to_developer, then call end_session again.`;
    }
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

  if (tool === "declare_step") store.lastIntent = declareArgs.intent;

  if (tool === "declare_step" && declareArgs.assumption) {
    const card = makeCard(declareArgs.assumption, "assumption", "declare_step", declareArgs.alternatives);
    createdCard = card.id;
    store.cards.set(card.id, card);
    appendRecord(card);
    // Pause only when nothing else is waiting: queued messages and holds take priority.
    const pauses = !declareArgs.important && !store.hold && store.pending.length === 0;
    push({ type: "card", card, ...(pauses ? { waitUntil: new Date(Date.now() + PAUSE_MS).toISOString() } : {}) });
    // Bob's own alternatives come first; the card writer, if configured, fills in only when he gave none.
    if (!card.options.some((o) => o.id.startsWith("alt-"))) void addAlternatives(store, card, declareArgs.intent, push);

    if (pauses) {
      const answer = await waitForAnswer(card.id, PAUSE_MS);
      if (answer) recordAnswer(store, card, answer, "context");
    }
  }

  if (tool === "declare_step" && declareArgs.important && !store.hold) {
    setHold(store, true);
    store.holdCard = createdCard;
    push({ type: "hold", on: true, reason: declareArgs.intent });
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
    if (m.card) store.lastMessageCard = m.card;
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
