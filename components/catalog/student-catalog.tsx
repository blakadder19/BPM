"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CalendarRange,
  Palette,
  GraduationCap,
  Gift,
  RefreshCw,
  Layers,
  Inbox,
} from "lucide-react";
import { PricePill, InlineBadge, ProductListItem, SectionLabel } from "@/components/student/primitives";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";
import { createStudentPurchaseAction } from "@/lib/actions/catalog-purchase";
import { createStripeCheckoutAction } from "@/lib/actions/stripe-checkout";
import type { ProductType } from "@/types/domain";

type CheckoutChoice = "online" | "reception";

export interface StyleOption {
  id: string;
  name: string;
}

export interface TermOption {
  id: string;
  name: string;
  startDate: string;
  isFuture: boolean;
}

export type StyleSelectionMode = "none" | "pick_one" | "pick_many";

export interface CatalogProduct {
  id: string;
  name: string;
  productType: ProductType;
  description: string;
  longDescription: string | null;
  priceCents: number;
  styles: string;
  levels: string;
  classesPerTerm: number | null;
  totalCredits: number | null;
  validityDescription: string | null;
  benefits: string[] | null;
  termBound: boolean;
  recurring: boolean;
  spanTerms: number | null;
  termName: string | null;
  currentEntitlement: { paymentStatus: string } | null;
  renewalEntitlement: { paymentStatus: string; termName: string | null; isRenewal: boolean } | null;
  styleSelectionMode: StyleSelectionMode;
  selectableStyles: StyleOption[];
  pickCount: number;
  eligibleTerms: TermOption[] | null;
  coveredTermIds: string[];
  autoRenew: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  membership: "Memberships",
  pass: "Passes",
  drop_in: "Drop-in",
};

const TYPE_ORDER: ProductType[] = ["membership", "pass", "drop_in"];

interface StudentCatalogProps {
  products: CatalogProduct[];
  stripeEnabled?: boolean;
}

