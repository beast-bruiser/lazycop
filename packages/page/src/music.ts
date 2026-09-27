// Background music: one looping track per screen, crossfaded when the screen changes.
// Follows the same mute toggle as the sound effects; songs are listed in music-urls.ts.
import { getCtx, muted } from "./audio.js";
import { MUSIC_FADE, MUSIC_URLS, MUSIC_VOLUME, type TrackName } from "./music-urls.js";

const buffers = new Map<TrackName, Promise<AudioBuffer | null>>();
let playing: { name: TrackName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
let wanted: TrackName | null = null;

/** Fetches and decodes a track once; a missing or unreadable file leaves that screen silent. */
function load(c: AudioContext, name: TrackName): Promise<AudioBuffer | null> {
  let buf = buffers.get(name);
  if (!buf) {
    const url = MUSIC_URLS[name].trim();
    buf = !url ? Promise.resolve(null) : fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => c.decodeAudioData(data))
      .catch((err: unknown) => {
        console.warn(`LazyCop: could not load ${name} music from ${url}:`, err);
        buffers.delete(name); // try again on the next render, e.g. once the server is back
        return null;
      });
    buffers.set(name, buf);
  }
  return buf;
}

function fadeOut(c: AudioContext): void {
  if (!playing) return;
  const { source, gain } = playing;
  gain.gain.cancelScheduledValues(c.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
  gain.gain.linearRampToValueAtTime(0, c.currentTime + MUSIC_FADE);
  source.stop(c.currentTime + MUSIC_FADE);
  playing = null;
}

async function start(c: AudioContext, name: TrackName): Promise<void> {
  const buffer = await load(c, name);
  // The screen may have changed, or sound been muted, while the track was loading.
  if (!buffer || wanted !== name || playing?.name === name || muted()) return;
  fadeOut(c);
  const source = c.createBufferSource();
  const gain = c.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  gain.connect(c.destination);
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(MUSIC_VOLUME, c.currentTime + MUSIC_FADE);
  source.start();
  playing = { name, source, gain };
}

/** Plays the track for the current screen; call on every render — it only acts on a change. */
export function syncMusic(name: TrackName): void {
  wanted = name;
  const c = getCtx();
  if (!c) {
    // Muted: stop at once rather than fade, so the toggle feels immediate.
    playing?.source.stop();
    playing = null;
    return;
  }
  if (playing?.name !== name) void start(c, name);
}
