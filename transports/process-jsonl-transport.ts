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

export type ProcessJsonlTransportOptions = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  killTimeoutMs?: number;
};

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

  onMessage(listener: JsonRpcTransportMessageListener): () => void {
    this.messageListeners.add(listener);

    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onError(listener: JsonRpcTransportErrorListener): () => void {
    this.errorListeners.add(listener);

    return () => {
      this.errorListeners.delete(listener);
    };
  }

  onStderr(listener: JsonRpcTransportStderrListener): () => void {
    this.stderrListeners.add(listener);

    return () => {
      this.stderrListeners.delete(listener);
    };
  }

  onExit(listener: JsonRpcTransportExitListener): () => void {
    this.exitListeners.add(listener);

    return () => {
      this.exitListeners.delete(listener);
    };
  }

  isClosed(): boolean {
    return this.closed;
  }

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

  private readonly handleStderrData = (data: Buffer): void => {
    this.dispatchSafely(this.stderrListeners, data.toString());
  };

  private readonly handleProcessError = (error: Error): void => {
    this.emitError(error);
  };

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

  private readonly handleClose = (): void => {
    this.closed = true;
    this.started = false;
  };

  private emitError(error: unknown): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Error listeners must not destabilize transport control flow.
      }
    }
  }

  private dispatchSafely<T>(listeners: Set<(value: T) => void>, value: T): void {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (error) {
        this.emitError(error);
      }
    }
  }

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

  private isProcessExited(serverProcess: ChildProcessWithoutNullStreams): boolean {
    return serverProcess.exitCode !== null || serverProcess.signalCode !== null;
  }
}

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};
