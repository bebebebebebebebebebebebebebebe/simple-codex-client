import type {
  CodexUiEvent,
  PlanStepStatus,
  ToolUiStatus,
} from "./ui-events";

type AnyRecord = Record<string, unknown>;

const TOOL_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "webSearch",
  "imageView",
]);

/**
 * unknown payload から object field を安全に読むための型ガード。
 *
 * @param value - Codex App Server から受け取った任意の値。
 * @returns object として field 参照できる場合は true。
 */
export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

/**
 * unknown payload から string field を取り出す。
 *
 * @param value - 文字列かもしれない値。
 * @returns 文字列の場合だけその値を返す。
 */
export function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * unknown payload から number field を取り出す。
 *
 * @param value - 数値かもしれない値。
 * @returns finite な数値の場合だけその値を返す。
 */
export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Codex 側の tool status を UI 用 status に寄せる。
 *
 * @param status - Codex item に含まれる status。
 * @returns Web UI が扱う tool status。
 */
export function normalizeToolStatus(status: unknown): ToolUiStatus {
  if (status === "running") return "running";
  if (status === "completed" || status === "success") return "completed";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "declined") return "declined";
  if (status === "requires-action") return "requires-action";
  return "unknown";
}

const normalizePlanStepStatus = (
  status: unknown,
): PlanStepStatus | undefined => {
  if (status === "pending") return "pending";
  if (status === "inProgress") return "inProgress";
  if (status === "completed") return "completed";
  return undefined;
};

const asToolType = (
  value: unknown,
): Extract<CodexUiEvent, { type: "tool.started" }>["toolType"] => {
  const toolType = asString(value);
  return toolType && TOOL_TYPES.has(toolType)
    ? (toolType as Extract<
        CodexUiEvent,
        { type: "tool.started" }
      >["toolType"])
    : "unknown";
};

/**
 * `item/agentMessage/delta` を text 表示用 delta に変換する。
 *
 * @param params - Codex notification params。
 * @returns 表示できる delta がある場合は UI event、なければ null。
 */
export function normalizeAgentMessageDelta(
  params: unknown,
  phaseOverride?: "commentary" | "final_answer",
): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const itemId = asString(params["itemId"]);
  const text = asString(params["delta"]) ?? asString(params["text"]);

  if (!turnId || !itemId || !text) return null;

  return {
    type: "message.delta",
    threadId,
    turnId,
    itemId,
    text,
    phase:
      params["phase"] === "commentary" || params["phase"] === "final_answer"
        ? params["phase"]
        : phaseOverride,
  };
}

/**
 * `item/reasoning/summaryTextDelta` を reasoning 表示用 delta に変換する。
 *
 * @param params - Codex notification params。
 * @returns 表示できる reasoning delta がある場合は UI event、なければ null。
 */
export function normalizeReasoningSummaryDelta(
  params: unknown,
): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const itemId = asString(params["itemId"]);
  const text = asString(params["delta"]) ?? asString(params["text"]);
  const summaryIndex = asNumber(params["summaryIndex"]) ?? 0;

  if (!turnId || !itemId || !text) return null;

  return {
    type: "reasoning.delta",
    threadId,
    turnId,
    itemId,
    summaryIndex,
    text,
  };
}

/**
 * `item/reasoning/summaryPartAdded` を reasoning section 境界に変換する。
 *
 * @param params - Codex notification params。
 * @returns section を識別できる場合は UI event、なければ null。
 */
export function normalizeReasoningPartAdded(
  params: unknown,
): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const itemId = asString(params["itemId"]);
  const summaryIndex = asNumber(params["summaryIndex"]) ?? 0;

  if (!turnId || !itemId) return null;

  return {
    type: "reasoning.part",
    threadId,
    turnId,
    itemId,
    summaryIndex,
  };
}

/**
 * `item/commandExecution/outputDelta` を tool output delta に変換する。
 *
 * @param params - Codex notification params。
 * @returns 出力文字列がある場合は UI event、なければ null。
 */
export function normalizeCommandOutputDelta(
  params: unknown,
): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const itemId = asString(params["itemId"]);
  const text = asString(params["delta"]) ?? asString(params["text"]);

  if (!turnId || !itemId || !text) return null;

  return {
    type: "tool.output.delta",
    threadId,
    turnId,
    itemId,
    text,
    stream:
      params["stream"] === "stdout" || params["stream"] === "stderr"
        ? params["stream"]
        : "unknown",
  };
}

/**
 * `turn/plan/updated` を plan 表示用 event に変換する。
 *
 * @param params - Codex notification params。
 * @returns 有効な plan step がある場合は UI event、なければ null。
 */
export function normalizePlanUpdated(params: unknown): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const rawPlan = params["plan"];

  if (!turnId || !Array.isArray(rawPlan)) return null;

  const plan = rawPlan.flatMap((step) => {
    if (!isRecord(step)) return [];

    const text = asString(step["step"]);
    const status = normalizePlanStepStatus(step["status"]);
    if (!text || !status) return [];

    return [{ step: text, status }];
  });

  return {
    type: "plan.updated",
    threadId,
    turnId,
    explanation: asString(params["explanation"]),
    plan,
  };
}

