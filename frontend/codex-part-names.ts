/**
 * Codex 固有の assistant-ui tool-call 名を集約する。
 */
export const CODEX_PART_TOOL_NAMES = {
  runStatus: "codex.run_status",
  plan: "codex.plan",
  diff: "codex.diff",
  approval: "codex.approval",
} as const;

/**
 * Codex の進行中表示で使う日本語ラベルを集約する。
 */
export const CODEX_PART_LABELS = {
  runStatus: "AIの作業状況",
  plan: "作業計画",
  reasoningSummary: "推論サマリー",
  commentary: "進行中の説明",
  tools: "実行ログ",
  diff: "変更差分",
  approval: "承認待ち",
} as const;

/**
 * reasoning part の内容種別を UI 側で識別するための見出し prefix。
 */
export const CODEX_REASONING_PREFIXES = {
  reasoningSummary: `## ${CODEX_PART_LABELS.reasoningSummary}\n`,
  commentary: `## ${CODEX_PART_LABELS.commentary}\n`,
} as const;
