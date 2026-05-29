import { describe, expect, spyOn, test } from "bun:test";
import {
  listCodexThreadTurns,
  listCodexThreads,
  readCodexThread,
  resumeCodexThread,
  startCodexThread,
} from "./codex-thread-api";

describe("codex thread API client", () => {
  test("lists threads with serialized query params", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [],
          nextCursor: null,
          currentThreadId: "thr_current",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      listCodexThreads({
        limit: 10,
        archived: false,
        searchTerm: "hello",
        sortKey: "updated_at",
        sourceKinds: ["appServer", "cli"],
      }),
    ).resolves.toMatchObject({
      ok: true,
      currentThreadId: "thr_current",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/threads?limit=10&archived=false&searchTerm=hello&sortKey=updated_at&sourceKinds=appServer%2Ccli",
    );
    fetchSpy.mockRestore();
  });

  test("starts a thread with POST body", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          thread: { id: "thr_new" },
          currentThreadId: "thr_new",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(startCodexThread({ model: null })).resolves.toMatchObject({
      thread: { id: "thr_new" },
      currentThreadId: "thr_new",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/threads",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: null }),
      }),
    );
    fetchSpy.mockRestore();
  });

  test("reads a thread from an encoded endpoint", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, thread: { id: "thr:1" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(readCodexThread("thr:1", { includeTurns: true })).resolves.toEqual(
      {
        ok: true,
        thread: { id: "thr:1" },
      },
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/threads/thr%3A1?includeTurns=true",
    );
    fetchSpy.mockRestore();
  });

  test("resumes a thread with POST body", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          thread: { id: "thr:1" },
          currentThreadId: "thr:1",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(resumeCodexThread("thr:1", { cwd: "/repo" })).resolves.toMatchObject({
      currentThreadId: "thr:1",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/threads/thr%3A1/resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cwd: "/repo" }),
      }),
    );
    fetchSpy.mockRestore();
  });

  test("lists thread turns with encoded endpoint and query params", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: [],
          nextCursor: null,
          backwardsCursor: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      listCodexThreadTurns("thr:1", {
        limit: 5,
        sortDirection: "asc",
        itemsView: "full",
      }),
    ).resolves.toMatchObject({ ok: true, data: [] });
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/threads/thr%3A1/turns?limit=5&sortDirection=asc&itemsView=full",
    );
    fetchSpy.mockRestore();
  });

  test("throws API error message when request fails", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "thread missing" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(readCodexThread("missing")).rejects.toThrow("thread missing");
    fetchSpy.mockRestore();
  });

  test("throws fallback error for non JSON responses", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500 }),
    );

    await expect(listCodexThreads()).rejects.toThrow(
      "Codex thread request failed: 500",
    );
    fetchSpy.mockRestore();
  });
});
