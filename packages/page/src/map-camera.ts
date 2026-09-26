// The camera over the tactical map: the panel shows about VIEW_W × VIEW_H tiles around the focused agent.
import { MAP_H, MAP_W } from "./map-model.js";
import { TILE } from "./map-art.js";

const VIEW_W = 20;
const VIEW_H = 26;
/** How fast the camera catches up with its target, per second. */
const FOLLOW = 4;

/** Where the camera looks, in tiles. */
const cam = { x: MAP_W / 2, y: MAP_H / 2, placed: false };

/** Eases the camera toward a point; the first call jumps straight there. */
export function follow(x: number, y: number, dt: number): void {
  const k = cam.placed ? 1 - Math.exp(-dt * FOLLOW) : 1;
  cam.x += (x - cam.x) * k;
  cam.y += (y - cam.y) * k;
  cam.placed = true;
}

export interface View {
  /** Screen pixels per logical pixel. */
  px: number;
  /** Screen position of the map's top-left corner. */
  ox: number;
  oy: number;
}

/** The camera's view for a canvas of this size, kept inside the map's edges. */
export function viewOf(width: number, height: number): View {
  // A big screen zooms in until the map covers it, rather than showing it small in a dark frame.
  const fit = Math.min(width / (VIEW_W * TILE), height / (VIEW_H * TILE));
  const px = Math.max(fit, width / (MAP_W * TILE), height / (MAP_H * TILE));
  const tile = TILE * px;
  const clamp = (centre: number, screen: number, size: number) =>
    size * tile <= screen ? (screen - size * tile) / 2 : Math.min(0, Math.max(screen - size * tile, screen / 2 - centre * tile));
  return { px, ox: clamp(cam.x, width, MAP_W), oy: clamp(cam.y, height, MAP_H) };
}

/** Screen position of a point in tiles. */
export const toScreen = (v: View, tx: number, ty: number) => [v.ox + tx * TILE * v.px, v.oy + ty * TILE * v.px] as const;
