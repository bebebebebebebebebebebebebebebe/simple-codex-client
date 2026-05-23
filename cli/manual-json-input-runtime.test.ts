import { describe, expect, spyOn, test } from "bun:test";
import {
  ManualJsonInputRuntime,
  type InputAdapter,
} from "./manual-json-input-runtime";
import { JsonRpcConnection } from "../rpc/connection";
import type {
  JsonRpcTransport,
  JsonRpcTransportErrorListener,
  JsonRpcTransportMessageListener,
} from "../rpc/transport";

class FakeInputAdapter implements InputAdapter<unknown> {
  onInput?: (input: unknown) => void;
  onError?: (error: unknown) => void;
  stopped = false;

  start(
    onInput: (input: unknown) => void,
    onError: (error: unknown) => void,
  ): void {
    this.onInput = onInput;
    this.onError = onError;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeTransport implements JsonRpcTransport {
  readonly sent: unknown[] = [];
  private readonly messageListeners =
    new Set<JsonRpcTransportMessageListener>();
  private readonly errorListeners = new Set<JsonRpcTransportErrorListener>();

  async start(): Promise<void> {}
  async stop(): Promise<void> {}

  async send(message: unknown): Promise<void> {
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

  emitMessage(message: unknown): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

describe("ManualJsonInputRuntime", () => {
  test("manual requests use requestRaw and log the result", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    const inputAdapter = new FakeInputAdapter();
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const runtime = new ManualJsonInputRuntime({
      connection,
      inputAdapter,
      inputMapper: {
        toMessage: (input) => input as never,
      },
    });

    try {
      await connection.start();
      runtime.start();

      inputAdapter.onInput?.({
        id: 7,
        method: "account/read",
        params: { refreshToken: false },
      });
      transport.emitMessage({ id: 7, result: { ok: true } });

      await waitFor(() =>
        consoleError.mock.calls.some(
          ([label, result]) =>
            label === "[manual request result]" &&
            JSON.stringify(result) === JSON.stringify({ ok: true }),
        ),
      );

      expect(transport.sent).toEqual([
        {
          id: 7,
          method: "account/read",
          params: { refreshToken: false },
        },
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  test("manual notifications still use sendRaw", async () => {
    const inputAdapter = new FakeInputAdapter();
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const runtime = new ManualJsonInputRuntime({
      connection,
      inputAdapter,
      inputMapper: {
        toMessage: (input) => input as never,
      },
    });

    await connection.start();
    runtime.start();

    inputAdapter.onInput?.({
      method: "initialized",
      params: {},
    });

    await waitFor(() => transport.sent.length === 1);

    expect(transport.sent).toEqual([
      {
        method: "initialized",
        params: {},
      },
    ]);
  });
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const started = Date.now();

  while (!predicate()) {
    if (Date.now() - started > 1_000) {
      throw new Error("timed out waiting for predicate");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
