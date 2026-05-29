export type CodexThreadListParams = {
  cursor?: string | null;
  limit?: number;
  archived?: boolean;
  searchTerm?: string;
  cwd?: string;
  sortKey?: "created_at" | "updated_at";
  sourceKinds?: string[];
};

export type CodexThreadListResponse = {
  ok: true;
  data: unknown[];
  nextCursor: string | null;
  currentThreadId: string | null;
};

export type CodexThreadResponse = {
  ok: true;
  thread: unknown;
  currentThreadId?: string | null;
};

export type CodexThreadTurnsListParams = {
  cursor?: string | null;
  limit?: number;
  sortDirection?: "asc" | "desc";
  itemsView?: "notLoaded" | "summary" | "full";
};

export type CodexThreadTurnsListResponse = {
  ok: true;
  data: unknown[];
  nextCursor: string | null;
  backwardsCursor: string | null;
};

const readJsonOrThrow = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => null)) as
    | { error?: unknown }
    | T
    | null;

  if (!response.ok) {
    const error =
      body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Codex thread request failed: ${response.status}`;
    throw new Error(error);
  }

  if (!body) {
    throw new Error(`Codex thread request failed: ${response.status}`);
  }

  return body as T;
};

/**
 * Codex thread 一覧を backend API から取得する。
 *
 * @param params - 一覧のページング、検索、絞り込み条件。
 * @returns thread summary のページ。
 * @throws backend API が失敗した場合。
 */
export async function listCodexThreads(
  params: CodexThreadListParams = {},
): Promise<CodexThreadListResponse> {
  const search = new URLSearchParams();

  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.archived !== undefined) {
    search.set("archived", String(params.archived));
  }
  if (params.searchTerm) search.set("searchTerm", params.searchTerm);
  if (params.cwd) search.set("cwd", params.cwd);
  if (params.sortKey) search.set("sortKey", params.sortKey);
  if (params.sourceKinds?.length) {
    search.set("sourceKinds", params.sourceKinds.join(","));
  }

  const suffix = search.toString();
  const response = await fetch(`/api/threads${suffix ? `?${suffix}` : ""}`);
  return readJsonOrThrow<CodexThreadListResponse>(response);
}

/**
 * Codex thread を新規作成する。
 *
 * @param body - `thread/start` に渡す追加 option。
 * @returns 作成された thread と current thread ID。
 * @throws backend API が失敗した場合。
 */
export async function startCodexThread(
  body: Record<string, unknown> = {},
): Promise<CodexThreadResponse> {
  const response = await fetch("/api/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return readJsonOrThrow<CodexThreadResponse>(response);
}

/**
 * 保存済み Codex thread を読み取る。
 *
 * @param threadId - 読み取る thread ID。
 * @param options - turn 履歴を含めるかどうか。
 * @returns 読み取った thread payload。
 * @throws backend API が失敗した場合。
 */
export async function readCodexThread(
  threadId: string,
  options: { includeTurns?: boolean } = {},
): Promise<CodexThreadResponse> {
  const search = new URLSearchParams();
  if (options.includeTurns) search.set("includeTurns", "true");

  const suffix = search.toString();
  const response = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}${suffix ? `?${suffix}` : ""}`,
  );

  return readJsonOrThrow<CodexThreadResponse>(response);
}

/**
 * 既存の Codex thread を resume し、backend の current thread として選択する。
 *
 * @param threadId - resume する thread ID。
 * @param body - `thread/resume` に渡す追加 option。
 * @returns resume された thread と current thread ID。
 * @throws backend API が失敗した場合。
 */
export async function resumeCodexThread(
  threadId: string,
  body: Record<string, unknown> = {},
): Promise<CodexThreadResponse> {
  const response = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}/resume`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  return readJsonOrThrow<CodexThreadResponse>(response);
}

/**
 * 保存済み Codex thread の turn 履歴を取得する。
 *
 * @param threadId - 履歴を取得する thread ID。
 * @param params - ページングや item view の指定。
 * @returns turn 履歴のページ。
 * @throws backend API が失敗した場合。
 */
export async function listCodexThreadTurns(
  threadId: string,
  params: CodexThreadTurnsListParams = {},
): Promise<CodexThreadTurnsListResponse> {
  const search = new URLSearchParams();

  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.sortDirection) {
    search.set("sortDirection", params.sortDirection);
  }
  if (params.itemsView) search.set("itemsView", params.itemsView);

  const suffix = search.toString();
  const response = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}/turns${
      suffix ? `?${suffix}` : ""
    }`,
  );

  return readJsonOrThrow<CodexThreadTurnsListResponse>(response);
}
