import type { JsonRpcConnection } from "../rpc/connection";
import {
  onCommandApprovalRequest,
  onFileChangeApprovalRequest,
} from "./approvals";
import {
  createCommandApprovalRequestedEvent,
  createFileChangeApprovalRequestedEvent,
} from "./approval-events";
import type {
  ApprovalController,
  ApprovalResolvedEvent,
} from "./approval-controller";
import type { CodexUiEvent } from "./ui-events";

export type ApprovalEventSink = (
  event: Extract<
    CodexUiEvent,
    { type: "approval.requested" | "approval.resolved" }
  >,
) => void;

const createResolvedEvent = (
  event: Extract<CodexUiEvent, { type: "approval.requested" }>,
  result: {
    decision: ApprovalResolvedEvent["decision"];
    status: ApprovalResolvedEvent["status"];
    resolvedAtMs: number;
  },
): ApprovalResolvedEvent => {
  return {
    type: "approval.resolved",
    approvalRequestId: event.approvalRequestId,
    threadId: event.threadId,
    turnId: event.turnId,
    itemId: event.itemId,
    decision: result.decision,
    status: result.status,
    resolvedAtMs: result.resolvedAtMs,
  };
};

/**
 * Web UI 向けの approval request handler を JSON-RPC connection に登録する。
 *
 * approval request を UI event として通知したあと、ユーザー decision が API 経由で
 * 到着するまで pending にし、Codex App Server へその decision を返す。
 *
 * @param connection - handler を登録する JSON-RPC connection。
 * @param approvalController - pending approval を管理する controller。
 * @param emit - approval request event を受け取る callback。
 * @returns 登録解除関数の配列。
 */
export const registerWebApprovalRequestHandlers = (
  connection: JsonRpcConnection,
  approvalController: ApprovalController,
  emit: ApprovalEventSink,
): Array<() => void> => {
  return [
    onCommandApprovalRequest(connection, async (params, context) => {
      const event = createCommandApprovalRequestedEvent(params, context);
      emit(event);

      const result = await approvalController.waitForDecision(event);
      emit(createResolvedEvent(event, result));

      return { decision: result.decision };
    }),
    onFileChangeApprovalRequest(connection, async (params, context) => {
      const event = createFileChangeApprovalRequestedEvent(params, context);
      emit(event);

      const result = await approvalController.waitForDecision(event);
      emit(createResolvedEvent(event, result));

      return { decision: result.decision };
    }),
  ];
};
