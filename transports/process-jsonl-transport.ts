import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type {
  JsonRpcTransport,
  JsonRpcTransportErrorListener,
  JsonRpcTransportExitListener,
  JsonRpcTransportMessageListener,
  JsonRpcTransportStderrListener,
} from "../rpc/transport";

/**
 * 子プロセス JSONL transport の起動設定。
 */
export type ProcessJsonlTransportOptions = {
  /** 起動するコマンド名またはパス。 */
  command: string;
  /** コマンドに渡す引数。 */
  args?: string[];
  /** 子プロセスの working directory。 */
  cwd?: string;
  /** 子プロセスへ渡す環境変数。 */
  env?: NodeJS.ProcessEnv;
  /** SIGTERM 後、SIGKILL に切り替えるまでの待機時間。 */
  killTimeoutMs?: number;
};

/**
 * 子プロセスの stdin/stdout を使って JSONL message を送受信する Transport。
 *
 * stdout は 1 行 1 JSON message として parse し、stdin へは
 * `JSON.stringify(message) + "\n"` を書き込む。JSON-RPC の意味解釈は行わず、
 * process lifecycle と JSONL wire format だけを担当する。
 */
export class ProcessJsonlTransport implements JsonRpcTransport {
  private serverProcess?: ChildProcessWithoutNullStreams;
  private serverOutput?: readline.Interface;

  private readonly messageListeners =
    new Set<JsonRpcTransportMessageListener>();
  private readonly errorListeners = new Set<JsonRpcTransportErrorListener>();
  private readonly stderrListeners = new Set<JsonRpcTransportStderrListener>();
  private readonly exitListeners = new Set<JsonRpcTransportExitListener>();

  private started = false;
  private closed = false;

  constructor(private readonly options: ProcessJsonlTransportOptions) {}

