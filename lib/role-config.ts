import type { UserRole } from "@/types/domain";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Calendar,
  CalendarRange,
  BookOpen,
  Users,
  Package,
  ClipboardCheck,
  Settings,
  AlertTriangle,
  Building2,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const NAVIGATION: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["admin", "teacher", "student"] },
  { name: "Classes", href: "/classes", icon: Calendar, roles: ["admin", "teacher", "student"] },
  { name: "Bookings", href: "/bookings", icon: BookOpen, roles: ["admin", "teacher", "student"] },
  { name: "Events", href: "/events", icon: Sparkles, roles: ["admin", "student"] },
  { name: "Catalog", href: "/catalog", icon: ShoppingBag, roles: ["student"] },
  { name: "Attendance", href: "/attendance", icon: ClipboardCheck, roles: ["admin", "teacher"] },
  { name: "Students", href: "/students", icon: Users, roles: ["admin"] },
  { name: "Terms", href: "/terms", icon: CalendarRange, roles: ["admin"] },
  { name: "Products", href: "/products", icon: Package, roles: ["admin"] },
  { name: "Penalties", href: "/penalties", icon: AlertTriangle, roles: ["admin"] },
  { name: "Finance", href: "/finance", icon: Wallet, roles: ["admin"] },
  { name: "Studio Hire", href: "/studio-hire", icon: Building2, roles: ["admin"] },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["admin"] },
];

export function getNavigationForRole(role: UserRole): NavItem[] {
  return NAVIGATION.filter((item) => item.roles.includes(role));
}

const ROUTE_ACCESS: { prefix: string; roles: UserRole[] }[] = [
  { prefix: "/dashboard", roles: ["admin", "teacher", "student"] },
  { prefix: "/classes", roles: ["admin", "teacher", "student"] },
  { prefix: "/bookings", roles: ["admin", "teacher", "student"] },
  { prefix: "/events", roles: ["admin", "student"] },
  { prefix: "/catalog", roles: ["student"] },
  { prefix: "/attendance", roles: ["admin", "teacher"] },
  { prefix: "/students", roles: ["admin"] },
  { prefix: "/terms", roles: ["admin"] },
  { prefix: "/products", roles: ["admin"] },
  { prefix: "/penalties", roles: ["admin"] },
  { prefix: "/finance", roles: ["admin"] },
  { prefix: "/studio-hire", roles: ["admin"] },
  { prefix: "/settings", roles: ["admin"] },
];

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const match = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/")
  );
  if (!match) return true;
  return match.roles.includes(role);
}
