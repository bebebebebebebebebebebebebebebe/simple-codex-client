import { describe, expect, test } from "bun:test";
import { CodexWebSession } from "./codex-session";
import type { CodexUiEvent } from "./ui-events";

type TestSessionInternals = {
  client: {
    interruptTurn?: (params: {
      threadId: string;
      turnId: string;
    }) => Promise<unknown>;
    startTurn?: (params: unknown) => Promise<unknown>;
    onNotification?: (method: string, listener: unknown) => () => void;
  } | null;
  started: boolean;
  threadId: string | null;
  activeTurn: {
    threadId: string;
    turnId: string;
    interrupting: boolean;
  } | null;
};

const internalsOf = (session: CodexWebSession): TestSessionInternals => {
  return session as unknown as TestSessionInternals;
};

describe("CodexWebSession interrupt handling", () => {
  test("interruptCurrentTurn returns no-active-turn without starting a client", async () => {
    const session = new CodexWebSession();

    await expect(session.interruptCurrentTurn()).resolves.toEqual({
      ok: false,
      status: "no-active-turn",
      message: "No active Codex turn to interrupt",
    });
  });

  test("interruptCurrentTurn sends turn interrupt for the active turn", async () => {
    const session = new CodexWebSession();
    const calls: unknown[] = [];
    const internals = internalsOf(session);

    internals.activeTurn = {
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: false,
    };
    internals.client = {
      interruptTurn: async (params) => {
        calls.push(params);
        return {};
      },
    };

    await expect(session.interruptCurrentTurn()).resolves.toEqual({
      ok: true,
      status: "interrupt-requested",
      threadId: "thr_123",
      turnId: "turn_456",
    });
    expect(calls).toEqual([{ threadId: "thr_123", turnId: "turn_456" }]);
    expect(internals.activeTurn?.interrupting).toBe(true);
  });

  test("interruptCurrentTurn is idempotent while interruption is pending", async () => {
    const session = new CodexWebSession();
    const calls: unknown[] = [];
    const internals = internalsOf(session);

    internals.activeTurn = {
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: true,
    };
    internals.client = {
      interruptTurn: async (params) => {
        calls.push(params);
        return {};
      },
    };

    await expect(session.interruptCurrentTurn()).resolves.toEqual({
      ok: true,
      status: "already-interrupting",
      threadId: "thr_123",
      turnId: "turn_456",
    });
    expect(calls).toEqual([]);
  });

  test("interruptCurrentTurn resets interrupting when the RPC request fails", async () => {
    const session = new CodexWebSession();
    const internals = internalsOf(session);

    internals.activeTurn = {
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: false,
    };
    internals.client = {
      interruptTurn: async () => {
        throw new Error("interrupt failed");
      },
    };

    await expect(session.interruptCurrentTurn()).rejects.toThrow(
      "interrupt failed",
    );
    expect(internals.activeTurn).toMatchObject({
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: false,
    });
  });

  test("runTurn clears the active turn when the iterator is closed", async () => {
    const session = new CodexWebSession();
    const unsubscribers: Array<() => void> = [];
    const internals = internalsOf(session);

    internals.started = true;
    internals.threadId = "thr_123";
    internals.client = {
      startTurn: async () => ({ turn: { id: "turn_456" } }),
      onNotification: () => {
        const unsubscribe = () => undefined;
        unsubscribers.push(unsubscribe);
        return unsubscribe;
      },
    };

    const iterator = session.runTurn("hello")[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: "turn.started",
        threadId: "thr_123",
        turnId: "turn_456",
      } satisfies CodexUiEvent,
    });

    expect(internals.activeTurn).toMatchObject({
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: false,
    });

    await iterator.return?.();

    expect(internals.activeTurn).toBeNull();
    expect(unsubscribers).toHaveLength(10);
  });
});
