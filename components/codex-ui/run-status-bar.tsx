import type { RunStatusViewModel } from "@/frontend/derive-run-status";
import { cn } from "@/lib/utils";
import type { FC } from "react";

type RunStatusBarProps = {
  status: RunStatusViewModel;
};

const severityClassName = {
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100",
  danger:
    "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
  muted: "border-border bg-muted/40 text-muted-foreground",
} as const satisfies Record<RunStatusViewModel["severity"], string>;

/**
 * assistant message の先頭で Codex turn の現在状態を短く表示する。
 *
 * @param props - 表示する RunStatusViewModel。
 * @returns 現在状態を伝えるコンパクトなステータスバー。
 */
export const RunStatusBar: FC<RunStatusBarProps> = ({ status }) => {
  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        "mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
        severityClassName[status.severity],
      )}
    >
      {status.active ? (
        <span
          aria-hidden
          className="size-2 shrink-0 animate-pulse rounded-full bg-current"
        />
      ) : null}

      <div className="min-w-0 break-words">
        <span className="font-medium">{status.label}</span>
        {status.description ? (
          <span className="ml-2 text-current/80">{status.description}</span>
        ) : null}
      </div>
    </section>
  );
};
