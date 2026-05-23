import { JsonRpcConnection } from "../rpc/connection";
import { assertJsonValue, type JsonValue } from "../rpc/types";
import type {
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
} from "./types";

/**
 * command execution approval request に応答する handler。
 */
export type CommandApprovalHandler = (
  params: CommandExecutionRequestApprovalParams,
) =>
  | CommandExecutionRequestApprovalResponse
  | Promise<CommandExecutionRequestApprovalResponse>;

/**
 * file change approval request に応答する handler。
 */
export type FileChangeApprovalHandler = (
  params: FileChangeRequestApprovalParams,
) =>
  | FileChangeRequestApprovalResponse
  | Promise<FileChangeRequestApprovalResponse>;

/**
 * Codex App Server の command execution approval request handler を登録する。
 *
 * @param connection - handler を登録する JSON-RPC connection。
 * @param handler - approval params を受け取り、approval response を返す関数。
 * @returns 登録解除関数。
 */
export const onCommandApprovalRequest = (
  connection: JsonRpcConnection,
  handler: CommandApprovalHandler,
): (() => void) => {
  return connection.onRequest(
    "item/commandExecution/requestApproval",
    async (params) => {
      const result = await handler(
        params as CommandExecutionRequestApprovalParams,
      );
      return asJsonValue(result);
    },
  );
};

/**
 * Codex App Server の file change approval request handler を登録する。
 *
 * @param connection - handler を登録する JSON-RPC connection。
 * @param handler - approval params を受け取り、approval response を返す関数。
 * @returns 登録解除関数。
 */
export const onFileChangeApprovalRequest = (
  connection: JsonRpcConnection,
  handler: FileChangeApprovalHandler,
): (() => void) => {
  return connection.onRequest("item/fileChange/requestApproval", async (params) => {
    const result = await handler(params as FileChangeRequestApprovalParams);
    return asJsonValue(result);
  });
};

/**
 * サンプル client 用の安全側デフォルト approval handler を登録する。
 *
 * UI や policy が未実装の状態で command execution / file change を自動承認しないよう、
 * どちらも `"decline"` を返す。
 *
 * @param connection - handler を登録する JSON-RPC connection。
 */
export const registerDefaultServerRequestHandlers = (
  connection: JsonRpcConnection,
): void => {
  onCommandApprovalRequest(connection, async (params) => {
    console.error("[approval required: command execution]", params);

    return {
      decision: "decline",
    };
  });

  onFileChangeApprovalRequest(connection, async (params) => {
    console.error("[approval required: file change]", params);

    return {
      decision: "decline",
    };
  });
};

/**
 * approval response が JSON として送信可能であることを確認する。
 */
const asJsonValue = (value: unknown): JsonValue => {
  assertJsonValue(value);
  return value;
};
