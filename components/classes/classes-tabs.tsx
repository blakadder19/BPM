"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ClassesTab } from "@/lib/classes-tabs";

export function ClassesTabs({ tabs }: { tabs: ClassesTab[] }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/classes") return pathname === "/classes";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex gap-6 border-b border-gray-200">
      {tabs.map((tab) => (
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
