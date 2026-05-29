import { applyCodexUiEvent } from "./codex-turn-reducer";
import type { CodexTurnState } from "./codex-turn-state";

/**
 * SSE の最終 event を読めない abort 経路でも UI 上の run status を中断へ寄せる。
 *
 * @param state - 現在までに復元できている Codex turn state。
 * @returns 中断済みとして扱う次の Codex turn state。
 */
export function markCodexTurnInterrupted(
  state: CodexTurnState,
): CodexTurnState {
  if (state.status === "interrupted") return state;

  if (state.turnId) {
    return applyCodexUiEvent(state, {
      type: "turn.completed",
      turnId: state.turnId,
      status: "interrupted",
    });
  }

  return {
    ...state,
    status: "interrupted",
  };
}
