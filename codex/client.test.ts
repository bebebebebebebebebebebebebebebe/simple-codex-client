import { describe, expect, test } from "bun:test";
import { CodexAppServerClient } from "./client";
import type { JsonValue } from "../rpc/types";
import type { JsonRpcConnection } from "../rpc/connection";

describe("CodexAppServerClient", () => {
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
