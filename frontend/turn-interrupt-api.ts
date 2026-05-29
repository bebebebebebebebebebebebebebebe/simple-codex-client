export type InterruptCurrentTurnResponse =
  | {
      ok: true;
      status: "interrupt-requested" | "already-interrupting";
      threadId: string;
      turnId: string;
    }
  | {
      ok: false;
      status?: string;
      error: string;
    };

/**
 * 現在の Codex turn に対して backend 経由で中断要求を送る。
 *
 * @returns backend が返した中断要求の結果。
 */
export async function interruptCurrentTurn(): Promise<InterruptCurrentTurnResponse> {
  const response = await fetch("/api/turns/current/interrupt", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
  });

  const body = (await response.json().catch(() => null)) as
    | InterruptCurrentTurnResponse
    | null;

  if (!body) {
    return {
      ok: false,
      error: `Interrupt request failed: ${response.status}`,
    };
  }

  return body;
}
