import { CODEX_PART_LABELS } from "@/frontend/codex-part-names";
import type { FC } from "react";

type DiffSummaryCardProps = {
  diff: string;
};

/**
 * Codex turn 全体の unified diff を、実行ログとは別の変更差分カードとして表示する。
 *
 * @param props - 表示する aggregated unified diff。
 * @returns 変更差分カード。
 */
export const DiffSummaryCard: FC<DiffSummaryCardProps> = ({ diff }) => {
  return (
    <section className="mb-4 rounded-lg border px-3 py-2 text-sm">
      <div className="mb-2 font-medium">{CODEX_PART_LABELS.diff}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-muted-foreground text-xs">
        {diff}
      </pre>
    </section>
  );
};
