// The task's documents, for the knowledge agent: named by the developer or read by Bob.
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { StoreState } from "./store.js";
import type { Push } from "./mcp.js";

export const DOC_BUDGET = 30_000;

const DOC_EXTENSIONS = /\.(md|markdown|txt|rst|adoc)$/i;
const DOC_NAMES = /(spec|readme|requirement|design)/i;

/** A file worth checking assumptions against: prose, not code. */
export function isDocPath(path: string): boolean {
  return DOC_EXTENSIONS.test(path) || (DOC_NAMES.test(path.split("/").at(-1) ?? "") && !/\.(m?[jt]sx?|py|go|java|rb|rs|css|json)$/i.test(path));
}

/** Bob's read_file result numbers each line ("12 | text"); this gives back the file's text. */
export function fileText(toolResponse: string): string {
  const lines = toolResponse.split("\n");
  const numbered = lines.filter((l) => /^\s*\d+ \| /.test(l));
  return numbered.length > 0 ? numbered.map((l) => l.replace(/^\s*\d+ \| /, "")).join("\n") : toolResponse;
}

/** Keeps a document for this task within the character budget. Returns false when it adds nothing. */
export function addDoc(store: StoreState, path: string, text: string, source: "named" | "bob", push: Push): boolean {
  if (!text.trim() || store.docs.has(path)) return false;
  const used = [...store.docs.values()].reduce((n, t) => n + t.length, 0);
  const room = DOC_BUDGET - used;
  if (room <= 0) return false;
  store.docs.set(path, text.slice(0, room));
  push({ type: "doc", path, source });
  return true;
}

/** Reads the documents the developer named, refusing anything outside the workspace. */
export function loadNamedDocs(store: StoreState, cwd: string | undefined, paths: unknown, push: Push): string[] {
  if (!cwd || !Array.isArray(paths)) return [];
  const loaded: string[] = [];
  for (const p of paths) {
    if (typeof p !== "string" || !p.trim()) continue;
    const full = resolve(cwd, p.trim());
    const inside = relative(cwd, full);
    if (inside.startsWith("..") || isAbsolute(inside)) continue;
    try {
      if (addDoc(store, inside, readFileSync(full, "utf8"), "named", push)) loaded.push(inside);
    } catch {
      // a missing file is skipped; Bob is told which documents were loaded
    }
  }
  return loaded;
}

/** Text compared the way a reader would: case, spacing, Markdown and curly quotes do not matter. */
export function normText(s: string): string {
  return s.toLowerCase().replace(/[*_`#>]/g, "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[\s-]+/g, " ").trim();
}

/** True when `quote` appears in `text`, ignoring spacing and case: the proof a spec check is not made up. */
export function quoteAppears(text: string, quote: string): boolean {
  const q = normText(quote);
  return q.length >= 15 && normText(text).includes(q);
}

const STOPWORDS = new Set(["the", "and", "for", "with", "that", "this", "are", "was", "has", "its", "per", "not", "any", "all", "but", "from", "into", "when", "then", "than", "only", "also", "always", "which"]);

/** The meaningful words of a claim, singular, for telling whether two claims say the same thing. */
export function claimWords(s: string): Set<string> {
  return new Set(
    normText(s).split(/[^a-z0-9.]+/).map((w) => w.replace(/\.+$/, "").replace(/s$/, "")).filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

/** True when most of `claim`'s words are already in one of `answered`: the point was already settled. */
export function alreadySettled(claim: string, answered: Iterable<string>, share = 0.6): boolean {
  const words = claimWords(claim);
  if (words.size === 0) return false;
  for (const other of answered) {
    const theirs = claimWords(other);
    let common = 0;
    for (const w of words) if (theirs.has(w)) common++;
    if (common / words.size >= share) return true;
  }
  return false;
}
