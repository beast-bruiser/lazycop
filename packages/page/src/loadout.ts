// A soldier's loadout, folded from Bob's own hook events: tools are weapons, skills are learned,
// subagents are the soldier's squadmates. No DOM here, so it is testable. Every number is a count
// of real hook events; nothing is estimated.
import type { HookPayload, SkillInfo } from "@lazycops/contracts";
import { COMMAND_TOOLS, EDIT_TOOLS, READ_TOOLS, SEARCH_TOOLS } from "./view.js";

export type WeaponClass = "recon" | "search" | "edit" | "command" | "radio";

export interface Weapon {
  cls: WeaponClass;
  name: string;
  icon: string;
  /** What the weapon is, in Bob's terms. */
  what: string;
}

export const WEAPONS: Weapon[] = [
  { cls: "recon", name: "SCOPE", icon: "🔭", what: "reads files" },
  { cls: "search", name: "RADAR", icon: "📡", what: "searches and lists files" },
  { cls: "edit", name: "RIFLE", icon: "🔫", what: "edits files" },
  { cls: "command", name: "EXPLOSIVES", icon: "💣", what: "runs commands" },
  { cls: "radio", name: "RADIO", icon: "📻", what: "talks to you through LazyCop" },
];

/** One Bob subagent, from its spawn_subagent call. */
export interface SubagentView {
  /** The spawn_subagent call's tool_use_id. */
  id: string;
  /** Bob's preset, e.g. "explore"; "general" when Bob named none. */
  preset: string;
  task: string;
  running: boolean;
  /** false when it ended without a result: Bob fires no PostToolUse for a failed call. */
  returned: boolean;
  /** Tool calls made while it was the only subagent running. */
  calls: number;
}

export interface Loadout {
  /** Tool calls the soldier made itself, by weapon; calls made while a subagent ran are not counted here. */
  shots: Record<WeaponClass, number>;
  /** Skills defined in the watched repo, from the session start. */
  defined: SkillInfo[];
  /** Skills Bob loaded with use_skill since the last compaction, in order. */
  learned: string[];
  /** The mode Bob last switched to; null until Bob switches. */
  mode: string | null;
  subagents: SubagentView[];
  /** Tool calls made while several subagents ran at once: Bob does not say which one made them. */
  sharedCalls: number;
}

export const emptyLoadout = (defined: SkillInfo[] = []): Loadout => ({
  shots: { recon: 0, search: 0, edit: 0, command: 0, radio: 0 },
  defined, learned: [], mode: null, subagents: [], sharedCalls: 0,
});

const OWN_TOOL = "mcp__lazycop__";

function weaponOf(tool: string): WeaponClass | null {
  if (tool.startsWith(OWN_TOOL)) return "radio";
  if (EDIT_TOOLS.includes(tool)) return "edit";
  if (READ_TOOLS.includes(tool)) return "recon";
  if (SEARCH_TOOLS.includes(tool) || tool === "grep") return "search";
  return COMMAND_TOOLS.includes(tool) ? "command" : null;
}

function arg(input: unknown, key: string): string | undefined {
  const v = input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Credits one finished tool call: to the soldier, to the one running subagent, or to the running group. */
function credit(l: Loadout, cls: WeaponClass): Loadout {
  const running = l.subagents.filter((s) => s.running);
  if (running.length === 0) return { ...l, shots: { ...l.shots, [cls]: l.shots[cls] + 1 } };
  if (running.length > 1) return { ...l, sharedCalls: l.sharedCalls + 1 };
  return { ...l, subagents: l.subagents.map((s) => (s === running[0] ? { ...s, calls: s.calls + 1 } : s)) };
}

/** Folds one hook event into the loadout; returns the same object when nothing changed. */
export function foldLoadout(l: Loadout, p: HookPayload): Loadout {
  if (p.hook_event_name === "PostCompact") return l.learned.length ? { ...l, learned: [] } : l;
  if (p.hook_event_name === "PreToolUse" && p.tool_name === "spawn_subagent") {
    const sub = { id: p.tool_use_id, preset: arg(p.tool_input, "name") ?? "general", task: arg(p.tool_input, "description") ?? "", running: true, returned: false, calls: 0 };
    return { ...l, subagents: [...l.subagents, sub] };
  }
  // The chat's turn is over, so every subagent has ended; one still open failed.
  if (p.hook_event_name === "Stop") {
    return l.subagents.some((s) => s.running) ? { ...l, subagents: l.subagents.map((s) => ({ ...s, running: false })) } : l;
  }
  // PostToolUse fires only for a call that succeeded (Bob 2.2.0).
  if (p.hook_event_name !== "PostToolUse") return l;
  switch (p.tool_name) {
    case "spawn_subagent":
      return { ...l, subagents: l.subagents.map((s) => (s.id === p.tool_use_id ? { ...s, running: false, returned: true } : s)) };
    case "use_skill": {
      const skill = arg(p.tool_input, "skill_name");
      return skill && !l.learned.includes(skill) ? { ...l, learned: [...l.learned, skill] } : l;
    }
    case "switch_mode": {
      const mode = arg(p.tool_input, "mode_id");
      return mode ? { ...l, mode } : l;
    }
  }
  const cls = weaponOf(p.tool_name);
  return cls ? credit(l, cls) : l;
}

/** Skills Bob has not loaded since the last compaction, among those the repo defines. */
export const lockedSkills = (l: Loadout): SkillInfo[] => l.defined.filter((s) => !l.learned.includes(s.name));
