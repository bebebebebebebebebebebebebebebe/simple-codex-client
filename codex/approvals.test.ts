import { describe, expect, spyOn, test } from "bun:test";
import { registerDefaultServerRequestHandlers } from "./approvals";
import { JsonRpcConnection } from "../rpc/connection";
import type {
  JsonRpcTransport,
  JsonRpcTransportErrorListener,
  JsonRpcTransportMessageListener,
} from "../rpc/transport";

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

describe("Codex approval handlers", () => {
  test("default command and file approval handlers decline", async () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);

    try {
      registerDefaultServerRequestHandlers(connection);
      await connection.start();

      transport.emitMessage({
        id: 1,
        method: "item/commandExecution/requestApproval",
        params: {},
      });
      transport.emitMessage({
        id: 2,
        method: "item/fileChange/requestApproval",
        params: {},
      });

      await sleep(10);

      expect(transport.sent).toEqual([
        { id: 1, result: { decision: "decline" } },
        { id: 2, result: { decision: "decline" } },
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });
});

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
