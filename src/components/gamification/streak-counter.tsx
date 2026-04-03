import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";

interface StreakCounterProps {
  count: number;
  className?: string;
}

export function StreakCounter({ count, className }: StreakCounterProps) {
  const color = count > 0 ? "text-foreground" : "text-muted-foreground";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Flame className={cn("h-5 w-5", count > 0 && color)} />
      <span className={cn("text-sm font-bold tabular-nums", count > 0 && color)}>
        {count}
      </span>
      <span className="text-xs text-muted-foreground">day{count !== 1 ? "s" : ""}</span>
    </div>
  );
}
