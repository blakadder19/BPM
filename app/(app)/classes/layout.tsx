"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { useUser } from "@/components/providers/user-provider";

const ADMIN_TABS = [
  { label: "Templates", href: "/classes" },
  { label: "Schedule", href: "/classes/bookable" },
  { label: "Teachers", href: "/classes/teachers" },
] as const;

function ClassesTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/classes") return pathname === "/classes";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex gap-6 border-b border-gray-200">
      {ADMIN_TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`pb-2 text-sm font-medium transition-colors ${
            isActive(tab.href)
              ? "border-b-2 border-bpm-600 text-bpm-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export default function ClassesLayout({ children }: { children: ReactNode }) {
  const { role } = useUser();
  const showTabs = role === "admin" || role === "teacher";

  return (
    <div className="space-y-6">
      {showTabs && <ClassesTabs />}
      {children}
    </div>
  );
}
