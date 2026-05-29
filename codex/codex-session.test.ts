import { describe, expect, test } from "bun:test";
import { CodexWebSession } from "./codex-session";
import type { CodexUiEvent } from "./ui-events";

type TestSessionInternals = {
  client: {
    interruptTurn?: (params: {
      threadId: string;
      turnId: string;
    }) => Promise<unknown>;
    listThreads?: (params?: unknown) => Promise<unknown>;
    readThread?: (params: unknown) => Promise<unknown>;
    resumeThread?: (params: unknown) => Promise<unknown>;
    startThread?: (params: unknown) => Promise<unknown>;
    startTurn?: (params: unknown) => Promise<unknown>;
    listThreadTurns?: (params: unknown) => Promise<unknown>;
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
  test("startNewThread starts a thread and stores the current thread id", async () => {
    const session = new CodexWebSession();
    const calls: unknown[] = [];
    const internals = internalsOf(session);

    internals.started = true;
    internals.client = {
      startThread: async (params) => {
        calls.push(params);
        return {
          thread: { id: "thr_new" },
          model: "gpt-5-codex",
          modelProvider: "openai",
          serviceTier: null,
          cwd: "/repo",
        };
      },
    };

    await expect(session.startNewThread({ model: null })).resolves.toMatchObject({
      thread: { id: "thr_new" },
    });
    expect(calls).toEqual([{ model: null }]);
    expect(session.getCurrentThreadId()).toBe("thr_new");
  });

  test("resumeThread resumes a thread and stores the current thread id", async () => {
    const session = new CodexWebSession();
    const calls: unknown[] = [];
    const internals = internalsOf(session);

    internals.started = true;
    internals.threadId = "thr_old";
    internals.client = {
      resumeThread: async (params) => {
        calls.push(params);
        return {
          thread: { id: "thr_new" },
          model: "gpt-5-codex",
          modelProvider: "openai",
          serviceTier: null,
          cwd: "/repo",
        };
      },
    };

    await expect(session.resumeThread("thr_new")).resolves.toMatchObject({
      thread: { id: "thr_new" },
    });
    expect(calls).toEqual([{ threadId: "thr_new" }]);
    expect(session.getCurrentThreadId()).toBe("thr_new");
  });

  test("readThread and listThreads do not change the current thread id", async () => {
    const session = new CodexWebSession();
    const internals = internalsOf(session);

    internals.started = true;
    internals.threadId = "thr_current";
    internals.client = {
      readThread: async () => ({ thread: { id: "thr_other" } }),
      listThreads: async () => ({ data: [{ id: "thr_other" }] }),
    };

    await expect(session.readThread("thr_other")).resolves.toEqual({
      thread: { id: "thr_other" },
    });
    await expect(session.listThreads()).resolves.toEqual({
      data: [{ id: "thr_other" }],
    });
    expect(session.getCurrentThreadId()).toBe("thr_current");
  });

  test("listThreadTurns does not change the current thread id", async () => {
    const session = new CodexWebSession();
    const calls: unknown[] = [];
    const internals = internalsOf(session);

    internals.started = true;
    internals.threadId = "thr_current";
    internals.client = {
      listThreadTurns: async (params) => {
        calls.push(params);
        return { data: [], nextCursor: null, backwardsCursor: null };
      },
    };

    await expect(session.listThreadTurns("thr_other", { limit: 10 })).resolves.toEqual({
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    });
    expect(calls).toEqual([{ threadId: "thr_other", limit: 10 }]);
    expect(session.getCurrentThreadId()).toBe("thr_current");
  });

  test("runTurn resumes the requested thread before starting a turn", async () => {
    const session = new CodexWebSession();
    const calls: Array<{ method: string; params: unknown }> = [];
    const internals = internalsOf(session);

    internals.started = true;
    internals.threadId = "thr_old";
    internals.client = {
      resumeThread: async (params) => {
        calls.push({ method: "resumeThread", params });
        return {
          thread: { id: "thr_new" },
          model: "gpt-5-codex",
          modelProvider: "openai",
          serviceTier: null,
          cwd: "/repo",
        };
      },
      startTurn: async (params) => {
        calls.push({ method: "startTurn", params });
        return { turn: { id: "turn_456" } };
      },
      onNotification: () => () => undefined,
    };

    const iterator = session
      .runTurn("hello", { threadId: "thr_new" })
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        type: "turn.started",
        threadId: "thr_new",
        turnId: "turn_456",
      } satisfies CodexUiEvent,
    });
    await iterator.return?.();

    expect(calls).toEqual([
      { method: "resumeThread", params: { threadId: "thr_new" } },
      {
        method: "startTurn",
        params: {
          threadId: "thr_new",
          input: [{ type: "text", text: "hello" }],
        },
      },
    ]);
    expect(session.getCurrentThreadId()).toBe("thr_new");
  });

  test("resumeThread rejects while an active turn is running", async () => {
    const session = new CodexWebSession();
    const internals = internalsOf(session);

    internals.started = true;
    internals.client = {
      resumeThread: async () => {
        throw new Error("should not call resumeThread");
      },
    };
    internals.activeTurn = {
      threadId: "thr_123",
      turnId: "turn_456",
      interrupting: false,
    };

    await expect(session.resumeThread("thr_other")).rejects.toThrow(
      "cannot switch thread while a turn is active",
    );
  });

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
