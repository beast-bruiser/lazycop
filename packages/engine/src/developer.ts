// What the developer sends from the page: messages, holds and card answers, each routed to its agent.
import type { AnswerBody, HoldBody, PendingMessage, QueueBody } from "@lazycops/contracts";
import type { Push } from "./mcp.js";
import type { Agent, Squad } from "./squad.js";
import { agentOfCard, isWatching, latest, tagged, watching, withRecords } from "./squad.js";
import { setHold, wake } from "./store.js";
import { recordAnswer } from "./review.js";
import { resolveCard } from "./cards.js";

export type Reply = [status: number, body: unknown];

const NOT_WATCHING: Reply = [409, { error: "LazyCop is not watching that task" }];

export function onDeveloper(squad: Squad, path: string, body: unknown, push: Push): Reply {
  if (path === "/queue") return queue(squad, body as QueueBody, push);
  if (path === "/hold") return hold(squad, body as HoldBody, push);
  return answer(squad, body as AnswerBody, push);
}

/** A message goes to the card's agent, else the one named, else the agent that acted last. */
function queue(squad: Squad, q: QueueBody, push: Push): Reply {
  const agent = typeof q.card === "string" ? agentOfCard(squad, q.card)
    : typeof q.agent === "string" ? squad.agents.get(q.agent) : latest(squad);
  if (!agent || !isWatching(agent)) return NOT_WATCHING;
  if (typeof q.text !== "string" || !q.text.trim()) return [400, { error: "text required" }];
  const msg: PendingMessage = {
    id: `m-${Date.now()}`,
    text: q.text.trim(),
    channel: q.channel === "block" ? "block" : "context",
    ...(typeof q.card === "string" ? { card: q.card } : {}),
  };
  agent.store.pending.push(msg);
  tagged(push, agent)({ type: "queued", id: msg.id, text: msg.text, channel: msg.channel, ...(msg.card ? { card: msg.card } : {}) });
  wake(agent.store);
  return [200, msg];
}

/** Holds the agent named, or every watched agent when none is. */
function hold(squad: Squad, h: HoldBody, push: Push): Reply {
  const named = typeof h.agent === "string" ? squad.agents.get(h.agent) : undefined;
  const agents: Agent[] = typeof h.agent === "string" ? (named && isWatching(named) ? [named] : []) : watching(squad);
  if (!agents.length) return NOT_WATCHING;
  for (const agent of agents) {
    setHold(agent.store, Boolean(h.on));
    tagged(push, agent)({ type: "hold", on: agent.store.hold, reason: "developer" });
  }
  return [200, { hold: Boolean(h.on) }];
}

function answer(squad: Squad, a: AnswerBody, push: Push): Reply {
  if (!a.card || !a.pick) return [400, { error: "card and pick required" }];
  const agent = agentOfCard(squad, a.card);
  const card = agent?.store.cards.get(a.card);
  if (!agent || !card) return [404, { error: "card not found" }];
  const { store } = agent;
  const send = tagged(push, agent);
  const answer = { kind: "answer" as const, card: a.card, pick: a.pick, text: a.text };
  send({ type: "answer", answer });
  const endsHold = store.hold && store.holdCard === card.id;
  if (!resolveCard(a.card, answer)) {
    // The pause is over: queue the answer so Bob gets it at its next tool call.
    withRecords(agent, () => recordAnswer(store, card, answer, "block"));
    for (const m of store.pending.filter((p) => p.card === card.id)) {
      send({ type: "queued", id: m.id, text: m.text, channel: m.channel, card: card.id, fromAnswer: true });
    }
    wake(store);
  }
  // Answering the decision Bob is held on is the review it was waiting for, whatever the answer.
  if (endsHold) {
    setHold(store, false);
    send({ type: "hold", on: false, reason: "answered" });
  }
  return [200, { ok: true }];
}
