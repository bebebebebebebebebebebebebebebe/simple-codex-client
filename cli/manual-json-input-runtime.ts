import readline from "node:readline";
import { JsonRpcConnection, RpcResponseError } from "../rpc/connection";
import {
  assertRpcMessage,
  isRpcRequest,
  type RpcMessage,
} from "../rpc/types";

/**
 * 任意の入力元を manual runtime へ接続する adapter。
 *
 * 標準入力、ファイル、Web UI など、入力の取得方法を runtime 本体から分離する。
 */
export interface InputAdapter<TInput> {
  /**
   * 入力監視を開始する。
   *
   * @param onInput - 入力値を受け取ったときに呼ぶ callback。
   * @param onError - 入力取得や parse に失敗したときに呼ぶ callback。
   */
  start(
    onInput: (input: TInput) => void,
    onError: (error: unknown) => void,
  ): void;

  /**
   * 入力監視を停止し、保持しているリソースを解放する。
   */
  stop(): void;
}

/**
 * 入力値を JSON-RPC message へ変換する mapper。
 *
 * 入力形式と RPC 送信形式を分けることで、JSON 以外の入力形式にも差し替えられる。
 */
export interface InputMapper<TInput> {
  /**
   * 入力値を RPC message へ変換する。
   *
   * @param input - adapter から渡された入力値。
   * @returns 検証済み RPC message。
   * @throws 入力値を RPC message として扱えない場合。
   */
  toMessage(input: TInput): RpcMessage;
}

/**
 * 標準入力から 1 行ずつ JSON を読み取る adapter。
 *
 * 入力された 1 行を `JSON.parse` し、成功すれば runtime へ渡す。
 */
export class StdinJsonInputAdapter implements InputAdapter<unknown> {
  private readlineInterface?: readline.Interface;

  /**
   * @param promptText - 標準入力に表示する prompt 文字列。
   */
  constructor(private readonly promptText = "> ") {}

  /**
   * readline を開始し、1 行ごとの JSON 入力を callback へ渡す。
   *
   * @param onInput - parse 済み入力を受け取る callback。
   * @param onError - JSON parse error などを受け取る callback。
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
   * readline を閉じる。
   */
  stop(): void {
    this.readlineInterface?.close();
    this.readlineInterface = undefined;
  }
}

/**
 * 入力値がすでに JSON-RPC message であることを検証する mapper。
 */
export class RpcMessageInputMapper implements InputMapper<unknown> {
  /**
   * @param input - JSON.parse 済みの unknown 値。
   * @returns RPC message として検証済みの値。
   * @throws RPC message として不正な場合。
   */
  toMessage(input: unknown): RpcMessage {
    assertRpcMessage(input);
    return input;
  }
}

/**
 * 手動入力された JSON-RPC message を connection へ送信する runtime。
 *
 * id 付き request は `requestRaw()` に通して pending 管理し、response を
 * `[manual request result]` / `[manual request error]` として表示する。
 * notification や response は低レベル message として `sendRaw()` で送る。
 */
export class ManualJsonInputRuntime<TInput> {
  private started = false;

  /**
   * @param dependencies - connection、入力 adapter、入力 mapper、任意の error handler。
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
   * 入力 adapter を開始する。
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
   * 入力 adapter を停止する。
   */
  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.dependencies.inputAdapter.stop();
  }

  /**
   * 入力値を RPC message に変換して送信する。
   *
   * manual request は、ユーザーが指定した id を wire 上で保持しつつ response と
   * 対応付ける必要があるため `requestRaw()` を使う。
   */
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

  /**
   * 入力処理中のエラーを runtime の error handler へ渡す。
   */
  private handleError(error: unknown): void {
    if (this.dependencies.onError) {
      this.dependencies.onError(error);
      return;
    }

    console.error("[manual input error]", error);
  }
}
