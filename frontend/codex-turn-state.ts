import type { ApprovalUiStatus, ApprovalUiType } from "../codex/ui-events";

/**
 * Codex reasoning item の表示状態。
 */
export type ReasoningState = {
  itemId: string;
  summaries: string[];
  status: "running" | "complete" | "incomplete";
};

/**
 * Codex tool item の表示状態。
 */
export type ToolState = {
  itemId: string;
  toolType: string;
  toolName: string;
  args?: unknown;
  argsText?: string;
  output: string;
  result?: unknown;
  error?: unknown;
  status: "running" | "complete" | "incomplete" | "requires-action";
};

/**
 * Codex approval request の表示状態。
 */
export type ApprovalState = {
  approvalRequestId: string;
  approvalType: ApprovalUiType;
  threadId: string;
  turnId: string;
  itemId: string;
  requestMethod: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  grantRoot?: string | null;
  networkApprovalContext?: unknown;
  availableDecisions?: string[];
  requestedAtMs?: number;
  status: ApprovalUiStatus;
};

/**
 * 1 turn 分の Codex UI event を assistant-ui parts へ変換するための中間状態。
 */
export type CodexTurnState = {
  turnId?: string;
  status: "running" | "completed" | "failed" | "interrupted";
  finalText: string;
  commentaryText: string;
  reasoningItems: Record<string, ReasoningState>;
  toolItems: Record<string, ToolState>;
  approvalItems: Record<string, ApprovalState>;
  planText: string;
  diffText?: string;
  error?: unknown;
};

/**
 * 新しい Codex turn を表示するための初期状態を作る。
 *
 * @returns 空の turn 表示状態。
 */
export function createInitialCodexTurnState(): CodexTurnState {
  return {
    status: "running",
    finalText: "",
    commentaryText: "",
    reasoningItems: {},
    toolItems: {},
    approvalItems: {},
    planText: "",
  };
}
