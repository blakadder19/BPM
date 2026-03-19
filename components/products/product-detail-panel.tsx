"use client";

import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { getAccessRule, describeAccess } from "@/config/product-access";
import type { MockProduct, MockSubscription } from "@/lib/mock-data";

interface ProductDetailPanelProps {
  product: MockProduct;
  subscriptions: MockSubscription[];
  colSpan: number;
}

export function ProductDetailPanel({
  product,
  subscriptions,
  colSpan,
}: ProductDetailPanelProps) {
  const rule = getAccessRule(product.id);
  const linkedSubs = subscriptions.filter((s) => s.productId === product.id);
  const activeSubs = linkedSubs.filter((s) => s.status === "active");

  return (
    <tr>
      <td colSpan={colSpan} className="bg-gray-50 p-0">
        <div className="grid gap-5 px-8 py-5 md:grid-cols-2">
          {/* ── General Info ── */}
          <Section title="General">
            <DL label="Description" value={product.description || "—"} />
            {product.longDescription && (
              <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                {product.longDescription}
              </p>
            )}
            <DL label="Price" value={formatCents(product.priceCents)} />
            {product.productType === "membership" && product.classesPerTerm ? (
              <DL label="Classes / Term" value={`${product.classesPerTerm}`} />
            ) : (
              <DL
                label="Credits Model"
                value={
                  product.creditsModel === "unlimited"
                    ? "Unlimited"
                    : product.creditsModel === "single_use"
                      ? "Single use"
                      : `Fixed — ${product.totalCredits ?? "?"} credits`
                }
              />
            )}
            <DL label="Validity" value={product.validityDescription ?? "—"} />
            <DL label="Term-bound" value={product.termBound ? "Yes" : "No"} />
            {product.recurring && <DL label="Recurring" value="Yes (auto-renew eligible)" />}
            {product.benefits && product.benefits.length > 0 && (
              <DL label="Benefits" value={product.benefits.join(", ")} />
            )}
            {product.isProvisional && (
              <div className="mt-2">
                <Badge variant="warning">Provisional</Badge>
              </div>
            )}
          </Section>

          {/* ── Access Rules ── */}
          <Section title="Access Rules">
            {rule ? (
              <>
                <DL label="Access Summary" value={describeAccess(rule)} />
                <DL
                  label="Class Types"
                  value={rule.allowedClassTypes.join(", ")}
                />
                <DL
                  label="Style Access"
                  value={describeStyleAccess(rule)}
                />
                <DL
                  label="Levels"
                  value={rule.allowedLevels?.join(", ") ?? "All levels"}
                />
                {rule.isProvisional && rule.provisionalNote && (
                  <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {rule.provisionalNote}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">
                No access rule configured for this product.
              </p>
            )}
          </Section>

          {/* ── Scope ── */}
          <Section title="Scope">
            <DL label="Styles" value={product.styleName ?? "—"} />
            <DL
              label="Allowed Levels"
              value={product.allowedLevels?.join(", ") ?? "All levels"}
            />
          </Section>

          {/* ── Usage ── */}
          <Section title="Usage">
            <DL
              label="Active Subscriptions"
              value={String(activeSubs.length)}
            />
            <DL
              label="Total Subscriptions"
              value={String(linkedSubs.length)}
            />
            {activeSubs.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-medium text-gray-500">
                  Active subscribers:
                </p>
                {activeSubs.slice(0, 5).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-sm text-gray-600"
                  >
                    <span className="truncate">{s.studentId}</span>
                    <StatusBadge status={s.status} />
                    {s.remainingCredits !== null && (
                      <span className="text-xs text-gray-400">
                        {s.remainingCredits} credits left
                      </span>
                    )}
                  </div>
                ))}
                {activeSubs.length > 5 && (
                  <p className="text-xs text-gray-400">
                    …and {activeSubs.length - 5} more
                  </p>
                )}
              </div>
            )}
          </Section>

          {/* ── Notes ── */}
          {product.notes && (
            <Section title="Internal Notes" className="md:col-span-2">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {product.notes}
              </p>
            </Section>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {title}
      </h4>
      {children}
    </div>
  );
}

function DL({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-40 shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

function describeStyleAccess(
  rule: NonNullable<ReturnType<typeof getAccessRule>>
): string {
  const sa = rule.styleAccess;
  switch (sa.type) {
    case "all":
      return "All styles";
    case "fixed":
      return sa.styleIds.length > 0
        ? `${sa.styleIds.length} fixed style(s)`
        : "No styles assigned (TBD)";
    case "selected_style":
      return "Student selects 1 style at purchase";
    case "course_group":
      return `Student picks ${sa.pickCount} of ${sa.poolStyleIds.length} styles`;
    case "social_only":
      return "Social events only";
  }
}
