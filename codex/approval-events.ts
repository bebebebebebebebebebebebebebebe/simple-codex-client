import type { JsonValue } from "../rpc/types";
import type { ApprovalRequestContext } from "./approvals";
import type {
  CommandExecutionRequestApprovalParams,
  FileChangeRequestApprovalParams,
} from "./types";
import type { CodexUiEvent } from "./ui-events";

type ApprovalRequestedEvent = Extract<
  CodexUiEvent,
  { type: "approval.requested" }
>;

type ApprovalRequestParamsBase = {
  threadId: string;
  turnId: string;
  itemId: string;
};

/**
 * JSON-RPC request id と Codex item scope から UI 表示用 approval id を作る。
 *
 * @param approvalType - UI に表示する approval 種別。
 * @param context - Codex App Server から届いた request の文脈。
 * @param params - approval request に含まれる thread / turn / item scope。
 * @returns UI state と assistant-ui part の key に使う approval id。
 */
export const createApprovalRequestId = (
  approvalType: string,
  context: ApprovalRequestContext,
  params: ApprovalRequestParamsBase,
): string => {
  return [
    approvalType,
    params.threadId,
    params.turnId,
    params.itemId,
    String(context.id),
  ].join(":");
};

/**
 * 任意値を空でない文字列配列へ正規化する。
 *
 * @param value - Codex approval request の availableDecisions 値。
 * @returns 表示可能な decision 名配列。文字列がなければ undefined。
 */
export const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length > 0 ? values : undefined;
};

/**
 * command execution approval request を Web UI 表示用 event に変換する。
 *
 * @param params - Codex App Server の command approval request params。
 * @param context - server initiated JSON-RPC request の文脈。
 * @returns SSE で frontend へ送る approval request event。
 */
export const createCommandApprovalRequestedEvent = (
  params: CommandExecutionRequestApprovalParams,
  context: ApprovalRequestContext,
): ApprovalRequestedEvent => {
  const approvalType =
    params.networkApprovalContext !== undefined ? "network" : "commandExecution";

  return {
    type: "approval.requested",
    approvalRequestId: createApprovalRequestId(approvalType, context, params),
    approvalType,
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    requestMethod: context.method,
    reason: params.reason,
    command: params.command,
    cwd: params.cwd,
    networkApprovalContext: params.networkApprovalContext as JsonValue | undefined,
    availableDecisions: asStringArray(params.availableDecisions),
    requestedAtMs: params.startedAtMs,
    status: "requires-action",
  };
};

/**
 * file change approval request を Web UI 表示用 event に変換する。
 *
 * @param params - Codex App Server の file change approval request params。
 * @param context - server initiated JSON-RPC request の文脈。
 * @returns SSE で frontend へ送る approval request event。
 */
export const createFileChangeApprovalRequestedEvent = (
  params: FileChangeRequestApprovalParams,
  context: ApprovalRequestContext,
): ApprovalRequestedEvent => {
  return {
    type: "approval.requested",
    approvalRequestId: createApprovalRequestId("fileChange", context, params),
    approvalType: "fileChange",
    threadId: params.threadId,
    turnId: params.turnId,
    itemId: params.itemId,
    requestMethod: context.method,
    reason: params.reason,
    grantRoot: params.grantRoot,
    requestedAtMs: params.startedAtMs,
    status: "requires-action",
  };
};
