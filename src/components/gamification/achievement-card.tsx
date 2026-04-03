import { cn } from "@/lib/utils";
import {
  Briefcase, Search, Users, FileText, Calendar, Flame, Trophy, Bookmark, Lock,
} from "lucide-react";

interface AchievementCardProps {
  id: string;
  name: string;
  description: string;
  category: string;
  xpReward: number;
  icon: string;
  unlocked: boolean;
  unlockedAt: string | null;
  className?: string;
}

const ICON_MAP: Record<string, React.ElementType> = {
  Briefcase,
  Search,
  Users,
  FileText,
  Calendar,
  Flame,
  Trophy,
  Bookmark,
};

export function AchievementCard({
  name,
  description,
  xpReward,
  icon,
  unlocked,
  unlockedAt,
  className,
}: AchievementCardProps) {
  const IconComponent = ICON_MAP[icon] || Trophy;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors",
        unlocked
          ? "bg-card border-primary/30"
          : "bg-muted/30 border-muted opacity-60",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          unlocked ? "bg-primary/10" : "bg-muted"
        )}
      >
        {unlocked ? (
          <IconComponent className="h-6 w-6 text-primary" />
        ) : (
          <Lock className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div>
        <p className={cn("text-sm font-medium", !unlocked && "text-muted-foreground")}>{name}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={cn("text-xs font-medium", unlocked ? "text-primary" : "text-muted-foreground")}>
        +{xpReward} XP
      </div>
      {unlocked && unlockedAt && (
        <p className="text-[9px] text-muted-foreground">
          {new Date(unlockedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
