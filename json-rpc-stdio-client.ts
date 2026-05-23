import readline from "node:readline";
import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/**
 * JSON-RPC のリクエスト ID を表す型。
 *
 * JSON-RPC 2.0 では ID は string / number / null を取り得る。
 * このコードでは、クライアントから送信するリクエストと、
 * サーバーから返ってくるレスポンスを対応付けるために使用する。
 */
type RpcId = string | number | null;

/**
 * JSON-RPC のエラーオブジェクト。
 *
 * @property code - JSON-RPC エラーコード。
 * @property message - エラー内容を表すメッセージ。
 * @property data - 任意の追加情報。
 */
type RpcError = {
  code: number;
  message: string;
  data?: unknown;
};

/**
 * JSON-RPC のリクエストメッセージ。
 *
 * クライアントからサーバー、またはサーバーからクライアントへ
 * 「応答が必要な処理」を依頼するために使う。
 *
 * @template TParams - params の型。
 * @property id - リクエストとレスポンスを対応付ける ID。
 * @property method - 呼び出す RPC メソッド名。
 * @property params - メソッドに渡す任意のパラメータ。
 */
type RpcRequest<TParams = unknown> = {
  id: RpcId;
  method: string;
  params?: TParams;
};

/**
 * JSON-RPC の通知メッセージ。
 *
 * 通知はリクエストと異なり、レスポンスを期待しない。
 * 例えば `initialized` のように、状態変化を一方向に知らせる用途で使う。
 *
 * @template TParams - params の型。
 * @property method - 通知する RPC メソッド名。
 * @property params - 通知に付随する任意のパラメータ。
 */
type RpcNotification<TParams = unknown> = {
  method: string;
  params?: TParams;
};

/**
 * JSON-RPC の成功レスポンス。
 *
 * @template TResult - result の型。
 * @property id - 対応するリクエスト ID。
 * @property result - RPC メソッドの成功結果。
 */
type RpcSuccessResponse<TResult = unknown> = {
  id: RpcId;
  result: TResult;
};

/**
 * JSON-RPC のエラーレスポンス。
 *
 * @property id - 対応するリクエスト ID。
 * @property error - JSON-RPC のエラー情報。
 */
type RpcErrorResponse = {
  id: RpcId;
  error: RpcError;
};

/**
 * このクライアントが扱う JSON-RPC メッセージ全体の Union 型。
 *
 * 受信した JSON オブジェクトは、最終的にこのいずれかとして扱われる。
 */
type RpcMessage =
  | RpcRequest
  | RpcNotification
  | RpcSuccessResponse
  | RpcErrorResponse;

/**
 * サーバーからクライアントへ送られた RPC リクエストを処理するハンドラ。
 *
 * Codex App Server では、コマンド実行やファイル変更に対する承認要求など、
 * サーバー側からクライアントに問い合わせが来る場合がある。
 *
 * @param params - サーバーから渡された RPC パラメータ。
 * @param context - リクエスト ID とメソッド名を含む実行コンテキスト。
 * @returns RPC レスポンスとしてサーバーに返す値。Promise も返却可能。
 */
type RpcRequestHandler = (
  params: unknown,
  context: {
    id: RpcId;
    method: string;
  },
) => unknown | Promise<unknown>;

/**
 * RPC 通知を受け取ったときに呼び出されるリスナー。
 *
 * @param params - 通知に付随するパラメータ。
 * @param method - 通知メソッド名。
 */
type RpcNotificationListener = (params: unknown, method: string) => void;

/**
 * RPC メッセージを受信したときに呼び出されるリスナー。
 *
 * @param message - 受信した RPC メッセージ。
 */
type RpcMessageListener = (message: RpcMessage) => void;

/**
 * RPC 接続上でエラーが発生したときに呼び出されるリスナー。
 *
 * @param error - 発生したエラー。
 */
type RpcErrorListener = (error: unknown) => void;

/**
 * サーバープロセスの stderr 出力を受け取るリスナー。
 *
 * @param data - stderr に出力された文字列。
 */
type RpcStderrListener = (data: string) => void;

/**
 * サーバープロセスが終了したときに呼び出されるリスナー。
 *
 * @param code - プロセスの終了コード。シグナル終了の場合は null になり得る。
 * @param signal - 終了シグナル。通常終了の場合は null になり得る。
 */
type RpcExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

/**
 * JSONL Transport が 1 行分の JSON メッセージを受信したときのリスナー。
 *
 * @param message - JSON.parse 済みの未知の値。
 */
type JsonlTransportMessageListener = (message: unknown) => void;

/**
 * JSONL Transport 内でエラーが発生したときのリスナー。
 *
 * @param error - 発生したエラー。
 */
type JsonlTransportErrorListener = (error: unknown) => void;

/**
 * JSONL Transport がサーバープロセスの stderr を受け取ったときのリスナー。
 *
 * @param data - stderr に出力された文字列。
 */
type JsonlTransportStderrListener = (data: string) => void;

/**
 * JSONL Transport がサーバープロセスの終了を検知したときのリスナー。
 *
 * @param code - 終了コード。
 * @param signal - 終了シグナル。
 */
type JsonlTransportExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

/**
 * 子プロセスとして起動する JSONL サーバーの設定。
 *
 * stdout / stdin を通じて 1 行 1 JSON のメッセージをやり取りする
 * サーバープロセスを起動するために使用する。
 *
 * @property command - 実行するコマンド。
 * @property args - コマンドに渡す引数。
 * @property cwd - サーバープロセスの作業ディレクトリ。
 * @property env - サーバープロセスに渡す環境変数。
 * @property killTimeoutMs - SIGTERM 後、SIGKILL に切り替えるまでの待機時間。
 */
