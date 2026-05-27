import { describe, expect, test } from "bun:test";
import { registerWebApprovalRequestHandlers } from "./web-approval-handlers";
import { ApprovalController } from "./approval-controller";
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

describe("Codex web approval handlers", () => {
  test("command approval request waits for controller decision", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const controller = new ApprovalController();
    const events: unknown[] = [];

    registerWebApprovalRequestHandlers(connection, controller, (event) => {
      events.push(event);
    });
    await connection.start();

    transport.emitMessage({
      id: "approval-1",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        startedAtMs: 123,
        command: "bun test",
        cwd: "/tmp/project",
      },
    });

    await sleep(10);

    expect(events).toEqual([
      expect.objectContaining({
        type: "approval.requested",
        approvalRequestId:
          "commandExecution:thread-1:turn-1:tool-1:approval-1",
        approvalType: "commandExecution",
        command: "bun test",
      }),
    ]);
    expect(transport.sent).toEqual([]);

    controller.submitDecision(
      "commandExecution:thread-1:turn-1:tool-1:approval-1",
      "accept",
    );

    await sleep(10);

    expect(events).toEqual([
      expect.objectContaining({
        type: "approval.requested",
      }),
      expect.objectContaining({
        type: "approval.resolved",
        approvalRequestId:
          "commandExecution:thread-1:turn-1:tool-1:approval-1",
        decision: "accept",
        status: "accepted",
      }),
    ]);
    expect(transport.sent).toEqual([
      { id: "approval-1", result: { decision: "accept" } },
    ]);
  });

  test("file change approval request returns submitted decline", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const controller = new ApprovalController();
    const events: unknown[] = [];

    registerWebApprovalRequestHandlers(connection, controller, (event) => {
      events.push(event);
    });
    await connection.start();

    transport.emitMessage({
      id: "approval-2",
      method: "item/fileChange/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-1",
        startedAtMs: 456,
        grantRoot: "/tmp/project",
      },
    });

    await sleep(10);

    expect(events).toEqual([
      expect.objectContaining({
        type: "approval.requested",
        approvalRequestId: "fileChange:thread-1:turn-1:file-1:approval-2",
        approvalType: "fileChange",
        grantRoot: "/tmp/project",
      }),
    ]);

    controller.submitDecision(
      "fileChange:thread-1:turn-1:file-1:approval-2",
      "decline",
    );
    await sleep(10);

    expect(transport.sent).toEqual([
      { id: "approval-2", result: { decision: "decline" } },
    ]);
  });

  test("approval timeout returns safe fallback decision", async () => {
    const transport = new FakeTransport();
    const connection = new JsonRpcConnection(transport);
    const controller = new ApprovalController(1);
    const events: unknown[] = [];

    registerWebApprovalRequestHandlers(connection, controller, (event) => {
      events.push(event);
    });
    await connection.start();

    transport.emitMessage({
      id: "approval-3",
      method: "item/commandExecution/requestApproval",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        startedAtMs: 789,
        availableDecisions: ["accept", "cancel"],
      },
    });

    await sleep(20);

    expect(events).toEqual([
      expect.objectContaining({
        type: "approval.requested",
      }),
      expect.objectContaining({
        type: "approval.resolved",
        decision: "cancel",
        status: "expired",
      }),
    ]);
    expect(transport.sent).toEqual([
      { id: "approval-3", result: { decision: "cancel" } },
    ]);
  });
});

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
