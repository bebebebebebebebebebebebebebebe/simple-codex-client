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

export type JsonRpcConnectionOptions = {
  defaultTimeoutMs?: number;
};

export class RpcResponseError extends Error {
  constructor(readonly rpcError: RpcError) {
    super(rpcError.message);
    this.name = "RpcResponseError";
  }
}

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

  async sendRaw(message: RpcMessage): Promise<void> {
    assertRpcMessage(message);
    assertJsonValue(message);
    await this.transport.send(message);
  }

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

  async notify(method: string, params?: JsonValue): Promise<void> {
    const message: RpcNotification =
      params === undefined ? { method } : { method, params };

    await this.sendRaw(message);
  }

  async respond(id: RpcRequestId, result: JsonValue | undefined): Promise<void> {
    await this.sendRaw({
      id,
      result: result ?? null,
    });
  }

  async respondError(id: RpcResponseId, error: RpcError): Promise<void> {
    await this.sendRaw({
      id,
      error,
    });
  }

  onMessage(listener: RpcMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onError(listener: RpcErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  onStderr(listener: RpcStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  onExit(listener: RpcExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

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

  onRequest(method: string, handler: RpcRequestHandler): () => void {
    this.requestHandlers.set(method, handler);

    return () => {
      const currentHandler = this.requestHandlers.get(method);

      if (currentHandler === handler) {
        this.requestHandlers.delete(method);
      }
    };
  }

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

  private readonly emitError = (error: unknown): void => {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listeners must not destabilize RPC control flow.
      }
    }
  };

  private readonly emitStderr = (data: string): void => {
    for (const listener of this.stderrListeners) {
      try {
        listener(data);
      } catch (error) {
        this.emitError(error);
      }
    }
  };

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

  private rejectAllPending(error: Error): void {
    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pendingRequests.delete(key);
    }
  }

  private unsubscribeTransport(): void {
    while (this.transportUnsubscribers.length > 0) {
      const unsubscribe = this.transportUnsubscribers.pop();
      unsubscribe?.();
    }
  }

  private createRequestId(): number {
    let id = this.nextRequestId;

    while (this.pendingRequests.has(this.getPendingKey(id))) {
      id += 1;
    }

    this.nextRequestId = id + 1;
    return id;
  }

  private getPendingKey(id: RpcRequestId): string {
    return `${typeof id}:${String(id)}`;
  }
}