type ProcessJsonlTransportOptions = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  killTimeoutMs?: number;
};

/**
 * JSON-RPC 接続の設定。
 *
 * @property defaultTimeoutMs - RPC リクエストのデフォルトタイムアウト時間。
 */
type JsonRpcConnectionOptions = {
  defaultTimeoutMs?: number;
};

/**
 * 接続対象となるサーバープロセスの種類。
 *
 * - json-rpc-mock-server: ローカルのモック RPC サーバーを bun で起動する。
 * - codex-app-server: `codex app-server` を起動する。
 * - custom: 任意のコマンドを JSONL RPC サーバーとして起動する。
 */
type ServerProcess =
  | {
      type: "json-rpc-mock-server";
      scriptPath?: string;
    }
  | {
      type: "codex-app-server";
    }
  | {
      type: "custom";
      command: string;
      args?: string[];
      cwd?: string;
      env?: NodeJS.ProcessEnv;
    };

/**
 * Codex App Server に渡すクライアント情報。
 *
 * initialize リクエスト時に送信し、サーバー側にクライアントの識別情報を伝える。
 *
 * @property name - 機械的に扱うクライアント名。
 * @property title - 表示向けのクライアント名。
 * @property version - クライアントのバージョン。
 */
type ClientInfo = {
  name: string;
  title: string;
  version: string;
};

/**
 * Codex App Server クライアントの設定。
 *
 * @property clientInfo - initialize 時にサーバーへ渡すクライアント情報。
 */
type CodexAppServerClientOptions = {
  clientInfo: ClientInfo;
};

/**
 * 任意の入力ソースを抽象化するインターフェース。
 *
 * stdin、Web UI、HTTP API、ファイルなど、入力元を差し替え可能にするための層。
 *
 * @template TInput - 入力として受け取る値の型。
 */
interface InputAdapter<TInput> {
  /**
   * 入力の監視を開始する。
   *
   * @param onInput - 入力を受け取ったときに呼び出すコールバック。
   * @param onError - 入力処理中にエラーが発生したときに呼び出すコールバック。
   */
  start(
    onInput: (input: TInput) => void,
    onError: (error: unknown) => void,
  ): void;

  /**
   * 入力の監視を停止する。
   */
  stop(): void;
}

/**
 * 任意の入力値を RPC メッセージへ変換するインターフェース。
 *
 * 入力形式と RPC 送信形式を分離することで、
 * CLI 入力、フォーム入力、独自 DSL などを RPC メッセージに変換できる。
 *
 * @template TInput - 変換元の入力型。
 */
interface InputMapper<TInput> {
  /**
   * 入力値を RPC メッセージへ変換する。
   *
   * @param input - 入力アダプタから渡された値。
   * @returns 送信可能な RPC メッセージ。
   * @throws 入力値が RPC メッセージとして不正な場合。
   */
  toMessage(input: TInput): RpcMessage;
}

/**
 * 子プロセスと JSONL 形式で通信する Transport 層。
 *
 * このクラスは JSON-RPC の意味解釈を行わず、
 * 「サーバープロセスを起動する」
 * 「stdin に JSON 文字列を書き込む」
 * 「stdout の 1 行を JSON として読み取る」
 * という低レベルな通信責務だけを持つ。
 */
class ProcessJsonlTransport {
  private serverProcess?: ChildProcessWithoutNullStreams;
  private serverOutput?: readline.Interface;

  private readonly messageListeners = new Set<JsonlTransportMessageListener>();
  private readonly errorListeners = new Set<JsonlTransportErrorListener>();
  private readonly stderrListeners = new Set<JsonlTransportStderrListener>();
  private readonly exitListeners = new Set<JsonlTransportExitListener>();

  private started = false;
  private closed = false;

  /**
   * ProcessJsonlTransport を生成する。
   *
   * @param options - 起動するプロセスのコマンド、引数、作業ディレクトリなど。
   */
  constructor(private readonly options: ProcessJsonlTransportOptions) {}

