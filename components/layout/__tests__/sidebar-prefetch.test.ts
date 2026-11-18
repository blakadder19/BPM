import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const linkProps = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: ReactNode } & Record<string, unknown>) => {
    linkProps.push(props);
    return createElement("a", { href: props.href }, props.children);
  },
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => createElement("img", { alt: props.alt }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("@/components/providers/sidebar-provider", () => ({
  useSidebar: () => ({ mobileOpen: false, close: () => {} }),
}));
vi.mock("@/lib/actions/auth", () => ({ signOut: async () => {} }));

import { Sidebar } from "@/components/layout/sidebar";
import { getNavigationForAccess } from "@/lib/role-config";
import type { AuthUser } from "@/lib/auth";

const admin: AuthUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.test",
  fullName: "Admin Example",
  role: "admin",
  avatarUrl: null,
  academyId: "academy-1",
  emailConfirmed: true,
};

describe("Sidebar navigation prefetch", () => {
  beforeEach(() => {
    linkProps.length = 0;
  });

  it("never forces a full prefetch of nav routes", () => {
    const navItems = getNavigationForAccess({
      isStudent: false,
      permissions: new Set(),
      isSuperAdmin: true,
    });
    expect(navItems.length).toBeGreaterThan(5);

    renderToStaticMarkup(createElement(Sidebar, { user: admin, navItems }));

    const navLinks = linkProps.filter((p) =>
      navItems.some((item) => item.href === p.href),
    );
    expect(navLinks.length).toBeGreaterThanOrEqual(navItems.length);
    for (const props of navLinks) {
      expect(props.prefetch).not.toBe(true);
    }
  });
});