  /**
   * 子プロセスを起動し、stdout / stderr / exit / close の監視を開始する。
   *
   * @returns spawn 完了の確認を表す Promise。
   * @throws spawn error または起動直後の exit を検知した場合。
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.closed = false;

    const serverProcess = spawn(this.options.command, this.options.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this.options.cwd,
      env: this.options.env,
    });

    this.serverProcess = serverProcess;
    this.serverOutput = readline.createInterface({
      input: serverProcess.stdout,
    });

    this.serverOutput.on("line", this.handleStdoutLine);
    serverProcess.stderr.on("data", this.handleStderrData);
    serverProcess.on("error", this.handleProcessError);
    serverProcess.on("exit", this.handleExit);
    serverProcess.on("close", this.handleClose);

    await this.waitForSpawn(serverProcess);
  }

  /**
   * 子プロセスを停止し、stdio と event listener を解放する。
   *
   * SIGTERM で終了しない場合は timeout 後に SIGKILL を送り、close を待つ。
   *
   * @returns 停止処理の完了を表す Promise。
   */
  async stop(): Promise<void> {
    const serverProcess = this.serverProcess;
    const serverOutput = this.serverOutput;

    if (!this.started && !serverProcess) {
      return;
    }

    this.started = false;

    if (!serverProcess) {
      this.closed = true;
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

    if (!this.isProcessExited(serverProcess)) {
      serverProcess.kill("SIGTERM");

      const exited = await this.waitForCloseOrTimeout(
        serverProcess,
        this.options.killTimeoutMs ?? 1_000,
      );

      if (!exited && !this.isProcessExited(serverProcess)) {
        serverProcess.kill("SIGKILL");
        await once(serverProcess, "close").catch(() => undefined);
      }
    } else if (!this.closed) {
      await once(serverProcess, "close").catch(() => undefined);
    }

    this.closed = true;
    this.serverProcess = undefined;
    this.serverOutput = undefined;
  }

  /**
   * message を JSONL として子プロセス stdin へ送信する。
   *
   * stream backpressure が発生した場合は `drain` を待つ。待機中に stdin が
   * error / close した場合は reject する。
   *
   * @param message - JSON.stringify 可能な値。
   * @returns 書き込み完了を表す Promise。
   * @throws Transport 未開始、stdin 書き込み不能、serialize 失敗の場合。
   */
  async send(message: unknown): Promise<void> {
    if (!this.started || !this.serverProcess) {
      throw new Error("transport is not started");
    }

    const stdin = this.serverProcess.stdin;

    if (!stdin.writable) {
      throw new Error("server stdin is not writable");
    }

    let serialized: string | undefined;

    try {
      serialized = JSON.stringify(message);
    } catch (error) {
      throw new Error(
        `failed to serialize message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (serialized === undefined) {
      throw new Error("failed to serialize message: JSON.stringify returned undefined");
    }

    const writable = stdin.write(`${serialized}\n`);

    if (!writable) {
      await Promise.race([
        once(stdin, "drain"),
        once(stdin, "error").then(([error]) => {
          throw error;
        }),
        once(stdin, "close").then(() => {
          throw new Error("server stdin closed before drain");
        }),
      ]);
    }
  }

  /**
   * stdout から受信した JSON message の listener を登録する。
   *
   * @param listener - JSON.parse 済みの値を受け取る関数。
   * @returns 登録解除関数。
   */
  onMessage(listener: JsonRpcTransportMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * Transport error listener を登録する。
   *
   * @param listener - error を受け取る関数。
   * @returns 登録解除関数。
   */
  onError(listener: JsonRpcTransportErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * 子プロセス stderr listener を登録する。
   *
   * @param listener - stderr 文字列を受け取る関数。
   * @returns 登録解除関数。
   */
  onStderr(listener: JsonRpcTransportStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  /**
   * 子プロセス exit listener を登録する。
   *
   * @param listener - exit code と signal を受け取る関数。
   * @returns 登録解除関数。
   */
  onExit(listener: JsonRpcTransportExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

  /**
   * close event を観測済みかを返す。
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * stdout の 1 行を JSON として parse し、message listener へ配送する。
   *
   * parse error と listener error を区別するため、parse 後の配送は別処理にする。
   */
  private readonly handleStdoutLine = (line: string): void => {
    let message: unknown;

    try {
      message = JSON.parse(line) as unknown;
    } catch (error) {
      this.emitError(
        new Error(
          `failed to parse server stdout line: ${line}\n${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      );
      return;
    }

    this.dispatchSafely(this.messageListeners, message);
  };

  /**
   * stderr chunk を文字列化して listener へ配送する。
   */
  private readonly handleStderrData = (data: Buffer): void => {
    this.dispatchSafely(this.stderrListeners, data.toString());
  };

  /**
   * child process error を Transport error として通知する。
   */
  private readonly handleProcessError = (error: Error): void => {
    this.emitError(error);
  };

  /**
   * child process exit を listener へ通知する。
   */
  private readonly handleExit = (
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void => {
    for (const listener of this.exitListeners) {
      try {
        listener(code, signal);
      } catch (error) {
        this.emitError(error);
      }
    }
  };

  /**
   * close event を内部状態へ反映する。
   */
  private readonly handleClose = (): void => {
    this.closed = true;
    this.started = false;
  };

  /**
   * error listener へ通知する。
   *
   * error listener 自身の例外は Transport を不安定にしないよう握りつぶす。
   */
  private emitError(error: unknown): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listeners must not destabilize transport control flow.
      }
    }
  }

  /**
   * listener 例外を error として隔離しながら値を配送する。
   */
  private dispatchSafely<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (error) {
        this.emitError(error);
      }
    }
  }

  /**
   * spawn 完了を待ち、起動直後に終了していないか確認する。
   */
  private async waitForSpawn(
    serverProcess: ChildProcessWithoutNullStreams,
  ): Promise<void> {
    await Promise.race([
      once(serverProcess, "spawn").then(() => undefined),
      once(serverProcess, "error").then(([error]) => {
        throw error;
      }),
    ]);

    await sleep(0);

    if (this.isProcessExited(serverProcess)) {
      throw new Error(
        `server process exited during startup: code=${String(
          serverProcess.exitCode,
        )} signal=${String(serverProcess.signalCode)}`,
      );
    }
  }

  /**
   * close event か timeout のどちらかを待つ。
   *
   * @returns timeout 前に close した場合は true。
   */
  private async waitForCloseOrTimeout(
    serverProcess: ChildProcessWithoutNullStreams,
    timeoutMs: number,
  ): Promise<boolean> {
    if (this.closed) {
      return true;
    }

    return Promise.race([
      once(serverProcess, "close").then(() => true),
      sleep(timeoutMs).then(() => false),
    ]);
  }

  /**
   * child process が exit または signal 終了済みかを判定する。
   */
  private isProcessExited(serverProcess: ChildProcessWithoutNullStreams): boolean {
    return serverProcess.exitCode !== null || serverProcess.signalCode !== null;
  }
}

/**
 * 指定時間待つ Promise を返す。
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
