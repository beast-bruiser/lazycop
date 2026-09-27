// Synthesised game sounds — Web Audio API, no files needed.
// Sound is off by default (per spec) and respects the mute toggle.
let ctx: AudioContext | null = null;

/** The shared audio context, or null while muted. Music and sound effects both play through it. */
export function getCtx(): AudioContext | null {
  if (muted()) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const MUTE_KEY = "lazycop-mute";
export const muted = () => localStorage.getItem(MUTE_KEY) !== "0";
export function toggleMute(): void {
  localStorage.setItem(MUTE_KEY, muted() ? "0" : "1");
}

function beep(freq: number, dur: number, type: OscillatorType = "square", gain = 0.25): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.start();
  osc.stop(c.currentTime + dur);
}

/** A card arrives — "ENEMY INTEL" question fired at the developer. */
export function sfxQuestion(): void {
  beep(660, 0.08, "square", 0.3);
  setTimeout(() => beep(880, 0.12, "square", 0.25), 80);
}

/** Developer agrees with Bob — "FIRE & AGREE". */
export function sfxAgree(): void {
  beep(880, 0.06, "sine", 0.3);
}

/** Developer challenges Bob — correction shot back. */
export function sfxChallenge(): void {
  beep(440, 0.07, "sawtooth", 0.3);
  setTimeout(() => beep(330, 0.12, "sawtooth", 0.25), 70);
}

/** Bob edits a file — tile claimed on the map. */
export function sfxEdit(): void {
  beep(1046, 0.04, "sine", 0.2);
}

/** Mission complete. */
export function sfxMissionClear(): void {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.12, "sine", 0.35), i * 90));
}
