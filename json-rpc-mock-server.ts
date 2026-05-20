import type { JsonRpcRequest, JsonRpcResponse } from "./json-rpc-schema";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export class JsonRpcMockServer {
  private rl?: readline.Interface;

  start(): void {
    /**
     * Starts the JSON-RPC mock server.
     *
     * Initializes the readline interface to listen for incoming JSON-RPC requests
     * from the standard input. Each line is treated as a separate request.
     */
    if (this.rl) {
      console.error("Server is already running.");
      return;
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    this.rl.on("line", async (line) => {
      if (!line.trim()) return;

      try {
        const response = await this.handleRequest(line);
        process.stdout.write(JSON.stringify(response) + "\n");
      } catch {
        process.stdout.write(
          JSON.stringify({ error: { message: "Internal server error" } }) +
            "\n",
        );
      }
    });

    this.rl.on("close", () => {
      console.error("Server shutting down...");
      process.exit(0);
    });

    console.log("JSON-RPC Mock Server is running...");
  }

  stop(): void {
    /**
     * Stops the JSON-RPC mock server.
     *
     * Closes the readline interface and releases resources. If the server is not
     * running, logs an error message and returns.
     */
    if (!this.rl) {
      console.error("Server is not running.");
      return;
    }

    this.rl.close();
    this.rl = undefined;
  }

  private async dispatchRequest(
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse> {
    const { method, params, id } = request;

    switch (method) {
      case "sum":
        if (Array.isArray(params)) {
          const result = params.reduce((acc, val) => acc + val, 0);
          return { id, result, method, params };
        } else {
          return {
            id,
            error: {
              message:
                "Invalid params for sum method. Expected an array of numbers.",
              data: params,
            },
          };
        }
      case "chat": {
        const message = (params as { message?: string }).message ?? "";
        return { id, result: { reply: `Echo: ${message}` }, method, params };
      }
      default:
        return {
          id,
          error: {
            message: `Method ${method} not found. Available methods: sum, chat`,
            data: request,
          },
        };
    }
  }

  private async handleRequest(request: string): Promise<JsonRpcResponse> {
    /**
     * Handles an incoming JSON-RPC request.
     *
     * Parses and validates the raw request, then delegates processing to
     * `dispatchRequest`. If the request is invalid or processing fails, returns
     * a JSON-RPC error response.
     *
     * @param request - Raw JSON string representing the JSON-RPC request.
     * @returns A promise resolving to a JSON-RPC response containing either the result or error details.
     */
    try {
      const data = JSON.parse(request);
      const isValidRequest =
        typeof data === "object" &&
        data !== null &&
        "id" in data &&
        "method" in data;

      if (!isValidRequest) {
        return {
          error: {
            message: "Invalid request",
            data: data,
          },
        };
      }

      const rpcRequest = data as JsonRpcRequest;
      return await this.dispatchRequest(rpcRequest);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return {
          error: {
            message: "Invalid JSON",
            data: request,
          },
        };
      }

      return {
        error: {
          message: "Internal server error",
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

const isDirectExecution =
  resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const server = new JsonRpcMockServer();
  server.start();
}
