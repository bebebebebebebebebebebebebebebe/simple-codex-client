import readline from "node:readline";
import { JsonRpcConnection, RpcResponseError } from "../rpc/connection";
import {
  assertRpcMessage,
  isRpcRequest,
  type RpcMessage,
} from "../rpc/types";

export interface InputAdapter<TInput> {
  start(
    onInput: (input: TInput) => void,
    onError: (error: unknown) => void,
  ): void;
  stop(): void;
}

export interface InputMapper<TInput> {
  toMessage(input: TInput): RpcMessage;
}

export class StdinJsonInputAdapter implements InputAdapter<unknown> {
  private readlineInterface?: readline.Interface;

  constructor(private readonly promptText = "> ") {}

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

  stop(): void {
    this.readlineInterface?.close();
    this.readlineInterface = undefined;
  }
}

export class RpcMessageInputMapper implements InputMapper<unknown> {
  toMessage(input: unknown): RpcMessage {
    assertRpcMessage(input);
    return input;
  }
}

export class ManualJsonInputRuntime<TInput> {
  private started = false;

  constructor(
    private readonly dependencies: {
      connection: JsonRpcConnection;
      inputAdapter: InputAdapter<TInput>;
      inputMapper: InputMapper<TInput>;
      onError?: (error: unknown) => void;
    },
  ) {}

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

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.dependencies.inputAdapter.stop();
  }

  private async handleInput(input: TInput): Promise<void> {
    try {
      const message = this.dependencies.inputMapper.toMessage(input);

      if (isRpcRequest(message)) {
        const result = await this.dependencies.connection.requestRaw(message);
        console.error("[manual request result]", result);
        return;
      }

      await this.dependencies.connection.sendRaw(message);
    } catch (error) {
      if (error instanceof RpcResponseError) {
        console.error("[manual request error]", error.rpcError);
        return;
      }

      this.handleError(error);
    }
  }

  private handleError(error: unknown): void {
    if (this.dependencies.onError) {
      this.dependencies.onError(error);
      return;
    }

    console.error("[manual input error]", error);
  }
}
