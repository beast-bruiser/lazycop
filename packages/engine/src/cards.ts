import type { AnswerRecord } from "@lazycops/contracts";

/** A declare_step waiting for the developer's answer to its card. */
interface CardWaiter {
  resolve: (answer: AnswerRecord | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

const cardWaiters = new Map<string, CardWaiter>();

export function resolveCard(cardId: string, answer: AnswerRecord): boolean {
  const waiter = cardWaiters.get(cardId);
  if (!waiter) return false;
  cardWaiters.delete(cardId);
  clearTimeout(waiter.timer);
  waiter.resolve(answer);
  return true;
}

export function waitForAnswer(cardId: string, ms: number): Promise<AnswerRecord | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cardWaiters.delete(cardId);
      resolve(null);
    }, ms);
    cardWaiters.set(cardId, { resolve, timer });
  });
}

/** Releases every paused declare_step, as if its pause had run out. */
export function cancelAllCards(): void {
  for (const [id, waiter] of cardWaiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(null);
    cardWaiters.delete(id);
  }
}
