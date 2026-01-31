"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListVideo, PlayCircle, FileText, Users, Monitor, BarChart3, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: string;
}

const navItems = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/testing", label: "Video Testing", icon: PlayCircle },
  { href: "/schedule", label: "Schedule Testing", icon: CalendarClock },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/dashboard", label: "Dashboard", icon: Monitor },
  { href: "/users", label: "User Management", icon: Users, adminOnly: true },
];

export function Sidebar({ isOpen, onClose, userRole }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
      <div className="flex h-16 items-center border-b border-slate-700 px-6">
        <BarChart3 className="mr-2 h-6 w-6 text-blue-400" />
        <h1 className="text-lg font-bold">HLS Analyzer</h1>
      </div>
      <nav className="mt-4 px-3">
        {navItems
          .filter((item) => !item.adminOnly || userRole === "ADMIN")
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors mb-1",
                  isActive
                    ? "bg-slate-700 text-white"
                    : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
      </nav>
      </aside>
    </>
  );
}
