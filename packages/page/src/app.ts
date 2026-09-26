// The LazyCop page: renders the view folded from the server's events and posts the developer's answers.
import type { SseEvent } from "@lazycops/contracts";
import type { CardView, ViewState } from "./view.js";
import { answeredCards, correctionBeingConfirmed, currentCard, emptyView, reduce, sourceLabel, summary, waitingQuestion } from "./view.js";

let view: ViewState = emptyView();
let notice = "";
let earlierOpen = false;
const root = document.getElementById("app")!;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  notice = res.ok ? "" : ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Request failed (${res.status})`;
  if (!res.ok) render();
}

function optionLabel(c: CardView, id: string, text: string): string {
  if (id === "bob") return c.card.source === "confirm" ? "Yes, that's what I meant" : `Yes: ${text}`;
  if (id === "other" && c.card.source === "confirm") return "Not quite…";
  if (id === "other") return "Something else…";
  if (id === "ask_why") return "Ask Bob why";
  return text;
}

/** One quiet line under the question: what an answer does. Cards run alongside Bob's work. */
function countdown(c: CardView): string {
  if (view.hold && view.holdCard === c.card.id) {
    return `<p class="countdown hold">Important decision: Bob holds his edits on it until you answer.</p>`;
  }
  if (c.card.source === "end_session" && c.waitUntil) {
    const left = Math.ceil((Date.parse(c.waitUntil) - Date.now()) / 1000);
    return left > 0
      ? `<p class="countdown">Final check: Bob closes the task in ${left} s unless you object.</p>`
      : `<p class="countdown late">Bob closed the task.</p>`;
  }
  return `<p class="countdown late">If you see it differently, Bob gets your answer at his next step.</p>`;
}

function renderWaiting(): string {
  const q = waitingQuestion(view);
  if (!q) return "";
  const target = q.card ? `data-thread="${esc(q.card)}"` : "data-compose";
  return `<section class="card waiting">
    <h2>Bob asked you something</h2>
    <p class="countdown late">If you don't reply, Bob goes with his own guess.</p>
    ${q.text ? `<p class="msg bob"><b>Bob</b> ${esc(q.text)}</p>` : ""}
    <form class="inline" ${target}>
      <input name="text" data-keep="waiting" placeholder="Answer Bob…" autocomplete="off"><button>Send</button>
    </form>
  </section>`;
}

function renderCurrent(c: CardView): string {
  const options = c.card.options
    .map((o, i) => `<button class="option" data-card="${esc(c.card.id)}" data-pick="${esc(o.id)}" data-text="${esc(o.text)}"><kbd>${i + 1}</kbd> ${esc(optionLabel(c, o.id, o.text))}</button>`)
    .join("");
  const corrected = correctionBeingConfirmed(view, c);
  return `<section class="card current source-${esc(c.card.source)}" data-countdown="${esc(c.card.id)}">
    <p class="chip">${esc(sourceLabel(c.card))}</p>
    ${corrected ? `<p class="about">You told Bob: “${esc(corrected)}”</p>` : ""}
    <h2>${esc(c.card.question)}</h2>
    <div class="cd">${countdown(c)}</div>
    <div class="options">${options}</div>
    <form class="inline" data-other="${esc(c.card.id)}" hidden>
      <input name="text" data-keep="other-${esc(c.card.id)}" placeholder="What should it be?" autocomplete="off">
      <button>Send to Bob</button>
    </form>
  </section>`;
}

function answerText(c: CardView): string {
  const a = c.answer!;
  if (a.pick === "bob") return "You agreed";
  if (a.pick === "ask_why") return "You asked Bob why";
  return `You said: ${a.text ?? a.pick}`;
}

/** An answered card as one compact exchange: what Bob assumed, what you said, and the thread since. */
function renderExchange(c: CardView, open: boolean): string {
  const thread = c.thread.map((m) => `<p class="msg ${m.from}"><b>${m.from === "bob" ? "Bob" : "You"}</b> ${esc(m.text)}</p>`).join("");
  const reply = open && c.answer!.pick !== "bob"
    ? `<form class="inline" data-thread="${esc(c.card.id)}">
        <input name="text" data-keep="thread-${esc(c.card.id)}" placeholder="Answer Bob…" autocomplete="off"><button>Send</button>
      </form>`
    : "";
  return `<article class="exchange${open ? " latest" : ""}">
    <p class="line"><span class="tick">✓</span> <span class="chip">${esc(sourceLabel(c.card))}</span> ${esc(c.card.claim)}</p>
    <p class="answer">${esc(answerText(c))}</p>
    ${thread}${reply}
  </article>`;
}

function renderAnswered(): string {
  const [latest, ...earlier] = answeredCards(view);
  if (!latest) return "";
  return `${renderExchange(latest, true)}
    ${earlier.length ? `<details class="earlier" data-earlier ${earlierOpen ? "open" : ""}>
      <summary>Earlier cards (${earlier.length})</summary>${earlier.map((c) => renderExchange(c, false)).join("")}
    </details>` : ""}`;
}

function renderWatching(): string {
  const now = currentCard(view);
  const feed = [...view.feed].reverse().slice(0, 40)
    .map((f) => `<li class="${f.kind}"><time>${esc(new Date(f.at).toLocaleTimeString())}</time> ${esc(f.text)}</li>`).join("");
  return `<div class="grid">
    <div class="cards">
      ${renderWaiting()}
      ${now ? renderCurrent(now) : `<section class="card idle"><h2>No new card</h2><p>Bob is working. A card appears each time he states what he assumes, so you can follow along.</p></section>`}
      ${renderAnswered()}
    </div>
    <aside>
      <h3>Bob now</h3><ul class="feed">${feed || "<li>Waiting for Bob…</li>"}</ul>
      <h3>Files edited</h3><p>${view.filesEdited.map(esc).join(", ") || "none yet"}</p>
    </aside>
  </div>
  <form class="compose" data-compose>
    <input name="text" data-keep="compose" placeholder="Tell Bob something no card asked about…" autocomplete="off">
    <label><input type="checkbox" name="urgent" data-keep="urgent"> stop Bob's next action</label>
    <button>Send</button>
  </form>`;
}

function renderEnded(): string {
  const s = summary(view);
  return `<section class="card wrap">
    <h2>Task finished</h2>
    <p>${s.cards} card${s.cards === 1 ? "" : "s"}: ${s.agreed} agreed, ${s.corrected} corrected, ${s.askedWhy} asked why, ${s.unanswered} unanswered.</p>
    <p>Files edited: ${s.filesEdited.map(esc).join(", ") || "none"}</p>
  </section>
  ${answeredCards(view).map((c) => renderExchange(c, false)).join("")}`;
}

function render(): void {
  const kept = new Map<string, string | boolean>();
  root.querySelectorAll<HTMLInputElement>("[data-keep]").forEach((el) => kept.set(el.dataset.keep!, el.type === "checkbox" ? el.checked : el.value));
  const focused = (document.activeElement as HTMLElement | null)?.dataset?.keep;

  const status = !view.connected ? "connecting…" : view.ended ? "finished" : view.task ? "watching" : "dormant";
  const body = !view.connected ? `<p class="hint">Connecting to LazyCop…</p>`
    : !view.task ? `<section class="card idle"><h2>LazyCop isn't watching a task</h2><p>In Bob, type <code>/lazycop &lt;task&gt;</code>.</p></section>`
    : view.ended ? renderEnded() : renderWatching();
  root.innerHTML = `<header>
      <h1>👮 LazyCop</h1><p class="task">${esc(view.task ?? "")}</p>
      <span class="status ${status}">${status}</span>
      ${view.task && !view.ended ? `<button class="hold ${view.hold ? "on" : ""}" data-hold>${view.hold ? "Release Bob" : "Hold Bob"}</button>` : ""}
    </header>
    ${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
    ${view.hold && !view.holdCard && !view.ended ? `<p class="notice hold">You put Bob on hold: he makes no edits until you release him.</p>` : ""}
    <main>${body}</main>`;

  root.querySelectorAll<HTMLInputElement>("[data-keep]").forEach((el) => {
    const v = kept.get(el.dataset.keep!);
    if (typeof v === "boolean") el.checked = v;
    else if (typeof v === "string") el.value = v;
  });
  if (focused) root.querySelector<HTMLElement>(`[data-keep="${focused}"]`)?.focus();
}

