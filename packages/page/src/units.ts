// How each agent looks: agent n wears the nth armour colour. Original pixel art; the names are LazyCop's own.
import type { Palette } from "./map-art.js";
import { SOLDIER, soldierPalette, spriteUrl } from "./map-art.js";
import { asset, tinted } from "./map-assets.js";

/** Armour and leg colours, one pair per agent, repeating after six. */
const ARMOUR: [string, string][] = [
  ["#b8321e", "#7a2214"], ["#2c5bd0", "#1c3a88"], ["#2f9a3c", "#1d6326"],
  ["#d49a1a", "#8a6310"], ["#8a3cc4", "#5a2388"], ["#d0602a", "#8a3c18"],
];

export const WEAPON = "DECLARE STEP";
export const ABILITY = "HOLD THE LINE";

const armour = (n: number) => ARMOUR[(Math.max(1, n) - 1) % ARMOUR.length]!;
export const agentColor = (n: number) => armour(n)[0];
export const agentPalette = (n: number): Palette => soldierPalette(...armour(n));
export const callSign = (n: number) => `BOB-${n}`;

const cache = new Map<string, string>();
const cached = (key: string, make: () => string) => cache.get(key) ?? (cache.set(key, make()), cache.get(key)!);

/** Painted art scales smoothly; the built-in sprites keep hard pixel edges. */
export const imgClass = (name: "unit" | "portrait") => (asset(name) ? "art" : "pixel");

/** Full-body image as a URL: assets/unit.png in the agent's colour if present, else the built-in sprite. */
export const unitSprite = (n: number) => asset("unit")
  ? cached(`unit-${n}`, () => tinted("unit", agentColor(n))!.toDataURL())
  : cached(`body-${n}`, () => spriteUrl(SOLDIER[0]!, agentPalette(n), 8));
/** Head and shoulders, for portraits: assets/portrait.png if present, else the built-in sprite. */
export const unitPortrait = (n: number) => asset("portrait")
  ? asset("portrait")!.src
  : cached(`head-${n}`, () => spriteUrl(SOLDIER[0]!.slice(0, 7), agentPalette(n), 6));
