import type { ReactNode } from "react";
import { Clock, MapPin, Check, ChevronDown } from "lucide-react";

// ── Row container ──────────────────────────────────────────

export function CompactRow({
  className = "",
  border = "border-gray-200",
  bg = "bg-white",
  children,
}: {
  className?: string;
  border?: string;
  bg?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border ${border} ${bg} p-2.5 ${className}`}>
      {children}
    </div>
  );
}

// ── Typography ─────────────────────────────────────────────

export function RowTitle({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <p className={`text-xs font-semibold truncate ${muted ? "text-gray-500" : "text-gray-900"}`}>
      {children}
    </p>
  );
}

export function RowMeta({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
      {children}
    </div>
  );
}

export function MetaTime({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Clock className="h-3 w-3" />
      {children}
    </span>
  );
}

export function MetaLocation({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <MapPin className="h-3 w-3" />
      {children}
    </span>
  );
}

// ── Section header ─────────────────────────────────────────

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
      {children}
    </p>
  );
}

// ── Preview shell ──────────────────────────────────────────

export function PreviewShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/50 p-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ── Price pill ─────────────────────────────────────────────

export function PricePill({
  children,
  accent,
  muted,
}: {
  children: ReactNode;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        muted
          ? "bg-gray-100 text-gray-400"
          : accent
            ? "bg-emerald-100 text-emerald-700"
            : "bg-gray-100 text-gray-700"
      }`}
    >
      {children}
    </span>
  );
}

// ── Action pill ────────────────────────────────────────────

type ActionVariant = "primary" | "waitlist" | "danger" | "restore" | "secondary" | "coc";

const ACTION_STYLES: Record<ActionVariant, string> = {
  primary: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200",
  waitlist: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  danger: "bg-red-100 text-red-600 hover:bg-red-200",
  restore: "bg-orange-100 text-orange-700 hover:bg-orange-200",
  secondary: "bg-gray-100 text-gray-600 hover:bg-gray-200",
  coc: "bg-amber-100 text-amber-700 hover:bg-amber-200",
};

export function ActionPill({
  children,
  variant = "primary",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: ActionVariant;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${ACTION_STYLES[variant]}`}
    >
      {children}
    </button>
  );
}

// ── Status pill ────────────────────────────────────────────

type StatusVariant = "confirmed" | "checked_in" | "waitlisted" | "cancelled" | "missed" | "blocked" | "default";

const STATUS_STYLES: Record<StatusVariant, string> = {
  confirmed: "bg-green-100 text-green-700",
  checked_in: "bg-green-100 text-green-700",
  waitlisted: "bg-amber-100 text-amber-700",
  cancelled: "bg-red-100 text-red-600",
  missed: "bg-red-100 text-red-600",
  blocked: "bg-gray-100 text-gray-500",
  default: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, { label: string; variant: StatusVariant }> = {
  confirmed: { label: "Confirmed", variant: "confirmed" },
  checked_in: { label: "Checked in", variant: "checked_in" },
  waiting: { label: "Waitlisted", variant: "waitlisted" },
  cancelled: { label: "Cancelled", variant: "cancelled" },
  late_cancelled: { label: "Late cancel", variant: "cancelled" },
  missed: { label: "Missed", variant: "missed" },
};

export function StatusPill({
  status,
  label,
  variant,
  icon,
}: {
  status?: string;
  label?: string;
  variant?: StatusVariant;
  icon?: boolean;
}) {
  const resolved = status ? STATUS_LABELS[status] : undefined;
  const v = variant ?? resolved?.variant ?? "default";
  const text = label ?? resolved?.label ?? status ?? "";

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[v]}`}
    >
      {icon && v === "confirmed" && <Check className="h-3 w-3" />}
      {icon && v === "waitlisted" && <Clock className="h-3 w-3" />}
      {text}
    </span>
  );
}

// ── Inline badge ───────────────────────────────────────────

export function InlineBadge({
  children,
  className = "bg-indigo-50 text-indigo-700",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {children}
    </span>
  );
}

// ── Tip box ────────────────────────────────────────────────

export function TipBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
      <p className="text-[11px] text-amber-800">{children}</p>
    </div>
  );
}

// ── Full card: Product list item ──────────────────────────
// Used identically in tutorial previews and real catalog.

export function ProductListItem({
  name,
  desc,
  price,
  badge,
  border = "border-gray-200",
  bg = "bg-white",
  chevron,
  expanded,
  onClick,
  expandContent,
}: {
  name: ReactNode;
  desc: string;
  price: ReactNode;
  badge?: ReactNode;
  border?: string;
  bg?: string;
  chevron?: boolean;
  expanded?: boolean;
  onClick?: () => void;
  expandContent?: ReactNode;
}) {
  const inner = (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <RowTitle>{name}</RowTitle>
          {badge}
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500 truncate">{desc}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {price}
        {chevron && (
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </div>
    </div>
  );

  return (
    <div className={`rounded-md border ${border} ${bg} overflow-hidden`}>
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full p-2.5 text-left">
          {inner}
        </button>
      ) : (
        <div className="p-2.5">{inner}</div>
      )}
      {expandContent}
    </div>
  );
}

// ── Full card: Class list item ────────────────────────────
// Used identically in tutorial previews and real class browser.

export function ClassListItem({
  name,
  badges,
  meta,
  action,
  extra,
  border = "border-gray-200",
  bg = "bg-white",
  className,
}: {
  name: ReactNode;
  badges?: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
  extra?: ReactNode;
  border?: string;
  bg?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md border ${border} ${bg} p-2.5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <RowTitle>{name}</RowTitle>
            {badges}
          </div>
          <div className="mt-0.5">{meta}</div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {extra}
    </div>
  );
}

// ── Full card: Booking list item ──────────────────────────
// Used identically in tutorial previews and real bookings page.

export function BookingListItem({
  name,
  badge,
  meta,
  status,
  action,
  muted,
  extra,
  border = "border-gray-200",
  bg = "bg-white",
  className,
}: {
  name: ReactNode;
  badge?: ReactNode;
  meta: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  muted?: boolean;
  extra?: ReactNode;
  border?: string;
  bg?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md border ${border} ${bg} p-2.5 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <RowTitle muted={muted}>{name}</RowTitle>
            {badge}
          </div>
          <div className="mt-0.5">{meta}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {status}
          {action}
        </div>
      </div>
      {extra}
    </div>
  );
}