export function StudentCatalog({ products, stripeEnabled = false }: StudentCatalogProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [purchaseTarget, setPurchaseTarget] = useState<CatalogProduct | null>(null);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return products;
    return products.filter((p) => p.productType === typeFilter);
  }, [products, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<ProductType, CatalogProduct[]>();
    for (const p of filtered) {
      const list = map.get(p.productType);
      if (list) list.push(p);
      else map.set(p.productType, [p]);
    }
    return TYPE_ORDER
      .filter((t) => map.has(t))
      .map((t) => ({ type: t, label: TYPE_LABELS[t] ?? t, items: map.get(t)! }));
  }, [filtered]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      counts[p.productType] = (counts[p.productType] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Products"
        description="Browse available memberships, passes, and drop-ins."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          label="All"
          count={products.length}
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        />
        {TYPE_ORDER.filter((t) => typeCounts[t]).map((t) => (
          <FilterChip
            key={t}
            label={TYPE_LABELS[t] ?? t}
            count={typeCounts[t]}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          />
        ))}
      </div>

      <div data-tour="catalog-products" className="space-y-3">
        {grouped.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No products found"
            description="Try a different filter or check back later."
          />
        ) : (
          grouped.map(({ type, label, items }) => (
            <section key={type} className="space-y-1.5">
              <SectionLabel>{label}</SectionLabel>
              <div className="space-y-1.5">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} onSelect={setPurchaseTarget} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {purchaseTarget && (
        <PurchaseDialog
          product={purchaseTarget}
          stripeEnabled={stripeEnabled}
          onClose={() => setPurchaseTarget(null)}
        />
      )}
    </div>
  );
}

function ProductCard({
  product: p,
  onSelect,
}: {
  product: CatalogProduct;
  onSelect: (p: CatalogProduct) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const NEGATIVE_PAYMENT = new Set(["refunded", "cancelled"]);
  const isCurrentNegative = p.currentEntitlement && NEGATIVE_PAYMENT.has(p.currentEntitlement.paymentStatus);
  const hasOwnership = !!(p.currentEntitlement || p.renewalEntitlement);

  const summaryParts: string[] = [];
  if (p.classesPerTerm != null) summaryParts.push(`${p.classesPerTerm} classes/term`);
  else if (p.totalCredits != null) summaryParts.push(`${p.totalCredits} class${p.totalCredits !== 1 ? "es" : ""}`);
  summaryParts.push(p.styles);
  if (p.levels !== "All levels") summaryParts.push(p.levels);

  const priceLabel = p.recurring ? `${formatCents(p.priceCents)}/term` : formatCents(p.priceCents);

  return (
    <ProductListItem
      name={p.name}
      desc={summaryParts.join(" · ")}
      price={<PricePill accent={!hasOwnership} muted={hasOwnership}>{priceLabel}</PricePill>}
      badge={
        <>
          {p.currentEntitlement && (
            <InlineBadge className={
              p.currentEntitlement.paymentStatus === "pending"
                ? "bg-amber-100 text-amber-700"
                : p.currentEntitlement.paymentStatus === "refunded" || p.currentEntitlement.paymentStatus === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : "bg-green-100 text-green-700"
            }>
              {p.currentEntitlement.paymentStatus === "pending" ? "Pending"
                : p.currentEntitlement.paymentStatus === "refunded" ? "Refunded"
                : p.currentEntitlement.paymentStatus === "cancelled" ? "Payment cancelled"
                : "Active"}
            </InlineBadge>
          )}
          {p.renewalEntitlement && !p.currentEntitlement && (
            <InlineBadge className={
              p.renewalEntitlement.paymentStatus === "pending"
                ? "bg-amber-100 text-amber-600"
                : "bg-green-100 text-green-600"
            }>
              {p.renewalEntitlement.isRenewal ? "Renewal" : "Scheduled"}
            </InlineBadge>
          )}
        </>
      }
      border={
        p.currentEntitlement
          ? isCurrentNegative
            ? "border-red-200"
            : "border-emerald-200"
          : p.renewalEntitlement
            ? "border-amber-200"
            : "border-gray-200"
      }
      bg={
        p.currentEntitlement
          ? isCurrentNegative
            ? "bg-red-50/40"
            : "bg-emerald-50/60"
          : p.renewalEntitlement
            ? "bg-amber-50/40"
            : "bg-white"
      }
      chevron
      expanded={expanded}
      onClick={() => setExpanded(!expanded)}
      expandContent={
        expanded ? (
          <div className="border-t border-gray-100 px-3 pb-3 pt-2.5 space-y-3">
            <p className="text-xs text-gray-600 leading-relaxed">{p.description}</p>

            <div className="space-y-1.5 text-xs text-gray-500">
              {p.classesPerTerm != null && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {p.classesPerTerm} classes per term
                </div>
              )}
              {p.totalCredits != null && p.classesPerTerm == null && (
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {p.totalCredits} class{p.totalCredits !== 1 ? "es" : ""}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                {p.styles}
              </div>
              {p.levels !== "All levels" && (
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {p.levels}
                </div>
              )}
              {p.termBound && (
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {p.termName ?? "Term-linked"}
                  {p.spanTerms != null && p.spanTerms > 1 && (
                    <span className="text-gray-400">({p.spanTerms} terms)</span>
                  )}
                </div>
              )}
              {p.recurring && (
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  Auto-renewing
                </div>
              )}
            </div>

            {p.benefits && p.benefits.length > 0 && (
              <ul className="space-y-1">
                {p.benefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                    <Gift className="h-3.5 w-3.5 shrink-0 text-bpm-400 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {p.longDescription && (
              <p className="text-xs text-gray-500 leading-relaxed">{p.longDescription}</p>
            )}

            {p.currentEntitlement || p.renewalEntitlement ? (
              <div className="space-y-1 text-center text-xs font-medium pt-1">
                {p.currentEntitlement && (
                  <p className={
                    p.currentEntitlement.paymentStatus === "pending" ? "text-amber-700"
                      : p.currentEntitlement.paymentStatus === "refunded" || p.currentEntitlement.paymentStatus === "cancelled" ? "text-red-700"
                      : "text-green-700"
                  }>
                    {p.currentEntitlement.paymentStatus === "pending"
                      ? "Active · Complete payment at reception"
                      : p.currentEntitlement.paymentStatus === "refunded"
                        ? "Refunded"
                        : p.currentEntitlement.paymentStatus === "cancelled"
                          ? "Payment cancelled"
                          : "Already active"}
                  </p>
                )}
                {p.renewalEntitlement && (
                  <p className={p.renewalEntitlement.paymentStatus === "pending" ? "text-amber-600" : "text-green-600"}>
                    {(() => {
                      const label = p.renewalEntitlement.isRenewal ? "Renewal" : "Scheduled";
                      const term = p.renewalEntitlement.termName ? ` for ${p.renewalEntitlement.termName}` : "";
                      return p.renewalEntitlement.paymentStatus === "pending"
                        ? `${label}${term} · Complete payment`
                        : `${label}${term}`;
                    })()}
                  </p>
                )}
              </div>
            ) : (
              <Button className="w-full" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(p); }}>
                Get Started
              </Button>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

function PurchaseDialog({
  product: p,
  stripeEnabled,
  onClose,
}: {
  product: CatalogProduct;
  stripeEnabled: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedOne, setSelectedOne] = useState<StyleOption | null>(null);
  const [selectedMany, setSelectedMany] = useState<Set<string>>(new Set());
  const [selectedTerm, setSelectedTerm] = useState<TermOption | null>(() => {
    if (!p.eligibleTerms?.length) return null;
    return p.eligibleTerms.find((t) => !t.isFuture && !p.coveredTermIds.includes(t.id))
      ?? p.eligibleTerms.find((t) => !p.coveredTermIds.includes(t.id))
      ?? null;
  });
  const [checkoutChoice, setCheckoutChoice] = useState<CheckoutChoice>(
    stripeEnabled ? "online" : "reception",
  );
  const [autoRenew, setAutoRenew] = useState(p.autoRenew);

  const needsStylePick = p.styleSelectionMode !== "none";
  const styleValid =
    p.styleSelectionMode === "none" ||
    (p.styleSelectionMode === "pick_one" && selectedOne !== null) ||
    (p.styleSelectionMode === "pick_many" && selectedMany.size === p.pickCount);

  const needsTermPick = p.eligibleTerms !== null && p.eligibleTerms.length > 0;
  const termValid = !needsTermPick || selectedTerm !== null;

  function toggleMany(id: string) {
    setSelectedMany((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size < p.pickCount) next.add(id);
      }
      return next;
    });
  }

  function buildInput() {
    let selectedStyleId: string | null = null;
    let selectedStyleName: string | null = null;
    let selectedStyleIds: string[] | null = null;
    let selectedStyleNames: string[] | null = null;

    if (p.styleSelectionMode === "pick_one" && selectedOne) {
      selectedStyleId = selectedOne.id;
      selectedStyleName = selectedOne.name;
    }
    if (p.styleSelectionMode === "pick_many" && selectedMany.size > 0) {
      selectedStyleIds = [...selectedMany];
      selectedStyleNames = p.selectableStyles
        .filter((s) => selectedMany.has(s.id))
        .map((s) => s.name);
    }

    return {
      productId: p.id,
      selectedStyleId,
      selectedStyleName,
      selectedStyleIds,
      selectedStyleNames,
      selectedTermId: selectedTerm?.id ?? null,
      autoRenew: p.autoRenew ? autoRenew : null,
    };
  }

  function handleConfirm() {
    startTransition(async () => {
      setError(null);
      const input = buildInput();

      if (checkoutChoice === "online") {
        const res = await createStripeCheckoutAction(input);
        if (res.success && res.url) {
          window.location.href = res.url;
          return;
        }
        setError(res.error ?? "Could not start online payment.");
        return;
      }

      const res = await createStudentPurchaseAction(input);
      if (res.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(res.error ?? "We couldn't process your purchase. Please try again.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review & Checkout</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Product summary */}
          <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{p.name}</p>
              <StatusBadge status={p.productType} />
            </div>
            <p className="text-sm text-gray-600">{p.description}</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900">
                {formatCents(p.priceCents)}
              </span>
              {p.recurring && (
                <span className="text-xs text-gray-400">/ term</span>
              )}
            </div>
          </div>

          {/* What's included */}
          <div className="space-y-1.5 text-sm text-gray-600">
            {p.classesPerTerm != null && (
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-400" />
                {p.classesPerTerm} classes per term
              </div>
            )}
            {p.totalCredits != null && p.classesPerTerm == null && (
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gray-400" />
                {p.totalCredits} class{p.totalCredits !== 1 ? "es" : ""}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-gray-400" />
              {p.styles}
            </div>
            {p.levels !== "All levels" && (
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-gray-400" />
                {p.levels}
              </div>
            )}
            {p.termBound && (
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-gray-400" />
                {p.termName ?? "Term-linked"}
                {p.spanTerms != null && p.spanTerms > 1 && (
                  <span className="text-gray-400">({p.spanTerms} terms)</span>
                )}
              </div>
            )}
          </div>

          {/* Style selection — pick one */}
          {p.styleSelectionMode === "pick_one" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Choose your dance style
              </label>
              <div className="space-y-1.5">
                {p.selectableStyles.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedOne?.id === s.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="style"
                      checked={selectedOne?.id === s.id}
                      onChange={() => setSelectedOne(s)}
                      className="accent-bpm-600"
                    />
                    <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Style selection — pick many */}
          {p.styleSelectionMode === "pick_many" && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Choose {p.pickCount} dance style{p.pickCount !== 1 ? "s" : ""}
              </label>
              <p className="text-xs text-gray-400">
                {selectedMany.size} of {p.pickCount} selected
              </p>
              <div className="space-y-1.5">
                {p.selectableStyles.map((s) => {
                  const checked = selectedMany.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        checked
                          ? "border-blue-400 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMany(s.id)}
                        disabled={!checked && selectedMany.size >= p.pickCount}
                        className="accent-bpm-600"
                      />
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Term selection */}
          {needsTermPick && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {p.spanTerms != null && p.spanTerms >= 2
                  ? "Choose starting term"
                  : "Choose term"}
              </label>
              <p className="text-xs text-gray-400">
                {p.spanTerms != null && p.spanTerms >= 2
                  ? "This pass covers the selected term and the following term."
                  : "This plan will apply only to classes in the selected term."}
              </p>
              <div className="space-y-1.5">
                {p.eligibleTerms!.map((t) => {
                  const covered = p.coveredTermIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                        covered
                          ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                          : selectedTerm?.id === t.id
                            ? "border-blue-400 bg-blue-50 cursor-pointer"
                            : "border-gray-200 hover:border-gray-300 cursor-pointer"
                      }`}
                    >
                      <input
                        type="radio"
                        name="term"
                        checked={selectedTerm?.id === t.id}
                        onChange={() => !covered && setSelectedTerm(t)}
                        disabled={covered}
                        className="accent-bpm-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{t.name}</span>
                        {t.isFuture && !covered && (
                          <span className="ml-2 text-xs text-amber-600">(starts {t.startDate})</span>
                        )}
                        {covered && (
                          <span className="ml-2 text-xs text-gray-400">Already active</span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              {selectedTerm?.isFuture && (
                <p className="text-xs text-amber-700">
                  {p.spanTerms != null && p.spanTerms >= 2
                    ? "This is a future term. Your pass will cover this term and the one after it, but won't be usable until that term starts."
                    : "This is a future term. Your plan will not be usable until that term starts."}
                </p>
              )}
            </div>
          )}

          {/* Auto-renew toggle for renewable products */}
          {p.autoRenew && !success && (
            <div className="space-y-1">
              <label className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:border-gray-300 transition-colors">
                <input
                  type="checkbox"
                  checked={autoRenew}
                  onChange={() => setAutoRenew(!autoRenew)}
                  className="accent-bpm-600"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Enable auto-renew
                  </span>
                  <p className="text-xs text-gray-500">
                    Automatically prepare a renewal for the next term. You will still need to pay separately — no card is charged automatically.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Payment method choice */}
          {!success && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                How would you like to pay?
              </label>
              <div className="space-y-1.5">
                {stripeEnabled && (
                  <label
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      checkoutChoice === "online"
                        ? "border-bpm-400 bg-bpm-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="checkout"
                      checked={checkoutChoice === "online"}
                      onChange={() => setCheckoutChoice("online")}
                      className="accent-bpm-600"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        Pay online (card)
                      </span>
                      <p className="text-xs text-gray-500">
                        Secure payment via Stripe. Your plan activates instantly after payment.
                      </p>
                    </div>
                  </label>
                )}
                <label
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    checkoutChoice === "reception"
                      ? "border-bpm-400 bg-bpm-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="checkout"
                    checked={checkoutChoice === "reception"}
                    onChange={() => setCheckoutChoice("reception")}
                    className="accent-bpm-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">
                      Pay at reception
                    </span>
                    <p className="text-xs text-gray-500">
                      Your plan is reserved immediately. Complete payment at the studio (cash or Revolut).
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className={`rounded-lg p-3 text-sm ${
              selectedTerm?.isFuture
                ? "bg-blue-50 text-blue-800"
                : "bg-green-50 text-green-800"
            }`}>
              <strong>{p.name}</strong>
              {selectedTerm
                ? p.spanTerms != null && p.spanTerms >= 2
                  ? ` starting from ${selectedTerm.name}`
                  : ` for ${selectedTerm.name}`
                : ""}
              {selectedTerm?.isFuture
                ? " has been scheduled."
                : " has been activated!"}
              {p.spanTerms != null && p.spanTerms >= 2
                ? " It covers this term and the following term."
                : ""}
              {selectedTerm?.isFuture
                ? " It will become usable once that term starts."
                : " You can now book classes."}
              {" "}Please complete payment at reception.
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {success ? (
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isPending || (needsStylePick && !styleValid) || !termValid}
              >
                {isPending
                  ? "Processing…"
                  : checkoutChoice === "online"
                    ? "Continue to payment"
                    : selectedTerm?.isFuture
                      ? "Confirm & Schedule"
                      : "Confirm & Activate"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1 py-px text-[9px] leading-none ${
          active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
