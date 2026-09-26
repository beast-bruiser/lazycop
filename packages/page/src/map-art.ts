// Original pixel art for the tactical map: sprites as character grids, and a terrain painted once per map.
import { MAP_H, MAP_W, ROADS, SLOTS } from "./map-model.js";

/** Logical pixels per map tile; the canvas scales them up without smoothing. */
export const TILE = 8;

export type Sprite = readonly string[];
export type Palette = Record<string, string>;

const TOP: Sprite = [
  "....HHHH....",
  "...HHHHHH...",
  "...HHVVVV...",
  "...SSSSSS...",
  "....SSSS....",
  "..AAAAAAA...",
  ".AAAAAAAGGGG",
  ".AAAAAAAGGG.",
  ".SAAAAAA....",
  "..AAAAAA....",
  "..BBBBBB....",
];
/** Soldier facing right: standing, then two walking frames. */
export const SOLDIER: readonly Sprite[] = [
  [...TOP, "..LLL.LLL...", "..LL...LL...", "..LL...LL...", "..KK...KK...", ".KKK..KKK..."],
  [...TOP, "...LLLLL....", "..LL..LL....", ".LL....LL...", ".KK....KK...", "KKK...KKK..."],
  [...TOP, "...LLLL.....", "...LLLL.....", "...LL.LL....", "...KK.KK....", "..KKKKKK...."],
];
export const soldierPalette = (armor: string, legs: string): Palette => ({
  H: "#3d4a2a", V: "#5fe0ff", S: "#e0a070", A: armor, G: "#9aa0a8", B: "#6b4a22", L: legs, K: "#15151a",
});

/** An assumption Bob has not had confirmed: a bug-bot. */
export const BUG: Sprite = [
  "..R....R..",
  "...R..R...",
  "..MMMMMM..",
  ".MMWMMWMM.",
  ".MMMMMMMM.",
  "MMMMMMMMMM",
  "M.MMMMMM.M",
  "..M.MM.M..",
  ".M..M..M..",
];
export const bugPalette = (active: boolean): Palette => ({ R: "#ff4422", M: active ? "#d0306a" : "#7a4aa0", W: "#ffffff" });

export const BUNKER: Sprite = [
  "..DDDDDD..",
  ".DDDDDDDD.",
  "DDSSSSSSDD",
  "DD.OOOO.DD",
  "DDDDDDDDDD",
];
export const bunkerPalette = (edited: boolean): Palette => ({ D: "#5a6068", S: edited ? "#f5c842" : "#8a9098", O: "#101014" });

export const HELIPAD: Sprite = [
  "YYYYYYYYYY",
  "Y........Y",
  "Y.WW..WW.Y",
  "Y.WWWWWW.Y",
  "Y.WW..WW.Y",
  "Y........Y",
  "YYYYYYYYYY",
];
export const helipadPalette: Palette = { Y: "#f5c842", W: "#e8e8e8", ".": "#3a3f45" };

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, palette: Palette, x: number, y: number, px: number, flip = false): void {
  const w = sprite[0]!.length;
  sprite.forEach((row, j) => {
    for (let i = 0; i < w; i++) {
      const color = palette[row[i]!];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x + (flip ? w - 1 - i : i) * px), Math.round(y + j * px), Math.ceil(px), Math.ceil(px));
    }
  });
}

/** A sprite as an image URL, for <img> tags outside the map (the unit profile, the side-scroller). */
export function spriteUrl(sprite: Sprite, palette: Palette, px = 4): string {
  const canvas = document.createElement("canvas");
  canvas.width = sprite[0]!.length * px;
  canvas.height = sprite.length * px;
  drawSprite(canvas.getContext("2d")!, sprite, palette, 0, 0, px);
  return canvas.toDataURL();
}

// ── Terrain ─────────────────────────────────────────────────
/** Deterministic noise in [0, 1) for a tile, so the map looks the same on every load. */
const noise = (x: number, y: number, seed = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
};

type Ground = "jungle" | "rock" | "water";

