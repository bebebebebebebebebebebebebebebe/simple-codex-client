import type { BasicApprovalDecision } from "../codex/types";

export type ApprovalDecisionResponse = {
  ok: true;
  approvalRequestId: string;
  decision: BasicApprovalDecision;
  status: string;
  resolvedAtMs: number;
};

/**
 * Web UI から backend の pending approval へ decision を送信する。
 *
 * @param approvalRequestId - 解決対象の approval request id。
 * @param decision - ユーザーが選択した基本 approval decision。
 * @returns backend が返した解決結果。
 * @throws HTTP error、JSON parse error、または API error response の場合。
 */
export async function submitApprovalDecision(
  approvalRequestId: string,
  decision: BasicApprovalDecision,
): Promise<ApprovalDecisionResponse> {
  const response = await fetch(
    `/api/approvals/${encodeURIComponent(approvalRequestId)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ decision }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Approval request failed: ${response.status}`,
    );
  }

  return (await response.json()) as ApprovalDecisionResponse;
}
