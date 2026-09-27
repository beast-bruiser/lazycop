// The tactical map, folded from the view: which repo folders are places, where Bob stands, where the enemies wait.
// No DOM here, so it is testable. map-canvas.ts draws it.
import type { TrailStop, ViewState } from "./view.js";
import { currentCard } from "./view.js";

/** Map size in tiles: larger than the panel, which shows it through a camera. */
export const MAP_W = 36;
export const MAP_H = 44;

/** Where places can stand, in tiles. Slot 0 is the drop zone; the last slot takes every folder past the others. */
export const SLOTS: readonly { x: number; y: number }[] = [
  { x: 6, y: 5 }, { x: 6, y: 15 }, { x: 15, y: 10 }, { x: 12, y: 22 },
  { x: 22, y: 18 }, { x: 29, y: 7 }, { x: 18, y: 30 }, { x: 29, y: 28 },
  { x: 8, y: 33 }, { x: 26, y: 38 }, { x: 14, y: 40 }, { x: 32, y: 41 },
];
export const DROP_ZONE = 0;
export const UNCHARTED = SLOTS.length - 1;

/** Dirt roads between slots. Every slot is reachable from the drop zone. */
export const ROADS: readonly [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [2, 5], [4, 5], [3, 6], [4, 7], [6, 7],
  [6, 8], [3, 8], [7, 9], [6, 10], [9, 10], [9, 11], [7, 11],
];

export interface Place {
  slot: number;
  /** Folder key, e.g. "packages/page", or "(root)" for files at the top of the repo. */
  key: string;
  label: string;
  visits: number;
  edits: number;
}

export interface Enemy {
  card: string;
  slot: number;
  /** The card the developer should answer now. */
  active: boolean;
}

export interface MapModel {
  /** One per revealed slot; the drop zone is always revealed. */
  places: Place[];
  /** The slot Bob stands at. */
  at: number;
  /** How far Bob has gone; it grows by one per trail stop. */
  steps: number;
  last: TrailStop | null;
  enemies: Enemy[];
}

/** One agent's soldier on the squad map. */
export interface Soldier {
  id: string;
  n: number;
  at: number;
  steps: number;
  last: TrailStop | null;
  /** false once the agent's task ended. */
  watching: boolean;
  hold: boolean;
  /** The last places it went, oldest first, ending where it stands: its route line. */
  route: number[];
}

/** Where an agent declared a step. */
export interface Flag {
  slot: number;
  n: number;
}

export interface SquadMap {
  places: Place[];
  soldiers: Soldier[];
  /** Every agent's unanswered cards; `active` marks the one the focused agent waits on. */
  enemies: (Enemy & { n: number })[];
  flags: Flag[];
}

/** How many places a route line remembers. */
const ROUTE_LENGTH = 8;

export interface AgentTrail {
  id: string;
  n: number;
  view: ViewState;
}

/** Folders that only group packages: a path under one is keyed by two segments, e.g. "packages/page". */
const GROUPS = ["packages", "apps", "libs", "services", "modules", "crates"];

/** The folder a path belongs to; `dir` says the path is itself a folder (a search or a listing). */
export function placeKey(path: string, dir = false): string {
  const parts = path.replace(/^\.\//, "").split("/").filter((p) => p && p !== ".");
  const folders = dir ? parts.length : parts.length - 1;
  if (folders < 1) return "(root)";
  return GROUPS.includes(parts[0]!) && folders >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]!;
}

/** A folder's own spot, picked from its name so it stands in the same place from one task to the next. */
export function homeSlot(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return 1 + ((h >>> 0) % (UNCHARTED - 1));
}

/** The home spot, or the next free one when another folder holds it; uncharted once every spot is taken. */
function freeSlot(key: string, taken: Set<number>): number {
  for (let i = 0; i < UNCHARTED - 1; i++) {
    const slot = 1 + ((homeSlot(key) - 1 + i) % (UNCHARTED - 1));
    if (!taken.has(slot)) return slot;
  }
  return UNCHARTED;
}

