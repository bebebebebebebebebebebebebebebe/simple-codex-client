/**
 * JSON として wire に安全に載せられる値。
 *
 * JSON-RPC の `params` / `result` / `error.data` は外部プロセスへ
 * `JSON.stringify()` されるため、`undefined`、`NaN`、`Infinity`、
 * 関数、symbol、循環参照などはこの型に含めない。
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * クライアントまたはサーバーが request に使う相関 ID。
 *
 * JSON-RPC の response と request を対応付けるための値で、
 * この実装では衝突や wire 上の破損を避けるため finite integer または
 * string のみを request id として許可する。
 */
export type RpcRequestId = string | number;

/**
 * response に現れる ID。
 *
 * JSON-RPC の error response では、parse error など request id が特定できない
 * 場合に `null` が使われ得るため、request id より広い型にしている。
 */
export type RpcResponseId = RpcRequestId | null;
export type RpcId = RpcResponseId;

/**
 * JSON-RPC error response の `error` オブジェクト。
 *
 * `code` と `message` は必須、`data` は JSON として送れる追加情報だけを許可する。
 */
export type RpcError = {
  code: number;
  message: string;
  data?: JsonValue;
};

/**
 * 応答を期待する JSON-RPC request。
 *
 * @template TParams - request の `params` に入る JSON 値の型。
 */
export type RpcRequest<TParams = JsonValue> = {
  id: RpcRequestId;
  method: string;
  params?: TParams;
};

/**
 * 応答を期待しない JSON-RPC notification。
 *
 * `id` を持たないため、サーバーから response は返らない前提で扱う。
 */
export type RpcNotification<TParams = JsonValue> = {
  method: string;
  params?: TParams;
};

/**
 * JSON-RPC success response。
 *
 * @template TResult - response の `result` に入る JSON 値の型。
 */
export type RpcSuccessResponse<TResult = JsonValue> = {
  id: RpcResponseId;
  result: TResult;
};

/**
 * JSON-RPC error response。
 */
export type RpcErrorResponse = {
  id: RpcResponseId;
  error: RpcError;
};

/**
 * このクライアントが単一メッセージとして扱う JSON-RPC message。
 *
 * Batch request は Codex App Server の検証用途では扱わないため含めていない。
 */
export type RpcMessage =
  | RpcRequest
  | RpcNotification
  | RpcSuccessResponse
  | RpcErrorResponse;

/**
 * サーバーからクライアントへ届いた request を処理するハンドラ。
 *
 * Codex App Server の approval request など、双方向 RPC の server initiated
 * request に応答するために使う。
 */
export type RpcRequestHandler = (
  params: JsonValue | undefined,
  context: {
    id: RpcRequestId;
    method: string;
  },
) => JsonValue | undefined | Promise<JsonValue | undefined>;

/**
 * 指定 method の notification を観測するリスナー。
 */
export type RpcNotificationListener = (
  params: JsonValue | undefined,
  method: string,
) => void;

/** 受信した RPC message 全体を観測するリスナー。 */
export type RpcMessageListener = (message: RpcMessage) => void;
/** RPC 層または Transport 層から通知されるエラーのリスナー。 */
export type RpcErrorListener = (error: unknown) => void;
/** 子プロセス stderr を観測するリスナー。 */
export type RpcStderrListener = (data: string) => void;
/** 子プロセス終了を観測するリスナー。 */
export type RpcExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

/**
 * 値がプレーンオブジェクトかを判定する。
 *
 * JSON-RPC message は object である必要があるが、配列や null は除外する。
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * 指定 key が own property として存在するかを判定する。
 */
export const hasOwn = (
  value: Record<string, unknown>,
  key: string,
): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

/**
 * request id として安全に扱える値かを判定する。
 *
 * JSON.stringify で `null` に化ける `NaN` / `Infinity` や、小数 ID は拒否する。
 */
export const isRpcRequestId = (value: unknown): value is RpcRequestId => {
  return (
    typeof value === "string" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value))
  );
};

