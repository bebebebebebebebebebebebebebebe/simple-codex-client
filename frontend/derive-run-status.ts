import type {
  ApprovalState,
  CodexTurnState,
  ToolState,
} from "./codex-turn-state";

/**
 * assistant message 上部に表示する Codex turn の状態種別。
 */
export type RunStatusKind =
  | "running"
  | "planning"
  | "tool-running"
  | "waiting-approval"
  | "submitting-approval"
  | "diff-ready"
  | "finalizing"
  | "completed"
  | "failed"
  | "interrupted";

/**
 * RunStatusBar の視覚的な重要度。
 */
export type RunStatusSeverity =
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "muted";

/**
 * Codex turn の現在状態を UI 表示へ渡すための view model。
 */
export type RunStatusViewModel = {
  kind: RunStatusKind;
  label: string;
  description?: string;
  severity: RunStatusSeverity;
  active: boolean;
};

const getErrorMessage = (error: unknown): string | undefined => {
  if (error === undefined || error === null) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const findApprovalByStatus = (
  approvals: Record<string, ApprovalState>,
  status: ApprovalState["status"],
): ApprovalState | undefined => {
  return Object.values(approvals).find(
    (approval) => approval.status === status,
  );
};

const findRunningTool = (
  tools: Record<string, ToolState>,
): ToolState | undefined => {
  return Object.values(tools).find(
    (tool) => tool.status === "running" || tool.status === "requires-action",
  );
};

const getApprovalDescription = (approval: ApprovalState): string => {
  switch (approval.approvalType) {
    case "commandExecution":
      return "コマンド実行の許可が必要です";
    case "fileChange":
      return "ファイル変更の許可が必要です";
    case "network":
      return "ネットワークアクセスの許可が必要です";
  }
};

const getToolDescription = (tool: ToolState): string => {
  if (tool.toolType === "commandExecution" && tool.argsText) {
    return tool.argsText.split("\n")[0]?.trim() || tool.toolName;
  }

  return tool.toolName || tool.toolType || "ツールを実行しています";
};

const getRunningPlanStep = (planText: string): string | undefined => {
  const line = planText
    .split("\n")
    .find((value) => value.trim().startsWith("[>]"));

  return line?.replace("[>]", "").trim() || undefined;
};

/**
 * Codex turn 表示状態から、現在の作業状態を表す view model を導出する。
 *
 * @param state - reducer 済みの Codex turn 表示状態。
 * @returns RunStatusBar が描画する状態 view model。
 */
export function deriveRunStatus(state: CodexTurnState): RunStatusViewModel {
  if (state.status === "failed") {
    return {
      kind: "failed",
      label: "失敗",
      description: getErrorMessage(state.error) ?? "処理中にエラーが発生しました",
      severity: "danger",
      active: false,
    };
  }

  if (state.status === "interrupted") {
    return {
      kind: "interrupted",
      label: "中断",
      description: "AIの作業を中断しました",
      severity: "muted",
      active: false,
    };
  }

  if (state.status === "completed") {
    return {
      kind: "completed",
      label: "完了",
      description: "AIの作業が完了しました",
      severity: "success",
      active: false,
    };
  }

  const pendingApproval = findApprovalByStatus(
    state.approvalItems,
    "requires-action",
  );
  if (pendingApproval) {
    return {
      kind: "waiting-approval",
      label: "承認待ち",
      description: getApprovalDescription(pendingApproval),
      severity: "warning",
      active: true,
    };
  }

  const submittingApproval = findApprovalByStatus(
    state.approvalItems,
    "submitting",
  );
  if (submittingApproval) {
    return {
      kind: "submitting-approval",
      label: "承認送信中",
      description: "ユーザーの判断を送信しています",
      severity: "warning",
      active: true,
    };
  }

  const runningTool = findRunningTool(state.toolItems);
  if (runningTool) {
    return {
      kind: "tool-running",
      label: "ツール実行中",
      description: getToolDescription(runningTool),
      severity: "info",
      active: true,
    };
  }

  const runningPlanStep = getRunningPlanStep(state.planText);
  if (runningPlanStep) {
    return {
      kind: "planning",
      label: "計画進行中",
      description: runningPlanStep,
      severity: "info",
      active: true,
    };
  }

  if (state.finalText) {
    return {
      kind: "finalizing",
      label: "回答作成中",
      description: "最終回答を生成しています",
      severity: "info",
      active: true,
    };
  }

  if (state.diffText) {
    return {
      kind: "diff-ready",
      label: "変更差分を更新",
      description: "ファイル変更の差分を生成しています",
      severity: "info",
      active: true,
    };
  }

  if (state.commentaryText || Object.keys(state.reasoningItems).length > 0) {
    return {
      kind: "running",
      label: "AI作業中",
      description: "調査・判断の要約を更新しています",
      severity: "info",
      active: true,
    };
  }

  return {
    kind: "running",
    label: "AI作業中",
    description: "作業を開始しています",
    severity: "info",
    active: true,
  };
}
