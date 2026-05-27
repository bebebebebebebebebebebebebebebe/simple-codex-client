import type { JsonRpcConnection } from "../rpc/connection";
import {
  onCommandApprovalRequest,
  onFileChangeApprovalRequest,
} from "./approvals";
import {
  createCommandApprovalRequestedEvent,
  createFileChangeApprovalRequestedEvent,
} from "./approval-events";
import type { CodexUiEvent } from "./ui-events";

export type ApprovalEventSink = (
  event: Extract<CodexUiEvent, { type: "approval.requested" }>,
) => void;

/**
 * Web UI 向けの approval request handler を JSON-RPC connection に登録する。
 *
 * approval request を UI event として通知したあと、Milestone 2 では安全側の暫定処理として
 * Codex App Server へ decline を返す。
 *
 * @param connection - handler を登録する JSON-RPC connection。
 * @param emit - approval request event を受け取る callback。
 * @returns 登録解除関数の配列。
 */
export const registerWebApprovalRequestHandlers = (
  connection: JsonRpcConnection,
  emit: ApprovalEventSink,
): Array<() => void> => {
  return [
    onCommandApprovalRequest(connection, async (params, context) => {
      emit(createCommandApprovalRequestedEvent(params, context));

      return {
        decision: "decline",
      };
    }),
    onFileChangeApprovalRequest(connection, async (params, context) => {
      emit(createFileChangeApprovalRequestedEvent(params, context));

      return {
        decision: "decline",
      };
    }),
  ];
};
