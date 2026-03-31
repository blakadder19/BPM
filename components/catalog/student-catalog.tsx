"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CalendarRange,
  Tag,
  CheckCircle2,
  Palette,
  GraduationCap,
  Gift,
  RefreshCw,
  Layers,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ProductType } from "@/types/domain";

export interface StyleOption {
  id: string;
  name: string;
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
  alreadyActive: boolean;
  styleSelectionMode: StyleSelectionMode;
  selectableStyles: StyleOption[];
  pickCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  membership: "Memberships",
  pass: "Passes",
  drop_in: "Drop-in",
};

const TYPE_ORDER: ProductType[] = ["membership", "pass", "drop_in"];

interface StudentCatalogProps {
  products: CatalogProduct[];
}

export function StudentCatalog({ products }: StudentCatalogProps) {
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
    <div className="space-y-6">
      <PageHeader
        title="Memberships & Passes"
        description="Browse our available plans and activate your membership or pass."
      />

      <div className="flex flex-wrap items-center gap-2">
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

      {grouped.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No products found"
          description="Try a different filter or check back later."
        />
      ) : (
        grouped.map(({ type, label, items }) => (
          <section key={type}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
              {label}
            </h2>
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((p) => (
                <ProductCard key={p.id} product={p} onSelect={setPurchaseTarget} />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 text-xs sm:text-sm text-amber-700">
        <p>
          Online payment is coming soon. For now, your selection will be recorded and
          payment can be completed at reception.
        </p>
      </div>

      {purchaseTarget && (
        <PurchaseDialog
          product={purchaseTarget}
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

  return (
    <Card
      className={`flex flex-col transition-shadow hover:shadow-md ${
        p.alreadyActive ? "border-green-200 bg-green-50/30" : ""
      }`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold text-gray-900">
            {p.name}
          </CardTitle>
          <StatusBadge status={p.productType} />
        </div>
        {p.alreadyActive && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 mt-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            You have this
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pt-0">
        <p className="text-sm text-gray-600">{p.description}</p>

        {/* Price */}
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-gray-400" />
          <span className="text-lg font-bold text-gray-900">
            {formatCents(p.priceCents)}
          </span>
          {p.recurring && (
            <span className="text-xs text-gray-400">/ term</span>
          )}
          {!p.recurring && p.validityDescription && (
            <span className="text-xs text-gray-400">{p.validityDescription}</span>
          )}
        </div>

        {/* Key details */}
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

        {(p.benefits?.length || p.longDescription) && (
          <div>
            <button
              type="button"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "What's included"}
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {p.longDescription && (
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {p.longDescription}
                  </p>
                )}
                {p.benefits && p.benefits.length > 0 && (
                  <ul className="space-y-1">
                    {p.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <Gift className="h-3.5 w-3.5 shrink-0 text-indigo-400 mt-0.5" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <div className="border-t border-gray-100 p-3 sm:p-4">
        {p.alreadyActive ? (
          <p className="text-center text-sm font-medium text-green-700">Already active</p>
        ) : (
          <Button className="w-full" onClick={() => onSelect(p)}>
            Get Started
          </Button>
        )}
      </div>
    </Card>
  );
}

function PurchaseDialog({
  product: p,
  onClose,
}: {
  product: CatalogProduct;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [selectedOne, setSelectedOne] = useState<StyleOption | null>(null);
  const [selectedMany, setSelectedMany] = useState<Set<string>>(new Set());

  const needsStylePick = p.styleSelectionMode !== "none";
  const styleValid =
    p.styleSelectionMode === "none" ||
    (p.styleSelectionMode === "pick_one" && selectedOne !== null) ||
    (p.styleSelectionMode === "pick_many" && selectedMany.size === p.pickCount);

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

  function handleConfirm() {
    startTransition(async () => {
      setError(null);

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

      const res = await createStudentPurchaseAction({
        productId: p.id,
        selectedStyleId,
        selectedStyleName,
        selectedStyleIds,
        selectedStyleNames,
      });

      if (res.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review & Activate</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Product summary */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
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
                      className="accent-blue-600"
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
                        className="accent-blue-600"
                      />
                      <span className="text-sm font-medium text-gray-900">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment notice */}
          {!success && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Payment will be collected at reception. Online payment coming soon.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              <strong>{p.name}</strong> has been activated! You can now book classes.
              Please complete payment at reception.
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
                disabled={isPending || (needsStylePick && !styleValid)}
              >
                {isPending ? "Processing…" : "Confirm & Activate"}
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
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${
          active ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
