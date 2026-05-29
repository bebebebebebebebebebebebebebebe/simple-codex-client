import { describe, expect, spyOn, test } from "bun:test";
import { interruptCurrentTurn } from "./turn-interrupt-api";

describe("turn interrupt API client", () => {
  test("posts to the current turn interrupt endpoint without an abort signal", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          status: "interrupt-requested",
          threadId: "thr_123",
          turnId: "turn_456",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(interruptCurrentTurn()).resolves.toMatchObject({
      ok: true,
      status: "interrupt-requested",
      threadId: "thr_123",
      turnId: "turn_456",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/turns/current/interrupt",
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    expect(fetchSpy.mock.calls[0]?.[1]).not.toHaveProperty("signal");
    fetchSpy.mockRestore();
  });

  test("returns API error JSON for failed interrupt requests", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          status: "no-active-turn",
          error: "No active Codex turn to interrupt",
        }),
        {
          status: 409,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(interruptCurrentTurn()).resolves.toEqual({
      ok: false,
      status: "no-active-turn",
      error: "No active Codex turn to interrupt",
    });
    fetchSpy.mockRestore();
  });

  test("returns a fallback error when the response is not JSON", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500 }),
    );

    await expect(interruptCurrentTurn()).resolves.toEqual({
      ok: false,
      error: "Interrupt request failed: 500",
    });
    fetchSpy.mockRestore();
  });
});
