import { describe, expect, test } from "bun:test";
import { createInitialCodexTurnState } from "./codex-turn-state";
import { markCodexTurnInterrupted } from "./codex-turn-interrupt";

describe("markCodexTurnInterrupted", () => {
  test("marks a state without a known turn id as interrupted", () => {
    const state = markCodexTurnInterrupted(createInitialCodexTurnState());

    expect(state.status).toBe("interrupted");
  });

  test("preserves the known turn id when marking a turn interrupted", () => {
    const state = markCodexTurnInterrupted({
      ...createInitialCodexTurnState(),
      turnId: "turn_456",
    });

    expect(state).toMatchObject({
      turnId: "turn_456",
      status: "interrupted",
    });
  });
});
