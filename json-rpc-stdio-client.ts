import { ManualJsonInputRuntime, RpcMessageInputMapper, StdinJsonInputAdapter } from "./cli/manual-json-input-runtime";
import { registerDefaultServerRequestHandlers } from "./codex/approvals";
import { CodexAppServerClient } from "./codex/client";
import { JsonRpcConnection } from "./rpc/connection";
import { safeStringify, type RpcMessage } from "./rpc/types";
import {
  ProcessJsonlTransport,
  type ProcessJsonlTransportOptions,
} from "./transports/process-jsonl-transport";

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
      } satisfies ProcessJsonlTransportOptions);

    default:
      return assertNever(serverProcess);
  }
};

/**
 * Local inspection logging. This intentionally prints full RPC payloads because
 * the sample client is for protocol debugging; do not use this unchanged in
 * production with user prompts, file contents, command output, or repo paths.
 */
const setupConnectionLogging = (connection: JsonRpcConnection): void => {
  connection.onMessage((message: RpcMessage) => {
    console.error("[rpc message]", safeStringify(message));
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

  const cleanup = async (): Promise<void> => {
    manualInputRuntime.stop();
    await codexClient.stop();
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

  const initializeResult = await codexClient.start();
  console.error("[initialized]", initializeResult);

  manualInputRuntime.start();
};

const assertNever = (value: never): never => {
  throw new Error(`Unsupported server process: ${safeStringify(value)}`);
};

void main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
