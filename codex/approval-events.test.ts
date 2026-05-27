import { describe, expect, test } from "bun:test";
import {
  createCommandApprovalRequestedEvent,
  createFileChangeApprovalRequestedEvent,
} from "./approval-events";

describe("Codex approval UI events", () => {
  test("command approval params are converted to approval requested event", () => {
    const event = createCommandApprovalRequestedEvent(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        startedAtMs: 123,
        reason: "needs command approval",
        command: "bun test",
        cwd: "/tmp/project",
        availableDecisions: ["accept", "decline"],
      },
      {
        id: "request-1",
        method: "item/commandExecution/requestApproval",
      },
    );

    expect(event).toMatchObject({
      type: "approval.requested",
      approvalRequestId:
        "commandExecution:thread-1:turn-1:tool-1:request-1",
      approvalType: "commandExecution",
      requestMethod: "item/commandExecution/requestApproval",
      reason: "needs command approval",
      command: "bun test",
      cwd: "/tmp/project",
      availableDecisions: ["accept", "decline"],
      requestedAtMs: 123,
      status: "requires-action",
    });
  });

  test("file change approval params are converted to approval requested event", () => {
    const event = createFileChangeApprovalRequestedEvent(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "file-1",
        startedAtMs: 456,
        reason: "needs file approval",
        grantRoot: "/tmp/project",
      },
      {
        id: "request-2",
        method: "item/fileChange/requestApproval",
      },
    );

    expect(event).toMatchObject({
      type: "approval.requested",
      approvalRequestId: "fileChange:thread-1:turn-1:file-1:request-2",
      approvalType: "fileChange",
      requestMethod: "item/fileChange/requestApproval",
      reason: "needs file approval",
      grantRoot: "/tmp/project",
      requestedAtMs: 456,
      status: "requires-action",
    });
  });

  test("network approval context changes command approval type to network", () => {
    const event = createCommandApprovalRequestedEvent(
      {
        threadId: "thread-1",
        turnId: "turn-1",
        itemId: "tool-1",
        startedAtMs: 789,
        command: "internal command",
        networkApprovalContext: {
          host: "example.com",
          protocol: "https",
        },
      },
      {
        id: "request-3",
        method: "item/commandExecution/requestApproval",
      },
    );

    expect(event).toMatchObject({
      approvalRequestId: "network:thread-1:turn-1:tool-1:request-3",
      approvalType: "network",
      networkApprovalContext: {
        host: "example.com",
        protocol: "https",
      },
    });
  });
});
