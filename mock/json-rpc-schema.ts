type JSONRpcId = number | string;

export type JsonRpcRequest = {
  id?: JSONRpcId;
  method: string;
  params: Record<string, unknown>;
}

export type JsonRpcResponse = {
  id?: JSONRpcId;
  result?: unknown;
  error?: {
    message: string;
    data?: unknown;
  };
  method?: string;
  params?: unknown;
}

