import { describe, expect, test } from "bun:test";
import { CodexAppServerClient } from "./client";
import type { JsonValue } from "../rpc/types";
import type { JsonRpcConnection } from "../rpc/connection";

describe("CodexAppServerClient", () => {
  test("listThreads sends thread/list with params", async () => {
    const requests: Array<{ method: string; params?: JsonValue }> = [];
    const connection = {
      request: async (method: string, params?: JsonValue) => {
        requests.push({ method, params });
        return { data: [], nextCursor: null };
      },
    } as unknown as JsonRpcConnection;

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "test-client",
        title: "Test Client",
        version: "0.0.0",
      },
    });

    await expect(client.listThreads({ limit: 10 })).resolves.toEqual({
      data: [],
      nextCursor: null,
    });
    expect(requests).toEqual([
      {
        method: "thread/list",
        params: { limit: 10 },
      },
    ]);
  });

  test("readThread sends thread/read with thread id", async () => {
    const requests: Array<{ method: string; params?: JsonValue }> = [];
    const connection = {
      request: async (method: string, params?: JsonValue) => {
        requests.push({ method, params });
        return { thread: { id: "thr_123" } };
      },
    } as unknown as JsonRpcConnection;

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "test-client",
        title: "Test Client",
        version: "0.0.0",
      },
    });

    await expect(
      client.readThread({ threadId: "thr_123", includeTurns: true }),
    ).resolves.toEqual({ thread: { id: "thr_123" } });
    expect(requests).toEqual([
      {
        method: "thread/read",
        params: { threadId: "thr_123", includeTurns: true },
      },
    ]);
  });

  test("resumeThread sends thread/resume with thread id", async () => {
    const requests: Array<{ method: string; params?: JsonValue }> = [];
    const connection = {
      request: async (method: string, params?: JsonValue) => {
        requests.push({ method, params });
        return {
          thread: { id: "thr_123" },
          model: "gpt-5-codex",
          modelProvider: "openai",
          serviceTier: null,
          cwd: "/repo",
        };
      },
    } as unknown as JsonRpcConnection;

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "test-client",
        title: "Test Client",
        version: "0.0.0",
      },
    });

    await expect(client.resumeThread({ threadId: "thr_123" })).resolves.toEqual(
      {
        thread: { id: "thr_123" },
        model: "gpt-5-codex",
        modelProvider: "openai",
        serviceTier: null,
        cwd: "/repo",
      },
    );
    expect(requests).toEqual([
      {
        method: "thread/resume",
        params: { threadId: "thr_123" },
      },
    ]);
  });

  test("listThreadTurns sends thread/turns/list with paging params", async () => {
    const requests: Array<{ method: string; params?: JsonValue }> = [];
    const connection = {
      request: async (method: string, params?: JsonValue) => {
        requests.push({ method, params });
        return { data: [], nextCursor: null, backwardsCursor: null };
      },
    } as unknown as JsonRpcConnection;

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "test-client",
        title: "Test Client",
        version: "0.0.0",
      },
    });

    await expect(
      client.listThreadTurns({ threadId: "thr_123", limit: 5 }),
    ).resolves.toEqual({
      data: [],
      nextCursor: null,
      backwardsCursor: null,
    });
    expect(requests).toEqual([
      {
        method: "thread/turns/list",
        params: { threadId: "thr_123", limit: 5 },
      },
    ]);
  });

  test("interruptTurn sends turn/interrupt with thread and turn ids", async () => {
    const requests: Array<{ method: string; params?: JsonValue }> = [];
    const connection = {
      request: async (method: string, params?: JsonValue) => {
        requests.push({ method, params });
        return {};
      },
    } as unknown as JsonRpcConnection;

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "test-client",
        title: "Test Client",
        version: "0.0.0",
      },
    });

    const params = {
      threadId: "thr_123",
      turnId: "turn_456",
    };

    await expect(client.interruptTurn(params)).resolves.toEqual({});
    expect(requests).toEqual([
      {
        method: "turn/interrupt",
        params,
      },
    ]);
  });
});
