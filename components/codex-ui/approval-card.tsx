import { CODEX_PART_LABELS } from "@/frontend/codex-part-names";
import type { ApprovalState } from "@/frontend/codex-turn-state";
import type { FC } from "react";

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

/**
 * Codex の approval request を、未接続の承認待ちカードとして表示する。
 *
 * @param props - 表示する approval request の状態。
 * @returns 承認待ちカード。
 */
export const ApprovalCard: FC<ApprovalCardProps> = ({ approval }) => {
  const networkContext = formatUnknown(approval.networkApprovalContext);

  return (
    <section className="mb-4 rounded-lg border border-amber-300/70 bg-amber-50/40 px-3 py-2 text-sm dark:border-amber-800/80 dark:bg-amber-950/20">
      <div className="mb-2 font-medium">{CODEX_PART_LABELS.approval}</div>

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
      </dl>

      <p className="mt-3 text-xs text-muted-foreground">
        この段階では承認操作は未接続です。安全側の暫定処理として
        decline されます。
      </p>
    </section>
  );
};