function answer(card: string, pick: string, text?: string): void {
  void post("/answer", { card, pick, ...(text ? { text } : {}) });
}

root.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("button");
  if (!el) return;
  if (el.dataset.hold !== undefined) return void post("/hold", { on: !view.hold });
  const { card, pick, text } = el.dataset;
  if (!card || !pick) return;
  if (pick === "other") {
    const form = root.querySelector<HTMLFormElement>(`[data-other="${card}"]`)!;
    form.hidden = false;
    form.querySelector("input")!.focus();
    return;
  }
  answer(card, pick, pick === "ask_why" ? undefined : text);
});

root.addEventListener("toggle", (e) => {
  if ((e.target as HTMLElement).dataset.earlier !== undefined) earlierOpen = (e.target as HTMLDetailsElement).open;
}, true);

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const input = form.querySelector<HTMLInputElement>('input[name="text"]')!;
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (form.dataset.other) answer(form.dataset.other, "other", text);
  else if (form.dataset.thread) void post("/queue", { text, card: form.dataset.thread });
  else if (form.dataset.compose !== undefined) {
    const urgent = form.querySelector<HTMLInputElement>('input[name="urgent"]')?.checked ?? false;
    void post("/queue", { text, channel: urgent ? "block" : "context" });
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement).tagName === "INPUT") return;
  const n = Number(e.key);
  const now = currentCard(view);
  if (!now || !Number.isInteger(n) || n < 1) return;
  root.querySelectorAll<HTMLButtonElement>(".current .option")[n - 1]?.click();
});

setInterval(() => {
  const now = currentCard(view);
  const box = now && root.querySelector(`[data-countdown="${now.card.id}"] .cd`);
  if (box) box.innerHTML = countdown(now);
}, 1000);

const stream = new EventSource("/stream");
stream.onmessage = (e) => {
  view = reduce(view, JSON.parse(e.data) as SseEvent);
  render();
};
stream.onerror = () => {
  view = { ...view, connected: false };
  render();
};
render();
