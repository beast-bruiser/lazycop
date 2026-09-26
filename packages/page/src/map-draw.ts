// Drawing helpers for the tactical map: text, rings, arrival effects, flags, route lines and the target lock.
// Sizes are in logical pixels times `px`, the screen pixels per logical pixel.
import type { TrailStop } from "./view.js";
import type { Palette } from "./map-art.js";
import { BUG, SOLDIER, bugPalette, drawSprite } from "./map-art.js";
import { FX_MS } from "./map-walkers.js";

type Ctx = CanvasRenderingContext2D;

export function ring(ctx: Ctx, x: number, y: number, r: number, color: string, px: number): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, px);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}

export function label(ctx: Ctx, text: string, x: number, y: number, size: number, color: string): void {
  ctx.font = `${Math.round(size)}px 'Press Start 2P', monospace`;
  ctx.textAlign = "center";
  ctx.lineWidth = Math.max(2, size / 3);
  ctx.strokeStyle = "#000";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Read: a scan ring. Search: radar pings. Edit and command: sparks. */
export function drawFx(ctx: Ctx, f: { kind: TrailStop["kind"]; start: number }, now: number, x: number, y: number, px: number): void {
  const t = (now - f.start) / FX_MS;
  if (t >= 1) return;
  ctx.globalAlpha = 1 - t;
  if (f.kind === "read") ring(ctx, x, y - 6 * px, (4 + t * 10) * px, "#44ccff", px);
  if (f.kind === "search") [0, 0.35].forEach((d) => t > d && ring(ctx, x, y, (t - d) * 22 * px, "#44cc44", px));
  if (f.kind === "edit" || f.kind === "command") {
    const colors = f.kind === "edit" ? ["#ffdd44", "#ff8800"] : ["#ff4422", "#ffdd44"];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = (3 + t * 9) * px;
      ctx.fillStyle = colors[i % 2]!;
      ctx.fillRect(x + Math.cos(a) * r - px, y - 6 * px + Math.sin(a) * r - px, 2 * px, 2 * px);
    }
  }
  ctx.globalAlpha = 1;
}

/** A working soldier between moves: a radar ping at its feet and a "…" bubble over its head. */
export function drawThinking(ctx: Ctx, x: number, y: number, top: number, px: number, now: number, color: string): void {
  const t = (now % 1600) / 1600;
  ctx.globalAlpha = 0.6 * (1 - t);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, px);
  ctx.beginPath(); ctx.ellipse(x, y + 2 * px, (3 + t * 9) * px, (1 + t * 3) * px, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
  const bw = 11 * px, bh = 5 * px, bx = x + 3 * px, by = top - bh;
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillRect(bx + px, by + bh, px, px);
  ctx.fillStyle = "#0a0a0f";
  const lit = Math.floor(now / 300) % 4;
  for (let i = 0; i < 3; i++) {
    const lift = i === lit ? px : 0;
    ctx.fillRect(bx + (2 + i * 3) * px, by + 2 * px - lift, 2 * px, px + lift / 2);
  }
}

/** A checkpoint flag in the agent's colour, planted with its pole at (x, y). */
export function drawFlag(ctx: Ctx, x: number, y: number, color: string, px: number, now: number): void {
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(x - 0.5 * px, y - 11 * px, px, 11 * px);
  const wave = Math.floor(now / 250) % 2;
  ctx.fillStyle = color;
  ctx.fillRect(x + 0.5 * px, y - 11 * px, 5 * px, 3 * px);
  ctx.fillRect(x + 0.5 * px, y - 8 * px, (4 + wave) * px, px);
}

/** A thick route line through screen points, dark-rimmed like the reference's red path. */
export function drawRoute(ctx: Ctx, points: (readonly [number, number])[], color: string, px: number, alpha: number): void {
  if (points.length < 2) return;
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [stroke, width] of [["#000", 4], [color, 2]] as const) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width * px;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Green corner brackets closing in on a target, as the reference locks onto an enemy. */
export function drawBrackets(ctx: Ctx, x: number, y: number, size: number, px: number, now: number): void {
  const s = size * (1 + 0.15 * Math.abs(Math.sin(now / 300))), arm = s * 0.35;
  ctx.strokeStyle = "#44ff66";
  ctx.lineWidth = 1.5 * px;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const cx = x + dx * s, cy = y + dy * s;
    ctx.beginPath();
    ctx.moveTo(cx - dx * arm, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - dy * arm);
    ctx.stroke();
  }
}

/**
 * A small side-scroller window: the agent's soldier firing on the bug-bot it must get past.
 * `soldier` is its built-in palette, or a function drawing painted art with its feet at (x, y).
 */
export function drawBattleInset(ctx: Ctx, x: number, y: number, soldier: Palette | ((fx: number, fy: number) => void), px: number, now: number): void {
  const w = 44 * px, h = 26 * px;
  ctx.fillStyle = "#0b1a2e";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#1f4a14";
  ctx.fillRect(x, y + h - 9 * px, w, 3 * px);
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(x, y + h - 6 * px, w, 6 * px);
  if (typeof soldier === "function") soldier(x + 10 * px, y + h - 6 * px);
  else drawSprite(ctx, SOLDIER[0]!, soldier, x + 3 * px, y + h - 22 * px, px);
  drawSprite(ctx, BUG, bugPalette(true), x + w - 14 * px, y + h - 18 * px + Math.sin(now / 150) * px, px);
  if (Math.floor(now / 120) % 2) {
    ctx.fillStyle = "#ffdd44";
    for (let i = 0; i < 3; i++) ctx.fillRect(x + (16 + ((now / 20 + i * 8) % 18)) * px, y + h - 15 * px, 2 * px, px);
  }
  ctx.strokeStyle = "#8fb4d8";
  ctx.lineWidth = px;
  ctx.strokeRect(x, y, w, h);
}
