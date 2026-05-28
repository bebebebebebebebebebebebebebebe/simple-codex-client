import { describe, expect, test } from "bun:test";
import type {
  ApprovalState,
  CodexTurnState,
  ToolState,
} from "./codex-turn-state";
import { createInitialCodexTurnState } from "./codex-turn-state";
import { deriveRunStatus } from "./derive-run-status";

const createState = (
  overrides: Partial<CodexTurnState> = {},
): CodexTurnState => ({
  ...createInitialCodexTurnState(),
  ...overrides,
});

const createApproval = (
  overrides: Partial<ApprovalState> = {},
): ApprovalState => ({
  approvalRequestId: "approval-1",
  approvalType: "commandExecution",
  threadId: "thread-1",
  turnId: "turn-1",
  itemId: "tool-1",
  requestMethod: "item/commandExecution/requestApproval",
  status: "requires-action",
  ...overrides,
});

const createTool = (overrides: Partial<ToolState> = {}): ToolState => ({
  itemId: "tool-1",
  toolType: "commandExecution",
  toolName: "shell",
  argsText: "bun test",
  output: "",
  status: "running",
  ...overrides,
});

describe("deriveRunStatus", () => {
  test("initial running state starts work", () => {
    expect(deriveRunStatus(createState())).toMatchObject({
      kind: "running",
      label: "AI作業中",
      description: "作業を開始しています",
      active: true,
    });
  });

  test("failed state returns terminal failure", () => {
    expect(
      deriveRunStatus(createState({ status: "failed", error: "boom" })),
    ).toMatchObject({
      kind: "failed",
      label: "失敗",
      description: "boom",
      severity: "danger",
      active: false,
    });
  });

  test("interrupted state returns terminal interruption", () => {
    expect(
      deriveRunStatus(createState({ status: "interrupted" })),
    ).toMatchObject({
      kind: "interrupted",
      label: "中断",
      active: false,
    });
  });

  test("completed state returns terminal completion", () => {
    expect(deriveRunStatus(createState({ status: "completed" }))).toMatchObject({
      kind: "completed",
      label: "完了",
      severity: "success",
      active: false,
    });
  });

  test("pending approval is waiting for approval", () => {
    expect(
      deriveRunStatus(
        createState({
          approvalItems: {
            "approval-1": createApproval({ approvalType: "network" }),
          },
        }),
      ),
    ).toMatchObject({
      kind: "waiting-approval",
      label: "承認待ち",
      description: "ネットワークアクセスの許可が必要です",
      severity: "warning",
    });
  });

  test("submitting approval is sending user decision", () => {
    expect(
      deriveRunStatus(
        createState({
          approvalItems: {
            "approval-1": createApproval({ status: "submitting" }),
          },
        }),
      ),
    ).toMatchObject({
      kind: "submitting-approval",
      label: "承認送信中",
    });
  });

  test("running command tool uses the command text as description", () => {
    expect(
      deriveRunStatus(
        createState({
          toolItems: {
            "tool-1": createTool({ argsText: "bun test\nsecond line" }),
          },
        }),
      ),
    ).toMatchObject({
      kind: "tool-running",
      label: "ツール実行中",
      description: "bun test",
    });
  });

  test("running non-command tool falls back to tool name", () => {
    expect(
      deriveRunStatus(
        createState({
          toolItems: {
            "tool-1": createTool({
              toolType: "webSearch",
              toolName: "webSearch",
              argsText: undefined,
            }),
          },
        }),
      ),
    ).toMatchObject({
      kind: "tool-running",
      description: "webSearch",
    });
  });

  test("plan text with active marker returns planning", () => {
    expect(
      deriveRunStatus(
        createState({
          planText: "Plan\n[x] Read files\n[>] Implement status bar",
        }),
      ),
    ).toMatchObject({
      kind: "planning",
      label: "計画進行中",
      description: "Implement status bar",
    });
  });

  test("running final answer returns finalizing", () => {
    expect(deriveRunStatus(createState({ finalText: "done" }))).toMatchObject({
      kind: "finalizing",
      label: "回答作成中",
    });
  });

  test("running diff returns diff-ready", () => {
    expect(deriveRunStatus(createState({ diffText: "diff" }))).toMatchObject({
      kind: "diff-ready",
      label: "変更差分を更新",
    });
  });

  test("terminal statuses take priority over stale approval and tool items", () => {
    const state = createState({
      status: "failed",
      error: "boom",
      approvalItems: {
        "approval-1": createApproval(),
      },
      toolItems: {
        "tool-1": createTool(),
      },
    });

    expect(deriveRunStatus(state).kind).toBe("failed");
  });

  test("pending approval takes priority over running tool and plan", () => {
    const state = createState({
      approvalItems: {
        "approval-1": createApproval(),
      },
      toolItems: {
        "tool-1": createTool(),
      },
      planText: "[>] Implement",
    });

    expect(deriveRunStatus(state).kind).toBe("waiting-approval");
  });
});