function groundAt(x: number, y: number): Ground {
  const near = SLOTS.some((s) => Math.abs(s.x - x) <= 1 && Math.abs(s.y - y) <= 1);
  if (near) return "jungle";
  if (x + (MAP_H - y) * 0.9 < 12 + noise(x, y, 1) * 2) return "water"; // coast, bottom-left
  if ((x - 32) ** 2 + ((y - 21) * 1.3) ** 2 < 16 + noise(x, y, 2) * 6) return "water"; // lake, right
  if (x > 20 && y < 14 && noise(x, y, 3) > 0.25) return "rock"; // mountains, top-right
  if (x > 30 && y > 32 && noise(x, y, 4) > 0.4) return "rock"; // ridge, bottom-right
  return "jungle";
}

const GROUND_COLORS: Record<Ground, string[]> = {
  jungle: ["#1e3a12", "#244416", "#2c5019", "#1a3310"],
  rock: ["#6b4a2e", "#7d5836", "#8f6a42", "#553a24"],
  water: ["#1d4f8f", "#235aa0", "#1a4680", "#2a66b0"],
};

/** Paints the whole terrain, roads and grid at TILE pixels per tile; a background image replaces the drawn ground. */
export function paintTerrain(background?: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  // An image gets four canvas pixels per logical pixel, so its detail survives.
  const scale = background ? 4 : 1;
  canvas.width = MAP_W * TILE * scale;
  canvas.height = MAP_H * TILE * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  if (background) ctx.drawImage(background, 0, 0, MAP_W * TILE, MAP_H * TILE);
  else paintGround(ctx);
  for (const [a, b] of ROADS) paintRoad(ctx, SLOTS[a]!, SLOTS[b]!);
  // A background image brings its own tactical grid.
  if (background) return canvas;
  ctx.fillStyle = "rgba(120, 180, 255, 0.10)";
  for (let x = 0; x <= MAP_W; x++) ctx.fillRect(x * TILE, 0, 1, MAP_H * TILE);
  for (let y = 0; y <= MAP_H; y++) ctx.fillRect(0, y * TILE, MAP_W * TILE, 1);
  return canvas;
}

function paintGround(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const colors = GROUND_COLORS[groundAt(x, y)];
      // Four dithered quarters per tile give the ground texture.
      for (let q = 0; q < 4; q++) {
        ctx.fillStyle = colors[Math.floor(noise(x * 2 + (q % 2), y * 2 + (q >> 1)) * colors.length)]!;
        ctx.fillRect(x * TILE + (q % 2) * (TILE / 2), y * TILE + (q >> 1) * (TILE / 2), TILE / 2, TILE / 2);
      }
      if (groundAt(x, y) === "jungle" && noise(x, y, 5) > 0.72) paintTree(ctx, x * TILE, y * TILE);
      if (groundAt(x, y) === "rock" && noise(x, y, 6) > 0.6) paintPeak(ctx, x * TILE, y * TILE);
    }
  }
}

function paintTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#0f2a0a";
  ctx.fillRect(x + 1, y + 1, 6, 5);
  ctx.fillStyle = "#3f7a22";
  ctx.fillRect(x + 2, y + 1, 3, 2);
  ctx.fillStyle = "#4a3018";
  ctx.fillRect(x + 3, y + 6, 2, 2);
}

function paintPeak(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = r === 0 ? "#e8dcc0" : "#4a3220";
    ctx.fillRect(x + 4 - r, y + 1 + r * 2 - 1, r * 2 + 1, 2);
  }
}

/** A dirt road: two-pixel steps along the line between slot centres, with a dark rim. */
function paintRoad(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const ax = (a.x + 0.5) * TILE, ay = (a.y + 0.5) * TILE, bx = (b.x + 0.5) * TILE, by = (b.y + 0.5) * TILE;
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 2);
  for (const [color, size] of [["#3a2814", 6], ["#a07a4a", 4]] as const) {
    ctx.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      ctx.fillRect(Math.round(ax + (bx - ax) * t - size / 2), Math.round(ay + (by - ay) * t - size / 2), size, size);
    }
  }
}
