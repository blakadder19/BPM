import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  linkProps: [] as Array<Record<string, unknown>>,
  prefetched: [] as string[],
  pending: false,
}));

vi.mock("next/link", () => ({
  default: (props: { href: string; children?: ReactNode } & Record<string, unknown>) => {
    h.linkProps.push(props);
    return createElement("a", { href: props.href }, props.children);
  },
  useLinkStatus: () => ({ pending: h.pending }),
}));
vi.mock("next/image", () => ({
  default: (props: { alt: string }) => createElement("img", { alt: props.alt }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ prefetch: (href: string) => h.prefetched.push(href) }),
}));
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

const navItems = getNavigationForAccess({
  isStudent: false,
  permissions: new Set(),
  isSuperAdmin: true,
});

function renderSidebar(): string {
  return renderToStaticMarkup(createElement(Sidebar, { user: admin, navItems }));
}

function navLinkProps() {
  return h.linkProps.filter((p) => navItems.some((item) => item.href === p.href));
}

describe("Sidebar navigation prefetch", () => {
  beforeEach(() => {
    h.linkProps.length = 0;
    h.prefetched.length = 0;
    h.pending = false;
  });

  it("does not prefetch nav routes just because they are on screen", () => {
    expect(navItems.length).toBeGreaterThan(5);
    renderSidebar();
    const links = navLinkProps();
    expect(links.length).toBeGreaterThanOrEqual(navItems.length);
    for (const props of links) {
      expect(props.prefetch).toBe(false);
    }
    expect(h.prefetched).toEqual([]);
  });

  it("prefetches only the route the user shows intent for", () => {
    renderSidebar();
    const finance = navLinkProps().find((p) => p.href === "/finance");
    expect(finance).toBeDefined();
    for (const handler of ["onMouseEnter", "onFocus", "onTouchStart"] as const) {
      h.prefetched.length = 0;
      (finance![handler] as () => void)();
      expect(h.prefetched).toEqual(["/finance"]);
    }
  });

  it("shows a pending indicator on the link being navigated to", () => {
    expect(renderSidebar()).not.toContain("data-nav-pending");
    h.pending = true;
    expect(renderSidebar()).toContain("data-nav-pending");
  });
});
