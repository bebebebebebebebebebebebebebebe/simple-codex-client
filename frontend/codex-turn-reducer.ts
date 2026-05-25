import type { CodexUiEvent } from "../codex/ui-events";
import type { CodexTurnState, ReasoningState, ToolState } from "./codex-turn-state";

const PLAN_STATUS_MARKER = {
  pending: "[ ]",
  inProgress: "[>]",
  completed: "[x]",
} as const;

const createReasoningState = (itemId: string): ReasoningState => ({
  itemId,
  summaries: [],
  status: "running",
});

const createToolState = (
  itemId: string,
  toolType = "unknown",
  toolName = "tool",
): ToolState => ({
  itemId,
  toolType,
  toolName,
  output: "",
  status: "running",
});

/**
 * tool argument を ToolFallback が表示しやすい文字列へ変換する。
 *
 * @param value - Codex tool item に含まれる argument。
 * @returns 表示用に整形した文字列。値がない場合は undefined。
 */
export function stringifyToolArgs(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Codex UI event を turn 表示状態へ反映する。
 *
 * @param state - 現在の turn 表示状態。
 * @param event - SSE から受け取った Codex UI event。
 * @returns event を反映した新しい turn 表示状態。
 */
export function applyCodexUiEvent(
  state: CodexTurnState,
  event: CodexUiEvent,
): CodexTurnState {
  switch (event.type) {
    case "turn.started":
      return {
        ...state,
        turnId: event.turnId,
        status: "running",
      };

    case "message.delta":
      if (event.phase === "commentary") {
        return {
          ...state,
          turnId: state.turnId ?? event.turnId,
          commentaryText: state.commentaryText + event.text,
        };
      }

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        finalText: state.finalText + event.text,
      };

    case "reasoning.part": {
      const current =
        state.reasoningItems[event.itemId] ??
        createReasoningState(event.itemId);
      const summaries = [...current.summaries];
      summaries[event.summaryIndex] ??= "";

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        reasoningItems: {
          ...state.reasoningItems,
          [event.itemId]: {
            ...current,
            summaries,
          },
        },
      };
    }

    case "reasoning.delta": {
      const current =
        state.reasoningItems[event.itemId] ??
        createReasoningState(event.itemId);
      const summaries = [...current.summaries];
      summaries[event.summaryIndex] =
        (summaries[event.summaryIndex] ?? "") + event.text;

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        reasoningItems: {
          ...state.reasoningItems,
          [event.itemId]: {
            ...current,
            summaries,
            status: "running",
          },
        },
      };
    }

    case "plan.updated": {
      const planText = [
        event.explanation,
        ...event.plan.map((step) => {
          return `${PLAN_STATUS_MARKER[step.status]} ${step.step}`;
        }),
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        planText,
      };
    }

    case "tool.started":
      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        toolItems: {
          ...state.toolItems,
          [event.itemId]: {
            ...createToolState(event.itemId, event.toolType, event.name),
            args: event.args,
            argsText: stringifyToolArgs(event.args),
          },
        },
      };

    case "tool.output.delta": {
      const current =
        state.toolItems[event.itemId] ?? createToolState(event.itemId);

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        toolItems: {
          ...state.toolItems,
          [event.itemId]: {
            ...current,
            output: current.output + event.text,
          },
        },
      };
    }

    case "tool.completed": {
      const current =
        state.toolItems[event.itemId] ??
        createToolState(event.itemId, event.toolType ?? "unknown", event.toolType);

      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        toolItems: {
          ...state.toolItems,
          [event.itemId]: {
            ...current,
            toolType: event.toolType ?? current.toolType,
            result: event.result ?? current.output,
            error: event.error,
            status:
              event.status === "completed"
                ? "complete"
                : event.status === "requires-action"
                  ? "requires-action"
                  : "incomplete",
          },
        },
      };
    }

    case "diff.updated":
      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        diffText: event.diff,
      };

    case "turn.completed":
      return {
        ...state,
        turnId: state.turnId ?? event.turnId,
        status:
          event.status === "completed"
            ? "completed"
            : event.status === "failed"
              ? "failed"
              : "interrupted",
        error: event.error,
      };

    case "error":
      return {
        ...state,
        status: "failed",
        finalText: state.finalText || event.message,
        error: event.details ?? event.message,
      };
  }
}
