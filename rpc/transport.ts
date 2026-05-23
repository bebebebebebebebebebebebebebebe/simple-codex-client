export type JsonRpcTransportMessageListener = (message: unknown) => void;
export type JsonRpcTransportErrorListener = (error: unknown) => void;
export type JsonRpcTransportStderrListener = (data: string) => void;
export type JsonRpcTransportExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null,
) => void;

export interface JsonRpcTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(message: unknown): Promise<void>;
  onMessage(listener: JsonRpcTransportMessageListener): () => void;
  onError(listener: JsonRpcTransportErrorListener): () => void;
  onStderr?(listener: JsonRpcTransportStderrListener): () => void;
  onExit?(listener: JsonRpcTransportExitListener): () => void;
}
