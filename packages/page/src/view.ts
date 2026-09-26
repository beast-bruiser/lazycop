// What the page shows, folded from the server's event stream. No DOM here, so it is testable.
import type { AnswerRecord, CardRecord, SseEvent, SseStateEvent } from "@lazycops/contracts";

export interface CardView {
  card: CardRecord;
  /** When Bob stops waiting on this card, if it paused. */
  waitUntil?: string;
  answer?: AnswerRecord;
  /** When the developer answered, to keep the latest exchange in view. */
  answeredAt?: string;
  /** Bob's replies and the developer's follow-ups on this card, in order. */
  thread: { from: "bob" | "you"; text: string }[];
}

export interface FeedItem {
  at: string;
  kind: "step" | "read" | "edit" | "reply" | "you" | "hold" | "session";
  text: string;
}

export interface ViewState {
  connected: boolean;
  task: string | null;
  /** true once the watched task has ended; the page then shows the wrap-up. */
  ended: boolean;
  hold: boolean;
  /** The card Bob is held on, when an important decision started the hold. */
  holdCard?: string;
  /** Set while Bob waits in check_in for the developer's answer. */
  waiting: { until?: string; card?: string } | null;
  cards: CardView[];
  feed: FeedItem[];
  filesRead: string[];
  filesEdited: string[];
}

export const EDIT_TOOLS = ["apply_diff", "write_file", "search_and_replace", "insert_content"];

export const emptyView = (): ViewState => ({
  connected: false, task: null, ended: false, hold: false, waiting: null, cards: [], feed: [], filesRead: [], filesEdited: [],
});

/** Rebuilds the whole view from the server's snapshot: the page keeps no state of its own. */
export function fromSnapshot(snapshot: SseStateEvent): ViewState {
  let view: ViewState = { ...emptyView(), connected: true };
  for (const event of snapshot.history) view = reduce(view, event);
  return { ...view, task: snapshot.session?.task ?? view.task, ended: snapshot.session === null && view.task !== null, hold: snapshot.hold };
}

const addOnce = (list: string[], item: string) => (list.includes(item) ? list : [...list, item]);

function pathOf(input: unknown): string | undefined {
  const p = input && typeof input === "object" ? (input as Record<string, unknown>)["path"] : undefined;
  return typeof p === "string" ? p : undefined;
}

export function reduce(view: ViewState, event: SseEvent): ViewState {
  const feed = (kind: FeedItem["kind"], text: string): FeedItem[] => [...view.feed, { at: event.at, kind, text }];
  switch (event.type) {
    case "state":
      return fromSnapshot(event);
    case "session":
      return event.on
        ? { ...emptyView(), connected: true, task: event.task ?? "", feed: [{ at: event.at, kind: "session", text: "LazyCop started watching" }] }
        : { ...view, ended: true, hold: false, waiting: null, feed: feed("session", "LazyCop stopped watching") };
    case "hold":
      return { ...view, hold: event.on, holdCard: event.on ? event.card : undefined, feed: feed("hold", event.on ? "Bob is on hold" : `Hold released (${event.reason})`) };
    case "waiting":
      return { ...view, waiting: event.on ? { until: event.until, card: event.card } : null };
    case "card": {
      // A card can arrive twice: the writer's alternative readings update it in place.
      const known = view.cards.find((c) => c.card.id === event.card.id);
      return known
        ? { ...view, cards: view.cards.map((c) => (c === known ? { ...c, card: event.card, waitUntil: event.waitUntil ?? c.waitUntil } : c)) }
        : { ...view, cards: [...view.cards, { card: event.card, waitUntil: event.waitUntil, thread: [] }] };
    }
    case "answer":
      return { ...view, cards: view.cards.map((c) => (c.card.id === event.answer.card ? { ...c, answer: event.answer, answeredAt: event.at } : c)) };
    case "reply": {
      const target = event.card ?? [...view.cards].reverse().find((c) => c.answer)?.card.id;
      return {
        ...view,
        cards: view.cards.map((c) => (c.card.id === target ? { ...c, thread: [...c.thread, { from: "bob" as const, text: event.text }] } : c)),
        feed: feed("reply", event.text),
      };
    }
    case "queued":
      if (event.fromAnswer) return view;
      if (event.card) {
        return { ...view, cards: view.cards.map((c) => (c.card.id === event.card ? { ...c, thread: [...c.thread, { from: "you" as const, text: event.text }] } : c)) };
      }
      return { ...view, feed: feed("you", event.text) };
    case "mcp":
      return event.tool === "declare_step" ? { ...view, feed: feed("step", String(event.args["intent"] ?? "")) } : view;
    case "hook": {
      const p = event.payload;
      if (p.hook_event_name !== "PostToolUse" || p.tool_name.startsWith("mcp__lazycop__")) return view;
      const path = pathOf(p.tool_input);
      if (!path) return view;
      if (EDIT_TOOLS.includes(p.tool_name)) return { ...view, filesEdited: addOnce(view.filesEdited, path), feed: feed("edit", path) };
      if (p.tool_name === "read_file") return { ...view, filesRead: addOnce(view.filesRead, path), feed: feed("read", path) };
      return view;
    }
    default:
      return view;
  }
}

/** What Bob is waiting on the developer for: his last message on the card, if he asked on one. */
export function waitingQuestion(view: ViewState): { card?: string; text?: string } | null {
  if (!view.waiting) return null;
  const card = view.cards.find((c) => c.card.id === view.waiting!.card);
  const last = card?.thread.at(-1);
  return { card: card?.card.id, text: last?.from === "bob" ? last.text : undefined };
}

/** Where a card came from, as the page labels it. */
export function sourceLabel(card: CardRecord): string {
  return { declare_step: "Before an edit", diff: "After an edit", end_session: "Final review", confirm: "Checking your correction" }[card.source] ?? "Question";
}

/** Answered cards, latest answer first: the first stays open under the current card, the rest fold away. */
export function answeredCards(view: ViewState): CardView[] {
  return view.cards.filter((c) => c.answer).sort((a, b) => (b.answeredAt ?? "").localeCompare(a.answeredAt ?? ""));
}

/** For a confirmation card: what the developer had said on the card it confirms. */
export function correctionBeingConfirmed(view: ViewState, c: CardView): string | undefined {
  const original = c.card.confirms ? view.cards.find((o) => o.card.id === c.card.confirms) : undefined;
  return original?.answer?.text;
}

/** The card the developer should look at now: the oldest unanswered one. */
export function currentCard(view: ViewState): CardView | undefined {
  return view.cards.find((c) => !c.answer);
}

export function summary(view: ViewState) {
  const answered = view.cards.filter((c) => c.answer);
  return {
    cards: view.cards.length,
    agreed: answered.filter((c) => c.answer!.pick === "bob").length,
    corrected: answered.filter((c) => c.answer!.pick !== "bob" && c.answer!.pick !== "ask_why").length,
    askedWhy: answered.filter((c) => c.answer!.pick === "ask_why").length,
    unanswered: view.cards.length - answered.length,
    filesEdited: view.filesEdited,
  };
}
