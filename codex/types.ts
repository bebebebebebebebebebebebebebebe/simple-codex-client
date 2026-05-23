import type { JsonValue } from "../rpc/types";

// This file intentionally keeps only the small App Server type subset used by
// the sample client. For complete version-specific bindings, regenerate with:
// `codex app-server generate-ts --out ./schemas/codex-app-server`

type JsonObjectLike = {
  [key: string]: JsonValue | undefined;
};

export type ClientInfo = {
  name: string;
  title: string;
  version: string;
};

export type InitializeCapabilities = {
  experimentalApi: boolean;
  optOutNotificationMethods?: string[] | null;
};

export type InitializeParams = {
  clientInfo: ClientInfo;
  capabilities: InitializeCapabilities | null;
};

export type InitializeResponse = {
  userAgent: string;
  codexHome: string;
  platformFamily: string;
  platformOs: string;
};

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

export type ThreadStartResponse = JsonObjectLike & {
  thread: JsonValue;
  model: string;
  modelProvider: string;
  serviceTier: string | null;
  cwd: string;
};

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

export type TurnStartResponse = JsonObjectLike & {
  turn: JsonValue;
};

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

export type FileChangeApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

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
  proposedExecpolicyAmendment?: JsonValue;
  proposedNetworkPolicyAmendments?: JsonValue[] | null;
};

export type CommandExecutionRequestApprovalResponse = {
  decision: CommandExecutionApprovalDecision;
};

export type FileChangeRequestApprovalParams = JsonObjectLike & {
  threadId: string;
  turnId: string;
  itemId: string;
  startedAtMs: number;
  reason?: string | null;
  grantRoot?: string | null;
};

export type FileChangeRequestApprovalResponse = {
  decision: FileChangeApprovalDecision;
};
