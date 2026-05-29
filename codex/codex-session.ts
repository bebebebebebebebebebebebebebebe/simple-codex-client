import { CodexAppServerClient } from "./client";
import {
  asString,
  isRecord,
  normalizeAgentMessageDelta,
  normalizeCommandOutputDelta,
  normalizeDiffUpdated,
  normalizeError,
  normalizeItemCompleted,
  normalizeItemStarted,
  normalizePlanUpdated,
  normalizeReasoningPartAdded,
  normalizeReasoningSummaryDelta,
  normalizeTurnCompleted,
} from "./notification-normalizer";
import type { CodexUiEvent } from "./ui-events";
import {
  ApprovalController,
  isBasicApprovalDecision,
  type ApprovalDecisionResult,
} from "./approval-controller";
import {
  registerWebApprovalRequestHandlers,
  type ApprovalEventSink,
} from "./web-approval-handlers";
import { JsonRpcConnection } from "../rpc/connection";
import { ProcessJsonlTransport } from "../transports/process-jsonl-transport";
import type { JsonValue } from "../rpc/types";
import { safeStringify, type RpcMessage } from "../rpc/types";
import type {
  ThreadListParams,
  ThreadListResponse,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadTurnsListParams,
  ThreadTurnsListResponse,
} from "./types";

/**
 * Codex app-server との JSON-RPC 接続で発生する診断イベントを stderr へ記録する。
 *
 * @param connection - ログ出力対象の JSON-RPC 接続。
 * @returns 登録処理のみを行い、値は返さない。
 */
const setupConnectionLogging = (connection: JsonRpcConnection): void => {
  connection.onMessage((message: RpcMessage) => {
    console.error("[codex rpc message]", safeStringify(message));
  });

  connection.onError((error) => {
    console.error("[codex rpc error]", error);
  });

  connection.onStderr((data) => {
    console.error("[codex stderr]", data);
  });

  connection.onExit((code, signal) => {
    console.error("[codex process exited]", {
      code,
      signal,
    });
  });
};

/**
 * push 型の通知コールバックを `AsyncIterable` として読み出せるようにする内部キュー。
 *
 * @typeParam T - キューで受け渡す値の型。
 */
class AsyncQueue<T> {
  private values: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private closed = false;

