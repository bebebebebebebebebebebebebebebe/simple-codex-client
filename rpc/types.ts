export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RpcRequestId = string | number;
export type RpcResponseId = RpcRequestId | null;
export type RpcId = RpcResponseId;

export type RpcError = {
  code: number;
  message: string;
  data?: JsonValue;
};

export type RpcRequest<TParams = JsonValue> = {
  id: RpcRequestId;
  method: string;
  params?: TParams;
};

export type RpcNotification<TParams = JsonValue> = {
  method: string;
  params?: TParams;
};

export type RpcSuccessResponse<TResult = JsonValue> = {
  id: RpcResponseId;
  result: TResult;
};

export type RpcErrorResponse = {
  id: RpcResponseId;
  error: RpcError;
};

export type RpcMessage =
  | RpcRequest
  | RpcNotification
  | RpcSuccessResponse
  | RpcErrorResponse;

export type RpcRequestHandler = (
  params: JsonValue | undefined,
  context: {
    id: RpcRequestId;
    method: string;
  },
) => JsonValue | undefined | Promise<JsonValue | undefined>;

export type RpcNotificationListener = (
  params: JsonValue | undefined,
  method: string,
) => void;

export type RpcMessageListener = (message: RpcMessage) => void;
export type RpcErrorListener = (error: unknown) => void;
export type RpcStderrListener = (data: string) => void;
export type RpcExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const hasOwn = (
  value: Record<string, unknown>,
  key: string,
): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

export const isRpcRequestId = (value: unknown): value is RpcRequestId => {
  return (
    typeof value === "string" ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      Number.isInteger(value))
  );
};

export const isRpcResponseId = (value: unknown): value is RpcResponseId => {
  return value === null || isRpcRequestId(value);
};

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

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  if (!isJsonValue(value)) {
    throw new Error(`value is not JSON-serializable: ${safeStringify(value)}`);
  }
}

export const isRpcError = (value: unknown): value is RpcError => {
  if (!isPlainObject(value)) {
    return false;
  }

  if (!Number.isInteger(value.code) || typeof value.message !== "string") {
    return false;
  }

  return !hasOwn(value, "data") || isJsonValue(value.data);
};

export const hasValidOptionalJsonRpcVersion = (
  value: Record<string, unknown>,
): boolean => {
  return !hasOwn(value, "jsonrpc") || value.jsonrpc === "2.0";
};

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

export const isRpcMessage = (value: unknown): value is RpcMessage => {
  return (
    isRpcRequest(value) ||
    isRpcNotification(value) ||
    isRpcSuccessResponse(value) ||
    isRpcErrorResponse(value)
  );
};

export function assertRpcMessage(value: unknown): asserts value is RpcMessage {
  if (!isRpcMessage(value)) {
    throw new Error(`invalid RPC message: ${safeStringify(value)}`);
  }
}

export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};
