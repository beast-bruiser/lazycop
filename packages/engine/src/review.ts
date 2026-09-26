// Cards: how they are made, answered, and enriched by the card writer while Bob works.
import type { AnswerRecord, CardRecord, CardType, HookPayload } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import type { Push } from "./mcp.js";
import { appendRecord } from "./logger.js";
import { waitForAnswer } from "./cards.js";
import { cardWriter } from "./writer.js";

export const EDIT_TOOLS = ["apply_diff", "write_file", "search_and_replace", "insert_content"];

let cardSeq = 0;

const QUESTIONS: Record<string, (claim: string) => string> = {
  declare_step: (c) => `Bob assumes: ${c}. Is that right?`,
  diff: (c) => `Bob's change decides: ${c}. Is that what you want?`,
  end_session: (c) => `Bob relied on this without asking you: ${c}. Is that right?`,
};

const tidy = (text: string) => text.trim().replace(/[.\s]+$/, "");

/** Cleans Bob's alternatives: text only, no repeats of his own reading, at most three. */
export function cleanAlternatives(claim: string, alternatives: unknown): string[] {
  if (!Array.isArray(alternatives)) return [];
  const seen = new Set([claim.toLowerCase()]);
  const out: string[] = [];
  for (const a of alternatives) {
    if (typeof a !== "string" || !tidy(a) || seen.has(tidy(a).toLowerCase())) continue;
    seen.add(tidy(a).toLowerCase());
    out.push(tidy(a));
  }
  return out.slice(0, 3);
}

export function makeCard(assumption: string, type: CardType, source: keyof typeof QUESTIONS, alternatives: string[] = []): CardRecord {
  const claim = tidy(assumption);
  return {
    kind: "card",
    id: `k-${++cardSeq}`,
    type,
    question: QUESTIONS[source]!(claim),
    claim,
    source,
    options: [
      { id: "bob", text: claim },
      ...cleanAlternatives(claim, alternatives).map((text, i) => ({ id: `alt-${i + 1}`, text })),
      { id: "other", text: "Something else…" },
      { id: "ask_why", text: "Ask Bob why" },
    ],
  };
}

export function answerToMessage(card: CardRecord, answer: AnswerRecord): string | null {
  const pick = answer.pick;
  if (pick === "bob") return null; // agree — nothing sent to Bob
  if (pick === "ask_why") {
    return `The developer asks why: ${card.claim}. Explain with \`reply_to_developer\` before editing.`;
  }
  const expectation = answer.text ?? pick;
  return `The developer disagrees with: ${card.claim}. They expect: ${expectation}. Reply, then adjust.`;
}

/**
 * Records a card's answer and, unless the developer agreed, queues the message Bob must
 * receive. Works the same whether the answer came during the pause or after it.
 */
export function recordAnswer(store: StoreState, card: CardRecord, answer: AnswerRecord, channel: "block" | "context"): void {
  appendRecord(answer);
  store.cards.delete(card.id);
  const text = answerToMessage(card, answer);
  if (text) store.pending.push({ id: `m-${Date.now()}-${card.id}`, text, channel, card: card.id });
}

/** Shows a card now, then adds the writer's alternative readings if they arrive while it is still open. */
export async function addAlternatives(store: StoreState, card: CardRecord, intent: string, push: Push): Promise<void> {
  const alternatives = await cardWriter().alternatives({ task: store.session?.task ?? "", intent, assumption: card.claim });
  if (alternatives.length === 0 || store.cards.get(card.id) !== card) return; // answered, or the session moved on
  const [bob, ...rest] = card.options;
  const updated: CardRecord = { ...card, options: [bob!, ...alternatives.map((text, i) => ({ id: `alt-${i + 1}`, text })), ...rest] };
  store.cards.set(card.id, updated);
  appendRecord(updated);
  push({ type: "card", card: updated });
}

/** After an edit lands, asks the writer what the diff decided that nobody asked about. Never delays Bob. */
export async function reviewEdit(store: StoreState, payload: HookPayload, push: Push): Promise<void> {
  if (payload.hook_event_name !== "PostToolUse" || !EDIT_TOOLS.includes(payload.tool_name)) return;
  if (!payload.tool_response.includes("@@")) return;
  const session = store.session;
  const claim = await cardWriter().hiddenAssumption({ task: session?.task ?? "", intent: store.lastIntent ?? "", patch: payload.tool_response });
  if (!claim || store.session !== session) return;
  const card = makeCard(claim, "hidden_assumption", "diff");
  store.cards.set(card.id, card);
  appendRecord(card);
  push({ type: "card", card });
}

/**
 * Turns the assumptions Bob relied on without asking into cards and waits for them, so a wrong
 * one is caught before the task closes. Returns the developer's objections, if any.
 */
export async function reviewBeforeEnd(store: StoreState, assumptions: string[], waitMs: number, push: Push): Promise<{ card: string; text: string }[]> {
  const cards = assumptions.map((a) => makeCard(a, "hidden_assumption", "end_session"));
  const waitUntil = new Date(Date.now() + waitMs).toISOString();
  for (const card of cards) {
    store.cards.set(card.id, card);
    appendRecord(card);
    push({ type: "card", card, waitUntil });
  }
  const answers = await Promise.all(cards.map((c) => waitForAnswer(c.id, waitMs)));
  const objections: { card: string; text: string }[] = [];
  cards.forEach((card, i) => {
    const answer = answers[i];
    if (!answer) return;
    appendRecord(answer);
    store.cards.delete(card.id);
    const text = answerToMessage(card, answer);
    if (text) objections.push({ card: card.id, text });
  });
  return objections;
}
