import { describe, it, expect } from "vitest";
import type { CardRecord } from "@lazycops/contracts";
import { renderBattleOverlays } from "../battle-overlays.js";
import { ui } from "../page-state.js";
import { emptyView } from "../view.js";

const card = (id: string, source = "declare_step"): CardRecord => ({
  kind: "card", id, type: "assumption", question: `Question ${id}`, claim: "c", source, options: [{ id: "bob", text: "c" }],
});
const show = (...cards: CardRecord[]) => {
  ui.view = { ...emptyView(), connected: true, task: "t", cards: cards.map((c) => ({ card: c, thread: [], trailAt: 0, at: "2026-09-27T12:00:00.000Z" })) };
  return renderBattleOverlays();
};

describe("battle dialog", () => {
  it("plays its entrance once per card, not on every redraw", () => {
    ui.shownCard = null;
    expect(show(card("k-1"))).not.toContain('class="settled"');
    expect(show(card("k-1"))).toContain('class="settled"');   // same card, redrawn by another event
    expect(show(card("k-2"))).not.toContain('class="settled"'); // a new card animates again
  });

  it("names where the card came from", () => {
    expect(show(card("k-3"))).toContain("ENEMY INTEL — CONFIRM OR CHALLENGE");
    expect(show(card("k-4", "spec"))).toContain("SPEC CHECK — CONFIRM OR CHALLENGE");
    expect(show(card("k-5", "end_session"))).toContain("FINAL REVIEW — CONFIRM OR CHALLENGE");
  });
});
