import { describe, expect, test } from "bun:test";
import type { MessageStatus } from "@assistant-ui/react";
import type { RunStatusViewModel } from "./derive-run-status";
import type { ApprovalState } from "./codex-turn-state";
import {
  resolveApprovalForMessage,
  resolveRunStatusForMessage,
} from "./message-cancel-overrides";

const cancelledMessageStatus: MessageStatus = {
  type: "incomplete",
  reason: "cancelled",
};

const createRunStatus = (
  overrides: Partial<RunStatusViewModel> = {},
): RunStatusViewModel => ({
  kind: "running",
  label: "AI作業中",
  description: "作業を開始しています",
  severity: "info",
  active: true,
  ...overrides,
});

const createApproval = (
  overrides: Partial<ApprovalState> = {},
): ApprovalState => ({
  approvalRequestId: "approval-1",
  approvalType: "commandExecution",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "item-1",
  requestMethod: "commandExecution/requestApproval",
  status: "requires-action",
  ...overrides,
});

describe("message cancel overrides", () => {
  test("cancelled message status turns active run status into interrupted", () => {
    expect(
      resolveRunStatusForMessage(createRunStatus(), cancelledMessageStatus),
    ).toEqual({
      kind: "interrupted",
      label: "中断",
      description: "AIの作業を中断しました",
      severity: "muted",
      active: false,
    });
  });

  test("cancelled message status does not overwrite terminal run statuses", () => {
    const statuses: RunStatusViewModel[] = [
      createRunStatus({
        kind: "completed",
        label: "完了",
        severity: "success",
        active: false,
      }),
      createRunStatus({
        kind: "failed",
        label: "失敗",
        severity: "danger",
        active: false,
      }),
      createRunStatus({
        kind: "interrupted",
        label: "中断",
        severity: "muted",
        active: false,
      }),
    ];

    for (const status of statuses) {
      expect(resolveRunStatusForMessage(status, cancelledMessageStatus)).toBe(
        status,
      );
    }
  });

  test("non-cancelled message status keeps active run status unchanged", () => {
    const runStatus = createRunStatus({ kind: "waiting-approval" });

    expect(
      resolveRunStatusForMessage(runStatus, {
        type: "incomplete",
        reason: "error",
      }),
    ).toBe(runStatus);
  });

  test("cancelled message status marks actionable approvals as cancelled", () => {
    expect(
      resolveApprovalForMessage(
        createApproval({ status: "requires-action" }),
        cancelledMessageStatus,
      ),
    ).toMatchObject({
      status: "cancelled",
      submittingDecision: undefined,
    });

    expect(
      resolveApprovalForMessage(
        createApproval({ status: "submitting", submittingDecision: "accept" }),
        cancelledMessageStatus,
      ),
    ).toMatchObject({
      status: "cancelled",
      submittingDecision: undefined,
    });
  });

  test("cancelled message status does not overwrite resolved approvals", () => {
    const approval = createApproval({
      status: "accepted",
      decision: "accept",
    });

    expect(resolveApprovalForMessage(approval, cancelledMessageStatus)).toBe(
      approval,
    );
  });
});
