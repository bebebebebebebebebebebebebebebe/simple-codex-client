import { describe, expect, test } from "bun:test";
import { applyCodexUiEvent } from "./codex-turn-reducer";
import { createInitialCodexTurnState } from "./codex-turn-state";
import { toAssistantRunResult } from "./to-assistant-parts";

describe("Codex turn reducer", () => {
  test("reasoning summary deltas are grouped by item and summary index", () => {
    let state = createInitialCodexTurnState();

    state = applyCodexUiEvent(state, {
      type: "reasoning.part",
      turnId: "turn-1",
      itemId: "reasoning-1",
      summaryIndex: 1,
    });
    state = applyCodexUiEvent(state, {
      type: "reasoning.delta",
      turnId: "turn-1",
      itemId: "reasoning-1",
      summaryIndex: 0,
      text: "first",
    });
    state = applyCodexUiEvent(state, {
      type: "reasoning.delta",
      turnId: "turn-1",
      itemId: "reasoning-1",
      summaryIndex: 1,
      text: "second",
    });

    expect(state.reasoningItems["reasoning-1"]?.summaries).toEqual([
      "first",
      "second",
    ]);
  });

  test("command tool events are merged by item id", () => {
    let state = createInitialCodexTurnState();

    state = applyCodexUiEvent(state, {
      type: "tool.started",
      turnId: "turn-1",
      itemId: "tool-1",
      toolType: "commandExecution",
      name: "shell",
      args: "bun test",
      cwd: "/tmp/project",
    });
    state = applyCodexUiEvent(state, {
      type: "tool.output.delta",
      turnId: "turn-1",
      itemId: "tool-1",
      text: "ok",
      stream: "stdout",
    });

    expect(state.toolItems["tool-1"]).toMatchObject({
      itemId: "tool-1",
      toolType: "commandExecution",
      toolName: "shell",
      argsText: "bun test",
      output: "ok",
      status: "running",
    });
  });

  test("item completed overwrites tool result and status with authoritative values", () => {
    let state = createInitialCodexTurnState();

    state = applyCodexUiEvent(state, {
      type: "tool.output.delta",
      turnId: "turn-1",
      itemId: "tool-1",
      text: "partial",
    });
    state = applyCodexUiEvent(state, {
      type: "tool.completed",
      turnId: "turn-1",
      itemId: "tool-1",
      toolType: "commandExecution",
      status: "completed",
      result: "final",
      exitCode: 0,
    });

    expect(state.toolItems["tool-1"]).toMatchObject({
      output: "partial",
      result: "final",
      status: "complete",
    });
  });

  test("plan and diff are projected to assistant-ui parts", () => {
    let state = createInitialCodexTurnState();

    state = applyCodexUiEvent(state, {
      type: "plan.updated",
      turnId: "turn-1",
      explanation: "Plan",
      plan: [
        { step: "Read files", status: "completed" },
        { step: "Implement", status: "inProgress" },
      ],
    });
    state = applyCodexUiEvent(state, {
      type: "diff.updated",
      turnId: "turn-1",
      diff: "diff --git a/file b/file",
    });

    const result = toAssistantRunResult(state);

    expect(result.content?.[0]).toMatchObject({
      type: "reasoning",
      text: "## Plan\nPlan\n[x] Read files\n[>] Implement",
    });
    expect(result.content?.[1]).toMatchObject({
      type: "tool-call",
      toolCallId: "turn-diff",
      toolName: "file changes",
      result: "diff --git a/file b/file",
    });
  });

  test("commentary reasoning keeps a stable position before tools", () => {
    let state = createInitialCodexTurnState();

    state = applyCodexUiEvent(state, {
      type: "message.delta",
      turnId: "turn-1",
      itemId: "commentary-1",
      phase: "commentary",
      text: "checking",
    });
    state = applyCodexUiEvent(state, {
      type: "tool.started",
      turnId: "turn-1",
      itemId: "tool-1",
      toolType: "mcpToolCall",
      name: "serena.find_symbol",
    });

    const result = toAssistantRunResult(state);

    expect(result.content?.map((part) => part.type)).toEqual([
      "reasoning",
      "tool-call",
    ]);
  });

  test("turn completed and error events update assistant message status", () => {
    const completed = applyCodexUiEvent(createInitialCodexTurnState(), {
      type: "turn.completed",
      turnId: "turn-1",
      status: "completed",
    });
    const failed = applyCodexUiEvent(createInitialCodexTurnState(), {
      type: "error",
      message: "failed",
    });

    expect(toAssistantRunResult(completed).status).toEqual({
      type: "complete",
      reason: "stop",
    });
    expect(toAssistantRunResult(failed).status).toEqual({
      type: "incomplete",
      reason: "error",
      error: "failed",
    });
    expect(toAssistantRunResult(failed).content?.[0]).toEqual({
      type: "text",
      text: "failed",
    });
  });
});
