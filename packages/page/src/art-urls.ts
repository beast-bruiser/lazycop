// Where the page's art comes from. This is the one file to edit when the images move to a CDN.
//
// For each slot the page tries, in order:
//   1. the URL set here (leave "" to skip it),
//   2. the local file packages/page/assets/<slot>.png (ignored by git, kept as the fallback),
//   3. the built-in pixel art drawn in code.
//
// The CDN must answer with CORS (`Access-Control-Allow-Origin: *`, or the page's origin
// http://127.0.0.1:4747): the page recolours soldiers per agent, which browsers only allow for
// CORS images. Without it, the slot falls back to the local file.
//
// After editing: `npm run build`, then reload the page. Specs and prompts: packages/page/assets/README.md.

export const ART_URLS = {
  /** Top-down jungle terrain, 1152 × 1408 (36 × 44 tiles); roads, places and soldiers are drawn on top. */
  map: "",
  /** Soldier sheet: 3 frames side by side facing right (standing, walk A, walk B), transparent, grey armour. */
  soldier: "",
  /** Full-body soldier for the unit profile and the side-scroller, transparent, grey armour. */
  unit: "",
  /** Face for the unit profile and the HUD, square. */
  portrait: "",
};

/** An image slot the page draws. Adding a slot above is all it takes to register it. */
export type AssetName = keyof typeof ART_URLS;
