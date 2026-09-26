// The live tactical map. One canvas lives for the whole page: renders move it into the screen's
// .map-host instead of rebuilding it, so each agent's soldier can walk between places frame by frame.
import type { SquadView } from "./squad-view.js";
import type { SquadMap } from "./map-model.js";
import { MAP_H, MAP_W, SLOTS, buildSquadMap, route } from "./map-model.js";
import type { Walker } from "./map-walkers.js";
import { centre, stepWalkers, syncWalkers } from "./map-walkers.js";
import { BUG, BUNKER, HELIPAD, SOLDIER, TILE, bugPalette, bunkerPalette, drawSprite, helipadPalette, paintTerrain } from "./map-art.js";
import type { View } from "./map-camera.js";
import { follow, toScreen, viewOf } from "./map-camera.js";
import { drawBattleInset, drawBrackets, drawFlag, drawFx, drawRoute, drawThinking, label, ring } from "./map-draw.js";
import { drawEffects, updateEffects } from "./map-effects.js";
import { asset, loadAssets, onAssetsChanged, tinted } from "./map-assets.js";
import { agentColor, agentPalette, callSign } from "./units.js";

const canvas = document.createElement("canvas");
canvas.className = "tactical-canvas";
let terrain: HTMLCanvasElement | null = null;
let squad: SquadView | null = null;
let model: SquadMap | null = null;
let walkers: Walker[] = [];
let focus: string | undefined;
let pick: (agent: string) => void = () => {};
/** Where each soldier was drawn last frame, in tiles, for clicks. */
let shown: { w: Walker; x: number; y: number }[] = [];
let view: View = { px: 1, ox: 0, oy: 0 };
let last = 0;

/** Puts the map canvas into the host element the latest render created. */
export function attachMap(host: HTMLElement | null): void {
  if (host && canvas.parentElement !== host) host.appendChild(canvas);
}

/** Calls `fn` with the agent whose soldier the developer clicked. */
export const onPickAgent = (fn: (agent: string) => void) => { pick = fn; };

export function updateMap(next: SquadView, focused: string | undefined): void {
  squad = next;
  focus = focused;
  model = buildSquadMap(next.agents, focused);
  walkers = syncWalkers(model.soldiers, next.connected);
  updateEffects(next, performance.now());
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  if (!canvas.isConnected || !model) return;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  terrain ??= paintTerrain(asset("map"));
  stepWalkers(dt, now);
  // The camera follows the focused agent's soldier, or looks at the drop zone before anyone starts.
  const lead = walkers.find((x) => x.soldier.id === focus) ?? walkers[0] ?? centre(0);
  follow(lead.x, lead.y, dt);
  view = viewOf(w, h);
  draw(canvas.getContext("2d")!, model, now, dpr);
}

function draw(ctx: CanvasRenderingContext2D, m: SquadMap, now: number, dpr: number): void {
  const { px } = view;
  const at = (tx: number, ty: number) => toScreen(view, tx, ty);
  ctx.fillStyle = "#05070a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Painted art is scaled smoothly; the built-in pixel art keeps its hard edges.
  ctx.imageSmoothingEnabled = !!asset("map");
  ctx.drawImage(terrain!, view.ox, view.oy, MAP_W * TILE * px, MAP_H * TILE * px);
  ctx.imageSmoothingEnabled = false;

  // Route lines under everything else, the focused agent's brightest.
  for (const s of m.soldiers) {
    const hops = s.route.flatMap((slot, i) => (i ? route(s.route[i - 1]!, slot).slice(1) : [slot]));
    drawRoute(ctx, hops.map((slot) => at(centre(slot).x, centre(slot).y)), agentColor(s.n), px, s.id === focus ? 0.9 : 0.35);
  }

  const font = Math.max(7 * dpr, Math.round(3.4 * px));
  SLOTS.forEach((_, slot) => {
    const place = m.places.find((p) => p.slot === slot);
    const [cx, cy] = at(centre(slot).x, centre(slot).y);
    if (!place) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath(); ctx.arc(cx, cy, TILE * px * 1.4, 0, Math.PI * 2); ctx.fill();
      label(ctx, "?", cx, cy + font / 2, font, "#667788");
      return;
    }
    if (slot === 0) drawSprite(ctx, HELIPAD, helipadPalette, cx - 5 * px, cy - 3.5 * px, px);
    else drawSprite(ctx, BUNKER, bunkerPalette(place.edits > 0), cx - 5 * px, cy - 2.5 * px, px);
    label(ctx, place.label, cx, cy + 7 * px + font, font, "#e8e8e8");
    if (place.edits) label(ctx, `EDITED x${place.edits}`, cx, cy + 7 * px + font * 2.3, font * 0.8, "#f5c842");
  });
  m.flags.forEach((f, i) => {
    const [cx, cy] = at(centre(f.slot).x, centre(f.slot).y);
    drawFlag(ctx, cx - (8 + (i % 3) * 3) * px, cy + 2 * px, agentColor(f.n), px, now);
  });

  const perSlot = new Map<number, number>();
  let locked: { x: number; y: number; n: number } | null = null;
  for (const e of m.enemies) {
    const k = perSlot.get(e.slot) ?? 0;
    perSlot.set(e.slot, k + 1);
    const [cx, cy] = at(centre(e.slot).x, centre(e.slot).y);
    const x = cx + (6 + k * 6) * px, y = cy - 12 * px + (e.active ? Math.sin(now / 150) * px : 0);
    drawSprite(ctx, BUG, bugPalette(e.active), x, y, px * 0.9);
    ctx.fillStyle = agentColor(e.n);
    ctx.fillRect(x + 3 * px, y + 10 * px, 3 * px, px);
    if (e.active) locked = { x: x + 4.5 * px, y: y + 4 * px, n: e.n };
  }

  // Soldiers standing at the same place stand side by side; the focused one is drawn last, on top.
  const standing = new Map<number, Walker[]>();
  for (const w of walkers) if (!w.moving) standing.set(w.slot, [...(standing.get(w.slot) ?? []), w]);
  shown = [...walkers].sort((a, b) => Number(a.soldier.id === focus) - Number(b.soldier.id === focus)).map((w) => {
    const group = w.moving ? [w] : standing.get(w.slot)!;
    return { w, x: w.x + (group.indexOf(w) - (group.length - 1) / 2) * 1.6, y: w.y };
  });
  for (const { w, x, y } of shown) drawSoldier(ctx, w, ...at(x, y), px, font, now);

  if (locked) {
    drawBrackets(ctx, locked.x, locked.y, 8 * px, px, now);
    const insetX = Math.min(canvas.width - 46 * px, Math.max(2 * px, locked.x - 22 * px));
    const sheet = tinted("soldier", agentColor(locked.n));
    const hero = sheet ? (x: number, y: number) => drawFrame(ctx, sheet, 0, x, y, 20 * px, false) : agentPalette(locked.n);
    drawBattleInset(ctx, insetX, Math.max(2 * px, locked.y - 44 * px), hero, px, now);
  }
  const focused = squad?.agents.find((a) => a.id === focus);
  drawEffects(ctx, canvas.width, canvas.height, px, font, now, focused?.view, focused?.n ?? 1);
}

