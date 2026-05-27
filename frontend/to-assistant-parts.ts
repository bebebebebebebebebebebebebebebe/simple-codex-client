import type {
  ChatModelRunResult,
  MessageStatus,
  ThreadAssistantMessagePart,
} from "@assistant-ui/react";
import {
  CODEX_PART_TOOL_NAMES,
  CODEX_REASONING_PREFIXES,
} from "./codex-part-names";
import type { CodexTurnState, ToolState } from "./codex-turn-state";

const createMessageStatus = (state: CodexTurnState): MessageStatus => {
  const error =
    state.error === undefined
      ? undefined
      : state.error instanceof Error
        ? state.error.message
        : String(state.error);

  if (state.status === "running") return { type: "running" };
  if (state.status === "completed") {
    return { type: "complete", reason: "stop" };
  }
  if (state.status === "interrupted") {
    return { type: "incomplete", reason: "cancelled", error };
  }
  return { type: "incomplete", reason: "error", error };
};

const toToolResult = (tool: ToolState): unknown => {
  if (tool.result !== undefined) return tool.result;
  if (tool.output) return tool.output;
  if (tool.error !== undefined) return tool.error;
  return undefined;
};

const toToolPart = (tool: ToolState): ThreadAssistantMessagePart => {
  const result = toToolResult(tool);

  return {
    type: "tool-call",
    toolCallId: tool.itemId,
    toolName: tool.toolName,
    args: {},
    argsText: tool.argsText ?? "",
    ...(result !== undefined ? { result } : {}),
    ...(tool.error !== undefined || tool.status === "incomplete"
      ? { isError: true }
      : {}),
  } as ThreadAssistantMessagePart;
};

/**
 * Codex turn 表示状態から assistant-ui が受け取る run result を作る。
 *
 * @param state - reducer 済みの Codex turn 表示状態。
 * @returns assistant-ui の `ChatModelAdapter.run` が yield できる結果。
 */
export function toAssistantRunResult(
  state: CodexTurnState,
): ChatModelRunResult {
  const content: ThreadAssistantMessagePart[] = [];

  if (state.planText) {
    content.push({
      type: "tool-call",
      toolCallId: "turn-plan",
      toolName: CODEX_PART_TOOL_NAMES.plan,
      args: {},
      argsText: "",
      result: state.planText,
    } as ThreadAssistantMessagePart);
  }

  for (const reasoning of Object.values(state.reasoningItems)) {
    const text = reasoning.summaries.filter(Boolean).join("\n\n");
    if (text) {
      content.push({
        type: "reasoning",
        text: `${CODEX_REASONING_PREFIXES.reasoningSummary}${text}`,
      });
    }
  }

  if (state.commentaryText) {
    content.push({
      type: "reasoning",
      text: `${CODEX_REASONING_PREFIXES.commentary}${state.commentaryText}`,
    });
  }

  for (const tool of Object.values(state.toolItems)) {
    content.push(toToolPart(tool));
  }

  if (state.diffText) {
    content.push({
      type: "tool-call",
      toolCallId: "turn-diff",
      toolName: CODEX_PART_TOOL_NAMES.diff,
      args: {},
      argsText: "",
      result: state.diffText,
    } as ThreadAssistantMessagePart);
  }

  if (state.finalText) {
    content.push({
      type: "text",
      text: state.finalText,
    });
  }

  return {
    content,
    status: createMessageStatus(state),
  };
}