/**
 * `turn/diff/updated` を diff 表示用 event に変換する。
 *
 * @param params - Codex notification params。
 * @returns diff 文字列がある場合は UI event、なければ null。
 */
export function normalizeDiffUpdated(params: unknown): CodexUiEvent | null {
  if (!isRecord(params)) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const diff = asString(params["diff"]);

  if (!turnId || !diff) return null;

  return {
    type: "diff.updated",
    threadId,
    turnId,
    diff,
  };
}

/**
 * `item/started` を tool 開始 event に変換する。
 *
 * @param params - Codex notification params。
 * @returns tool として表示できる item の場合は UI event、なければ null。
 */
export function normalizeItemStarted(params: unknown): CodexUiEvent | null {
  if (!isRecord(params)) return null;
  const item = params["item"];
  if (!isRecord(item)) return null;

  const itemId = asString(item["id"]);
  if (!itemId) return null;

  const threadId = asString(params["threadId"]);
  const turnId = asString(params["turnId"]);
  const toolType = asToolType(item["type"]);

  if (toolType === "commandExecution") {
    return {
      type: "tool.started",
      threadId,
      turnId,
      itemId,
      toolType,
      name: "shell",
      args: asString(item["command"]) ?? item["command"],
      cwd: asString(item["cwd"]),
    };
  }

  if (toolType === "mcpToolCall") {
    return {
      type: "tool.started",
      threadId,
      turnId,
      itemId,
      toolType,
      name: `${asString(item["server"]) ?? "mcp"}.${
        asString(item["tool"]) ?? "tool"
      }`,
      args: item["arguments"],
    };
  }

  if (toolType === "dynamicToolCall") {
    return {
      type: "tool.started",
      threadId,
      turnId,
      itemId,
      toolType,
      name: asString(item["tool"]) ?? "dynamicTool",
      args: item["arguments"],
    };
  }

  if (toolType === "webSearch") {
    return {
      type: "tool.started",
      threadId,
      turnId,
      itemId,
      toolType,
      name: "webSearch",
      args: asString(item["query"]) ?? item["query"],
    };
  }

  if (toolType === "fileChange" || toolType === "imageView") {
    return {
      type: "tool.started",
      threadId,
      turnId,
      itemId,
      toolType,
      name: toolType === "fileChange" ? "fileChange" : "imageView",
      args: asString(item["path"]) ?? item["path"],
    };
  }

  return null;
}

/**
 * `item/completed` を tool 完了 event に変換する。
 *
 * @param params - Codex notification params。
 * @returns tool の確定状態として表示できる場合は UI event、なければ null。
 */
export function normalizeItemCompleted(params: unknown): CodexUiEvent | null {
  if (!isRecord(params)) return null;
  const item = params["item"];
  if (!isRecord(item)) return null;

  const itemId = asString(item["id"]);
  const itemType = asString(item["type"]);
  if (!itemId || !itemType || !TOOL_TYPES.has(itemType)) return null;

  const result =
    item["aggregatedOutput"] ??
    item["result"] ??
    item["changes"] ??
    item["output"] ??
    undefined;

  return {
    type: "tool.completed",
    threadId: asString(params["threadId"]),
    turnId: asString(params["turnId"]),
    itemId,
    toolType: itemType,
    status: normalizeToolStatus(item["status"]),
    result,
    error: item["error"],
    exitCode: asNumber(item["exitCode"]),
    durationMs: asNumber(item["durationMs"]),
  };
}

/**
 * `turn/completed` を turn 完了 event に変換する。
 *
 * @param params - Codex notification params。
 * @returns turn 完了状態を表す UI event。
 */
export function normalizeTurnCompleted(params: unknown): CodexUiEvent {
  const payload = isRecord(params) ? params : {};
  const turn = isRecord(payload["turn"]) ? payload["turn"] : {};
  const status = turn["status"];

  return {
    type: "turn.completed",
    threadId: asString(payload["threadId"]),
    turnId:
      asString(turn["id"]) ?? asString(payload["turnId"]) ?? "unknown-turn",
    status:
      status === "interrupted" || status === "failed"
        ? status
        : "completed",
    error: turn["error"] ?? payload["error"],
  };
}

/**
 * Codex の error notification を UI error event に変換する。
 *
 * @param params - Codex notification params。
 * @returns Web UI へ送る error event。
 */
export function normalizeError(params: unknown): CodexUiEvent {
  const payload = isRecord(params) ? params : {};
  const error = isRecord(payload["error"]) ? payload["error"] : undefined;

  return {
    type: "error",
    message:
      asString(error?.["message"]) ??
      asString(payload["message"]) ??
      "Codex turn failed",
    details: params,
  };
}
