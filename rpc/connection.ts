import {
  assertJsonValue,
  assertRpcMessage,
  isRpcErrorResponse,
  isRpcNotification,
  isRpcRequest,
  isRpcRequestId,
  isRpcSuccessResponse,
  type JsonValue,
  type RpcError,
  type RpcErrorListener,
  type RpcExitListener,
  type RpcMessage,
  type RpcMessageListener,
  type RpcNotification,
  type RpcNotificationListener,
  type RpcRequest,
  type RpcRequestHandler,
  type RpcRequestId,
  type RpcResponseId,
  type RpcStderrListener,
} from "./types";
import type { JsonRpcTransport } from "./transport";

/**
 * JSON-RPC connection の基本設定。
 */
export type JsonRpcConnectionOptions = {
  /** request / requestRaw が response を待つ既定時間。未指定時は 30 秒。 */
  defaultTimeoutMs?: number;
};

/**
 * JSON-RPC error response を Promise rejection として扱うための Error。
 *
 * `request()` / `requestRaw()` が error response を受信した場合、この Error で
 * reject し、元の RPC error object は `rpcError` から参照できる。
 */
export class RpcResponseError extends Error {
  /**
   * @param rpcError - サーバーから返された JSON-RPC error object。
   */
  constructor(readonly rpcError: RpcError) {
    super(rpcError.message);
    this.name = "RpcResponseError";
  }
}

/**
 * Transport 上に JSON-RPC の意味論を実装する双方向 connection。
 *
 * request / response の pending 管理、notification 配送、サーバーから来る
 * request への応答、listener 例外の隔離を担当する。具体的な通信手段は
 * `JsonRpcTransport` に委譲する。
 */