  /**
   * サーバープロセスを起動し、stdout / stderr / exit / error の監視を開始する。
   *
   * すでに起動済みの場合は何もしない。
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.closed = false;

    this.serverProcess = spawn(this.options.command, this.options.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.options.cwd,
      env: this.options.env,
    });

    this.serverOutput = readline.createInterface({
      input: this.serverProcess.stdout,
    });

    this.serverOutput.on("line", this.handleStdoutLine);
    this.serverProcess.stderr.on("data", this.handleStderrData);
    this.serverProcess.on("error", this.handleProcessError);
    this.serverProcess.on("exit", this.handleExit);
    this.serverProcess.on("close", this.handleClose);
  }

  /**
   * サーバープロセスとの通信を停止する。
   *
   * stdin を閉じ、プロセスが終了していない場合は SIGTERM を送り、
   * 指定時間内に終了しなければ SIGKILL を送る。
   *
   * @returns 停止処理の完了を表す Promise。
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    const serverProcess = this.serverProcess;
    const serverOutput = this.serverOutput;

    if (!serverProcess) {
      return;
    }

    serverOutput?.off("line", this.handleStdoutLine);
    serverProcess.stderr.off("data", this.handleStderrData);
    serverProcess.off("error", this.handleProcessError);
    serverProcess.off("exit", this.handleExit);
    serverProcess.off("close", this.handleClose);

    serverOutput?.close();

    if (serverProcess.stdin.writable) {
      serverProcess.stdin.end();
    }

    if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
      serverProcess.kill("SIGTERM");

      await sleep(this.options.killTimeoutMs ?? 1_000);

      if (
        serverProcess.exitCode === null &&
        serverProcess.signalCode === null
      ) {
        serverProcess.kill("SIGKILL");
      }
    }

    this.closed = true;
  }

  /**
   * サーバープロセスの stdin に JSONL メッセージを送信する。
   *
   * @param message - JSON.stringify 可能な任意の値。
   * @returns 書き込み完了を表す Promise。
   * @throws Transport が開始されていない場合。
   * @throws stdin が書き込み不能な場合。
   * @throws JSON.stringify に失敗した場合。
   */
  async send(message: unknown): Promise<void> {
    if (!this.started || !this.serverProcess) {
      throw new Error("transport is not started");
    }

    if (!this.serverProcess.stdin.writable) {
      throw new Error("server stdin is not writable");
    }

    let line: string;

    try {
      line = `${JSON.stringify(message)}\n`;
    } catch (error) {
      throw new Error(
        `failed to serialize message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const writable = this.serverProcess.stdin.write(line);

    if (!writable) {
      await once(this.serverProcess.stdin, "drain");
    }
  }

  /**
   * stdout から JSON メッセージを受信したときのリスナーを登録する。
   *
   * @param listener - JSON.parse 済みメッセージを受け取る関数。
   * @returns 登録解除関数。
   */
  onMessage(listener: JsonlTransportMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * Transport レベルのエラーリスナーを登録する。
   *
   * @param listener - エラーを受け取る関数。
   * @returns 登録解除関数。
   */
  onError(listener: JsonlTransportErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * サーバープロセスの stderr リスナーを登録する。
   *
   * @param listener - stderr 文字列を受け取る関数。
   * @returns 登録解除関数。
   */
  onStderr(listener: JsonlTransportStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  /**
   * サーバープロセス終了時のリスナーを登録する。
   *
   * @param listener - 終了コードと終了シグナルを受け取る関数。
   * @returns 登録解除関数。
   */
  onExit(listener: JsonlTransportExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

  /**
   * stdout から 1 行受け取ったときの内部ハンドラ。
   *
   * @param line - stdout から読み取った 1 行の文字列。
   */
  private readonly handleStdoutLine = (line: string): void => {
    try {
      const message = JSON.parse(line) as unknown;

      for (const listener of this.messageListeners) {
        listener(message);
      }
    } catch (error) {
      this.emitError(
        new Error(
          `failed to parse server stdout line: ${line}\n${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
    }
  };

  /**
   * stderr からデータを受け取ったときの内部ハンドラ。
   *
   * @param data - stderr から受け取った Buffer。
   */
  private readonly handleStderrData = (data: Buffer): void => {
    for (const listener of this.stderrListeners) {
      listener(data.toString());
    }
  };

  /**
   * サーバープロセス起動・実行中にエラーが発生したときの内部ハンドラ。
   *
   * @param error - Node.js のプロセスエラー。
   */
  private readonly handleProcessError = (error: Error): void => {
    this.emitError(error);
  };

  /**
   * サーバープロセスが exit したときの内部ハンドラ。
   *
   * @param code - 終了コード。
   * @param signal - 終了シグナル。
   */
  private readonly handleExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    for (const listener of this.exitListeners) {
      listener(code, signal);
    }
  };

  /**
   * サーバープロセスの close イベントを処理する内部ハンドラ。
   */
  private readonly handleClose = (): void => {
    this.closed = true;
  };

  /**
   * 登録済みのエラーリスナーへエラーを通知する。
   *
   * @param error - 通知するエラー。
   */
  private emitError(error: unknown): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  /**
   * Transport が閉じられているかを返す。
   *
   * @returns close 済みであれば true。
   */
  isClosed(): boolean {
    return this.closed;
  }
}

/**
 * JSONL Transport の上に JSON-RPC の意味論を実装する接続クラス。
 *
 * このクラスは以下を担当する。
 *
 * - RPC request / response の対応付け
 * - タイムアウト管理
 * - notification の配送
 * - サーバーから来た request への応答
 * - RPC メッセージの妥当性検証
 */
class JsonRpcConnection {
  private readonly pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (reason: unknown) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  private readonly requestHandlers = new Map<string, RpcRequestHandler>();
  private readonly notificationListeners = new Map<
    string,
    Set<RpcNotificationListener>
  >();

  private readonly messageListeners = new Set<RpcMessageListener>();
  private readonly errorListeners = new Set<RpcErrorListener>();
  private readonly stderrListeners = new Set<RpcStderrListener>();
  private readonly exitListeners = new Set<RpcExitListener>();

  private nextRequestId = 0;
  private started = false;

  /**
   * JsonRpcConnection を生成する。
   *
   * @param transport - JSONL 形式で読み書きする Transport。
   * @param options - RPC 接続の設定。
   */
  constructor(
    private readonly transport: ProcessJsonlTransport,
    private readonly options: JsonRpcConnectionOptions = {},
  ) {}

