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

/**
 * Codex App Server client の設定。
 */
export type CodexAppServerClientOptions = {
  /** initialize request でサーバーへ渡す client 情報。 */
  clientInfo: ClientInfo;
  /** initialize request で宣言する任意の capability。 */
  capabilities?: InitializeCapabilities | null;
};

/**
 * Codex App Server 向けの薄い高水準 client。
 *
 * `JsonRpcConnection` の汎用 request / notification API の上に、
 * initialize lifecycle とよく使う Codex method の typed wrapper を提供する。
 */
export class CodexAppServerClient {
  /**
   * @param connection - Codex App Server と通信する JSON-RPC connection。
   * @param options - initialize に使う client 情報と capability。
   */
  constructor(
    private readonly connection: JsonRpcConnection,
    private readonly options: CodexAppServerClientOptions,
  ) {}

  /**
   * connection を開始し、Codex App Server の initialize handshake を実行する。
   *
   * @returns initialize response。
   */
  async start(): Promise<InitializeResponse> {
    await this.connection.start();
    return this.initialize();
  }

  /**
   * connection を停止する。
   */
  async stop(): Promise<void> {
    await this.connection.stop();
  }

  /**
   * `initialize` request を送り、続けて `initialized` notification を送る。
   *
   * @returns initialize response。
   */
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

  /**
   * Codex App Server へ任意の request を送る。
   *
   * @template TResult - 期待する result の型。
   * @param method - RPC method 名。
   * @param params - request params。
   * @param options - request timeout 設定。
   * @returns response result。
   */
  async request<TResult = JsonValue>(
    method: string,
    params?: JsonValue,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<TResult> {
    return this.connection.request<TResult>(method, params, options);
  }

  /**
   * Codex App Server へ任意の notification を送る。
   *
   * @param method - notification method 名。
   * @param params - notification params。
   */
  async notify(method: string, params?: JsonValue): Promise<void> {
    await this.connection.notify(method, params);
  }

  /**
   * `thread/start` request を送る typed wrapper。
   *
   * @param params - thread start params。
   * @returns thread start response。
   */
  async startThread(params: ThreadStartParams): Promise<ThreadStartResponse> {
    return this.connection.request<ThreadStartResponse>(
      "thread/start",
      asJsonValue(params),
    );
  }

  /**
   * `turn/start` request を送る typed wrapper。
   *
   * @param params - turn start params。
   * @returns turn start response。
   */
  async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.connection.request<TurnStartResponse>(
      "turn/start",
      asJsonValue(params),
    );
  }

  /**
   * Codex App Server から届く notification を購読する。
   *
   * @param method - notification method 名。
   * @param listener - params と method を受け取る関数。
   * @returns 登録解除関数。
   */
  onNotification(
    method: string,
    listener: RpcNotificationListener,
  ): () => void {
    return this.connection.onNotification(method, listener);
  }

  /**
   * Codex App Server から届く request の handler を登録する。
   *
   * approval request など、client 側から response が必要な method に使う。
   *
   * @param method - request method 名。
   * @param handler - response result を返す handler。
   * @returns 登録解除関数。
   */
  onRequest(method: string, handler: RpcRequestHandler): () => void {
    return this.connection.onRequest(method, handler);
  }
}

/**
 * 生成 schema を使わない最小型を、送信前に JSON 値として検証する。
 */
const asJsonValue = (value: unknown): JsonValue => {
  assertJsonValue(value);
  return value;
};
