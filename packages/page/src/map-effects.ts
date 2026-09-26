// Moments on the tactical map, found by comparing the squad with what the map saw last:
// a checkpoint banner when a card is answered, a READY screen when an agent starts, and the wait or work bar.
import type { SquadView } from "./squad-view.js";
import type { ViewState } from "./view.js";
import { currentCard } from "./view.js";
import { label } from "./map-draw.js";
import { callSign } from "./units.js";

const BANNER_MS = 2600;
const READY_MS = 1800;

let banner: { text: string; color: string; start: number } | null = null;
let ready: { start: number; sign: string } | null = null;
/** Agent tasks already seen, so only a new one plays READY. */
const seen = new Set<string>();
const answered = new Map<string, Set<string>>();
/** When the map first saw each wait, so its bar fills from there. */
const waitStart = new Map<string, number>();
/** Nothing plays for what the first snapshot after connecting already holds. */
let primed = false;

export function updateEffects(squad: SquadView, now: number): void {
  for (const a of squad.agents) {
    const done = a.view.cards.filter((c) => c.answer);
    const known = answered.get(a.id);
    for (const c of done) {
      if (!primed || !known || known.has(c.card.id)) continue;
      const pick = c.answer!.pick;
      const secured = done.filter((d) => d.answer!.pick === "bob").length;
      banner = pick === "bob" ? { text: `CHECKPOINT ${secured} SECURED`, color: "#44ff66", start: now }
        : pick === "ask_why" ? { text: "INTEL REQUESTED", color: "#44ccff", start: now }
        : { text: "INTEL CORRECTED", color: "#ff8800", start: now };
    }
    answered.set(a.id, new Set(done.map((c) => c.card.id)));
    const key = `${a.id}:${a.view.task}`;
    if (primed && !seen.has(key) && !a.view.ended) ready = { start: now, sign: callSign(a.n) };
    seen.add(key);
  }
  primed = squad.connected;
}

/** The focused agent's wait: its check_in, else the pause on its current card. */
function waitOf(view: ViewState, n: number): { text: string; until?: string } | null {
  if (view.waiting) return { text: `${callSign(n)} WAITS FOR YOUR REPLY`, until: view.waiting.until };
  const card = currentCard(view);
  if (card?.waitUntil) return { text: `${callSign(n)} AWAITS INTEL…`, until: card.waitUntil };
  return view.hold ? { text: `${callSign(n)} HOLDING — YOUR CALL` } : null;
}

export function drawEffects(ctx: CanvasRenderingContext2D, w: number, h: number, px: number, font: number, now: number, view: ViewState | undefined, n: number): void {
  const wait = view && waitOf(view, n);
  if (wait) drawWaitBar(ctx, wait, h, px, font, now);
  else if (view?.task != null && !view.ended && view.connected) drawWorkBar(ctx, view, n, h, px, font, now);
  if (banner && now - banner.start < BANNER_MS) {
    const blink = Math.floor((now - banner.start) / 200) % 2 === 0 || now - banner.start > 1000;
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, h * 0.72 - font * 1.6, w, font * 2.4);
    if (blink) label(ctx, banner.text, w / 2, h * 0.72, font * 1.2, banner.color);
  }
  if (ready && now - ready.start < READY_MS) drawReady(ctx, w, h, font, now - ready.start, ready.sign);
}

