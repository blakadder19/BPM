"use client";

import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AuthUser } from "@/lib/auth";

const ROLE_BADGE: Record<string, "default" | "success" | "info"> = {
  admin: "default",
  teacher: "success",
  student: "info",
};

interface TopbarProps {
  user: AuthUser;
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <Badge variant={ROLE_BADGE[user.role] ?? "default"}>
          {user.role}
        </Badge>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled
          title="Notifications — coming soon"
          className="relative rounded-lg p-2 text-gray-300 cursor-not-allowed opacity-50"
        >
          <Bell className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-600">{user.email}</span>
      </div>
    </header>
  );
}