  /**
   * 待機中の consumer がいれば即時に渡し、いなければ値を蓄積する。
   *
   * @param value - 次に consumer へ渡す値。
   * @returns 値は返さない。
   */
  push(value: T) {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  /**
   * キューを閉じ、待機中の consumer へ完了を通知する。
   *
   * @returns 値は返さない。
   */
  close() {
    this.closed = true;
    while (this.resolvers.length > 0) {
      this.resolvers.shift()?.({ value: undefined as T, done: true });
    }
  }

  /**
   * 次の値があれば返し、なければ `push` または `close` まで待機する。
   *
   * @returns 次の iterator result。キューが閉じていれば `done: true` を返す。
   */
  async next(): Promise<IteratorResult<T>> {
    const value = this.values.shift();
    if (value) return { value, done: false };
    if (this.closed) return { value: undefined as T, done: true };

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * このキュー自身を async iterator として返す。
   *
   * @returns `for await...of` で消費できる async iterator。
   */
  [Symbol.asyncIterator]() {
    return this;
  }
}

type ActiveTurn = {
  threadId: string;
  turnId: string;
  interrupting: boolean;
};

export type InterruptCurrentTurnResult =
  | {
      ok: true;
      status: "interrupt-requested" | "already-interrupting";
      threadId: string;
      turnId: string;
    }
  | {
      ok: false;
      status: "no-active-turn" | "client-not-initialized";
      message: string;
    };

type RunTurnOptions = {
  signal?: AbortSignal;
  threadId?: string | null;
};

/**
 * Web UI から Codex app-server のスレッドとターンを扱うためのセッション管理クラス。
 *
 * 接続の遅延初期化、スレッド再利用、ターン通知の `CodexUiEvent` 化をまとめて扱う。
 */
export class CodexWebSession {
  private client: CodexAppServerClient | null = null;
  private connection: JsonRpcConnection | null = null;
  private started = false;
  private threadId: string | null = null;
  private activeTurn: ActiveTurn | null = null;
  private activeApprovalSink: ApprovalEventSink | null = null;
  private readonly approvalController = new ApprovalController();

  /**
   * Codex app-server プロセスを起動し、JSON-RPC クライアントを初期化する。
   *
   * すでに開始済みの場合は何もせず戻る。
   *
   * @returns 初期化が完了したら解決する Promise。
   * @throws プロセス起動、JSON-RPC 接続、または client start に失敗した場合に例外を送出する。
   */
  async start() {
    if (this.started) return;

    const transport = new ProcessJsonlTransport({
      command: "codex",
      args: ["app-server"],
    });

    const connection = new JsonRpcConnection(transport, {
      defaultTimeoutMs: 120_000,
    });

    const client = new CodexAppServerClient(connection, {
      clientInfo: {
        name: "simple_codex_client_web",
        title: "Simple Codex Client Web",
        version: "0.1.0",
      },
    });

    setupConnectionLogging(connection);
    connection.onExit(() => {
      this.approvalController.cleanup();
    });
    registerWebApprovalRequestHandlers(
      connection,
      this.approvalController,
      (event) => {
        this.activeApprovalSink?.(event);
      },
    );

    await client.start();

    this.connection = connection;
    this.client = client;
    this.started = true;
  }

  /**
   * 現在選択中の Codex thread ID を返す。
   *
   * @returns current thread ID。未選択の場合は `null`。
   */
  getCurrentThreadId(): string | null {
    return this.threadId;
  }

  private assertNoActiveTurn(): void {
    if (this.activeTurn) {
      throw new Error("cannot switch thread while a turn is active");
    }
  }

  private getInitializedClient(): CodexAppServerClient {
    const client = this.client;
    if (!client) {
      throw new Error("Codex client is not initialized");
    }
    return client;
  }

  private extractThreadId(
    result: Pick<ThreadStartResponse, "thread">,
    method: "thread/start" | "thread/resume",
  ): string {
    const thread = isRecord(result.thread) ? result.thread : undefined;
    const threadId = asString(thread?.["id"]);
    if (!threadId) {
      throw new Error(`${method} did not return thread.id`);
    }
    return threadId;
  }

  private async ensureThread(
    options: { threadId?: string | null } = {},
  ): Promise<string> {
    const requestedThreadId = options.threadId?.trim();
    if (requestedThreadId) {
      if (this.threadId !== requestedThreadId) {
        await this.resumeThread(requestedThreadId);
      }
      return requestedThreadId;
    }

    if (this.threadId) return this.threadId;

    const result = await this.startNewThread({ model: null });
    return this.extractThreadId(result, "thread/start");
  }

  /**
   * 保存済み Codex threads の一覧を取得する。
   *
   * @param params - ページングや検索などの一覧取得条件。
   * @returns Codex App Server が返す thread summary ページ。
   * @throws Codex client の初期化または JSON-RPC request が失敗した場合。
   */
  async listThreads(
    params: ThreadListParams = {},
  ): Promise<ThreadListResponse> {
    await this.start();
    return this.getInitializedClient().listThreads(params);
  }

  /**
   * 保存済み Codex thread を読み取る。
   *
   * `thread/read` は current thread を切り替えず、runtime へ resume もしない。
   *
   * @param threadId - 読み取る thread ID。
   * @param options - turn 履歴を response に含めるかどうか。
   * @returns 読み取った thread payload。
   * @throws Codex client の初期化または JSON-RPC request が失敗した場合。
   */
  async readThread(
    threadId: string,
    options: { includeTurns?: boolean } = {},
  ): Promise<ThreadReadResponse> {
    await this.start();
    return this.getInitializedClient().readThread({
      threadId,
      includeTurns: options.includeTurns ?? false,
    });
  }

  /**
   * 新しい Codex thread を作成し、current thread として選択する。
   *
   * @param params - `thread/start` に渡す runtime option。
   * @returns 作成された thread の情報。
   * @throws 実行中 turn がある場合、または Codex request が失敗した場合。
   */
  async startNewThread(
    params: ThreadStartParams = { model: null },
  ): Promise<ThreadStartResponse> {
    await this.start();
    this.assertNoActiveTurn();

    const result = await this.getInitializedClient().startThread(params);
    this.threadId = this.extractThreadId(result, "thread/start");
    return result;
  }

  /**
   * 既存の Codex thread を runtime に resume し、current thread として選択する。
   *
   * @param threadId - resume する thread ID。
   * @param params - `thread/resume` に渡す追加 runtime option。
   * @returns resume された thread の情報。
   * @throws 実行中 turn がある場合、または Codex request が失敗した場合。
   */
  async resumeThread(
    threadId: string,
    params: Omit<ThreadResumeParams, "threadId"> = {},
  ): Promise<ThreadResumeResponse> {
    await this.start();
    this.assertNoActiveTurn();

    const result = await this.getInitializedClient().resumeThread({
      ...params,
      threadId,
    });
    this.threadId = threadId;
    return result;
  }

  /**
   * 保存済み Codex thread の turn 履歴を取得する。
   *
   * @param threadId - 履歴を取得する thread ID。
   * @param params - ページングや item 読み込み粒度。
   * @returns Codex App Server が返す turn 履歴ページ。
   * @throws Codex client の初期化または JSON-RPC request が失敗した場合。
   */
  async listThreadTurns(
    threadId: string,
    params: Omit<ThreadTurnsListParams, "threadId"> = {},
  ): Promise<ThreadTurnsListResponse> {
    await this.start();
    return this.getInitializedClient().listThreadTurns({
      ...params,
      threadId,
    });
  }

  /**
   * Codex スレッドへユーザー入力を送信し、ターンの進行を `CodexUiEvent` として順次返す。
   *
   * 初回呼び出しではスレッドを作成し、以後は current thread ID を再利用する。`options.threadId`
   * が指定された場合は、その thread を resume してから turn を開始する。通知購読で受けた
   * reasoning、tool、message、turn 完了 event を yield し、終了時には購読解除とキューの close を必ず行う。
   *
   * @param inputText - Codex へ送信するユーザー入力テキスト。
   * @param options - abort signal と明示的な実行先 thread ID。
   * @returns Web UI が SSE として送信できるチャット進行イベントの async iterable。
   */
  async *runTurn(
    inputText: string,
    options: RunTurnOptions = {},
  ): AsyncIterable<CodexUiEvent> {
    await this.start();

    const client = this.client;
    if (!client) {
      yield { type: "error", message: "Codex client is not initialized" };
      return;
    }

    let threadId: string;
    try {
      threadId = await this.ensureThread({ threadId: options.threadId });
    } catch (error) {
      yield {
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      };
      return;
    }

    const queue = new AsyncQueue<CodexUiEvent>();
    const unsubscribers: Array<() => void> = [];
    const agentMessagePhases = new Map<
      string,
      "commentary" | "final_answer"
    >();

    const pushIfEvent = (event: CodexUiEvent | null): void => {
      if (event) queue.push(event);
    };

    this.activeApprovalSink = (event) => {
      queue.push(event);
    };

    unsubscribers.push(
      client.onNotification("item/agentMessage/delta", (params) => {
        const itemId = isRecord(params) ? asString(params["itemId"]) : undefined;
        pushIfEvent(
          normalizeAgentMessageDelta(
            params,
            itemId ? agentMessagePhases.get(itemId) : undefined,
          ),
        );
      }),
    );
    unsubscribers.push(
      client.onNotification("item/reasoning/summaryTextDelta", (params) => {
        pushIfEvent(normalizeReasoningSummaryDelta(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("item/reasoning/summaryPartAdded", (params) => {
        pushIfEvent(normalizeReasoningPartAdded(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("item/commandExecution/outputDelta", (params) => {
        pushIfEvent(normalizeCommandOutputDelta(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("turn/plan/updated", (params) => {
        pushIfEvent(normalizePlanUpdated(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("turn/diff/updated", (params) => {
        pushIfEvent(normalizeDiffUpdated(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("item/started", (params) => {
        const item = isRecord(params) ? params["item"] : undefined;
        if (isRecord(item)) {
          const itemId = asString(item["id"]);
          const phase = item["phase"];
          if (
            itemId &&
            item["type"] === "agentMessage" &&
            (phase === "commentary" || phase === "final_answer")
          ) {
            agentMessagePhases.set(itemId, phase);
          }
        }

        pushIfEvent(normalizeItemStarted(params));
      }),
    );
    unsubscribers.push(
      client.onNotification("item/completed", (params) => {
        const item = isRecord(params) ? params["item"] : undefined;
        const itemId = isRecord(item) ? asString(item["id"]) : undefined;
        pushIfEvent(normalizeItemCompleted(params));
        if (itemId && isRecord(item) && item["type"] === "agentMessage") {
          agentMessagePhases.delete(itemId);
        }
      }),
    );
    unsubscribers.push(
      client.onNotification("turn/completed", (params) => {
        queue.push(normalizeTurnCompleted(params));
        queue.close();
      }),
    );
    unsubscribers.push(
      client.onNotification("error", (params) => {
        queue.push(normalizeError(params));
        queue.close();
      }),
    );

    let startedTurnId: string | null = null;

    try {
      const turnResult = await client.startTurn({
        threadId,
        input: [{ type: "text", text: inputText }] as JsonValue[],
      });

      const turn = isRecord(turnResult.turn) ? turnResult.turn : undefined;
      const turnId = asString(turn?.["id"]);
      if (turnId) {
        startedTurnId = turnId;
        this.activeTurn = {
          threadId,
          turnId,
          interrupting: false,
        };

        queue.push({
          type: "turn.started",
          threadId,
          turnId,
        });

        if (options.signal?.aborted) {
          void this.interruptCurrentTurn().catch((error) => {
            console.error("[codex interrupt after start failed]", error);
          });
        }
      }

      for await (const event of queue) {
        yield event;
        if (event.type === "turn.completed" || event.type === "error") break;
      }
    } finally {
      this.approvalController.cleanup(
        threadId ? { threadId } : undefined,
      );
      this.activeApprovalSink = null;
      if (!this.activeTurn || this.activeTurn.turnId === startedTurnId) {
        this.activeTurn = null;
      }
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      queue.close();
    }
  }

  /**
   * 現在実行中の turn に `turn/interrupt` を送信する。
   *
   * @returns 中断要求の送信結果。実行中 turn がない場合は失敗 result を返す。
   * @throws Codex App Server への interrupt request が失敗した場合。
   */
  async interruptCurrentTurn(): Promise<InterruptCurrentTurnResult> {
    const activeTurn = this.activeTurn;
    if (!activeTurn) {
      return {
        ok: false,
        status: "no-active-turn",
        message: "No active Codex turn to interrupt",
      };
    }

    const client = this.client;
    if (!client) {
      return {
        ok: false,
        status: "client-not-initialized",
        message: "Codex client is not initialized",
      };
    }

    if (activeTurn.interrupting) {
      return {
        ok: true,
        status: "already-interrupting",
        threadId: activeTurn.threadId,
        turnId: activeTurn.turnId,
      };
    }

    this.activeTurn = {
      ...activeTurn,
      interrupting: true,
    };

    try {
      await client.interruptTurn({
        threadId: activeTurn.threadId,
        turnId: activeTurn.turnId,
      });
    } catch (error) {
      if (this.activeTurn?.turnId === activeTurn.turnId) {
        this.activeTurn = {
          ...activeTurn,
          interrupting: false,
        };
      }
      throw error;
    }

    return {
      ok: true,
      status: "interrupt-requested",
      threadId: activeTurn.threadId,
      turnId: activeTurn.turnId,
    };
  }

  /**
   * Codex クライアントを停止し、接続状態と保持中のスレッド ID を破棄する。
   *
   * @returns 停止処理が完了したら解決する Promise。
   */
  async stop() {
    this.approvalController.cleanup();
    await this.client?.stop();
    this.client = null;
    this.connection = null;
    this.started = false;
    this.threadId = null;
    this.activeTurn = null;
  }

  /**
   * Web UI から送られた approval decision で pending approval を解決する。
   *
   * @param approvalRequestId - 解決対象の approval request id。
   * @param decision - Web UI から送られた decision 値。
   * @returns approval controller が確定した decision と表示 status。
   * @throws decision が不正、または pending approval が存在しない場合。
   */
  submitApprovalDecision(
    approvalRequestId: string,
    decision: unknown,
  ): ApprovalDecisionResult {
    if (!isBasicApprovalDecision(decision)) {
      throw new Error(`invalid approval decision: ${String(decision)}`);
    }

    return this.approvalController.submitDecision(approvalRequestId, decision);
  }
}

/**
 * HTTP サーバーから共有して利用する Codex Web セッションのシングルトン。
 */
export const codexWebSession = new CodexWebSession();