/**
 * response id として扱える値かを判定する。
 */
export const isRpcResponseId = (value: unknown): value is RpcResponseId => {
  return value === null || isRpcRequestId(value);
};

/**
 * 値が JSON として安全に serialize できるかを再帰的に判定する。
 *
 * 循環参照も検出し、wire 上で壊れる値を送信前に止める。
 */
export const isJsonValue = (
  value: unknown,
  seen = new WeakSet<object>(),
): value is JsonValue => {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      return false;
  }

  if (seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item, seen));
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).every((item) => isJsonValue(item, seen));
};

/**
 * 値が JSON 値であることを保証する assertion。
 *
 * @throws 値が JSON として安全に送れない場合。
 */
export function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (!isJsonValue(value)) {
    throw new Error(`value is not JSON-serializable: ${safeStringify(value)}`);
  }
}

/**
 * 値が JSON-RPC error object として妥当かを判定する。
 */
export const isRpcError = (value: unknown): value is RpcError => {
  if (!isPlainObject(value)) {
    return false;
  }

  if (!Number.isInteger(value.code) || typeof value.message !== "string") {
    return false;
  }

  return !hasOwn(value, "data") || isJsonValue(value.data);
};

/**
 * `jsonrpc` フィールドが省略されている、または `"2.0"` であることを確認する。
 *
 * Codex App Server の stdio transport は wire 上で `jsonrpc` を省略するため、
 * strict JSON-RPC 2.0 より緩い判定にしている。
 */
export const hasValidOptionalJsonRpcVersion = (
  value: Record<string, unknown>,
): boolean => {
  return !hasOwn(value, "jsonrpc") || value.jsonrpc === "2.0";
};

/**
 * unknown 値が request message かを判定する。
 */
export const isRpcRequest = (value: unknown): value is RpcRequest => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcRequestId(value.id) &&
    typeof value.method === "string" &&
    (!hasOwn(value, "params") || isJsonValue(value.params)) &&
    !hasOwn(value, "result") &&
    !hasOwn(value, "error")
  );
};

/**
 * unknown 値が notification message かを判定する。
 */
export const isRpcNotification = (
  value: unknown,
): value is RpcNotification => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    !hasOwn(value, "id") &&
    typeof value.method === "string" &&
    (!hasOwn(value, "params") || isJsonValue(value.params)) &&
    !hasOwn(value, "result") &&
    !hasOwn(value, "error")
  );
};

/**
 * unknown 値が success response message かを判定する。
 */
export const isRpcSuccessResponse = (
  value: unknown,
): value is RpcSuccessResponse => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcResponseId(value.id) &&
    hasOwn(value, "result") &&
    isJsonValue(value.result) &&
    !hasOwn(value, "method") &&
    !hasOwn(value, "error")
  );
};

/**
 * unknown 値が error response message かを判定する。
 */
export const isRpcErrorResponse = (
  value: unknown,
): value is RpcErrorResponse => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcResponseId(value.id) &&
    hasOwn(value, "error") &&
    isRpcError(value.error) &&
    !hasOwn(value, "method") &&
    !hasOwn(value, "result")
  );
};

/**
 * unknown 値がこの実装で扱える単一 RPC message かを判定する。
 */
export const isRpcMessage = (value: unknown): value is RpcMessage => {
  return (
    isRpcRequest(value) ||
    isRpcNotification(value) ||
    isRpcSuccessResponse(value) ||
    isRpcErrorResponse(value)
  );
};

/**
 * 値が RPC message であることを保証する assertion。
 *
 * @throws 値が request / notification / success response / error response の
 * いずれでもない場合。
 */
export function assertRpcMessage(value: unknown): asserts value is RpcMessage {
  if (!isRpcMessage(value)) {
    throw new Error(`invalid RPC message: ${safeStringify(value)}`);
  }
}

/**
 * ログやエラーメッセージ用に値を安全に文字列化する。
 *
 * 循環参照などで `JSON.stringify` に失敗しても、例外を外へ漏らさない。
 */
export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
