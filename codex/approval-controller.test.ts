import { describe, expect, test } from "bun:test";
import { ApprovalController } from "./approval-controller";
import type { CodexUiEvent } from "./ui-events";

const createApprovalEvent = (
  overrides: Partial<Extract<CodexUiEvent, { type: "approval.requested" }>> = {},
): Extract<CodexUiEvent, { type: "approval.requested" }> => ({
  type: "approval.requested",
  approvalRequestId: "approval-1",
  approvalType: "commandExecution",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "tool-1",
  requestMethod: "item/commandExecution/requestApproval",
  status: "requires-action",
  ...overrides,
});

describe("ApprovalController", () => {
  test("pending approval resolves with submitted decision", async () => {
    const controller = new ApprovalController();
    const pending = controller.waitForDecision(createApprovalEvent());

    const result = controller.submitDecision("approval-1", "accept");

    expect(result).toMatchObject({
      decision: "accept",
      status: "accepted",
    });
    await expect(pending).resolves.toMatchObject({
      decision: "accept",
      status: "accepted",
    });
  });

  test("unknown approval id fails", () => {
    const controller = new ApprovalController();

    expect(() => controller.submitDecision("missing", "decline")).toThrow(
      "approval request not found",
    );
  });

  test("available decisions restrict submitted decision", () => {
    const controller = new ApprovalController();
    controller.waitForDecision(
      createApprovalEvent({
        availableDecisions: ["accept", "cancel"],
      }),
    );

    expect(() => controller.submitDecision("approval-1", "decline")).toThrow(
      "approval decision is not available",
    );
    expect(controller.submitDecision("approval-1", "cancel")).toMatchObject({
      decision: "cancel",
      status: "cancelled",
    });
  });

  test("timeout resolves with expired status and safe fallback decision", async () => {
    const controller = new ApprovalController(1);

    await expect(
      controller.waitForDecision(
        createApprovalEvent({
          availableDecisions: ["accept", "cancel"],
        }),
      ),
    ).resolves.toMatchObject({
      decision: "cancel",
      status: "expired",
    });
  });

  test("cleanup resolves matching pending approvals safely", async () => {
    const controller = new ApprovalController();
    const pending = controller.waitForDecision(createApprovalEvent());

    expect(controller.cleanup({ turnId: "turn-1" })).toBe(1);

    await expect(pending).resolves.toMatchObject({
      decision: "cancel",
      status: "cancelled",
    });
  });
});
