import { CODEX_PART_LABELS } from "@/frontend/codex-part-names";
import type { ApprovalState } from "@/frontend/codex-turn-state";
import { submitApprovalDecision } from "@/frontend/approval-api";
import { Button } from "@/components/ui/button";
import type { BasicApprovalDecision } from "@/codex/types";
import type { FC } from "react";
import { useMemo, useState } from "react";

type ApprovalCardProps = {
  approval: ApprovalState;
};

const getApprovalTypeLabel = (
  approvalType: ApprovalState["approvalType"],
): string => {
  switch (approvalType) {
    case "commandExecution":
      return "コマンド実行";
    case "fileChange":
      return "ファイル変更";
    case "network":
      return "ネットワークアクセス";
  }
};

const formatUnknown = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const APPROVAL_DECISION_ACTIONS = [
  {
    decision: "accept",
    label: "今回だけ許可",
    variant: "default",
  },
  {
    decision: "acceptForSession",
    label: "このセッションでは許可",
    variant: "outline",
  },
  {
    decision: "decline",
    label: "拒否",
    variant: "secondary",
  },
  {
    decision: "cancel",
    label: "キャンセル",
    variant: "destructive",
  },
] as const satisfies ReadonlyArray<{
  decision: BasicApprovalDecision;
  label: string;
  variant: "default" | "outline" | "secondary" | "destructive";
}>;

const APPROVAL_STATUS_LABELS = {
  "requires-action": "承認待ち",
  submitting: "送信中",
  accepted: "承認済み",
  "accepted-for-session": "セッション中許可",
  declined: "拒否済み",
  cancelled: "キャンセル済み",
  expired: "期限切れ",
  failed: "失敗",
} as const satisfies Record<ApprovalState["status"], string>;

const isActionableStatus = (status: ApprovalState["status"]): boolean => {
  return status === "requires-action" || status === "submitting";
};

/**
 * Codex の approval request を、未接続の承認待ちカードとして表示する。
 *
 * @param props - 表示する approval request の状態。
 * @returns 承認待ちカード。
 */
export const ApprovalCard: FC<ApprovalCardProps> = ({ approval }) => {
  const networkContext = formatUnknown(approval.networkApprovalContext);
  const [submittingDecision, setSubmittingDecision] =
    useState<BasicApprovalDecision | null>(null);
  const [submittedDecision, setSubmittedDecision] =
    useState<BasicApprovalDecision | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const actionItems = useMemo(() => {
    if (approval.availableDecisions?.length) {
      return APPROVAL_DECISION_ACTIONS.filter((action) =>
        approval.availableDecisions?.includes(action.decision),
      );
    }

    if (approval.unsupportedDecisionOptions?.length) return [];

    return APPROVAL_DECISION_ACTIONS;
  }, [approval.availableDecisions, approval.unsupportedDecisionOptions]);
  const isSubmitting = submittingDecision !== null;
  const isResolved = !isActionableStatus(approval.status);
  const shouldDisableActions =
    isSubmitting || isResolved || submittedDecision !== null;

  const handleDecision = async (decision: BasicApprovalDecision) => {
    setSubmittingDecision(decision);
    setSubmitError(null);

    try {
      await submitApprovalDecision(approval.approvalRequestId, decision);
      setSubmittedDecision(decision);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmittingDecision(null);
    }
  };

  return (
    <section className="mb-4 rounded-lg border border-amber-300/70 bg-amber-50/40 px-3 py-2 text-sm dark:border-amber-800/80 dark:bg-amber-950/20">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="font-medium">{CODEX_PART_LABELS.approval}</div>
        <span className="rounded-md border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
          {APPROVAL_STATUS_LABELS[approval.status]}
        </span>
      </div>

      <dl className="space-y-2 text-muted-foreground">
        <div>
          <dt className="font-medium text-foreground">種類</dt>
          <dd>{getApprovalTypeLabel(approval.approvalType)}</dd>
        </div>

        {approval.reason ? (
          <div>
            <dt className="font-medium text-foreground">理由</dt>
            <dd>{approval.reason}</dd>
          </div>
        ) : null}

        {approval.cwd ? (
          <div>
            <dt className="font-medium text-foreground">作業ディレクトリ</dt>
            <dd className="break-all font-mono text-xs">{approval.cwd}</dd>
          </div>
        ) : null}

        {approval.approvalType !== "network" && approval.command ? (
          <div>
            <dt className="font-medium text-foreground">コマンド</dt>
            <dd>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-xs">
                {approval.command}
              </pre>
            </dd>
          </div>
        ) : null}

        {approval.grantRoot ? (
          <div>
            <dt className="font-medium text-foreground">許可対象</dt>
            <dd className="break-all font-mono text-xs">
              {approval.grantRoot}
            </dd>
          </div>
        ) : null}

        {networkContext ? (
          <div>
            <dt className="font-medium text-foreground">
              ネットワーク承認情報
            </dt>
            <dd>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-xs">
                {networkContext}
              </pre>
            </dd>
          </div>
        ) : null}

        {approval.availableDecisions?.length ? (
          <div>
            <dt className="font-medium text-foreground">利用可能な判断</dt>
            <dd>{approval.availableDecisions.join(", ")}</dd>
          </div>
        ) : null}

        {approval.unsupportedDecisionOptions?.length ? (
          <div>
            <dt className="font-medium text-foreground">未対応の承認オプション</dt>
            <dd>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-xs">
                {approval.unsupportedDecisionOptions.join("\n")}
              </pre>
            </dd>
          </div>
        ) : null}
      </dl>

      {isResolved ? (
        <p className="mt-3 text-xs text-muted-foreground">
          判断は送信済みです
          {approval.decision ? `: ${approval.decision}` : ""}。
        </p>
      ) : submittedDecision ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {submittedDecision} を送信しました。Codex App Server の完了通知を待っています。
        </p>
      ) : actionItems.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {actionItems.map((action) => (
            <Button
              key={action.decision}
              type="button"
              size="sm"
              variant={action.variant}
              disabled={shouldDisableActions}
              onClick={() => void handleDecision(action.decision)}
            >
              {submittingDecision === action.decision
                ? "送信中"
                : action.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          この承認リクエストには Milestone 3 で送信できる基本 decision がありません。
        </p>
      )}

      {submitError ? (
        <p className="mt-2 text-xs text-destructive">{submitError}</p>
      ) : null}
    </section>
  );
};
