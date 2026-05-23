import { JsonRpcConnection } from "../rpc/connection";
import { assertJsonValue, type JsonValue } from "../rpc/types";
import type {
  CommandExecutionRequestApprovalParams,
  CommandExecutionRequestApprovalResponse,
  FileChangeRequestApprovalParams,
  FileChangeRequestApprovalResponse,
} from "./types";

export type CommandApprovalHandler = (
  params: CommandExecutionRequestApprovalParams,
) =>
  | CommandExecutionRequestApprovalResponse
  | Promise<CommandExecutionRequestApprovalResponse>;

export type FileChangeApprovalHandler = (
  params: FileChangeRequestApprovalParams,
) =>
  | FileChangeRequestApprovalResponse
  | Promise<FileChangeRequestApprovalResponse>;

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

export const onFileChangeApprovalRequest = (
  connection: JsonRpcConnection,
  handler: FileChangeApprovalHandler,
): (() => void) => {
  return connection.onRequest("item/fileChange/requestApproval", async (params) => {
    const result = await handler(params as FileChangeRequestApprovalParams);
    return asJsonValue(result);
  });
};

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

const asJsonValue = (value: unknown): JsonValue => {
  assertJsonValue(value);
  return value;
};
