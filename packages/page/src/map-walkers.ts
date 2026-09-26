// One walker per agent: where its soldier stands on the map, the road still ahead, and its arrival effect.
import type { TrailStop } from "./view.js";
import type { Soldier } from "./map-model.js";
import { SLOTS, route } from "./map-model.js";

const TILES_PER_SECOND = 6;
export const FX_MS = 900;

export interface Walker {
  soldier: Soldier;
  /** Position in tiles. */
  x: number;
  y: number;
  facing: number;
  /** Where the walk ends; `path` is the queue of slot centres still to walk. */
  slot: number;
  path: { x: number; y: number }[];
  arrival: TrailStop["kind"] | null;
  fx: { kind: TrailStop["kind"]; start: number } | null;
  moving: boolean;
}

export const centre = (slot: number) => ({ x: SLOTS[slot]!.x + 0.5, y: SLOTS[slot]!.y + 0.5 });

const walkers = new Map<string, Walker>();
/** Whether the last update came from a connected page; the first snapshot after connecting is not walked. */
let wasConnected = false;

/** Matches the walkers to the squad: new soldiers stand at their place, known ones walk to their new one. */
export function syncWalkers(soldiers: Soldier[], connected: boolean): Walker[] {
  for (const id of walkers.keys()) if (!soldiers.some((s) => s.id === id)) walkers.delete(id);
  for (const s of soldiers) {
    const w = walkers.get(s.id);
    if (!w || !wasConnected || s.steps < w.soldier.steps) {
      // Page load, reconnect, a new agent or a new task: stand at the place without replaying the walk.
      walkers.set(s.id, { soldier: s, ...centre(s.at), facing: 1, slot: s.at, path: [], arrival: null, fx: null, moving: false });
      continue;
    }
    if (s.steps > w.soldier.steps) {
      w.path.push(...route(w.slot, s.at).slice(1).map(centre));
      w.slot = s.at;
      w.arrival = s.last?.kind ?? null;
    }
    w.soldier = s;
  }
  wasConnected = connected;
  return [...walkers.values()];
}

/** Moves every walker one frame along its road; an arrival starts its effect. */
export function stepWalkers(dt: number, now: number): void {
  for (const w of walkers.values()) {
    const target = w.path[0];
    w.moving = !!target;
    if (w.fx && now - w.fx.start > FX_MS) w.fx = null;
    if (!target) {
      if (w.arrival) { w.fx = { kind: w.arrival, start: now }; w.arrival = null; }
      continue;
    }
    const dx = target.x - w.x, dy = target.y - w.y;
    const dist = Math.hypot(dx, dy), stride = TILES_PER_SECOND * dt;
    if (Math.abs(dx) > 0.01) w.facing = Math.sign(dx);
    if (dist <= stride) { w.x = target.x; w.y = target.y; w.path.shift(); }
    else { w.x += (dx / dist) * stride; w.y += (dy / dist) * stride; }
  }
}
