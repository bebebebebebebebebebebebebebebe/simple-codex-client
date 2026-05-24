import { registerDefaultServerRequestHandlers } from "./approvals";
import { CodexAppServerClient } from "./client";
import { JsonRpcConnection } from "../rpc/connection";
import { ProcessJsonlTransport } from "../transports/process-jsonl-transport";
import type { JsonValue } from "../rpc/types";
import { safeStringify, type RpcMessage } from "../rpc/types";

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
 * Web UI へ SSE として渡すチャット進行イベントを表す。
 *
 * `delta` は生成途中のテキスト、`done` は正常完了、`error` はターン失敗を示す。
 */
type ChatChunk =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; message: string };

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

/**
 * Web UI から Codex app-server のスレッドとターンを扱うためのセッション管理クラス。
 *
 * 接続の遅延初期化、スレッド再利用、ターン通知の `ChatChunk` 化をまとめて扱う。
 */
export class CodexWebSession {
  private client: CodexAppServerClient | null = null;
  private connection: JsonRpcConnection | null = null;
  private started = false;
  private threadId: string | null = null;

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
    registerDefaultServerRequestHandlers(connection);

    await client.start();

    this.connection = connection;
    this.client = client;
    this.started = true;
  }

  /**
   * Codex スレッドへユーザー入力を送信し、ターンの進行を `ChatChunk` として順次返す。
   *
   * 初回呼び出しではスレッドを作成し、以後は同じスレッド ID を再利用する。通知購読で受けた
   * `delta`、`done`、`error` を yield し、終了時には購読解除とキューの close を必ず行う。
   *
   * @param inputText - Codex へ送信するユーザー入力テキスト。
   * @returns Web UI が SSE として送信できるチャット進行イベントの async iterable。
   */
  async *runTurn(inputText: string): AsyncIterable<ChatChunk> {
    await this.start();

    const client = this.client;
    if (!client) {
      yield { type: "error", message: "Codex client is not initialized" };
      return;
    }

    if (!this.threadId) {
      const threadResult = await client.startThread({
        model: null,
      });

      const thread = threadResult.thread as { id?: string };
      if (!thread.id) {
        yield {
          type: "error",
          message: "thread/start did not return thread.id",
        };
        return;
      }

      this.threadId = thread.id;
    }

    const queue = new AsyncQueue<ChatChunk>();

    const unsubscribeDelta = client.onNotification(
      "item/agentMessage/delta",
      (params) => {
        const payload = params as { delta?: string; text?: string };
        const text = payload.delta ?? payload.text ?? "";
        if (text) {
          queue.push({ type: "delta", text });
        }
      },
    );

    const unsubscribeCompleted = client.onNotification("turn/completed", () => {
      queue.push({ type: "done" });
      queue.close();
    });

    const unsubscribeError = client.onNotification("error", (params) => {
      const payload = params as { error?: { message?: string } };
      queue.push({
        type: "error",
        message: payload.error?.message ?? "Codex turn failed",
      });
      queue.close();
    });

    try {
      await client.startTurn({
        threadId: this.threadId,
        input: [{ type: "text", text: inputText }] as JsonValue[],
      });

      for await (const chunk of queue) {
        yield chunk;
        if (chunk.type === "done" || chunk.type === "error") break;
      }
    } finally {
      unsubscribeDelta();
      unsubscribeCompleted();
      unsubscribeError();
      queue.close();
    }
  }

  /**
   * Codex クライアントを停止し、接続状態と保持中のスレッド ID を破棄する。
   *
   * @returns 停止処理が完了したら解決する Promise。
   */
  async stop() {
    await this.client?.stop();
    this.client = null;
    this.connection = null;
    this.started = false;
    this.threadId = null;
  }
}

/**
 * HTTP サーバーから共有して利用する Codex Web セッションのシングルトン。
 */
export const codexWebSession = new CodexWebSession();
