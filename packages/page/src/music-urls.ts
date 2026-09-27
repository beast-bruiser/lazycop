// Where the page's music comes from. This is the one file to edit to change or move the songs.
//
// Each track is a URL the page fetches: a path the LazyCop server serves (local files live in
// packages/page/assets/audio/, served at /assets/audio/<name>.mp3 — kebab-case names only),
// or a full CDN URL (it must answer with CORS). Leave "" to play nothing for that screen.
//
// After editing: `npm run build`, then reload the page.

export const MUSIC_URLS = {
  /** Briefing screen — waiting for a task, preparing the squad. */
  preparation: "/assets/audio/preparation.mp3",
  /** Mission screen — Bob is working and cards are firing. */
  action: "/assets/audio/action.mp3",
};

/** Music loudness, 0–1. Kept under the sound effects so the card beeps still cut through. */
export const MUSIC_VOLUME = 0.35;

/** Seconds one track takes to fade into the next. */
export const MUSIC_FADE = 1.2;

export type TrackName = keyof typeof MUSIC_URLS;
