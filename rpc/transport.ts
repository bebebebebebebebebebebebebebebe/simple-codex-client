/** Transport が JSON decode 済みの message を受信したときのリスナー。 */
export type JsonRpcTransportMessageListener = (message: unknown) => void;
/** Transport 内部のエラーを受け取るリスナー。 */
export type JsonRpcTransportErrorListener = (error: unknown) => void;
/** 子プロセス stderr など、RPC message ではない診断出力を受け取るリスナー。 */
export type JsonRpcTransportStderrListener = (data: string) => void;
/** Transport の接続先プロセスや接続が終了したときのリスナー。 */
export type JsonRpcTransportExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

/**
 * JSON-RPC connection が依存する Transport 抽象。
 *
 * `JsonRpcConnection` は stdio / WebSocket / in-memory などの具体的な通信手段を
 * 知らず、この interface を通じて message の送受信だけを扱う。
 */
export interface JsonRpcTransport {
  /**
   * Transport を開始し、message を送受信できる状態にする。
   *
   * @returns 起動処理の完了を表す Promise。
   */
  start(): Promise<void>;

  /**
   * Transport を停止し、関連リソースを解放する。
   *
   * @returns 停止処理の完了を表す Promise。
   */
  stop(): Promise<void>;

  /**
   * 1 つの JSON-RPC message を送信する。
   *
   * @param message - Transport が wire 形式へ変換して送る値。
   * @returns 送信完了を表す Promise。
   */
  send(message: unknown): Promise<void>;

  /**
   * message 受信リスナーを登録する。
   *
   * @param listener - JSON decode 済みの値を受け取る関数。
   * @returns 登録解除関数。
   */
  onMessage(listener: JsonRpcTransportMessageListener): () => void;

  /**
   * Transport error リスナーを登録する。
   *
   * @param listener - エラーを受け取る関数。
   * @returns 登録解除関数。
   */
  onError(listener: JsonRpcTransportErrorListener): () => void;

  /**
   * stderr などの診断出力リスナーを登録する。
   *
   * Transport に診断出力の概念がない場合は未実装でよい。
   */
  onStderr?(listener: JsonRpcTransportStderrListener): () => void;

  /**
   * Transport 終了リスナーを登録する。
   *
   * Transport に exit の概念がない場合は未実装でよい。
   */
  onExit?(listener: JsonRpcTransportExitListener): () => void;
}

