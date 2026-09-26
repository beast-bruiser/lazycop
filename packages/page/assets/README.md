# Tactical map art

Each image slot comes from, in order: its CDN URL in `packages/page/src/art-urls.ts`, the
local file here, then the built-in pixel art. After setting a URL, run `npm run build` and reload.
The CDN must send CORS headers (the page recolours soldiers), or the local file is used.

Local PNGs here are ignored by git and act as the fallback. The server serves only kebab-case
`.png` files from this folder.

| File | Size | What it is |
|---|---|---|
| `map.png` | 1152 × 1408 (36 × 44 tiles of 32 px) | Top-down terrain only. The page draws roads, bunkers, labels, flags and soldiers on top |
| `soldier.png` | 3 frames side by side, e.g. 96 × 32 | Soldier facing right: standing, walk A, walk B. Transparent background |
| `unit.png` | e.g. 192 × 256 | Full-body soldier for the unit profile. Transparent background |
| `portrait.png` | e.g. 128 × 128 | Face for the unit profile and HUD |

**Names must match exactly** (`soldier.png`, `portrait.png`): any other name is simply not loaded.

**Transparency must be real.** Image models often paint a grey-and-white checkerboard instead of
leaving the background transparent; the soldier then carries that box across the map. Check the
alpha channel, or cut the background out. The originals behind the current files are in
`source/`, which the server never serves.

**Armour must be neutral steel grey.** The page recolours grey pixels into each agent's colour
(BOB-1 red, BOB-2 blue, BOB-3 green…), keeping their shading. Skin, dark gun metal and coloured
details stay as drawn.

**Keep it original.** No Contra names, logos or characters (Bill Rizer, Lance Bean): the page
ships publicly with the LazyCop submission.

## The map layout the page expects

Places stand at fixed spots, so the terrain should leave them on open jungle ground:

- dense jungle over most of the map;
- a mountain range in the **top-right** (roughly the right 45 %, top 30 %);
- a rocky ridge in the **bottom-right corner**;
- a lake on the **right edge, just above the middle**;
- sea along the **bottom-left corner**, cut diagonally.

## Prompts

Use them with any image model; generate at the size above or larger, then crop or resize.

### map.png

> Top-down 16-bit pixel art game map of a tropical jungle, SNES era style, seen straight from
> above, portrait orientation 36:44. Dense layered jungle canopy in deep greens with dithered
> shading; a range of brown rocky mountains with sharp ridges and light snow-free peaks in the
> top-right area; a small rocky ridge in the bottom-right corner; a blue lake with a sandy rim on
> the right edge just above the middle; ocean with foam waves along the bottom-left corner, cut
> diagonally. Faint blue tactical grid overlay. No roads, no buildings, no text, no characters,
> no UI. Crisp pixels, limited palette, high detail.

### soldier.png

> 16-bit pixel art sprite sheet, 3 frames in one row, each 32×32, transparent background: an
> original futuristic soldier in bulky neutral steel-grey armour with a dark visor helmet and a
> large dark-metal rifle, side view facing right. Frame 1 standing, frames 2 and 3 a walking
> cycle. SNES run-and-gun style, strong black outline, 3-tone shading, no text.

### unit.png

> 16-bit pixel art full-body character portrait on transparent background: an original
> futuristic soldier in bulky neutral steel-grey plated armour, short blond hair, determined
> expression, holding a large dark-metal rifle across the body, three-quarter view. SNES era
> run-and-gun style, strong outline, rich shading, no text, no logo.

### portrait.png

> 16-bit pixel art face portrait, 128×128, of the same original soldier: square jaw, short
> blond hair, gritty determined look, steel-grey armour collar, dark blue background. SNES
> era dialogue-portrait style, no text.
