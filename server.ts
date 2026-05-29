import index from "./index.html";
import { codexWebSession } from "./codex/codex-session";

const requestedPort = Number(Bun.env.PORT ?? 3000);

/**
 * Server-Sent Events の1イベント分を wire format 文字列へ変換する。
 *
 * @param event - SSE の event フィールドに設定するイベント名。
 * @param data - JSON 文字列化して data フィールドに設定するペイロード。
 * @returns SSE クライアントへ送信できる1イベント分の文字列。
 */
function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * API レスポンス用の JSON `Response` を生成する。
 *
 * @param data - JSON として返すレスポンス本文。
 * @param init - HTTP ステータスやヘッダーなどの `Response` 初期化オプション。
 * @returns `application/json` として扱われる Bun/Fetch API のレスポンス。
 */
function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

/**
 * Web UI と Codex チャット API を提供する Bun サーバーを起動する。
 *
 * `/api/health`、SSE で応答する `/api/chat`、API 404 fallback を同じサーバーに登録する。
 *
 * @param port - Bun サーバーを listen する TCP ポート番号。
 * @returns 起動済みの Bun サーバーインスタンス。
 * @throws `Bun.serve` が listen に失敗した場合は、その例外をそのまま送出する。
 */
function startServer(port: number) {
  return Bun.serve({
    port,

    routes: {
      "/": index,

      "/api/health": {
        GET: () => {
          return jsonResponse({ ok: true });
        },
      },

      "/api/chat": {
        POST: async (request, server) => {
          const body = (await request.json().catch(() => null)) as {
            message?: string;
          } | null;

          if (
            !body ||
            typeof body.message !== "string" ||
            !body.message.trim()
          ) {
            return jsonResponse(
              { error: "message is required" },
              { status: 400 },
            );
          }

          // SSEは長時間無通信になる可能性があるため、request単位でidle timeoutを無効化する
          server.timeout(request, 0);

          let interruptRequested = false;
          let streamFinished = false;

          const requestInterrupt = async (
            source: "request-abort" | "stream-cancel",
            reason?: unknown,
          ): Promise<void> => {
            if (interruptRequested || streamFinished) return;
            interruptRequested = true;

            try {
              const result = await codexWebSession.interruptCurrentTurn();
              if (!result.ok && result.status !== "no-active-turn") {
                console.error("[codex interrupt failed]", {
                  source,
                  reason,
                  status: result.status,
                  message: result.message,
                });
              }
            } catch (error) {
              console.error("[codex interrupt request failed]", {
                source,
                reason,
                error,
              });
            }
          };

          const requestAbortHandler = () => {
            void requestInterrupt("request-abort");
          };

          request.signal.addEventListener("abort", requestAbortHandler, {
            once: true,
          });

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              const encoder = new TextEncoder();
              const message = body.message;

              if (typeof message !== "string" || message.length === 0) {
                return jsonResponse(
                  { error: "message is required" },
                  { status: 400 },
                );
              }

              try {
                for await (const event of codexWebSession.runTurn(
                  message,
                  { signal: request.signal },
                )) {
                  controller.enqueue(
                    encoder.encode(sseEncode(event.type, event)),
                  );

                  if (
                    event.type === "turn.completed" ||
                    event.type === "error"
                  ) {
                    break;
                  }
                }
              } catch (error) {
                if (!interruptRequested) {
                  controller.enqueue(
                    encoder.encode(
                      sseEncode("error", {
                        type: "error",
                        message:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      }),
                    ),
                  );
                }
              } finally {
                streamFinished = true;
                request.signal.removeEventListener(
                  "abort",
                  requestAbortHandler,
                );
                try {
                  controller.close();
                } catch (error) {
                  if (!interruptRequested) {
                    console.error("[codex sse close failed]", error);
                  }
                }
              }
            },
            async cancel(reason) {
              await requestInterrupt("stream-cancel", reason);
            },
          });

          return new Response(stream, {
            headers: {
              "content-type": "text/event-stream; charset=utf-8",
              "cache-control": "no-cache",
              connection: "keep-alive",
            },
          });
        },
      },

      "/api/turns/current/interrupt": {
        POST: async () => {
          try {
            const result = await codexWebSession.interruptCurrentTurn();

            if (!result.ok) {
              const status = result.status === "no-active-turn" ? 409 : 500;

              return jsonResponse(
                {
                  ok: false,
                  status: result.status,
                  error: result.message,
                },
                { status },
              );
            }

            return jsonResponse(result);
          } catch (error) {
            return jsonResponse(
              {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
              },
              { status: 500 },
            );
          }
        },
      },

      "/api/approvals/:approvalRequestId": {
        POST: async (request) => {
          const approvalRequestId = request.params.approvalRequestId;
          const body = (await request.json().catch(() => null)) as {
            decision?: unknown;
          } | null;

          if (!body || body.decision === undefined) {
            return jsonResponse(
              { error: "decision is required" },
              { status: 400 },
            );
          }

          try {
            const result = codexWebSession.submitApprovalDecision(
              approvalRequestId,
              body.decision,
            );

            return jsonResponse({
              ok: true,
              approvalRequestId,
              decision: result.decision,
              status: result.status,
              resolvedAtMs: result.resolvedAtMs,
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            const status = message.startsWith("invalid approval decision")
              ? 400
              : 404;

            return jsonResponse({ error: message }, { status });
          }
        },
      },

      "/api/*": {
        GET: () => jsonResponse({ message: "Not found" }, { status: 404 }),
        POST: () => jsonResponse({ message: "Not found" }, { status: 404 }),
        PUT: () => jsonResponse({ message: "Not found" }, { status: 404 }),
        PATCH: () => jsonResponse({ message: "Not found" }, { status: 404 }),
        DELETE: () => jsonResponse({ message: "Not found" }, { status: 404 }),
      },
    },

    fetch() {
      return new Response("Not Found", { status: 404 });
    },

    development: {
      hmr: true,
      console: true,
    },
  });
}

/**
 * 例外がポート使用中を表す `EADDRINUSE` エラーかどうかを判定する。
 *
 * @param error - `Bun.serve` などから投げられた任意の例外値。
 * @returns ポート衝突を示すエラーであれば `true`。
 */
function isPortInUseError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "EADDRINUSE"
  );
}

const candidatePorts = Bun.env.PORT
  ? [requestedPort]
  : [requestedPort, 3001, 3002, 3003, 3004, 3005];

let server: ReturnType<typeof Bun.serve> | undefined;
let lastError: unknown;

for (const port of candidatePorts) {
  try {
    server = startServer(port);
    break;
  } catch (error) {
    if (!isPortInUseError(error)) throw error;
    lastError = error;
    console.warn(`Port ${port} is in use.`);
  }
}

if (!server) {
  throw lastError;
}

console.log(`Server running at ${server.url}`);
