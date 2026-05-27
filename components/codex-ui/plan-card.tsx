import { CODEX_PART_LABELS } from "@/frontend/codex-part-names";
import type { FC } from "react";

type PlanCardProps = {
  text: string;
};

/**
 * Codex が共有した作業計画を、推論サマリーとは別のカードとして表示する。
 *
 * @param props - 表示する整形済み計画テキスト。
 * @returns 作業計画カード。
 */
export const PlanCard: FC<PlanCardProps> = ({ text }) => {
  return (
    <section className="mb-4 rounded-lg border px-3 py-2 text-sm">
      <div className="mb-2 font-medium">{CODEX_PART_LABELS.plan}</div>
      <pre className="whitespace-pre-wrap text-muted-foreground">{text}</pre>
    </section>
  );
};
