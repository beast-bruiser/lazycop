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
  map: "https://ucarecdn.com/bb281164-cc5e-4e91-93d9-ee4733642da9/map.png",
  /** Soldier sheet: 3 frames side by side facing right (standing, walk A, walk B), transparent, grey armour. */
  soldier: "https://ucarecdn.com/7e903dc7-917f-4d6d-b70d-84f0997fc86b/soldier.png",
  /** Full-body soldier for the unit profile and the side-scroller, transparent, grey armour. */
  unit: "https://ucarecdn.com/131631e6-ad3e-4302-9f64-5353060cfd6e/unit.png",
  /** Face for the unit profile and the HUD, square. */
  portrait: "https://ucarecdn.com/28c3b2bd-132f-42b4-b12b-46d89d7775ca/portrait.png",
};

/** An image slot the page draws. Adding a slot above is all it takes to register it. */
export type AssetName = keyof typeof ART_URLS;
