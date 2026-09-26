// Optional art: a map background, a soldier sheet, the unit's full body and portrait.
// Each slot comes from its CDN URL (art-urls.ts), else the local file, else the built-in pixel art.
import type { AssetName } from "./art-urls.js";
import { ART_URLS } from "./art-urls.js";

export type { AssetName };

const images = new Map<AssetName, HTMLImageElement>();
const listeners: (() => void)[] = [];

/** Calls `fn` whenever an image finishes loading, so the map and the screens can repaint with it. */
export const onAssetsChanged = (fn: () => void) => { listeners.push(fn); };

/** Where a slot's image is looked for, in order: its CDN URL if set, then the local file. */
export function artSources(name: AssetName, urls: Record<AssetName, string> = ART_URLS): string[] {
  const cdn = urls[name].trim();
  return [...(cdn ? [cdn] : []), `/assets/${name}.png`];
}

/** Tries each source in turn; when all fail, the slot keeps the built-in art. */
function load(name: AssetName, sources: string[]): void {
  const [src, ...rest] = sources;
  if (!src) return;
  const img = new Image();
  // Recolouring reads the pixels back, which a browser allows only for CORS images.
  if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
  img.onload = () => { images.set(name, img); listeners.forEach((fn) => fn()); };
  img.onerror = () => {
    if (rest.length) console.warn(`LazyCop: could not load ${name} art from ${src} (missing, or no CORS); trying ${rest[0]}`);
    load(name, rest);
  };
  img.src = src;
}

export function loadAssets(): void {
  for (const name of Object.keys(ART_URLS) as AssetName[]) load(name, artSources(name));
}

export const asset = (name: AssetName): HTMLImageElement | undefined => images.get(name);

const tints = new Map<string, HTMLCanvasElement>();

/**
 * The image with its neutral grey parts (the armour) recoloured to `color`, keeping their shading.
 * Skin, weapons in dark metal and saturated details keep their own colours.
 */
export function tinted(name: AssetName, color: string): HTMLCanvasElement | undefined {
  const img = images.get(name);
  if (!img) return undefined;
  const key = `${name}:${color}`;
  const hit = tints.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [tr, tg, tb] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const light = (max + min) / 510, sat = max === 0 ? 0 : (max - min) / max;
    if (px[i + 3]! < 16 || sat > 0.18 || light < 0.3) continue;
    // Mid greys map to the full colour, highlights toward white, shadows toward black.
    const shade = light * 2;
    const lift = Math.max(0, shade - 1) * 255;
    px[i] = Math.min(255, tr! * Math.min(1, shade) + lift);
    px[i + 1] = Math.min(255, tg! * Math.min(1, shade) + lift);
    px[i + 2] = Math.min(255, tb! * Math.min(1, shade) + lift);
  }
  ctx.putImageData(data, 0, 0);
  tints.set(key, canvas);
  return canvas;
}
