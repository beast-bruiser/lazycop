// The skills a soldier can learn: every Bob skill defined in the watched repo's .bob/skills.
// Read once when a session starts, never from a hook (invariant 1).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillInfo } from "@lazycops/contracts";

/** One frontmatter field: `key: value` on its own line, quotes dropped. */
function field(front: string, key: string): string {
  const line = front.split("\n").find((l) => l.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, "$2") : "";
}

function readSkill(dir: string): SkillInfo | null {
  let text: string;
  try {
    text = readFileSync(join(dir, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (!front) return null;
  const name = field(front, "name");
  return name ? { name, description: field(front, "description") } : null;
}

/** Every skill under <cwd>/.bob/skills, by name; an unreadable folder gives none. */
export function definedSkills(cwd: string | undefined): SkillInfo[] {
  if (!cwd) return [];
  const root = join(cwd, ".bob", "skills");
  let dirs: string[];
  try {
    dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  return dirs
    .map((d) => readSkill(join(root, d)))
    .filter((s): s is SkillInfo => s !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}
