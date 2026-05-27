import type { BasicApprovalDecision } from "./types";
import type { CodexUiEvent } from "./ui-events";

type ApprovalRequestedEvent = Extract<
  CodexUiEvent,
  { type: "approval.requested" }
>;

export type ApprovalResolvedEvent = Extract<
  CodexUiEvent,
  { type: "approval.resolved" }
>;

export type ApprovalDecisionResult = {
  decision: BasicApprovalDecision;
  status: ApprovalResolvedEvent["status"];
  resolvedAtMs: number;
};

type PendingApproval = {
  event: ApprovalRequestedEvent;
  resolve: (result: ApprovalDecisionResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export const BASIC_APPROVAL_DECISIONS = [
  "accept",
  "acceptForSession",
  "decline",
  "cancel",
] as const satisfies readonly BasicApprovalDecision[];

/**
 * 任意値が Milestone 3 で送信できる基本 approval decision かどうかを判定する。
 *
 * @param value - API request body などから受け取った値。
 * @returns 基本 approval decision であれば `true`。
 */
export const isBasicApprovalDecision = (
  value: unknown,
): value is BasicApprovalDecision => {
  return BASIC_APPROVAL_DECISIONS.includes(value as BasicApprovalDecision);
};

/**
 * approval decision を Web UI 表示用 status に変換する。
 *
 * @param decision - ユーザーが選択した基本 approval decision。
 * @returns approval card に表示する resolved status。
 */
export const approvalStatusFromDecision = (
  decision: BasicApprovalDecision,
): ApprovalResolvedEvent["status"] => {
  switch (decision) {
    case "accept":
      return "accepted";
    case "acceptForSession":
      return "accepted-for-session";
    case "decline":
      return "declined";
    case "cancel":
      return "cancelled";
  }
};

/**
 * Codex App Server から届いた approval request を pending 管理し、
 * Web UI から届く decision で server initiated request を解決する。
 */
export class ApprovalController {
  private readonly pending = new Map<string, PendingApproval>();

  /**
   * @param timeoutMs - ユーザー decision を待つ最大時間。経過後は安全側 decision で解決する。
   */
  constructor(private readonly timeoutMs = 5 * 60 * 1000) {}

  /**
   * approval request を pending として登録し、ユーザー decision を待つ。
   *
   * @param event - frontend へ送る approval request event。
   * @returns decision が送信、timeout、cleanup されたときに解決する Promise。
   * @throws 同じ approval id がすでに pending の場合。
   */
  waitForDecision(
    event: ApprovalRequestedEvent,
  ): Promise<ApprovalDecisionResult> {
    if (this.pending.has(event.approvalRequestId)) {
      throw new Error(
        `approval request is already pending: ${event.approvalRequestId}`,
      );
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.resolveWithFallback(event.approvalRequestId, "expired");
      }, this.timeoutMs);

      this.pending.set(event.approvalRequestId, {
        event,
        resolve,
        timeout,
      });
    });
  }

  /**
   * Web UI から届いた decision で pending approval を解決する。
   *
   * @param approvalRequestId - 解決対象の approval request id。
   * @param decision - ユーザーが選択した基本 approval decision。
   * @returns 解決結果。
   * @throws approval が存在しない、または decision が許可されていない場合。
   */
  submitDecision(
    approvalRequestId: string,
    decision: BasicApprovalDecision,
  ): ApprovalDecisionResult {
    const pending = this.pending.get(approvalRequestId);
    if (!pending) {
      throw new Error(`approval request not found: ${approvalRequestId}`);
    }

    this.assertDecisionAllowed(pending.event, decision);

    return this.resolvePending(
      approvalRequestId,
      decision,
      approvalStatusFromDecision(decision),
    );
  }

  /**
   * 指定 scope の pending approval を安全側 decision で cleanup する。
   *
   * @param scope - cleanup 対象を絞る thread / turn。未指定なら全 pending を対象にする。
   * @returns cleanup で解決した件数。
   */
  cleanup(scope?: { threadId?: string; turnId?: string }): number {
    const ids = Array.from(this.pending.entries())
      .filter(([, pending]) => {
        if (scope?.threadId && pending.event.threadId !== scope.threadId) {
          return false;
        }
        if (scope?.turnId && pending.event.turnId !== scope.turnId) {
          return false;
        }
        return true;
      })
      .map(([approvalRequestId]) => approvalRequestId);

    for (const approvalRequestId of ids) {
      this.resolveWithFallback(approvalRequestId, "cancelled");
    }

    return ids.length;
  }

  /**
   * pending approval が存在するか確認する。
   *
   * @param approvalRequestId - 確認対象の approval request id。
   * @returns pending であれば `true`。
   */
  hasPending(approvalRequestId: string): boolean {
    return this.pending.has(approvalRequestId);
  }

  private assertDecisionAllowed(
    event: ApprovalRequestedEvent,
    decision: BasicApprovalDecision,
  ): void {
    const availableDecisions = event.availableDecisions;
    if (!availableDecisions?.length) return;

    if (!availableDecisions.includes(decision)) {
      throw new Error(
        `approval decision is not available: ${decision}`,
      );
    }
  }

  private resolveWithFallback(
    approvalRequestId: string,
    status: "expired" | "cancelled",
  ): ApprovalDecisionResult | undefined {
    const pending = this.pending.get(approvalRequestId);
    if (!pending) return undefined;

    const decision = this.getSafeFallbackDecision(pending.event);
    return this.resolvePending(approvalRequestId, decision, status);
  }

  private getSafeFallbackDecision(
    event: ApprovalRequestedEvent,
  ): BasicApprovalDecision {
    const availableDecisions = event.availableDecisions;
    if (!availableDecisions?.length || availableDecisions.includes("cancel")) {
      return "cancel";
    }
    if (availableDecisions.includes("decline")) {
      return "decline";
    }
    return "decline";
  }

  private resolvePending(
    approvalRequestId: string,
    decision: BasicApprovalDecision,
    status: ApprovalResolvedEvent["status"],
  ): ApprovalDecisionResult {
    const pending = this.pending.get(approvalRequestId);
    if (!pending) {
      throw new Error(`approval request not found: ${approvalRequestId}`);
    }

    clearTimeout(pending.timeout);
    this.pending.delete(approvalRequestId);

    const result = {
      decision,
      status,
      resolvedAtMs: Date.now(),
    };
    pending.resolve(result);
    return result;
  }
}