export class JsonRpcConnection {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: JsonValue) => void;
      reject: (reason: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private readonly requestHandlers = new Map<string, RpcRequestHandler>();
  private readonly notificationListeners = new Map<
    string,
    Set<RpcNotificationListener>
  >();

  private readonly messageListeners = new Set<RpcMessageListener>();
  private readonly errorListeners = new Set<RpcErrorListener>();
  private readonly stderrListeners = new Set<RpcStderrListener>();
  private readonly exitListeners = new Set<RpcExitListener>();
  private readonly transportUnsubscribers: Array<() => void> = [];

  private nextRequestId = 0;
  private started = false;

  constructor(
    private readonly transport: JsonRpcTransport,
    private readonly options: JsonRpcConnectionOptions = {},
  ) {}

  /**
   * Transport を開始し、受信 message の処理を始める。
   *
   * 複数回呼ばれた場合、すでに開始済みなら何もしない。
   *
   * @returns Transport 起動の完了を表す Promise。
   * @throws Transport の起動に失敗した場合。
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.transportUnsubscribers.push(
      this.transport.onMessage(this.handleTransportMessage),
      this.transport.onError(this.emitError),
    );

    if (this.transport.onStderr) {
      this.transportUnsubscribers.push(
        this.transport.onStderr(this.emitStderr),
      );
    }

    if (this.transport.onExit) {
      this.transportUnsubscribers.push(
        this.transport.onExit(this.handleTransportExit),
      );
    }

    try {
      await this.transport.start();
    } catch (error) {
      this.started = false;
      this.unsubscribeTransport();
      throw error;
    }
  }

  /**
   * connection を停止し、未完了 request をすべて reject する。
   *
   * @returns Transport 停止の完了を表す Promise。
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.rejectAllPending(
      new Error("connection stopped before response was received"),
    );
    this.unsubscribeTransport();
    await this.transport.stop();
  }

  /**
   * RPC message をそのまま送信する低レベル API。
   *
   * request を送る場合でも pending 管理は行わない。response を待つ request は
   * `request()` または、入力済み id を保持したい場合は `requestRaw()` を使う。
   *
   * @param message - 送信する request / notification / response。
   * @returns 送信完了を表す Promise。
   * @throws message が RPC message でない、または JSON として安全に送れない場合。
   */
  async sendRaw(message: RpcMessage): Promise<void> {
    assertRpcMessage(message);
    assertJsonValue(message);
    await this.transport.send(message);
  }

  /**
   * 新しい request id を自動採番して RPC request を送信する。
   *
   * アプリケーションコード向けの便利 API。response は Promise として返り、
   * error response は `RpcResponseError` として reject される。
   *
   * @template TResult - 期待する result の型。
   * @param method - 呼び出す RPC method 名。
   * @param params - method に渡す JSON params。
   * @param options - この request 専用の timeout 設定。
   * @returns サーバーから返された result。
   */
  async request<TResult = JsonValue>(
    method: string,
    params?: JsonValue,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<TResult> {
    const id = this.createRequestId();
    const message: RpcRequest =
      params === undefined ? { id, method } : { id, method, params };

    return this.requestRaw<TResult>(message, options);
  }

  /**
   * 入力済みの request id を保持して RPC request を送信する。
   *
   * 標準入力から JSON-RPC request を手入力する場合など、wire 上の id をユーザーが
   * 指定した値のまま保ちたい用途で使う。`sendRaw()` と違い、id を
   * pending 管理に登録して response と対応付ける。
   *
   * @template TResult - 期待する result の型。
   * @param message - 送信する id 付き request message。
   * @param options - この request 専用の timeout 設定。
   * @returns サーバーから返された result。
   * @throws 同じ id の request が未完了の場合。
   */
  async requestRaw<TResult = JsonValue>(
    message: RpcRequest,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<TResult> {
    assertRpcMessage(message);
    assertJsonValue(message);

    const timeoutMs =
      options?.timeoutMs ?? this.options.defaultTimeoutMs ?? 30_000;
    const key = this.getPendingKey(message.id);

    if (this.pendingRequests.has(key)) {
      throw new Error(
        `RPC request id is already pending: id=${String(message.id)}`,
      );
    }

    const resultPromise = new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(key);
        reject(
          new Error(
            `RPC request timed out: ${message.method} id=${String(message.id)}`,
          ),
        );
      }, timeoutMs);

      this.pendingRequests.set(key, {
        resolve: (value) => {
          resolve(value as TResult);
        },
        reject,
        timeout,
      });
    });

    try {
      await this.sendRaw(message);
    } catch (error) {
      const pending = this.pendingRequests.get(key);

      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.pendingRequests.delete(key);
      }
    }

    return resultPromise;
  }

  /**
   * 応答を期待しない notification を送信する。
   *
   * @param method - 通知する RPC method 名。
   * @param params - notification に付ける JSON params。
   * @returns 送信完了を表す Promise。
   */
  async notify(method: string, params?: JsonValue): Promise<void> {
    const message: RpcNotification =
      params === undefined ? { method } : { method, params };

    await this.sendRaw(message);
  }

  /**
   * サーバーから届いた request に success response を返す。
   *
   * `undefined` は JSON wire 上で消えるため、`null` に正規化して送信する。
   *
   * @param id - 対応する server request の id。
   * @param result - response の result。未指定の場合は `null` として送る。
   * @returns 送信完了を表す Promise。
   */
  async respond(id: RpcRequestId, result: JsonValue | undefined): Promise<void> {
    await this.sendRaw({
      id,
      result: result ?? null,
    });
  }

  /**
   * サーバーから届いた request に error response を返す。
   *
   * @param id - 対応する request id。parse error などでは `null` も許容する。
   * @param error - JSON-RPC error object。
   * @returns 送信完了を表す Promise。
   */
  async respondError(id: RpcResponseId, error: RpcError): Promise<void> {
    await this.sendRaw({
      id,
      error,
    });
  }

  /**
   * 受信したすべての RPC message を観測する listener を登録する。
   *
   * ログやデバッグ用であり、listener が例外を投げても RPC 制御フローは継続する。
   *
   * @param listener - 受信 message を受け取る関数。
   * @returns 登録解除関数。
   */
  onMessage(listener: RpcMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * connection 内で発生したエラーを受け取る listener を登録する。
   *
   * @param listener - エラーを受け取る関数。
   * @returns 登録解除関数。
   */
  onError(listener: RpcErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * Transport の stderr 出力を受け取る listener を登録する。
   *
   * @param listener - stderr 文字列を受け取る関数。
   * @returns 登録解除関数。
   */
  onStderr(listener: RpcStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  /**
   * Transport の終了イベントを受け取る listener を登録する。
   *
   * @param listener - 終了コードとシグナルを受け取る関数。
   * @returns 登録解除関数。
   */
  onExit(listener: RpcExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

  /**
   * 指定 method の notification listener を登録する。
   *
   * @param method - 監視する notification method 名。
   * @param listener - notification params と method を受け取る関数。
   * @returns 登録解除関数。
   */
  onNotification(
    method: string,
    listener: RpcNotificationListener,
  ): () => void {
    const listeners = this.notificationListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.notificationListeners.set(method, listeners);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.notificationListeners.delete(method);
      }
    };
  }

  /**
   * サーバーから送られる request の handler を登録する。
   *
   * Codex App Server の approval request など、client 側が response を返す必要が
   * ある method に使う。
   *
   * @param method - 処理対象の request method 名。
   * @param handler - response result を返す handler。
   * @returns 登録解除関数。
   */
  onRequest(method: string, handler: RpcRequestHandler): () => void {
    this.requestHandlers.set(method, handler);

    return () => {
      const currentHandler = this.requestHandlers.get(method);

      if (currentHandler === handler) {
        this.requestHandlers.delete(method);
      }
    };
  }

  /**
   * Transport から届いた unknown 値を RPC message として分類して処理する。
   */
  private readonly handleTransportMessage = (message: unknown): void => {
    try {
      assertRpcMessage(message);
      this.dispatchSafely(this.messageListeners, message);

      if (isRpcSuccessResponse(message)) {
        this.handleSuccessResponse(message);
        return;
      }

      if (isRpcErrorResponse(message)) {
        this.handleErrorResponse(message);
        return;
      }

      if (isRpcRequest(message)) {
        void this.handleServerRequest(message).catch(this.emitError);
        return;
      }

      if (isRpcNotification(message)) {
        this.handleNotification(message);
      }
    } catch (error) {
      this.emitError(error);
    }
  };

  /**
   * success response を pending request に対応付けて resolve する。
   *
   * pending が見つからない response は、手元で管理していない id への response なので
   * protocol/debugging error として通知する。
   */
  private handleSuccessResponse(message: { id: RpcResponseId; result: JsonValue }): void {
    if (!isRpcRequestId(message.id)) {
      this.emitError(
        new Error(`received response for non-request id: ${String(message.id)}`),
      );
      return;
    }

    const key = this.getPendingKey(message.id);
    const pending = this.pendingRequests.get(key);

    if (!pending) {
      this.emitError(
        new Error(
          `received response for unknown request id: ${String(message.id)}`,
        ),
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(key);
    pending.resolve(message.result);
  }

  /**
   * error response を pending request に対応付けて reject する。
   */
  private handleErrorResponse(message: { id: RpcResponseId; error: RpcError }): void {
    if (!isRpcRequestId(message.id)) {
      this.emitError(
        new Error(
          `received error response for non-request id: ${String(message.id)}`,
        ),
      );
      return;
    }

    const key = this.getPendingKey(message.id);
    const pending = this.pendingRequests.get(key);

    if (!pending) {
      this.emitError(
        new Error(
          `received error response for unknown request id: ${String(message.id)}`,
        ),
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(key);
    pending.reject(new RpcResponseError(message.error));
  }

  /**
   * サーバー initiated request を handler に配送し、result または error を返す。
   */
  private async handleServerRequest(message: RpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(message.method);

    if (!handler) {
      await this.respondError(message.id, {
        code: -32601,
        message: `Method not found: ${message.method}`,
      });
      return;
    }

    try {
      const result = await handler(message.params, {
        id: message.id,
        method: message.method,
      });

      await this.respond(message.id, result);
    } catch (error) {
      await this.respondError(message.id, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * notification を method ごとの listener に配送する。
   */
  private handleNotification(message: RpcNotification): void {
    const listeners = this.notificationListeners.get(message.method);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      try {
        listener(message.params, message.method);
      } catch (error) {
        this.emitError(error);
      }
    }
  }

  /**
   * エラー listener へ通知する。
   *
   * error listener 自身の例外は、二次障害で RPC 処理が止まらないよう握りつぶす。
   */
  private readonly emitError = (error: unknown): void => {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listeners must not destabilize RPC control flow.
      }
    }
  };

  /**
   * stderr listener へ診断出力を配送する。
   */
  private readonly emitStderr = (data: string): void => {
    for (const listener of this.stderrListeners) {
      try {
        listener(data);
      } catch (error) {
        this.emitError(error);
      }
    }
  };

  /**
   * Transport 終了時に未完了 request を reject し、exit listener へ通知する。
   */
  private readonly handleTransportExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    this.rejectAllPending(
      new Error("server process exited before response was received"),
    );

    for (const listener of this.exitListeners) {
      try {
        listener(code, signal);
      } catch (error) {
        this.emitError(error);
      }
    }
  };

  /**
   * listener 例外を隔離しながら値を配送する。
   */
  private dispatchSafely<T>(
    listeners: Set<(value: T) => void>,
    value: T,
  ): void {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (error) {
        this.emitError(error);
      }
    }
  }

  /**
   * connection 停止や Transport 終了時に、未完了 request をまとめて reject する。
   */
  private rejectAllPending(error: Error): void {
    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(key);
    }
  }

  /**
   * start() 時に登録した Transport listener をすべて解除する。
   */
  private unsubscribeTransport(): void {
    while (this.transportUnsubscribers.length > 0) {
      const unsubscribe = this.transportUnsubscribers.pop();
      unsubscribe?.();
    }
  }

  /**
   * 自動採番 request 用の id を生成する。
   *
   * manual `requestRaw()` が同じ数値 id を未完了で使っている場合は避ける。
   */
  private createRequestId(): number {
    let id = this.nextRequestId;

    while (this.pendingRequests.has(this.getPendingKey(id))) {
      id += 1;
    }

    this.nextRequestId = id + 1;
    return id;
  }

  /**
   * pending request map 用の衝突しない key を作る。
   *
   * JSON-RPC id は string と number の両方を許すため、`"1"` と `1` を区別する。
   */
  private getPendingKey(id: RpcRequestId): string {
    return `${typeof id}:${String(id)}`;
  }
}
