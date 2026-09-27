// Cards: how they are made and answered, and the knowledge agent's check of them against the task's documents.
import type { AnswerRecord, CardRecord, CardType } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import type { Push } from "./mcp.js";
import { appendRecord } from "./logger.js";
import { waitForAnswer } from "./cards.js";
import { cardWriter } from "./writer.js";
import { quoteAppears } from "./docs.js";

export const EDIT_TOOLS = ["apply_diff", "write_file", "search_and_replace", "insert_content"];

let cardSeq = 0;

const QUESTIONS: Record<string, (claim: string) => string> = {
  declare_step: (c) => `Bob assumes: ${c}. Is that right?`,
  end_session: (c) => `Bob relied on this without asking you: ${c}. Is that right?`,
  confirm: (c) => `Bob now reads your correction as: ${c}. Is that what you meant?`,
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
  if (pick === "spec" && card.quote) {
    return `The developer disagrees with: ${card.claim}. They expect what ${card.quote.path} says: "${card.quote.text}" (${answer.text ?? ""}). Reply, then adjust.`;
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
  const correction = answer.pick !== "bob" && answer.pick !== "ask_why";
  if (text) store.pending.push({ id: `m-${Date.now()}-${card.id}`, text, channel, card: card.id, ...(correction ? { correction } : {}) });
}

/** Called when a message reaches Bob: a correction makes his next assumption card a confirmation. */
export function noteDelivered(store: StoreState, message: { card?: string; correction?: boolean }): void {
  if (message.card) store.lastMessageCard = message.card;
  if (message.card && message.correction) store.confirmFor = message.card;
}

/**
 * Turns the assumptions Bob relied on without asking into cards and waits for them, so a wrong
 * one is caught before the task closes. Returns the developer's objections, if any.
 */
export async function reviewBeforeEnd(store: StoreState, assumptions: string[], waitMs: number, push: Push): Promise<{ card: string; text: string; correction: boolean }[]> {
  const cards = assumptions.map((a) => makeCard(a, "hidden_assumption", "end_session"));
  const waitUntil = new Date(Date.now() + waitMs).toISOString();
  for (const card of cards) {
    store.cards.set(card.id, card);
    appendRecord(card);
    push({ type: "card", card, waitUntil });
  }
  const answers = await Promise.all(cards.map((c) => waitForAnswer(c.id, waitMs)));
  const objections: { card: string; text: string; correction: boolean }[] = [];
  cards.forEach((card, i) => {
    const answer = answers[i];
    if (!answer) return;
    appendRecord(answer);
    store.cards.delete(card.id);
    const text = answerToMessage(card, answer);
    if (text) objections.push({ card: card.id, text, correction: answer.pick !== "ask_why" });
  });
  return objections;
}

/**
 * The knowledge agent's spec check: compares an assumption card with the task's documents and, if a
 * passage contradicts or sharpens it, shows a card quoting that passage. A quote that does not appear
 * in the document is dropped, so the card can never cite something the documents do not say.
 */
export async function specCheck(store: StoreState, about: CardRecord, push: Push): Promise<void> {
  if (store.docs.size === 0) return;
  const session = store.session;
  const docs = [...store.docs].map(([path, text]) => ({ path, text }));
  const finding = await cardWriter().specCheck({ task: session?.task ?? "", assumption: about.claim, docs });
  if (!finding || store.session !== session) return;
  const text = store.docs.get(finding.path);
  if (!text || !quoteAppears(text, finding.quote)) return;
  const card: CardRecord = {
    kind: "card",
    id: `k-${++cardSeq}`,
    type: "spec_check",
    question: `Bob assumes: ${about.claim}. What do the documents mean?`,
    claim: about.claim,
    source: "spec",
    about: about.id,
    quote: { path: finding.path, text: finding.quote.trim() },
    options: [
      { id: "bob", text: about.claim },
      { id: "spec", text: finding.reading.replace(/[.\s]+$/, "") },
      { id: "other", text: "Something else…" },
      { id: "ask_why", text: "Ask Bob why" },
    ],
  };
  store.cards.set(card.id, card);
  appendRecord(card);
  push({ type: "card", card });
}
