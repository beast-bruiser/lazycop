// Cards: how they are made, answered, and enriched by the card writer while Bob works.
import type { AnswerRecord, CardRecord, CardType, HookPayload } from "@lazycops/contracts";
import type { StoreState } from "./store.js";
import type { Push } from "./mcp.js";
import { appendRecord } from "./logger.js";
import { cancelCard, waitForAnswer } from "./cards.js";
import { cardWriter } from "./writer.js";
import { alreadySettled, normText, quoteAppears } from "./docs.js";

export const EDIT_TOOLS = ["apply_diff", "write_file", "search_and_replace", "insert_content"];

let cardSeq = 0;

const QUESTIONS: Record<string, (claim: string) => string> = {
  declare_step: (c) => `Bob assumes: ${c}. Is that right?`,
  diff: (c) => `Bob's change decides: ${c}. Is that what you want?`,
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
    return `The developer wants you to follow ${card.quote.path}: "${card.quote.text}". Check your code against it, reply, then adjust if it differs.`;
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
  settle(store, card, answer);
  const text = answerToMessage(card, answer);
  const correction = answer.pick !== "bob" && answer.pick !== "ask_why";
  if (text) store.pending.push({ id: `m-${Date.now()}-${card.id}`, text, channel, card: card.id, ...(correction ? { correction, pick: answer.pick } : {}) });
}

/** Remembers what a card settled: Bob's claim, the passage it quoted and the developer's own words. */
export function settle(store: StoreState, card: CardRecord, answer?: AnswerRecord | null): void {
  store.answeredClaims.add([card.claim, card.quote?.text, answer?.text].filter(Boolean).join(" "));
}

/** Called when a message reaches Bob: a correction makes his next assumption card a confirmation. */
export function noteDelivered(store: StoreState, message: { card?: string; correction?: boolean; pick?: string }): void {
  if (message.card) store.lastMessageCard = message.card;
  if (message.card && message.correction) {
    store.confirmFor = message.card;
    store.confirmForPick = message.pick;
  }
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

/** The lines an edit added, from the unified patch in its tool response. */
export function addedLines(patch: string): string[] {
  return patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).filter((l) => l.trim() !== "");
}

/**
 * After an edit lands, asks the writer what the diff decided that nobody asked about. Never delays Bob.
 * The writer must name the added line that decides it, and that line must really be one of the added
 * lines: the card shows it, so the developer judges the code, not the model's reading of it.
 */
export async function reviewEdit(store: StoreState, payload: HookPayload, push: Push): Promise<void> {
  if (payload.hook_event_name !== "PostToolUse" || !EDIT_TOOLS.includes(payload.tool_name)) return;
  if (!payload.tool_response.includes("@@")) return;
  const session = store.session;
  const finding = await cardWriter().hiddenAssumption({ task: session?.task ?? "", intent: store.lastIntent ?? "", patch: payload.tool_response });
  if (!finding || store.session !== session) return;
  const line = normText(finding.line.replace(/^\+\s?/, ""));
  const evidence = addedLines(payload.tool_response).find((l) => line.length >= 8 && normText(l).includes(line));
  if (!evidence) return;
  const path = (payload.tool_input as { path?: unknown } | null)?.path;
  const card: CardRecord = {
    ...makeCard(finding.claim, "hidden_assumption", "diff"),
    quote: { path: typeof path === "string" ? path : "the change", text: evidence.trim() },
  };
  card.question = `Bob's change adds: "${evidence.trim()}" This decides: ${card.claim}. Is that what you want?`;
  store.cards.set(card.id, card);
  appendRecord(card);
  push({ type: "card", card });
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
    settle(store, card, answer);
    if (!answer) return;
    appendRecord(answer);
    store.cards.delete(card.id);
    const text = answerToMessage(card, answer);
    if (text) objections.push({ card: card.id, text, correction: answer.pick !== "ask_why" });
  });
  return objections;
}

