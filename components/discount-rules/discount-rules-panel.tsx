"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Tag,
  Inbox,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  X,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { formatDate } from "@/lib/utils";
import {
  AFFILIATION_TYPES,
  DISCOUNT_KINDS,
  DISCOUNT_RULE_TYPES,
  type AffiliationType,
  type DiscountKind,
  type DiscountRuleType,
} from "@/lib/domain/pricing-engine";
import type { ProductType } from "@/types/domain";
import {
  createDiscountRuleAction,
  updateDiscountRuleAction,
  toggleDiscountRuleActiveAction,
  deleteDiscountRuleAction,
  previewDiscountRuleAction,
  type DiscountRuleInput,
  type DiscountRulePreviewResult,
} from "@/lib/actions/discount-rules";

interface RuleRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  ruleType: DiscountRuleType;
  affiliationType: AffiliationType | null;
  discountKind: DiscountKind;
  discountValue: number;
  appliesToProductTypes: ProductType[] | null;
  appliesToProductIds: string[] | null;
  minPriceCents: number | null;
  maxDiscountCents: number | null;
  isActive: boolean;
  priority: number;
  stackable: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  productType: ProductType;
  priceCents: number;
}

interface StudentRow {
  id: string;
  fullName: string;
  email: string | null;
}

/**
 * Plain-boolean permissions resolved server-side from the current
 * staff access. Each flag corresponds 1:1 to a permission key
 * checked by the matching server action.
 */
export interface DiscountRulesPanelPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canPreview: boolean;
}

interface PanelProps {
  rules: RuleRow[];
  products: ProductRow[];
  students: StudentRow[];
  verifiedAffiliationCounts: Record<string, number>;
  permissions: DiscountRulesPanelPermissions;
}

const RULE_TYPE_LABELS: Record<DiscountRuleType, string> = {
  first_time_purchase: "First-time purchase",
  affiliation: "Affiliation",
};

const AFFILIATION_TYPE_LABELS: Record<AffiliationType, string> = {
  hse: "HSE",
  gardai: "Gardaí",
  language_school: "Language School",
  corporate: "Corporate",
  staff: "Staff",
  other: "Other",
};

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  membership: "Membership",
  pass: "Pass",
  drop_in: "Drop-in",
};

const PRODUCT_TYPES: ProductType[] = ["membership", "pass", "drop_in"];

function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDiscount(rule: RuleRow): string {
  if (rule.discountKind === "percentage") return `-${rule.discountValue}%`;
  return `-${formatCents(rule.discountValue)}`;
}

function isWithinWindow(rule: RuleRow, nowIso: string): boolean {
  if (rule.validFrom && rule.validFrom > nowIso) return false;
  if (rule.validUntil && rule.validUntil < nowIso) return false;
  return true;
}

/**
 * Compact chip-based scope renderer for the rules table. Wraps within
 * its own column so long product names cannot bleed into Stackable /
 * Priority. Falls back to "All products" when the rule has no
 * type/id restrictions.
 */
