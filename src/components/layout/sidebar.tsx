"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  SlidersHorizontal,
  Search,
  Bookmark,
  KanbanSquare,
  Users,
  Map,
  PenTool,
  Settings,
  Briefcase,
  Trophy,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/resume", label: "Resume", icon: FileText },
  { href: "/builder", label: "Resume Builder", icon: PenTool },
  { href: "/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/jobs", label: "Job Search", icon: Search },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/map", label: "Job Map", icon: Map },
  { href: "/saved", label: "Saved Jobs", icon: Bookmark },
  { href: "/networking", label: "Networking", icon: Users },
  { href: "/gamification", label: "Progress", icon: Trophy },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Briefcase className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold">JobHunt</span>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
