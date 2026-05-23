import { describe, expect, test } from "bun:test";
import { JsonRpcConnection, RpcResponseError } from "./connection";
import type {
  JsonRpcTransport,
  JsonRpcTransportErrorListener,
  JsonRpcTransportExitListener,
  JsonRpcTransportMessageListener,
  JsonRpcTransportStderrListener,
} from "./transport";

class FakeTransport implements JsonRpcTransport {
  readonly sent: unknown[] = [];
  stopCalled = false;
  sendError?: Error;

  private readonly messageListeners =
    new Set<JsonRpcTransportMessageListener>();
  private readonly errorListeners = new Set<JsonRpcTransportErrorListener>();
  private readonly stderrListeners = new Set<JsonRpcTransportStderrListener>();
  private readonly exitListeners = new Set<JsonRpcTransportExitListener>();

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.stopCalled = true;
    await sleep(5);
  }

  async send(message: unknown): Promise<void> {
    if (this.sendError) {
      throw this.sendError;
    }

    this.sent.push(message);
  }

  onMessage(listener: JsonRpcTransportMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: JsonRpcTransportErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  onStderr(listener: JsonRpcTransportStderrListener): () => void {
    this.stderrListeners.add(listener);
    return () => this.stderrListeners.delete(listener);
  }

  onExit(listener: JsonRpcTransportExitListener): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

describe("JsonRpcConnection", () => {
  test("response listener exception does not block pending request resolution", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const errors: unknown[] = [];

    connection.onError((error) => errors.push(error));
    connection.onMessage(() => {
      throw new Error("listener boom");
    });

    await connection.start();
    const resultPromise = connection.request("sum", [1, 2, 3]);

    transport.emitMessage({ id: 0, result: 6 });

    await expect(resultPromise).resolves.toBe(6);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("listener boom");
  });

  test("notification listener exception is emitted and does not crash dispatch", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const errors: unknown[] = [];
    let secondListenerCalled = false;

    connection.onError((error) => errors.push(error));
    connection.onNotification("event", () => {
      throw new Error("notification boom");
    });
    connection.onNotification("event", () => {
      secondListenerCalled = true;
    });

    await connection.start();
    transport.emitMessage({ method: "event", params: { ok: true } });

    expect(secondListenerCalled).toBe(true);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("notification boom");
  });

  test("invalid RPC ids and non-JSON values are rejected before send", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);

    await connection.start();

    await expect(
      connection.sendRaw({ id: Number.NaN, method: "bad" } as never),
    ).rejects.toThrow("invalid RPC message");
    await expect(
      connection.sendRaw({ id: 1.5, method: "bad" } as never),
    ).rejects.toThrow("invalid RPC message");
    await expect(
      connection.sendRaw({ id: 1, result: undefined } as never),
    ).rejects.toThrow("invalid RPC message");
  });

  test("requestRaw tracks the supplied id and resolves matching responses", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const errors: unknown[] = [];

    connection.onError((error) => errors.push(error));

    await connection.start();
    const resultPromise = connection.requestRaw({
      id: 99,
      method: "account/read",
      params: { refreshToken: false },
    });

    expect(transport.sent).toEqual([
      {
        id: 99,
        method: "account/read",
        params: { refreshToken: false },
      },
    ]);

    transport.emitMessage({ id: 99, result: { ok: true } });

    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(errors).toHaveLength(0);
  });

  test("requestRaw rejects RPC error responses", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);

    await connection.start();
    const resultPromise = connection.requestRaw({
      id: "manual-1",
      method: "account/read",
      params: { refreshToken: false },
    });

    transport.emitMessage({
      id: "manual-1",
      error: {
        code: -32600,
        message: "Bad request",
      },
    });

    await expect(resultPromise).rejects.toBeInstanceOf(RpcResponseError);
  });

  test("responses without a pending request still emit unknown response errors", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const errors: unknown[] = [];

    connection.onError((error) => errors.push(error));

    await connection.start();
    transport.emitMessage({ id: 123, result: { ok: true } });

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain(
      "received response for unknown request id: 123",
    );
  });

  test("server request response send failure is emitted", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const errors: unknown[] = [];

    connection.onError((error) => errors.push(error));
    connection.onRequest("server/request", () => ({ ok: true }));
    transport.sendError = new Error("send failed");

    await connection.start();
    transport.emitMessage({ id: 1, method: "server/request", params: {} });
    await sleep(10);

    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain("send failed");
  });

  test("stop rejects pending requests and waits for transport stop", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);

    await connection.start();
    const resultPromise = connection.request("never");
    const stopPromise = connection.stop();

    await expect(resultPromise).rejects.toThrow("connection stopped");
    await stopPromise;
    expect(transport.stopCalled).toBe(true);
  });
});

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