/** Bob is working between events: his current step, how long since his last move, and a scanning bar. */
function drawWorkBar(ctx: CanvasRenderingContext2D, view: ViewState, n: number, h: number, px: number, font: number, now: number): void {
  const last = [view.feed.at(-1)?.at, view.trail.at(-1)?.at].filter((t): t is string => !!t).map(Date.parse);
  const quiet = last.length ? Math.max(0, Math.floor((Date.now() - Math.max(...last)) / 1000)) : 0;
  const step = view.feed.filter((f) => f.kind === "step").at(-1)?.text ?? view.task ?? "";
  const dots = ".".repeat(1 + (Math.floor(now / 400) % 3));
  const text = `${callSign(n)} ${quiet > 20 ? "THINKING" : "ON THE MOVE"}${dots}`;
  const bar = drawBarFrame(ctx, text, h, px, font);
  // Indeterminate: a segment sweeps across the track, like a radar scan.
  const seg = (bar.w - 2 * px) * 0.25, t = (now / 1400) % 1;
  const x0 = bar.x + px + (bar.w - 2 * px + seg) * t - seg;
  const left = Math.max(bar.x + px, x0), right = Math.min(bar.x + bar.w - px, x0 + seg);
  ctx.fillStyle = "#44ccff";
  if (right > left) ctx.fillRect(left, bar.y + px, right - left, bar.h - 2 * px);
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = `${Math.round(font * 0.7)}px 'Press Start 2P', monospace`;
  ctx.fillStyle = "#8fb4d8";
  const detail = `${step.length > 34 ? `${step.slice(0, 33)}…` : step}${quiet ? `  ${quiet}s` : ""}`;
  ctx.fillText(detail, bar.x, bar.y + bar.h + font * 1.1);
  ctx.restore();
}

/** The dark box, caption and empty track shared by the wait and work bars. */
function drawBarFrame(ctx: CanvasRenderingContext2D, text: string, h: number, px: number, font: number) {
  const x = 6 * px, y = h - 20 * px, w = Math.min(ctx.canvas.width - 12 * px, 110 * px), bh = 5 * px;
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.fillRect(x - 2 * px, y - font * 1.6, w + 4 * px, bh + font * 3 + 3 * px);
  ctx.save();
  ctx.textAlign = "left";
  ctx.font = `${Math.round(font * 0.9)}px 'Press Start 2P', monospace`;
  ctx.fillStyle = "#e8e8e8";
  ctx.fillText(text, x, y - font * 0.4);
  ctx.restore();
  ctx.strokeStyle = "#8fb4d8";
  ctx.lineWidth = px;
  ctx.strokeRect(x, y, w, bh);
  return { x, y, w, h: bh };
}

function drawWaitBar(ctx: CanvasRenderingContext2D, wait: { text: string; until?: string }, h: number, px: number, font: number, now: number): void {
  const until = wait.until ? Date.parse(wait.until) : NaN;
  const key = wait.until ?? "hold";
  if (!waitStart.has(key)) waitStart.set(key, Date.now());
  const start = waitStart.get(key)!;
  if (Date.now() > until) return;
  // A hold has no end the page knows of: its bar pulses instead of filling.
  const fill = Number.isNaN(until) ? 0.5 + 0.5 * Math.sin(now / 300) : (Date.now() - start) / Math.max(1, until - start);
  const { x, y, w: bw, h: bh } = drawBarFrame(ctx, wait.text, h, px, font);
  ctx.fillStyle = "#44cc44";
  ctx.fillRect(x + px, y + px, Math.max(0, Math.min(1, fill)) * (bw - 2 * px), bh - 2 * px);
}

/** Red tint, glitch strips and a chromatic READY, fading out. */
function drawReady(ctx: CanvasRenderingContext2D, w: number, h: number, font: number, t: number, sign: string): void {
  const fade = t < READY_MS * 0.7 ? 1 : 1 - (t - READY_MS * 0.7) / (READY_MS * 0.3);
  ctx.globalAlpha = 0.45 * fade;
  ctx.fillStyle = "#c83214";
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = fade;
  const frame = Math.floor(t / 60);
  for (let i = 0; i < 7; i++) {
    const r = Math.sin(frame * 12.9898 + i * 78.233) * 43758.5453;
    const f = r - Math.floor(r);
    ctx.fillStyle = ["#44ccff", "#ff44aa", "#ffffff", "#f5c842"][i % 4]!;
    ctx.fillRect(f * w * 0.7, ((f * 7 + i) % 1) * h, w * (0.1 + f * 0.3), font * 0.5);
  }
  const jitter = (frame % 3) - 1;
  const big = font * 3.4;
  label(ctx, "READY", w / 2 - 3 + jitter, h / 2, big, "#44ccff");
  label(ctx, "READY", w / 2 + 3 - jitter, h / 2, big, "#ff4422");
  label(ctx, "READY", w / 2, h / 2, big, "#f5c842");
  label(ctx, sign, w / 2, h / 2 + big * 0.9, font * 1.1, "#ffffff");
  ctx.globalAlpha = 1;
}
