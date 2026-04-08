"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogOut, X } from "lucide-react";
import { signOut } from "@/lib/actions/auth";
import { getNavigationForRole } from "@/lib/role-config";
import { useSidebar } from "@/components/providers/sidebar-provider";
import type { AuthUser } from "@/lib/auth";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-indigo-100 text-indigo-700",
  teacher: "bg-emerald-100 text-emerald-700",
  student: "bg-sky-100 text-sky-700",
};

interface SidebarProps {
  user: AuthUser;
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { mobileOpen, close } = useSidebar();
  const navItems = getNavigationForRole(user.role);

  const initials = user.fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navContent = (
    <>
      <div className="flex h-20 items-center justify-between border-b border-gray-200 px-6">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/branding/bpm-logo-full.jpg"
            alt="BPM"
            width={180}
            height={60}
            className="h-14 w-auto object-contain"
            priority
          />
        </Link>
        <button
          onClick={close}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-y-contain px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={close}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0",
                  isActive
                    ? "text-indigo-600"
                    : "text-gray-400 group-hover:text-gray-500"
                )}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-3 py-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              ROLE_COLORS[user.role] ?? "bg-gray-100 text-gray-700"
            )}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium text-gray-900">
              {user.fullName}
            </p>
            <p className="text-xs text-gray-500">
              {ROLE_LABELS[user.role] ?? user.role}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
        {navContent}
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/40"
            onClick={close}
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl animate-in slide-in-from-left duration-200">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
