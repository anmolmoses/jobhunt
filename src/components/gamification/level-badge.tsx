import { cn } from "@/lib/utils";

interface LevelBadgeProps {
  level: number;
  title: string;
  className?: string;
}

export function LevelBadge({ level, title, className }: LevelBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
        {level}
      </div>
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}
