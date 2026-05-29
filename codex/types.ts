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
 * Codex thread の runtime status を UI へ渡すための sample client 用 subset。
 */
export type CodexThreadStatus = JsonObjectLike & {
  type?: string;
  activeFlags?: string[];
};

/**
 * `thread/list` が返す thread summary の sample client 用 subset。
 */
export type CodexThreadSummary = JsonObjectLike & {
  id: string;
  name?: string | null;
  preview?: string | null;
  archived?: boolean | null;
  ephemeral?: boolean | null;
  modelProvider?: string | null;
  createdAt?: number | string | null;
  updatedAt?: number | string | null;
  status?: JsonValue;
};

/**
 * `thread/list` request params の sample client 用 subset。
 */
export type ThreadListParams = JsonObjectLike & {
  cursor?: string | null;
  limit?: number | null;
  sortKey?: "created_at" | "updated_at" | null;
  modelProviders?: string[] | null;
  sourceKinds?: string[] | null;
  archived?: boolean | null;
  cwd?: string | null;
  searchTerm?: string | null;
};

/**
 * `thread/list` response の sample client 用 subset。
 */
export type ThreadListResponse = JsonObjectLike & {
  data: JsonValue[];
  nextCursor?: string | null;
};

/**
 * `thread/read` request params の sample client 用 subset。
 */
export type ThreadReadParams = JsonObjectLike & {
  threadId: string;
  includeTurns?: boolean | null;
};

/**
 * `thread/read` response の sample client 用 subset。
 */
export type ThreadReadResponse = JsonObjectLike & {
  thread: JsonValue;
};

/**
 * `thread/resume` request params の sample client 用 subset。
 */
export type ThreadResumeParams = JsonObjectLike & {
  threadId: string;
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
};

/**
 * `thread/resume` response の sample client 用 subset。
 */
export type ThreadResumeResponse = ThreadStartResponse;

/**
 * `thread/turns/list` request params の sample client 用 subset。
 */
export type ThreadTurnsListParams = JsonObjectLike & {
  threadId: string;
  cursor?: string | null;
  limit?: number | null;
  sortDirection?: "asc" | "desc" | null;
  itemsView?: "notLoaded" | "summary" | "full" | null;
};

/**
 * `thread/turns/list` response の sample client 用 subset。
 */
export type ThreadTurnsListResponse = JsonObjectLike & {
  data: JsonValue[];
  nextCursor?: string | null;
  backwardsCursor?: string | null;
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
 * `turn/interrupt` request params の sample client 用 subset。
 */
export type TurnInterruptParams = JsonObjectLike & {
  threadId: string;
  turnId: string;
};

/**
 * `turn/interrupt` response の sample client 用 subset。
 *
 * Codex App Server は成功時に空 object result を返す。
 */
export type TurnInterruptResponse = JsonObjectLike;

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
 * Web UI から送信できる基本 approval decision。
 *
 * policy amendment 付き decision は Milestone 3 では表示のみで、送信対象に含めない。
 */
export type BasicApprovalDecision =
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
  availableDecisions?: JsonValue[] | null;
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
