/**
 * Codex の plan step を Web UI で表示するときの状態。
 */
export type PlanStepStatus = "pending" | "inProgress" | "completed";

/**
 * Codex の tool item を Web UI で表示するときの状態。
 */
export type ToolUiStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "declined"
  | "requires-action"
  | "unknown";

/**
 * Codex の approval request を Web UI で表示するときの種別。
 */
export type ApprovalUiType = "commandExecution" | "fileChange" | "network";

/**
 * Codex の approval request を Web UI で表示するときの状態。
 */
export type ApprovalUiStatus =
  | "requires-action"
  | "submitting"
  | "accepted"
  | "accepted-for-session"
  | "declined"
  | "cancelled"
  | "expired"
  | "failed";

/**
 * Web UI から送信できる approval decision。
 */
export type ApprovalUiDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

/**
 * Codex App Server の notification を Web UI 表示用に正規化したイベント。
 *
 * SSE の `event:` 名と `data.type` の両方でこの `type` を使う。
 */
export type CodexUiEvent =
  | {
      type: "turn.started";
      threadId?: string;
      turnId: string;
    }
  | {
      type: "message.delta";
      threadId?: string;
      turnId: string;
      itemId: string;
      text: string;
      phase?: "commentary" | "final_answer";
    }
  | {
      type: "reasoning.delta";
      threadId?: string;
      turnId: string;
      itemId: string;
      summaryIndex: number;
      text: string;
    }
  | {
      type: "reasoning.part";
      threadId?: string;
      turnId: string;
      itemId: string;
      summaryIndex: number;
    }
  | {
      type: "plan.updated";
      threadId?: string;
      turnId: string;
      explanation?: string;
      plan: Array<{
        step: string;
        status: PlanStepStatus;
      }>;
    }
  | {
      type: "tool.started";
      threadId?: string;
      turnId?: string;
      itemId: string;
      toolType:
        | "commandExecution"
        | "fileChange"
        | "mcpToolCall"
        | "dynamicToolCall"
        | "webSearch"
        | "imageView"
        | "unknown";
      name: string;
      args?: unknown;
      cwd?: string;
    }
  | {
      type: "tool.output.delta";
      threadId?: string;
      turnId: string;
      itemId: string;
      text: string;
      stream?: "stdout" | "stderr" | "unknown";
    }
  | {
      type: "tool.completed";
      threadId?: string;
      turnId?: string;
      itemId: string;
      toolType?: string;
      status: ToolUiStatus;
      result?: unknown;
      error?: unknown;
      exitCode?: number;
      durationMs?: number;
    }
  | {
      type: "diff.updated";
      threadId?: string;
      turnId: string;
      diff: string;
    }
  | {
      type: "approval.requested";
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
      unsupportedDecisionOptions?: string[];
      requestedAtMs?: number;
      status: ApprovalUiStatus;
    }
  | {
      type: "approval.resolved";
      approvalRequestId: string;
      threadId?: string;
      turnId?: string;
      itemId?: string;
      decision: ApprovalUiDecision;
      status: ApprovalUiStatus;
      resolvedAtMs: number;
      error?: string;
    }
  | {
      type: "turn.completed";
      threadId?: string;
      turnId: string;
      status: "completed" | "interrupted" | "failed";
      error?: unknown;
    }
  | {
      type: "error";
      message: string;
      details?: unknown;
    };
