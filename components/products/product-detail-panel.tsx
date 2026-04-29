"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import type { MockProduct, MockSubscription } from "@/lib/mock-data";
import type { ProductScope } from "./admin-products";

interface ProductDetailPanelProps {
  product: MockProduct;
  subscriptions: MockSubscription[];
  studentNameMap: Record<string, string>;
  colSpan: number;
  scope?: ProductScope;
}

export function ProductDetailPanel({
  product,
  subscriptions,
  studentNameMap,
  colSpan,
  scope,
}: ProductDetailPanelProps) {
  const linkedSubs = subscriptions.filter((s) => s.productId === product.id);
  const activeSubs = linkedSubs.filter((s) => s.status === "active");
  const [showAllSubs, setShowAllSubs] = useState(false);

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
            {product.productType === "membership" && (
              <>
                <DL
                  label="Allowance"
                  value={product.classesPerTerm
                    ? `${product.classesPerTerm} classes per term`
                    : "Not set — update classes per term"}
                />
                <DL label="Recurring" value={product.recurring ? "Yes (auto-renew eligible)" : "No"} />
              </>
            )}
            {product.productType === "pass" && (
              <DL
                label="Total Classes"
                value={product.totalCredits ? `${product.totalCredits}` : "—"}
              />
            )}
            {product.productType === "drop_in" && (
              <DL label="Allowance" value="1 class (single use)" />
            )}
            <DL label="Validity" value={product.validityDescription ?? "—"} />
            <DL label="Term-bound" value={product.termBound ? "Yes" : "No"} />
            {product.productType !== "membership" && product.recurring && (
              <DL label="Recurring" value="Yes" />
            )}
            {product.benefits && product.benefits.length > 0 && (
              <DL label="Benefits" value={product.benefits.join(", ")} />
            )}
            {product.isProvisional && (
              <div className="mt-2">
                <Badge variant="warning">Provisional</Badge>
              </div>
            )}
          </Section>

          {/* ── Restrictions ── */}
          <Section title="Restrictions">
            {product.styleAccessMode === "social_only" ? (
              <>
                {/*
                  Socials-only short-circuits the generic Allowed Styles /
                  Allowed Levels presentation: those fields are ignored by
                  the access engine in this mode, so showing them as
                  "All styles · All levels" would be misleading.
                */}
                <DL label="Access" value="Socials only" />
                <DL label="Class types" value="Social events" />
                <p className="mt-1 text-xs text-gray-500">
                  Excluded from class booking. Style and level restrictions do not apply to socials.
                </p>
              </>
            ) : (
              <>
                <DL
                  label="Allowed Styles"
                  value={
                    product.styleAccessMode === "all"
                      ? "All styles"
                      : product.allowedStyleNames?.length
                        ? product.allowedStyleNames.join(", ")
                        : product.styleName ?? "All styles"
                  }
                />
                <DL
                  label="Allowed Levels"
                  value={
                    product.allowedLevels?.length
                      ? product.allowedLevels.join(", ")
                      : "All levels"
                  }
                />
                {product.styleAccessMode && (
                  <DL
                    label="Style access mode"
                    value={
                      product.styleAccessMode === "course_group" && product.styleAccessPickCount
                        ? `${product.styleAccessMode} (pick ${product.styleAccessPickCount})`
                        : product.styleAccessMode
                    }
                  />
                )}
                {product.allowedClassTypes && product.allowedClassTypes.length > 0 && (
                  <DL label="Allowed class types" value={product.allowedClassTypes.join(", ")} />
                )}
              </>
            )}
            {product.spanTerms && product.spanTerms > 1 && (
              <DL label="Spans" value={`${product.spanTerms} terms`} />
            )}
          </Section>

          {/* ── Lifecycle / Stripe ── */}
          {(product.archivedAt || product.stripePriceId) && (
            <Section title="Lifecycle & integrations">
              {product.archivedAt && (
                <DL
                  label="Archived at"
                  value={new Date(product.archivedAt).toLocaleString()}
                />
              )}
              {product.stripePriceId && (
                <DL label="Stripe price ID" value={product.stripePriceId} />
              )}
            </Section>
          )}

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
                <button
                  onClick={() => setShowAllSubs((v) => !v)}
                  className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  Active subscribers ({activeSubs.length})
                  {showAllSubs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showAllSubs && (
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-gray-100 bg-white p-2">
                    {activeSubs.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 text-sm text-gray-600"
                      >
                        <span className="truncate font-medium">
                          {studentNameMap[s.studentId] ?? s.studentId}
                        </span>
                        <StatusBadge status={s.status} />
                        {s.productType === "membership" && s.classesPerTerm !== null ? (
                          <span className="text-xs text-gray-400">
                            {s.classesPerTerm - s.classesUsed} of {s.classesPerTerm} left
                          </span>
                        ) : s.remainingCredits !== null ? (
                          <span className="text-xs text-gray-400">
                            {s.remainingCredits} left
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
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

