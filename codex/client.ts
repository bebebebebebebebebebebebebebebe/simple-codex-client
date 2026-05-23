import { JsonRpcConnection } from "../rpc/connection";
import {
  assertJsonValue,
  type JsonValue,
  type RpcNotificationListener,
  type RpcRequestHandler,
} from "../rpc/types";
import type {
  ClientInfo,
  InitializeCapabilities,
  InitializeParams,
  InitializeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  TurnStartParams,
  TurnStartResponse,
} from "./types";

export type CodexAppServerClientOptions = {
  clientInfo: ClientInfo;
  capabilities?: InitializeCapabilities | null;
};

export class CodexAppServerClient {
  constructor(
    private readonly connection: JsonRpcConnection,
    private readonly options: CodexAppServerClientOptions,
  ) {}

  async start(): Promise<InitializeResponse> {
    await this.connection.start();
    return this.initialize();
  }

  async stop(): Promise<void> {
    await this.connection.stop();
  }

  async initialize(): Promise<InitializeResponse> {
    const params: InitializeParams = {
      clientInfo: this.options.clientInfo,
      capabilities: this.options.capabilities ?? null,
    };

    const result = await this.connection.request<InitializeResponse>(
      "initialize",
      asJsonValue(params),
    );

    await this.connection.notify("initialized", {});

    return result;
  }

  async request<TResult = JsonValue>(
    method: string,
    params?: JsonValue,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<TResult> {
    return this.connection.request<TResult>(method, params, options);
  }

  async notify(method: string, params?: JsonValue): Promise<void> {
    await this.connection.notify(method, params);
  }

  async startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
    return this.connection.request<ThreadStartResponse>(
      "thread/start",
      asJsonValue(params),
    );
  }

  async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.connection.request<TurnStartResponse>(
      "turn/start",
      asJsonValue(params),
    );
  }

  onNotification(
    method: string,
    listener: RpcNotificationListener,
  ): () => void {
    return this.connection.onNotification(method, listener);
  }

  onRequest(method: string, handler: RpcRequestHandler): () => void {
    return this.connection.onRequest(method, handler);
  }
}

const asJsonValue = (value: unknown): JsonValue => {
  assertJsonValue(value);
  return value;
};
