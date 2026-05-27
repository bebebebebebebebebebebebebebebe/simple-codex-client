import type { JsonValue } from "../rpc/types";

/**
 * このファイルは sample client が直接使う Codex App Server 型だけを持つ。
 *
 * 完全な version-specific binding が必要な場合は、次を再生成して使う。
 * `codex app-server generate-ts --out ./schemas/codex-app-server`
 */

/**
 * 将来 field が追加されても受け取れる、JSON object 風の補助型。
 */
type JsonObjectLike = {
  [key: string]: JsonValue | undefined;
};

/**
 * initialize 時にサーバーへ渡す client 識別情報。
 */
export type ClientInfo = {
  name: string;
  title: string;
  version: string;
};

/**
 * initialize 時に client が宣言する capability。
 */
export type InitializeCapabilities = {
  experimentalApi: boolean;
  optOutNotificationMethods?: string[] | null;
};

/**
 * Codex App Server の `initialize` request params。
 */
export type InitializeParams = {
  clientInfo: ClientInfo;
  capabilities: InitializeCapabilities | null;
};

/**
 * Codex App Server の `initialize` response。
 */
export type InitializeResponse = {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
};

/**
 * `thread/start` request params の sample client 用 subset。
 *
 * 完全な型ではなく、主要 field と JSON extension field を許容する。
 */
export type ThreadStartParams = JsonObjectLike & {
  model?: string | null;
  modelProvider?: string | null;
  serviceTier?: string | null;
  cwd?: string | null;
  approvalPolicy?: JsonValue;
  sandbox?: JsonValue;
  config?: Record<string, JsonValue> | null;
  serviceName?: string | null;
  baseInstructions?: string | null;
  developerInstructions?: string | null;
  personality?: JsonValue;
  ephemeral?: boolean | null;
};

/**
 * `thread/start` response の sample client 用 subset。
 */
export type ThreadStartResponse = JsonObjectLike & {
  thread: JsonValue;
  model: string;
  modelProvider: string;
  serviceTier: string | null;
  cwd: string;
};

/**
 * `turn/start` request params の sample client 用 subset。
 */
export type TurnStartParams = JsonObjectLike & {
  threadId: string;
  input: JsonValue[];
  cwd?: string | null;
  approvalPolicy?: JsonValue;
  sandboxPolicy?: JsonValue;
  model?: string | null;
  serviceTier?: string | null;
  effort?: string | null;
  summary?: JsonValue;
  personality?: JsonValue;
  outputSchema?: JsonValue;
};

/**
 * `turn/start` response の sample client 用 subset。
 */
export type TurnStartResponse = JsonObjectLike & {
  turn: JsonValue;
};

/**
 * command execution approval request へ返せる decision。
 */
export type CommandExecutionApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: JsonValue;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: JsonValue;
      };
    };

/**
 * file change approval request へ返せる decision。
 */
export type FileChangeApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

/**
 * command execution approval request params の sample client 用 subset。
 */
export type CommandExecutionRequestApprovalParams = JsonObjectLike & {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  approvalId?: string | null;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  commandActions?: JsonValue[] | null;
  networkApprovalContext?: JsonValue;
  availableDecisions?: string[] | null;
  proposedExecpolicyAmendment?: JsonValue;
  proposedNetworkPolicyAmendments?: JsonValue[] | null;
};

/**
 * command execution approval request への response。
 */
export type CommandExecutionRequestApprovalResponse = {
  decision: CommandExecutionApprovalDecision;
};

/**
 * file change approval request params の sample client 用 subset。
 */
export type FileChangeRequestApprovalParams = JsonObjectLike & {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  reason?: string | null;
  grantRoot?: string | null;
};

/**
 * file change approval request への response。
 */
export type FileChangeRequestApprovalResponse = {
  decision: FileChangeApprovalDecision;
};