/**
 * When Bob declares a new assumption, unanswered "before an edit" and "checking your correction" cards,
 * and the spec checks about them, become stale. Final-review cards and the hold card are never stale.
 * Stale cards are removed from the active set and the page is told to drop them.
 */
export function markStale(store: StoreState, protectedId: string | undefined, push: Push): void {
  const primarySources = new Set(["declare_step", "confirm"]);
  // Collect unanswered primary cards (all cards in store.cards are unanswered; not the just-created one, not the held card, not end_session).
  const stalePrimary = [...store.cards.values()].filter(
    (c) => primarySources.has(c.source) && c.id !== protectedId && c.id !== store.holdCard,
  );
  // Their spec-check children.
  const primaryIds = new Set(stalePrimary.map((c) => c.id));
  const staleSpec = [...store.cards.values()].filter(
    (c) => c.source === "spec" && c.about && primaryIds.has(c.about),
  );
  const stale = [...stalePrimary, ...staleSpec];
  if (stale.length === 0) return;
  for (const c of stale) store.cards.delete(c.id);
  const ids = stale.map((c) => c.id);
  appendRecord({ kind: "stale", ts: new Date().toISOString(), ids });
  push({ type: "stale", ids });
}

/**
 * Closes open final-review cards that an answer given meanwhile already settles, so the developer is
 * not asked the same thing twice while they are answering. Closed cards are recorded as skipped.
 */
export function closeSettledReviews(store: StoreState, push: Push): void {
  const settled = [...store.cards.values()].filter((c) => c.source === "end_session" && alreadySettled(c.claim, store.answeredClaims));
  if (settled.length === 0) return;
  for (const c of settled) {
    store.cards.delete(c.id);
    cancelCard(c.id);
  }
  const ids = settled.map((c) => c.id);
  appendRecord({ kind: "stale", ts: new Date().toISOString(), ids });
  push({ type: "stale", ids });
}

/**
 * The knowledge agent's spec check: compares an assumption card with the task's documents and, if a
 * passage contradicts or sharpens it, shows a card quoting that passage. A quote that does not appear
 * in the document is dropped, so the card can never cite something the documents do not say.
 *
 * Suppressed when the same quote was already shown this session. The caller skips confirmation cards
 * whose correction was the developer choosing the spec's reading: they already know what it says.
 */
export async function specCheck(store: StoreState, about: CardRecord, push: Push): Promise<void> {
  if (store.docs.size === 0) return;
  const session = store.session;
  const docs = [...store.docs].map(([path, text]) => ({ path, text }));
  const finding = await cardWriter().specCheck({ task: session?.task ?? "", assumption: about.claim, docs });
  if (!finding || store.session !== session) return;
  const text = store.docs.get(finding.path);
  if (!text || !quoteAppears(text, finding.quote)) return;
  const writer = cardWriter();
  if (writer.passageMatters && !(await writer.passageMatters({ passage: finding.quote, assumption: about.claim }))) return;
  if (store.session !== session) return;
  // Suppress if this exact quote was already shown in this session.
  const quoteKey = normText(finding.quote);
  if (store.shownQuotes.has(quoteKey)) return;
  store.shownQuotes.add(quoteKey);
  const card: CardRecord = {
    kind: "card",
    id: `k-${++cardSeq}`,
    type: "spec_check",
    // Leads with the document, so it never reads as a repeat of the assumption card it checks.
    question: `${finding.path} says: "${finding.quote.trim()}" Bob assumes: ${about.claim}. Which is right?`,
    claim: about.claim,
    source: "spec",
    about: about.id,
    quote: { path: finding.path, text: finding.quote.trim() },
    options: [
      { id: "bob", text: about.claim },
      // The verified passage itself, never the model's paraphrase of it: it cannot say what the document does not.
      { id: "spec", text: finding.quote.trim() },
      { id: "other", text: "Something else…" },
      { id: "ask_why", text: "Ask Bob why" },
    ],
  };
  store.cards.set(card.id, card);
  appendRecord(card);
  push({ type: "card", card });
}