function ScopeCell({
  rule,
  products,
}: {
  rule: RuleRow;
  products: ProductRow[];
}) {
  const types = rule.appliesToProductTypes ?? [];
  const productIds = rule.appliesToProductIds ?? [];
  const isAll = types.length === 0 && productIds.length === 0;

  if (isAll) {
    return <span className="text-xs text-gray-500">All products</span>;
  }

  const productNames = productIds.map(
    (id) => products.find((p) => p.id === id)?.name ?? id,
  );
  const tooltip = [
    types.length > 0
      ? `Types: ${types.map((t) => PRODUCT_TYPE_LABELS[t]).join(", ")}`
      : null,
    productNames.length > 0 ? `Products: ${productNames.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const visibleProducts = productNames.slice(0, 2);
  const extraProducts = productNames.length - visibleProducts.length;

  return (
    <div
      className="flex max-w-[260px] flex-col gap-1 whitespace-normal"
      title={tooltip}
    >
      {types.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {types.map((t) => (
            <span
              key={t}
              className="inline-flex items-center rounded-full bg-bpm-50 px-1.5 py-0.5 text-[10px] font-medium text-bpm-700"
            >
              {PRODUCT_TYPE_LABELS[t]}
            </span>
          ))}
        </div>
      )}
      {productNames.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleProducts.map((name) => (
            <span
              key={name}
              className="inline-flex max-w-[200px] items-center truncate rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700"
              title={name}
            >
              {name}
            </span>
          ))}
          {extraProducts > 0 && (
            <span className="inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              +{extraProducts} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page component ──────────────────────────────────────────

export function DiscountRulesPanel({
  rules,
  products,
  students,
  verifiedAffiliationCounts,
  permissions,
}: PanelProps) {
  const isReadOnly =
    !permissions.canCreate && !permissions.canEdit && !permissions.canDelete;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorRule, setEditorRule] = useState<RuleRow | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const nowIso = new Date().toISOString();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...rules]
      .filter((r) => {
        if (statusFilter === "active" && !r.isActive) return false;
        if (statusFilter === "inactive" && r.isActive) return false;
        if (statusFilter === "current_window" && !isWithinWindow(r, nowIso)) return false;
        if (typeFilter !== "all" && r.ruleType !== typeFilter) return false;
        if (!q) return true;
        return (
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort(
        (a, b) =>
          Number(b.isActive) - Number(a.isActive) ||
          b.priority - a.priority ||
          a.code.localeCompare(b.code),
      );
  }, [rules, search, statusFilter, typeFilter, nowIso]);

  function runRowAction(
    id: string,
    action: () => Promise<{ success: boolean; error?: string }>,
  ) {
    setActionError(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await action();
      if (!r.success) setActionError(r.error ?? "Action failed");
      setPendingId(null);
    });
  }

  function openCreate() {
    setEditorRule(null);
    setEditorOpen(true);
  }

  function openEdit(rule: RuleRow) {
    setEditorRule(rule);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Discount Rules"
        description="Manage the academy's discount catalogue. BPM is the only source of truth — Stripe charges the exact final amount BPM calculates, and editing rules here never affects historical purchases (each subscription carries a frozen snapshot)."
        actions={
          permissions.canCreate ? (
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              <span>New rule</span>
            </Button>
          ) : null
        }
      />

      {isReadOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have view-only access to Discount Rules. Create, edit, and delete
          actions are hidden.
        </div>
      )}

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div className="sm:max-w-sm sm:flex-1">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by code, name or description"
          />
        </div>
        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active only" },
            { value: "inactive", label: "Inactive only" },
            { value: "current_window", label: "In window now" },
          ]}
        />
        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: "all", label: "All types" },
            ...DISCOUNT_RULE_TYPES.map((t) => ({
              value: t,
              label: RULE_TYPE_LABELS[t],
            })),
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No discount rules"
          description="Create a rule to start offering discounts to verified affiliations or first-time purchasers."
        />
      ) : (
        <AdminTable
          headers={[
            "Code",
            "Type",
            "Discount",
            "Scope",
            "Stackable",
            "Priority",
            "Status",
            "Validity",
            "Actions",
          ]}
          count={filtered.length}
        >
          {filtered.map((r) => {
            const inWindow = isWithinWindow(r, nowIso);
            const verifiedCount =
              r.affiliationType != null
                ? verifiedAffiliationCounts[r.affiliationType] ?? 0
                : null;
            return (
              <tr key={r.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <Tag className="size-3.5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{r.code}</div>
                      <div className="text-xs text-gray-500">{r.name}</div>
                      {r.description && (
                        <div className="mt-0.5 text-xs text-gray-400">{r.description}</div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="text-xs">
                    <Badge variant="info">{RULE_TYPE_LABELS[r.ruleType]}</Badge>
                    {r.affiliationType && (
                      <div className="mt-1 text-gray-500">
                        type: {AFFILIATION_TYPE_LABELS[r.affiliationType]}
                        {verifiedCount != null && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            ({verifiedCount} verified)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </Td>
                <Td>
                  <span className="font-medium tabular-nums">{formatDiscount(r)}</span>
                  {r.maxDiscountCents != null && (
                    <div className="text-xs text-gray-500">
                      cap {formatCents(r.maxDiscountCents)}
                    </div>
                  )}
                  {r.minPriceCents != null && (
                    <div className="text-xs text-gray-500">
                      min basket {formatCents(r.minPriceCents)}
                    </div>
                  )}
                </Td>
                <Td className="align-top text-xs text-gray-600">
                  <ScopeCell rule={r} products={products} />
                </Td>
                <Td>
                  <Badge variant={r.stackable ? "success" : "neutral"}>
                    {r.stackable ? "Yes" : "No"}
                  </Badge>
                </Td>
                <Td className="text-xs tabular-nums">{r.priority}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <Badge variant={r.isActive ? "success" : "neutral"}>
                      {r.isActive ? "Active" : "Inactive"}
                    </Badge>
                    {r.isActive && !inWindow && (
                      <span className="text-[10px] text-amber-600">
                        out of window
                      </span>
                    )}
                  </div>
                </Td>
                <Td>
                  <div className="text-xs text-gray-600">
                    <div>{r.validFrom ? `From ${formatDate(r.validFrom)}` : "no start"}</div>
                    <div>{r.validUntil ? `To ${formatDate(r.validUntil)}` : "no end"}</div>
                  </div>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {permissions.canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(r)}
                        disabled={pendingId === r.id}
                      >
                        <Pencil className="size-3.5" />
                        <span>Edit</span>
                      </Button>
                    )}
                    {permissions.canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          runRowAction(r.id, () =>
                            toggleDiscountRuleActiveAction(r.id, !r.isActive),
                          )
                        }
                        disabled={pendingId === r.id}
                      >
                        {r.isActive ? (
                          <PowerOff className="size-3.5" />
                        ) : (
                          <Power className="size-3.5" />
                        )}
                        <span>{r.isActive ? "Deactivate" : "Activate"}</span>
                      </Button>
                    )}
                    {permissions.canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            !confirm(
                              `Delete discount rule "${r.code}"? Historical purchases keep their frozen snapshot — only future evaluations are affected. (Tip: deactivate is usually safer.)`,
                            )
                          ) {
                            return;
                          }
                          runRowAction(r.id, () => deleteDiscountRuleAction(r.id));
                        }}
                        disabled={pendingId === r.id}
                      >
                        <Trash2 className="size-3.5 text-red-600" />
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {editorOpen && (permissions.canCreate || permissions.canEdit) && (
        <RuleEditor
          rule={editorRule}
          products={products}
          students={students}
          onClose={() => setEditorOpen(false)}
          onError={(msg) => setActionError(msg)}
        />
      )}
    </div>
  );
}

// ── Editor modal (create + edit + preview) ──────────────────

function RuleEditor({
  rule,
  products,
  students,
  onClose,
  onError,
}: {
  rule: RuleRow | null;
  products: ProductRow[];
  students: StudentRow[];
  onClose: () => void;
  onError: (msg: string | null) => void;
}) {
  const isEdit = rule != null;

  const [code, setCode] = useState(rule?.code ?? "");
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [ruleType, setRuleType] = useState<DiscountRuleType>(
    rule?.ruleType ?? "first_time_purchase",
  );
  const [affiliationType, setAffiliationType] = useState<AffiliationType | "">(
    rule?.affiliationType ?? "",
  );
  const [discountKind, setDiscountKind] = useState<DiscountKind>(
    rule?.discountKind ?? "percentage",
  );
  // Discount value rendered as a friendlier number — percent stays as-is,
  // fixed amount is shown in euros (we convert to cents on save).
  const [discountValueRaw, setDiscountValueRaw] = useState<string>(() => {
    if (!rule) return "10";
    if (rule.discountKind === "percentage") return String(rule.discountValue);
    return (rule.discountValue / 100).toFixed(2);
  });
  const [maxDiscountEuros, setMaxDiscountEuros] = useState<string>(
    rule?.maxDiscountCents != null
      ? (rule.maxDiscountCents / 100).toFixed(2)
      : "",
  );
  const [minPriceEuros, setMinPriceEuros] = useState<string>(
    rule?.minPriceCents != null ? (rule.minPriceCents / 100).toFixed(2) : "",
  );
  const [appliesToTypes, setAppliesToTypes] = useState<Set<ProductType>>(
    new Set(rule?.appliesToProductTypes ?? []),
  );
  const [appliesToIds, setAppliesToIds] = useState<Set<string>>(
    new Set(rule?.appliesToProductIds ?? []),
  );
  const [validFrom, setValidFrom] = useState<string>(rule?.validFrom ?? "");
  const [validUntil, setValidUntil] = useState<string>(rule?.validUntil ?? "");
  const [priority, setPriority] = useState<string>(String(rule?.priority ?? 0));
  const [stackable, setStackable] = useState<boolean>(rule?.stackable ?? false);
  const [isActive, setIsActive] = useState<boolean>(rule?.isActive ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function buildInput(): DiscountRuleInput | { error: string } {
    const dv = Number(discountValueRaw);
    if (!Number.isFinite(dv) || dv <= 0) {
      return { error: "Discount value must be greater than zero." };
    }
    const discountValue =
      discountKind === "percentage" ? dv : Math.round(dv * 100);

    const max = maxDiscountEuros.trim()
      ? Math.round(Number(maxDiscountEuros) * 100)
      : null;
    if (max != null && (!Number.isFinite(max) || max < 0)) {
      return { error: "Cap must be a non-negative number." };
    }
    const min = minPriceEuros.trim()
      ? Math.round(Number(minPriceEuros) * 100)
      : null;
    if (min != null && (!Number.isFinite(min) || min < 0)) {
      return { error: "Min basket must be a non-negative number." };
    }
    const prio = Number(priority);
    if (!Number.isInteger(prio)) {
      return { error: "Priority must be an integer." };
    }

    return {
      code,
      name,
      description: description.trim() || null,
      ruleType,
      affiliationType:
        ruleType === "affiliation" && affiliationType
          ? (affiliationType as AffiliationType)
          : null,
      discountKind,
      discountValue,
      appliesToProductTypes:
        appliesToTypes.size > 0 ? [...appliesToTypes] : null,
      appliesToProductIds: appliesToIds.size > 0 ? [...appliesToIds] : null,
      minPriceCents: min,
      maxDiscountCents: max,
      isActive,
      priority: prio,
      stackable,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError(null);
    setLocalError(null);
    const built = buildInput();
    if ("error" in built) {
      setLocalError(built.error);
      return;
    }
    setSubmitting(true);
    try {
      const r = isEdit
        ? await updateDiscountRuleAction(rule.id, built)
        : await createDiscountRuleAction(built);
      if (!r.success) {
        setLocalError(r.error ?? "Save failed");
        return;
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const inputForPreview = (() => {
    const built = buildInput();
    return "error" in built ? null : built;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        // Click-outside-to-close: only when the click STARTED on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discount-rule-editor-title"
        className="flex w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-lg max-h-[calc(100dvh-2rem)]"
      >
        {/* Header — fixed height, never scrolls */}
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 id="discount-rule-editor-title" className="text-lg font-semibold">
            {isEdit ? `Edit rule — ${rule.code}` : "New discount rule"}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="rounded p-1 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Form — flex column so body can scroll while footer stays pinned */}
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Code" hint="Unique identifier, e.g. FIRST_TIME or HSE_25">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm uppercase"
              />
            </Field>
            <Field label="Name" hint="Shown in finance + emails when applied">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Rule type">
              <select
                value={ruleType}
                onChange={(e) => {
                  const next = e.target.value as DiscountRuleType;
                  setRuleType(next);
                  if (next === "first_time_purchase") setAffiliationType("");
                }}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {DISCOUNT_RULE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {RULE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            {ruleType === "affiliation" ? (
              <Field
                label="Affiliation type"
                hint="Only students with a verified affiliation of this type qualify"
              >
                <select
                  value={affiliationType}
                  onChange={(e) =>
                    setAffiliationType(e.target.value as AffiliationType | "")
                  }
                  required
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="" disabled>
                    Select affiliation…
                  </option>
                  {AFFILIATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {AFFILIATION_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="Affiliation requirement">
                <p className="text-xs text-gray-500 italic px-1 py-1.5">
                  Not used for first-time rules.
                </p>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Discount kind">
              <select
                value={discountKind}
                onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                {DISCOUNT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k === "percentage" ? "Percentage" : "Fixed amount"}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={discountKind === "percentage" ? "Value (%)" : "Value (€)"}
              hint={
                discountKind === "percentage"
                  ? "0 < value ≤ 100"
                  : "Saved as cents server-side"
              }
            >
              <input
                type="number"
                step={discountKind === "percentage" ? "1" : "0.01"}
                min={discountKind === "percentage" ? "1" : "0.01"}
                max={discountKind === "percentage" ? "100" : undefined}
                value={discountValueRaw}
                onChange={(e) => setDiscountValueRaw(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
            <Field label="Cap (€, optional)" hint="Max discount per purchase">
              <input
                type="number"
                step="0.01"
                min="0"
                value={maxDiscountEuros}
                onChange={(e) => setMaxDiscountEuros(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
          </div>

          <Field
            label="Applies to product types (optional)"
            hint="Leave all unchecked to apply to ALL product types"
          >
            <div className="flex flex-wrap gap-3">
              {PRODUCT_TYPES.map((t) => (
                <label key={t} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={appliesToTypes.has(t)}
                    onChange={(e) => {
                      const next = new Set(appliesToTypes);
                      if (e.target.checked) next.add(t);
                      else next.delete(t);
                      setAppliesToTypes(next);
                    }}
                  />
                  {PRODUCT_TYPE_LABELS[t]}
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Applies to specific products (optional)"
            hint="Leave empty to apply to every product matching the type filter above"
          >
            <div className="max-h-40 overflow-y-auto rounded border border-gray-200 px-2 py-1">
              {products.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-1.5">
                  No products available.
                </p>
              ) : (
                products.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={appliesToIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(appliesToIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setAppliesToIds(next);
                      }}
                    />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-gray-500">
                      {PRODUCT_TYPE_LABELS[p.productType]} · {formatCents(p.priceCents)}
                    </span>
                  </label>
                ))
              )}
            </div>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Min basket (€, optional)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={minPriceEuros}
                onChange={(e) => setMinPriceEuros(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
            <Field label="Valid from (optional)">
              <input
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Valid until (optional)">
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Priority" hint="Higher numbers evaluated first">
              <input
                type="number"
                step="1"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm tabular-nums"
              />
            </Field>
            <Field label="Stackable">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={stackable}
                  onChange={(e) => setStackable(e.target.checked)}
                />
                Combine with other stackable rules
              </label>
            </Field>
            <Field label="Active">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Available to the engine
              </label>
            </Field>
          </div>

          <div className="border-t pt-4">
            <PreviewPanel students={students} products={products} input={inputForPreview} />
          </div>
          </div>
          {/* /scrollable body */}

          {/* Footer — pinned, never scrolls off */}
          <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-5 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              <span>{isEdit ? "Save changes" : "Create rule"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

// ── Preview panel ───────────────────────────────────────────

/**
 * Lightweight rule-preview helper.
 *
 * Calls `previewDiscountRuleAction` (server-side) so the result is
 * computed by the SAME pricing engine that real purchases use. There is
 * intentionally no client-side discount math here.
 *
 * The preview is read-only:
 *   - No atomic claim is recorded.
 *   - Nothing is persisted.
 *   - The displayed final amount matches what the catalog/checkout would
 *     show once the rule is saved (so admins can confirm correctness
 *     before flipping `isActive`).
 *
 * Note: the preview reflects the CURRENTLY SAVED rule catalogue. Edits
 * that have not been saved yet will only appear in the preview after
 * "Save changes" is pressed. This is intentional — preview must mirror
 * the engine's real input, not a hypothetical client-side mutation.
 */
function PreviewPanel({
  students,
  products,
  input,
}: {
  students: StudentRow[];
  products: ProductRow[];
  input: DiscountRuleInput | null;
}) {
  const [studentId, setStudentId] = useState("");
  const [productId, setProductId] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscountRulePreviewResult | null>(null);

  async function run() {
    setRunning(true);
    try {
      const r = await previewDiscountRuleAction({ studentId, productId });
      setResult(r);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-4 text-bpm-600" />
        <h3 className="text-sm font-semibold">Preview against a real student / product</h3>
      </div>
      <p className="text-[11px] text-gray-500">
        Runs the live pricing engine server-side, using all currently-saved rules and the
        student&apos;s verified affiliations. Read-only — nothing is persisted.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Student">
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
                {s.email ? ` (${s.email})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatCents(p.priceCents)})
              </option>
            ))}
          </select>
        </Field>
        <Field label=" ">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!studentId || !productId || running}
            onClick={run}
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
            <span>Run preview</span>
          </Button>
        </Field>
      </div>

      {input == null && (
        <p className="text-[11px] text-amber-600">
          Form has invalid values — fix them above to see what this rule would actually
          award. (Preview always uses the saved catalogue, not unsaved changes.)
        </p>
      )}

      {result && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          {!result.success ? (
            <p className="text-red-700">{result.error}</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{formatCents(result.basePriceCents ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Discount</span>
                <span className="tabular-nums text-bpm-700">
                  −{formatCents(result.totalDiscountCents ?? 0)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-1.5">
                <span className="font-medium">Total</span>
                <span className="font-semibold tabular-nums">
                  {formatCents(result.finalPriceCents ?? 0)}
                </span>
              </div>
              <div className="text-[11px] text-gray-500">
                First-time eligible: {result.isFirstTime ? "yes" : "no"}
              </div>
              {result.appliedDiscounts && result.appliedDiscounts.length > 0 && (
                <div className="border-t border-gray-200 pt-1.5">
                  <p className="font-medium text-gray-700">Applied:</p>
                  <ul className="list-disc list-inside text-gray-600">
                    {result.appliedDiscounts.map((d) => (
                      <li key={d.ruleId}>
                        <span className="font-mono text-[10px]">{d.code}</span> · {d.name} —
                        −{formatCents(d.amountCents)} ({d.reason})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.reasons && result.reasons.length > 0 && (
                <details className="border-t border-gray-200 pt-1.5">
                  <summary className="cursor-pointer text-gray-500">
                    Engine trace ({result.reasons.length})
                  </summary>
                  <ul className="mt-1 list-disc list-inside text-[11px] text-gray-500">
                    {result.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
