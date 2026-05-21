import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { memo } from "react";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar = memo(function Sidebar({ isOpen, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-all duration-300 overflow-hidden flex-shrink-0",
        isOpen ? "w-64" : "w-10",
      )}
    >
      <div className="flex h-10 items-center border-b px-1.5">
        {isOpen && (
          <span className="flex-1 truncate px-1.5 text-sm font-semibold text-foreground">
            チャット履歴
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 flex-shrink-0"
          onClick={onToggle}
          aria-label={isOpen ? "サイドバーを閉じる" : "サイドバーを開く"}
        >
          {isOpen ? (
            <PanelLeftCloseIcon className="size-4" />
          ) : (
            <PanelLeftOpenIcon className="size-4" />
          )}
        </Button>
      </div>
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-2">
          <ThreadList />
        </div>
      )}
    </aside>
  );
});