const labelOf = (key: string) => (key === "(root)" ? "REPO ROOT" : key.split("/").at(-1)!.toUpperCase().slice(0, 12));

/** One agent alone: the map as it was before squads. */
export function buildMap(view: ViewState): MapModel {
  const map = buildSquadMap([{ id: "solo", n: 1, view }], "solo");
  const { at, steps, last } = map.soldiers[0]!;
  return { places: map.places, at, steps, last, enemies: map.enemies.map(({ card, slot, active }) => ({ card, slot, active })) };
}

/** The squad on one map: places are shared, each folder at its own spot (see homeSlot). */
export function buildSquadMap(agents: AgentTrail[], focus: string | undefined): SquadMap {
  const places: Place[] = [{ slot: DROP_ZONE, key: "", label: "DROP ZONE", visits: 0, edits: 0 }];
  const slotOfKey = new Map<string, number>();
  // Each agent's slot after each of its trail stops, so a card can stand where its agent was when it arrived.
  const slotAfter = agents.map(() => [] as number[]);
  const stops = agents
    .flatMap((a, i) => a.view.trail.map((stop) => ({ stop, i })))
    .sort((x, y) => (x.stop.at < y.stop.at ? -1 : x.stop.at > y.stop.at ? 1 : 0));

  for (const { stop, i } of stops) {
    const key = stop.path === null ? "" : placeKey(stop.path, stop.kind === "search");
    const slot = stop.path === null ? DROP_ZONE : slotOfKey.get(key) ?? freeSlot(key, new Set(slotOfKey.values()));
    if (stop.path !== null) slotOfKey.set(key, slot);
    let place = places.find((p) => p.slot === slot);
    if (!place) places.push((place = { slot, key, label: labelOf(key), visits: 0, edits: 0 }));
    else if (slot === UNCHARTED && place.key !== key) Object.assign(place, { key: "(more)", label: "UNCHARTED" });
    place.visits++;
    if (stop.kind === "edit") place.edits++;
    slotAfter[i]!.push(slot);
  }

  const soldiers = agents.map((a, i) => ({
    id: a.id, n: a.n, at: slotAfter[i]!.at(-1) ?? DROP_ZONE, steps: a.view.trail.length,
    last: a.view.trail.at(-1) ?? null, watching: !a.view.ended, hold: a.view.hold,
    route: [DROP_ZONE, ...slotAfter[i]!].filter((slot, j, all) => slot !== all[j - 1]).slice(-ROUTE_LENGTH),
  }));
  // A step stands where its agent was when declaring it: after its last trail stop up to that moment.
  const flags = agents.flatMap((a, i) =>
    a.view.feed.filter((f) => f.kind === "step").map((f) => {
      const before = a.view.trail.filter((t) => t.at <= f.at).length;
      return { slot: slotAfter[i]![before - 1] ?? DROP_ZONE, n: a.n };
    }),
  ).filter((f, j, all) => all.findIndex((g) => g.slot === f.slot && g.n === f.n) === j);
  // An ended task's open cards were cancelled with it: no enemies stay behind.
  const enemies = agents.flatMap((a, i) => {
    if (a.view.ended) return [];
    const now = a.id === focus ? currentCard(a.view) : undefined;
    return a.view.cards
      .filter((c) => !c.answer)
      .map((c) => ({ card: c.card.id, slot: slotAfter[i]![c.trailAt - 1] ?? DROP_ZONE, active: c === now, n: a.n }));
  });
  return { places, soldiers, enemies, flags };
}

/** The slots Bob walks through from one slot to another along the roads, both ends included. */
export function route(from: number, to: number): number[] {
  const prev = new Map<number, number>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift()!;
    if (here === to) break;
    for (const [a, b] of ROADS) {
      const next = a === here ? b : b === here ? a : -1;
      if (next >= 0 && !prev.has(next)) { prev.set(next, here); queue.push(next); }
    }
  }
  if (!prev.has(to)) return [from, to];
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return path;
}