function drawSoldier(ctx: CanvasRenderingContext2D, w: Walker, sx: number, sy: number, px: number, font: number, now: number): void {
  const s = w.soldier;
  ctx.globalAlpha = s.watching ? 1 : 0.45;
  if (s.id === focus) ring(ctx, sx, sy, (5 + Math.sin(now / 200)) * px, "#ff4422", px);
  const frameIndex = w.moving ? 1 + (Math.floor(now / 140) % 2) : 0;
  const sheet = tinted("soldier", agentColor(s.n));
  if (sheet) {
    // Painted art: a ground shadow and a light halo keep the soldier readable on a busy map.
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath(); ctx.ellipse(sx, sy + 2 * px, 7 * px, 2 * px, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
    ctx.shadowBlur = 2.5 * px;
    drawFrame(ctx, sheet, frameIndex, sx, sy + 2 * px, 22 * px, w.facing < 0);
    ctx.restore();
  } else {
    drawSprite(ctx, SOLDIER[frameIndex]!, agentPalette(s.n), sx - 6 * px, sy - 14 * px, px, w.facing < 0);
  }
  const tag = s.hold ? `${callSign(s.n)} HOLD` : s.watching ? callSign(s.n) : `${callSign(s.n)} DONE`;
  const top = sy - (sheet ? 22 : 18) * px;
  label(ctx, tag, sx, top, font * 0.8, s.hold ? "#ff8800" : agentColor(s.n));
  ctx.globalAlpha = 1;
  // Working between events: show it is alive rather than a still figure.
  if (s.watching && !s.hold && !w.moving && !w.fx) drawThinking(ctx, sx, sy, top - font, px, now, agentColor(s.n));
  if (w.fx) drawFx(ctx, w.fx, now, sx, sy, px);
}

/** One frame of a soldier sheet (three frames side by side, facing right), feet at (x, y). */
function drawFrame(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource & { width: number; height: number }, frame: number, x: number, y: number, height: number, flip: boolean): void {
  const fw = sheet.width / 3, fh = sheet.height, dw = (fw / fh) * height;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.translate(x, 0);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, frame * fw, 0, fw, fh, -dw / 2, y - height, dw, height);
  ctx.restore();
}

/** Pointer position in canvas pixels. */
function pointer(e: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * canvas.width, ((e.clientY - r.top) / r.height) * canvas.height];
}

const near = ([ax, ay]: readonly [number, number], [bx, by]: readonly [number, number], r: number) => Math.hypot(ax - bx, ay - by) < r;

// Hovering a place names its folder and what the squad did there.
canvas.addEventListener("mousemove", (e) => {
  if (!model) return;
  const p = pointer(e);
  const hit = model.places.find((pl) => near(toScreen(view, centre(pl.slot).x, centre(pl.slot).y), p, TILE * view.px * 1.5));
  canvas.title = !hit ? "" : hit.slot === 0 ? `Drop zone — shell commands (${hit.visits})` : `${hit.key}: ${hit.visits} visits, ${hit.edits} edits`;
});

// Clicking a soldier focuses its agent.
canvas.addEventListener("click", (e) => {
  const [tx, ty] = pointer(e);
  const hit = shown.find((s) => near(toScreen(view, s.x, s.y), [tx, ty + 6 * view.px], 9 * view.px));
  if (hit) pick(hit.w.soldier.id);
});

onAssetsChanged(() => { terrain = null; });
loadAssets();
requestAnimationFrame(frame);
