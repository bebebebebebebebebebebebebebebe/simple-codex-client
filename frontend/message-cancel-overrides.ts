import type { MessageStatus } from "@assistant-ui/react";
import type { RunStatusViewModel } from "./derive-run-status";
import type { ApprovalState } from "./codex-turn-state";

const INTERRUPTED_RUN_STATUS: RunStatusViewModel = {
  kind: "interrupted",
  label: "中断",
  description: "AIの作業を中断しました",
  severity: "muted",
  active: false,
};

const ACTIONABLE_APPROVAL_STATUSES = new Set<ApprovalState["status"]>([
  "requires-action",
  "submitting",
]);

/**
 * assistant-ui の message status が Cancel 済みか判定する。
 *
 * @param messageStatus - assistant-ui が保持する message status。
 * @returns Cancel による incomplete status なら true。
 */
export function isCancelledMessageStatus(
  messageStatus: MessageStatus | undefined,
): boolean {
  return (
    messageStatus?.type === "incomplete" &&
    messageStatus.reason === "cancelled"
  );
}

/**
 * Cancel 後に stale な running result が残った RunStatusBar 表示を中断状態へ補正する。
 *
 * @param runStatus - Codex turn state から生成済みの run status。
 * @param messageStatus - assistant-ui が保持する message status。
 * @returns 表示に使う run status。
 */
export function resolveRunStatusForMessage(
  runStatus: RunStatusViewModel,
  messageStatus: MessageStatus | undefined,
): RunStatusViewModel {
  if (!isCancelledMessageStatus(messageStatus)) return runStatus;
  if (!runStatus.active) return runStatus;

  return INTERRUPTED_RUN_STATUS;
}

/**
 * Cancel 後に残った actionable approval を表示上は解決済み扱いへ補正する。
 *
 * @param approval - Codex turn state から生成済みの approval state。
 * @param messageStatus - assistant-ui が保持する message status。
 * @returns 表示に使う approval state。
 */
export function resolveApprovalForMessage(
  approval: ApprovalState,
  messageStatus: MessageStatus | undefined,
): ApprovalState {
  if (!isCancelledMessageStatus(messageStatus)) return approval;
  if (!ACTIONABLE_APPROVAL_STATUSES.has(approval.status)) return approval;

  return {
    ...approval,
    status: "cancelled",
    submittingDecision: undefined,
  };
}
