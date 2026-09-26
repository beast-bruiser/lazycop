import type { PendingMessage, CardRecord, SseEvent } from "@lazycops/contracts";

/** The task LazyCop is watching. `id` is Bob's session_id, bound by the start_session hook. */
export interface Session {
  id: string | null;
  task: string;
  cwd?: string;
}

export interface StoreState {
  /** null while LazyCop is dormant. */
  session: Session | null;
  hold: boolean;
  holdPolls: number;
  /** The card whose important decision started the hold; answering it ends the hold. */
  holdCard?: string;
  seq: number;
  pending: PendingMessage[];
  /** Active cards indexed by id, so answers can find their card. */
  cards: Map<string, CardRecord>;
  /** Every event pushed since the current (or last) session started; the page rebuilds from it. */
  history: SseEvent[];
  /** The card behind the last developer message Bob received, so its reply lands on that card. */
  lastMessageCard?: string;
  /** The card of Bob's last reply: what he is waiting on when he calls check_in. */
  lastReplyCard?: string;
  /** Bob's last declared intent, the context for reviewing his next edit. */
  lastIntent?: string;
  /** A card whose correction Bob has received; his next assumption card confirms it. */
  confirmFor?: string;
  /** The task's documents by workspace path, for the knowledge agent. */
  docs: Map<string, string>;
  waiters: Set<() => void>;
}

export function createStore(): StoreState {
  return {
    session: null,
    hold: false,
    holdPolls: 0,
    seq: 0,
    pending: [],
    cards: new Map(),
    history: [],
    docs: new Map(),
    waiters: new Set(),
  };
}

/** True when a hook payload belongs to the task LazyCop is watching. */
export function isWatched(store: StoreState, sessionId: string): boolean {
  return store.session !== null && store.session.id === sessionId;
}

/** Drops everything tied to the current session and releases anything waiting on it. */
export function clearSession(store: StoreState): void {
  store.session = null;
  store.hold = false;
  store.holdPolls = 0;
  store.holdCard = undefined;
  store.pending = [];
  store.cards.clear();
  store.lastMessageCard = undefined;
  store.lastReplyCard = undefined;
  store.confirmFor = undefined;
  store.docs.clear();
  wake(store);
}

export function wake(store: StoreState): void {
  for (const done of store.waiters) done();
  store.waiters.clear();
}

export function setHold(store: StoreState, on: boolean): void {
  store.hold = on;
  if (on) store.holdPolls = 0;
  else store.holdCard = undefined;
  wake(store);
}

export function takePending(
  store: StoreState,
  channel: "block" | "context",
): PendingMessage | null {
  const i = store.pending.findIndex((m) => m.channel === channel);
  if (i === -1) return null;
  const [msg] = store.pending.splice(i, 1);
  return msg;
}

export function waitForDeveloper(store: StoreState, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { store.waiters.delete(done); resolve(); }, ms);
    store.waiters.add(done);
  });
}
