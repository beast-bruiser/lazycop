import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENTRY = ".lazycop/";
const LISTED = new Set([".lazycop", ".lazycop/", "/.lazycop", "/.lazycop/"]);

/** Adds .lazycop/ to the workspace .gitignore when it is a git repo and the entry is missing.
 *  Only appends: every existing line stays as it was. Returns whether it wrote. */
export function ignoreRecords(workspace: string): boolean {
  const path = join(workspace, ".gitignore");
  const exists = existsSync(path);
  if (!exists && !existsSync(join(workspace, ".git"))) return false;
  const text = exists ? readFileSync(path, "utf8") : "";
  if (text.split(/\r?\n/).some((line) => LISTED.has(line.trim()))) return false;
  const lead = text === "" || text.endsWith("\n") ? "" : "\n";
  appendFileSync(path, `${lead}# LazyCop's per-task records\n${ENTRY}\n`);
  return true;
}