  /**
   * RPC 接続を開始する。
   *
   * Transport のイベントリスナーを登録し、サーバープロセスを起動する。
   * すでに開始済みの場合は何もしない。
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    this.transport.onMessage(this.handleTransportMessage);
    this.transport.onError(this.emitError);
    this.transport.onStderr(this.emitStderr);
    this.transport.onExit(this.handleTransportExit);

    this.transport.start();
  }

  /**
   * RPC 接続を停止する。
   *
   * 未完了のリクエストをすべて失敗扱いにし、
   * Transport を停止する。
   *
   * @returns 停止完了を表す Promise。
   */
  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(
        new Error("connection stopped before response was received"),
      );
      this.pendingRequests.delete(key);
    }

    await this.transport.stop();
  }

  /**
   * RPC メッセージをそのまま送信する。
   *
   * request / notification / response を問わず送信できるため、
   * 手動入力や低レベルな検証用途に向いている。
   *
   * @param message - 送信する RPC メッセージ。
   * @returns 送信完了を表す Promise。
   * @throws message が RPC メッセージとして不正な場合。
   */
  async sendRaw(message: RpcMessage): Promise<void> {
    assertRpcMessage(message);
    await this.transport.send(message);
  }

  /**
   * RPC リクエストを送信し、対応するレスポンスを待つ。
   *
   * @template TResult - 期待する result の型。
   * @param method - 呼び出す RPC メソッド名。
   * @param params - メソッドへ渡すパラメータ。
   * @param options - このリクエスト専用のオプション。
   * @returns サーバーから返された result。
   * @throws タイムアウトした場合。
   * @throws Transport 送信に失敗した場合。
   * @throws サーバーが RPC エラーレスポンスを返した場合。
   */
  async request<TResult = unknown>(
    method: string,
    params?: unknown,
    options?: {
      timeoutMs?: number;
    },
  ): Promise<TResult> {
    const id = this.createRequestId();
    const message: RpcRequest =
      params === undefined ? { id, method } : { id, method, params };

    const timeoutMs =
      options?.timeoutMs ?? this.options.defaultTimeoutMs ?? 30_000;
    const key = this.getPendingKey(id);

    const resultPromise = new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(key);
        reject(new Error(`RPC request timed out: ${method} id=${String(id)}`));
      }, timeoutMs);

      this.pendingRequests.set(key, {
        resolve: (value) => {
          resolve(value as TResult);
        },
        reject,
        timeout,
      });
    });

    try {
      await this.sendRaw(message);
    } catch (error) {
      const pending = this.pendingRequests.get(key);

      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(error);
        this.pendingRequests.delete(key);
      }
    }

    return resultPromise;
  }

  /**
   * RPC notification を送信する。
   *
   * notification はレスポンスを待たない。
   *
   * @param method - 通知メソッド名。
   * @param params - 通知に渡すパラメータ。
   * @returns 送信完了を表す Promise。
   */
  async notify(method: string, params?: unknown): Promise<void> {
    const message: RpcNotification =
      params === undefined ? { method } : { method, params };

    await this.sendRaw(message);
  }

  /**
   * サーバーから受け取った RPC request に成功レスポンスを返す。
   *
   * @param id - 対応するリクエスト ID。
   * @param result - 返却する処理結果。
   * @returns 送信完了を表す Promise。
   */
  async respond(id: RpcId, result: unknown): Promise<void> {
    await this.sendRaw({
      id,
      result,
    });
  }

  /**
   * サーバーから受け取った RPC request にエラーレスポンスを返す。
   *
   * @param id - 対応するリクエスト ID。
   * @param error - 返却する RPC エラー。
   * @returns 送信完了を表す Promise。
   */
  async respondError(id: RpcId, error: RpcError): Promise<void> {
    await this.sendRaw({
      id,
      error,
    });
  }

  /**
   * すべての RPC メッセージを監視するリスナーを登録する。
   *
   * ロギングやデバッグ用途で使用する。
   *
   * @param listener - 受信メッセージを受け取る関数。
   * @returns 登録解除関数。
   */
  onMessage(listener: RpcMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * RPC 接続上のエラーリスナーを登録する。
   *
   * @param listener - エラーを受け取る関数。
   * @returns 登録解除関数。
   */
  onError(listener: RpcErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * サーバープロセスの stderr 出力リスナーを登録する。
   *
   * @param listener - stderr 文字列を受け取る関数。
   * @returns 登録解除関数。
   */
  onStderr(listener: RpcStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  /**
   * サーバープロセス終了時のリスナーを登録する。
   *
   * @param listener - 終了コードとシグナルを受け取る関数。
   * @returns 登録解除関数。
   */
  onExit(listener: RpcExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

  /**
   * 特定の RPC notification を処理するリスナーを登録する。
   *
   * @param method - 監視対象の notification メソッド名。
   * @param listener - notification を受け取る関数。
   * @returns 登録解除関数。
   */
  onNotification(
    method: string,
    listener: RpcNotificationListener,
  ): () => void {
    const listeners = this.notificationListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.notificationListeners.set(method, listeners);

    return () => {
      listeners.delete(listener);

      if (listeners.size === 0) {
        this.notificationListeners.delete(method);
      }
    };
  }

  /**
   * サーバーから送られてくる特定の RPC request を処理するハンドラを登録する。
   *
   * @param method - 処理対象の request メソッド名。
   * @param handler - request を処理して result を返す関数。
   * @returns 登録解除関数。
   */
  onRequest(method: string, handler: RpcRequestHandler): () => void {
    this.requestHandlers.set(method, handler);

    return () => {
      const currentHandler = this.requestHandlers.get(method);

      if (currentHandler === handler) {
        this.requestHandlers.delete(method);
      }
    };
  }

  /**
   * Transport から受信した unknown メッセージを RPC メッセージとして処理する。
   *
   * メッセージの種別に応じて、成功レスポンス、エラーレスポンス、
   * サーバー request、notification に振り分ける。
   *
   * @param message - Transport から受け取った未検証の値。
   */
  private readonly handleTransportMessage = (message: unknown): void => {
    try {
      assertRpcMessage(message);

      for (const listener of this.messageListeners) {
        listener(message);
      }

      if (isRpcSuccessResponse(message)) {
        this.handleSuccessResponse(message);
        return;
      }

      if (isRpcErrorResponse(message)) {
        this.handleErrorResponse(message);
        return;
      }

      if (isRpcRequest(message)) {
        void this.handleServerRequest(message);
        return;
      }

      if (isRpcNotification(message)) {
        this.handleNotification(message);
        return;
      }

      this.emitError(
        new Error(`unsupported RPC message: ${JSON.stringify(message)}`),
      );
    } catch (error) {
      this.emitError(error);
    }
  };

  /**
   * 成功レスポンスを処理し、対応する pending request を resolve する。
   *
   * @param message - サーバーから受け取った成功レスポンス。
   */
  private handleSuccessResponse(message: RpcSuccessResponse): void {
    const key = this.getPendingKey(message.id);
    const pending = this.pendingRequests.get(key);

    if (!pending) {
      this.emitError(
        new Error(
          `received response for unknown request id: ${String(message.id)}`,
        ),
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(key);
    pending.resolve(message.result);
  }

  /**
   * エラーレスポンスを処理し、対応する pending request を reject する。
   *
   * @param message - サーバーから受け取ったエラーレスポンス。
   */
  private handleErrorResponse(message: RpcErrorResponse): void {
    const key = this.getPendingKey(message.id);
    const pending = this.pendingRequests.get(key);

    if (!pending) {
      this.emitError(
        new Error(
          `received error response for unknown request id: ${String(message.id)}`,
        ),
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(key);
    pending.reject(new RpcResponseError(message.error));
  }

  /**
   * サーバーから送られてきた RPC request を処理する。
   *
   * 登録済みハンドラがあれば実行し、成功またはエラーとして応答する。
   * 未登録メソッドの場合は JSON-RPC の Method not found を返す。
   *
   * @param message - サーバーから受け取った RPC request。
   * @returns 応答送信の完了を表す Promise。
   */
  private async handleServerRequest(message: RpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(message.method);

    if (!handler) {
      await this.respondError(message.id, {
        code: -32601,
        message: `Method not found: ${message.method}`,
      });
      return;
    }

    try {
      const result = await handler(message.params, {
        id: message.id,
        method: message.method,
      });

      await this.respond(message.id, result ?? null);
    } catch (error) {
      await this.respondError(message.id, {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * RPC notification を登録済みリスナーへ配送する。
   *
   * @param message - 受信した notification。
   */
  private handleNotification(message: RpcNotification): void {
    const listeners = this.notificationListeners.get(message.method);

    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(message.params, message.method);
    }
  }

  /**
   * 登録済みエラーリスナーへエラーを通知する。
   *
   * @param error - 通知するエラー。
   */
  private readonly emitError = (error: unknown): void => {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  };

  /**
   * 登録済み stderr リスナーへ stderr 文字列を通知する。
   *
   * @param data - stderr 文字列。
   */
  private readonly emitStderr = (data: string): void => {
    for (const listener of this.stderrListeners) {
      listener(data);
    }
  };

  /**
   * Transport の終了イベントを処理する。
   *
   * 未完了リクエストをすべて失敗させたうえで、
   * 登録済み exit リスナーへ終了情報を通知する。
   *
   * @param code - 終了コード。
   * @param signal - 終了シグナル。
   */
  private readonly handleTransportExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    for (const [key, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(
        new Error(
          `server process exited before response was received: requestKey=${key}`,
        ),
      );
      this.pendingRequests.delete(key);
    }

    for (const listener of this.exitListeners) {
      listener(code, signal);
    }
  };

  /**
   * 新しい RPC リクエスト ID を生成する。
   *
   * @returns 連番の数値 ID。
   */
  private createRequestId(): number {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return id;
  }

  /**
   * pendingRequests Map 用のキーを生成する。
   *
   * string の "1" と number の 1 を区別するため、
   * 型名と値を組み合わせた文字列にする。
   *
   * @param id - RPC リクエスト ID。
   * @returns pendingRequests 用のキー。
   */
  private getPendingKey(id: RpcId): string {
    return `${typeof id}:${String(id)}`;
  }
}

/**
 * Codex App Server 向けの高水準クライアント。
 *
 * JsonRpcConnection を直接扱う代わりに、
 * Codex App Server の initialize フローや request / notify を
 * 少し扱いやすくするためのラッパークラス。
 */
class CodexAppServerClient {
  /**
   * CodexAppServerClient を生成する。
   *
   * @param connection - Codex App Server と通信する JSON-RPC 接続。
   * @param options - クライアント情報などの設定。
   */
  constructor(
    private readonly connection: JsonRpcConnection,
    private readonly options: CodexAppServerClientOptions,
  ) {}

  /**
   * Codex App Server の初期化フローを実行する。
   *
   * まず `initialize` request を送り、その後 `initialized` notification を送る。
   *
   * @returns initialize メソッドのレスポンス。
   */
  async initialize(): Promise<unknown> {
    const result = await this.connection.request("initialize", {
      clientInfo: this.options.clientInfo,
    });

    await this.connection.notify("initialized", {});

    return result;
  }

  /**
   * Codex App Server に RPC request を送信する。
   *
   * @template TResult - 期待する result の型。
   * @param method - 呼び出す RPC メソッド名。
   * @param params - メソッドに渡すパラメータ。
   * @returns サーバーから返された result。
   */
  async request<TResult = unknown>(
    method: string,
    params?: unknown,
  ): Promise<TResult> {
    return this.connection.request<TResult>(method, params);
  }

  /**
   * Codex App Server に RPC notification を送信する。
   *
   * @param method - 通知メソッド名。
   * @param params - 通知に渡すパラメータ。
   * @returns 送信完了を表す Promise。
   */
  async notify(method: string, params?: unknown): Promise<void> {
    await this.connection.notify(method, params);
  }

  /**
   * Codex App Server からの notification を購読する。
   *
   * @param method - 購読対象の notification メソッド名。
   * @param listener - notification を受け取る関数。
   * @returns 登録解除関数。
   */
  onNotification(
    method: string,
    listener: RpcNotificationListener,
  ): () => void {
    return this.connection.onNotification(method, listener);
  }

  /**
   * Codex App Server からの request を処理するハンドラを登録する。
   *
   * @param method - 処理対象の request メソッド名。
   * @param handler - request を処理する関数。
   * @returns 登録解除関数。
   */
  onRequest(method: string, handler: RpcRequestHandler): () => void {
    return this.connection.onRequest(method, handler);
  }
}

/**
 * 標準入力から 1 行ずつ JSON を受け取る InputAdapter。
 *
 * CLI から手動で RPC メッセージを入力し、
 * サーバーへ送るために使用する。
 */
class StdinJsonInputAdapter implements InputAdapter<unknown> {
  private readlineInterface?: readline.Interface;

  /**
   * StdinJsonInputAdapter を生成する。
   *
   * @param promptText - CLI に表示するプロンプト文字列。
   */
  constructor(private readonly promptText = "> ") {}

  /**
   * 標準入力の監視を開始する。
   *
   * 入力された 1 行を JSON.parse し、成功すれば onInput に渡す。
   * JSON として不正な場合は onError に渡す。
   *
   * @param onInput - JSON.parse した入力値を受け取る関数。
   * @param onError - 入力処理中のエラーを受け取る関数。
   */
  start(
    onInput: (input: unknown) => void,
    onError: (error: unknown) => void,
  ): void {
    if (this.readlineInterface) {
      return;
    }

    this.readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    this.readlineInterface.setPrompt(this.promptText);
    this.readlineInterface.prompt();

    this.readlineInterface.on("line", (line) => {
      const text = line.trim();

      if (!text) {
        this.readlineInterface?.prompt();
        return;
      }

      try {
        const input = JSON.parse(text) as unknown;
        onInput(input);
      } catch (error) {
        onError(error);
      } finally {
        this.readlineInterface?.prompt();
      }
    });
  }

  /**
   * 標準入力の監視を停止する。
   */
  stop(): void {
    this.readlineInterface?.close();
    this.readlineInterface = undefined;
  }
}

/**
 * 入力値を RPC メッセージとして検証し、そのまま返す InputMapper。
 *
 * CLI で入力された JSON がすでに RPC メッセージ形式である前提のため、
 * 変換は行わず、妥当性検証のみを行う。
 */
class RpcMessageInputMapper implements InputMapper<unknown> {
  /**
   * 入力値を RPC メッセージとして検証して返す。
   *
   * @param input - 入力アダプタから渡された値。
   * @returns 検証済み RPC メッセージ。
   * @throws input が RPC メッセージとして不正な場合。
   */
  toMessage(input: unknown): RpcMessage {
    assertRpcMessage(input);
    return input;
  }
}

/**
 * 手動入力された JSON を RPC メッセージとして送信するランタイム。
 *
 * InputAdapter と InputMapper を組み合わせることで、
 * 入力元と RPC メッセージ変換処理を差し替え可能にしている。
 *
 * @template TInput - 入力アダプタが返す入力値の型。
 */
class ManualJsonInputRuntime<TInput> {
  private started = false;

  /**
   * ManualJsonInputRuntime を生成する。
   *
   * @param dependencies - 接続、入力アダプタ、入力マッパー、任意のエラーハンドラ。
   */
  constructor(
    private readonly dependencies: {
      connection: JsonRpcConnection;
      inputAdapter: InputAdapter<TInput>;
      inputMapper: InputMapper<TInput>;
      onError?: (error: unknown) => void;
    },
  ) {}

  /**
   * 手動入力ランタイムを開始する。
   *
   * 入力アダプタを起動し、入力値を RPC メッセージに変換して送信する。
   */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    this.dependencies.inputAdapter.start(
      (input) => {
        void this.handleInput(input);
      },
      (error) => {
        this.handleError(error);
      },
    );
  }

  /**
   * 手動入力ランタイムを停止する。
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.dependencies.inputAdapter.stop();
  }

  /**
   * 入力値を RPC メッセージへ変換し、接続へ送信する。
   *
   * @param input - 入力アダプタから受け取った値。
   * @returns 送信完了を表す Promise。
   */
  private async handleInput(input: TInput): Promise<void> {
    try {
      const message = this.dependencies.inputMapper.toMessage(input);
      await this.dependencies.connection.sendRaw(message);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * 入力処理中のエラーを処理する。
   *
   * onError が指定されていれば委譲し、指定されていなければ throw する。
   *
   * @param error - 発生したエラー。
   */
  private handleError(error: unknown): void {
    if (this.dependencies.onError) {
      this.dependencies.onError(error);
      return;
    }

    throw error;
  }
}

/**
 * JSON-RPC エラーレスポンスを JavaScript Error として扱うためのクラス。
 *
 * request() がサーバーから error response を受け取った場合、
 * このエラーとして reject される。
 */
class RpcResponseError extends Error {
  /**
   * RpcResponseError を生成する。
   *
   * @param rpcError - サーバーから返された JSON-RPC エラー。
   */
  constructor(readonly rpcError: RpcError) {
    super(rpcError.message);
    this.name = "RpcResponseError";
  }
}

/**
 * ServerProcess 設定から ProcessJsonlTransport を生成する。
 *
 * サーバー種別に応じて、起動コマンドと引数を組み立てる。
 *
 * @param serverProcess - 起動対象のサーバープロセス設定。
 * @returns 対応する ProcessJsonlTransport。
 */
const createProcessJsonlTransport = (
  serverProcess: ServerProcess,
): ProcessJsonlTransport => {
  switch (serverProcess.type) {
    case "json-rpc-mock-server":
      return new ProcessJsonlTransport({
        command: "bun",
        args: ["run", serverProcess.scriptPath ?? "json-rpc-mock-server.ts"],
      });

    case "codex-app-server":
      return new ProcessJsonlTransport({
        command: "codex",
        args: ["app-server"],
      });

    case "custom":
      return new ProcessJsonlTransport({
        command: serverProcess.command,
        args: serverProcess.args,
        cwd: serverProcess.cwd,
        env: serverProcess.env,
      });

    default:
      return assertNever(serverProcess);
  }
};

/**
 * RPC 接続にデフォルトのログ出力を設定する。
 *
 * RPC メッセージ、RPC エラー、stderr、プロセス終了を console.error に出力する。
 *
 * @param connection - ログ設定対象の RPC 接続。
 */
const setupConnectionLogging = (connection: JsonRpcConnection): void => {
  connection.onMessage((message) => {
    console.error("[rpc message]", JSON.stringify(message));
  });

  connection.onError((error) => {
    console.error("[rpc error]", error);
  });

  connection.onStderr((data) => {
    console.error("[server stderr]", data);
  });

  connection.onExit((code, signal) => {
    console.error("[server exited]", {
      code,
      signal,
    });
  });
};

/**
 * Codex App Server から送られる承認要求に対するデフォルトハンドラを登録する。
 *
 * このサンプルでは安全側に倒し、
 * コマンド実行承認とファイル変更承認のどちらも deny を返す。
 *
 * 実運用では、UI でユーザーに承認を求める、ポリシーに基づき自動判定する、
 * といった処理に置き換える想定。
 *
 * @param connection - ハンドラを登録する RPC 接続。
 */
const registerDefaultServerRequestHandlers = (
  connection: JsonRpcConnection,
): void => {
  connection.onRequest(
    "item/commandExecution/requestApproval",
    async (params) => {
      console.error("[approval required: command execution]", params);

      return {
        decision: "deny",
        reason: "No approval handler is configured.",
      };
    },
  );

  connection.onRequest("item/fileChange/requestApproval", async (params) => {
    console.error("[approval required: file change]", params);

    return {
      decision: "deny",
      reason: "No approval handler is configured.",
    };
  });
};

/**
 * 値がプレーンなオブジェクトかどうかを判定する。
 *
 * 配列、null、プリミティブ値は false を返す。
 *
 * @param value - 判定対象の値。
 * @returns プレーンオブジェクトであれば true。
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * オブジェクトが指定した own property を持つかどうかを判定する。
 *
 * @param value - 判定対象のオブジェクト。
 * @param key - 確認するプロパティ名。
 * @returns own property として存在すれば true。
 */
const hasOwn = (value: Record<string, unknown>, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

/**
 * 値が JSON-RPC の ID として妥当かどうかを判定する。
 *
 * @param value - 判定対象の値。
 * @returns string / number / null のいずれかであれば true。
 */
const isRpcId = (value: unknown): value is RpcId => {
  return (
    typeof value === "string" || typeof value === "number" || value === null
  );
};

/**
 * 値が JSON-RPC エラーオブジェクトとして妥当かどうかを判定する。
 *
 * @param value - 判定対象の値。
 * @returns RpcError として扱える場合は true。
 */
const isRpcError = (value: unknown): value is RpcError => {
  if (!isPlainObject(value)) {
    return false;
  }

  return typeof value.code === "number" && typeof value.message === "string";
};

/**
 * jsonrpc フィールドが存在しない、または "2.0" であるかを判定する。
 *
 * このコードでは jsonrpc フィールドを任意として扱い、
 * 存在する場合のみ "2.0" であることを要求する。
 *
 * @param value - 判定対象のオブジェクト。
 * @returns jsonrpc フィールドが妥当であれば true。
 */
const hasValidOptionalJsonRpcVersion = (
  value: Record<string, unknown>,
): boolean => {
  return !hasOwn(value, "jsonrpc") || value.jsonrpc === "2.0";
};

/**
 * 値が JSON-RPC request として妥当かどうかを判定する。
 *
 * request は id と method を持ち、result / error を持たない。
 *
 * @param value - 判定対象の値。
 * @returns RpcRequest として扱える場合は true。
 */
const isRpcRequest = (value: unknown): value is RpcRequest => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcId(value.id) &&
    typeof value.method === "string" &&
    !hasOwn(value, "result") &&
    !hasOwn(value, "error")
  );
};

/**
 * 値が JSON-RPC notification として妥当かどうかを判定する。
 *
 * notification は method を持ち、id / result / error を持たない。
 *
 * @param value - 判定対象の値。
 * @returns RpcNotification として扱える場合は true。
 */
const isRpcNotification = (value: unknown): value is RpcNotification => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    !hasOwn(value, "id") &&
    typeof value.method === "string" &&
    !hasOwn(value, "result") &&
    !hasOwn(value, "error")
  );
};

/**
 * 値が JSON-RPC 成功レスポンスとして妥当かどうかを判定する。
 *
 * 成功レスポンスは id と result を持ち、method / error を持たない。
 *
 * @param value - 判定対象の値。
 * @returns RpcSuccessResponse として扱える場合は true。
 */
const isRpcSuccessResponse = (value: unknown): value is RpcSuccessResponse => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcId(value.id) &&
    hasOwn(value, "result") &&
    !hasOwn(value, "method") &&
    !hasOwn(value, "error")
  );
};

/**
 * 値が JSON-RPC エラーレスポンスとして妥当かどうかを判定する。
 *
 * エラーレスポンスは id と error を持ち、method / result を持たない。
 *
 * @param value - 判定対象の値。
 * @returns RpcErrorResponse として扱える場合は true。
 */
const isRpcErrorResponse = (value: unknown): value is RpcErrorResponse => {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasValidOptionalJsonRpcVersion(value) &&
    hasOwn(value, "id") &&
    isRpcId(value.id) &&
    hasOwn(value, "error") &&
    isRpcError(value.error) &&
    !hasOwn(value, "method") &&
    !hasOwn(value, "result")
  );
};

/**
 * 値がこのクライアントで扱える RPC メッセージかどうかを判定する。
 *
 * @param value - 判定対象の値。
 * @returns request / notification / success response / error response のいずれかであれば true。
 */
const isRpcMessage = (value: unknown): value is RpcMessage => {
  return (
    isRpcRequest(value) ||
    isRpcNotification(value) ||
    isRpcSuccessResponse(value) ||
    isRpcErrorResponse(value)
  );
};

/**
 * 値が RPC メッセージであることを検証する assertion 関数。
 *
 * TypeScript の型推論上、この関数を通過した後の value は RpcMessage として扱える。
 *
 * @param value - 検証対象の値。
 * @throws value が RPC メッセージとして不正な場合。
 */
function assertRpcMessage(value: unknown): asserts value is RpcMessage {
  if (!isRpcMessage(value)) {
    throw new Error(`invalid RPC message: ${JSON.stringify(value)}`);
  }
}

/**
 * Union 型の網羅性チェック用関数。
 *
 * switch 文で未処理の分岐が残っている場合にコンパイル時検出しやすくする。
 *
 * @param value - 到達不能であるべき値。
 * @returns never。
 * @throws 実行時に到達した場合。
 */
const assertNever = (value: never): never => {
  throw new Error(`Unsupported server process: ${JSON.stringify(value)}`);
};

/**
 * 指定時間だけ待機する Promise を返す。
 *
 * @param ms - 待機時間。単位はミリ秒。
 * @returns 指定時間後に resolve される Promise。
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * アプリケーションのエントリーポイント。
 *
 * 以下の流れを実行する。
 *
 * 1. `codex app-server` を JSONL Transport として起動する。
 * 2. JSON-RPC 接続を作成する。
 * 3. Codex App Server クライアントを作成する。
 * 4. 手動 JSON 入力ランタイムを作成する。
 * 5. ログとデフォルト承認ハンドラを登録する。
 * 6. SIGINT / SIGTERM 時のクリーンアップを登録する。
 * 7. 接続開始後、Codex App Server を initialize する。
 * 8. 標準入力からの手動 RPC 送信を開始する。
 *
 * @returns 初期化と起動処理の完了を表す Promise。
 */
const main = async (): Promise<void> => {
  const transport = createProcessJsonlTransport({
    type: "codex-app-server",
  });

  const connection = new JsonRpcConnection(transport, {
    defaultTimeoutMs: 30_000,
  });

  const codexClient = new CodexAppServerClient(connection, {
    clientInfo: {
      name: "my_client",
      title: "My Client",
      version: "0.1.0",
    },
  });

  const manualInputRuntime = new ManualJsonInputRuntime({
    connection,
    inputAdapter: new StdinJsonInputAdapter("> "),
    inputMapper: new RpcMessageInputMapper(),
    onError: (error) => {
      console.error("[manual input error]", error);
    },
  });

  setupConnectionLogging(connection);
  registerDefaultServerRequestHandlers(connection);

  /**
   * 終了時のクリーンアップ処理。
   *
   * 手動入力ランタイムを停止し、RPC 接続とサーバープロセスを停止する。
   *
   * @returns クリーンアップ完了を表す Promise。
   */
  const cleanup = async (): Promise<void> => {
    manualInputRuntime.stop();
    await connection.stop();
  };

  process.once("SIGINT", () => {
    void cleanup().finally(() => {
      process.exit(130);
    });
  });

  process.once("SIGTERM", () => {
    void cleanup().finally(() => {
      process.exit(143);
    });
  });

  connection.start();

  const initializeResult = await codexClient.initialize();

  console.error("[initialized]", initializeResult);

  manualInputRuntime.start();
};

void main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
