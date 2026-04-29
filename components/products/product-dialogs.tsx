"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  createProductAction,
  updateProductAction,
  toggleProductActiveAction,
  archiveProductAction,
  unarchiveProductAction,
} from "@/lib/actions/products";
import { CLASS_LEVEL_NAMES } from "@/config/class-levels";
import type { MockProduct } from "@/lib/mock-data";
import type { StyleAccessMode } from "@/lib/domain/subscription-snapshot";
import type { ClassType, ProductType } from "@/types/domain";

interface DanceStyleOption {
  id: string;
  name: string;
}

// Single source of truth lives in config/class-levels.ts. Renaming or
// reordering must happen there to keep DB strings, regex matchers, and
// admin UI in sync.
const LEVEL_OPTIONS = CLASS_LEVEL_NAMES;

const SELECT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-bpm-300 focus:outline-none focus:ring-2 focus:ring-bpm-100";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pass", label: "Pass" },
  { value: "drop_in", label: "Drop-in" },
];

const STYLE_ACCESS_MODE_OPTIONS: { value: StyleAccessMode; label: string; hint: string }[] = [
  { value: "all", label: "All styles", hint: "Any active style. The Allowed Styles selection below is ignored." },
  { value: "fixed", label: "Fixed list", hint: "Grants exactly the Allowed Styles selected below." },
  { value: "selected_style", label: "Selected style (1 from list)", hint: "Student picks one style at purchase from the Allowed Styles selected below." },
  { value: "course_group", label: "Course group (pick N from pool)", hint: "Student picks N styles at purchase from the Allowed Styles pool selected below. Set the pick count further down." },
  { value: "social_only", label: "Socials only", hint: "Excluded from class booking flow. The Allowed Styles selection below is ignored." },
];

const CLASS_TYPE_OPTIONS: { value: ClassType; label: string }[] = [
  { value: "class", label: "Class" },
  { value: "student_practice", label: "Student Practice" },
  { value: "social", label: "Social" },
];

// ── Shared form fields ───────────────────────────────────────

function ProductFormFields({
  defaults,
  showStatus,
  danceStyles = [],
}: {
  defaults?: MockProduct;
  showStatus?: boolean;
  danceStyles?: DanceStyleOption[];
}) {
  const [productType, setProductType] = useState<ProductType>(defaults?.productType ?? "membership");
  const [selectedStyleIds, setSelectedStyleIds] = useState<Set<string>>(
    new Set(defaults?.allowedStyleIds ?? [])
  );
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(
    new Set(defaults?.allowedLevels ?? [])
  );
  const isMembership = productType === "membership";
  const isPass = productType === "pass";
  const isDropIn = productType === "drop_in";

  // ── Real-logic perks (membership-only). When defaults?.perks is null
  // (legacy / not yet customised), we pre-fill all three on for memberships
  // — that matches the existing productType-derived behaviour, so saving
  // without changes preserves the same effective entitlement.
  const seededPerks = defaults?.perks ?? null;
  const [perkBirthday, setPerkBirthday] = useState<boolean>(
    seededPerks?.birthdayFreeClass ?? true,
  );
  const [perkPractice, setPerkPractice] = useState<boolean>(
    seededPerks?.freeWeekendPractice ?? true,
  );
  const [perkGiveaway, setPerkGiveaway] = useState<boolean>(
    seededPerks?.memberGiveaway ?? true,
  );

  // ── Phase 3 structured fields ─────────────────────────────
  // Default the mode to the saved value, or fall back to a sensible derive
  // (so editing a legacy product doesn't silently change behaviour after save).
  const initialMode: StyleAccessMode =
    defaults?.styleAccessMode
    ?? (() => {
      if (defaults?.productType === "drop_in") return "all";
      if ((defaults?.allowedStyleIds?.length ?? 0) > 0) return "fixed";
      return "all";
    })();
  const [styleAccessMode, setStyleAccessMode] = useState<StyleAccessMode>(initialMode);
  const [styleAccessPickCount, setStyleAccessPickCount] = useState<string>(
    defaults?.styleAccessPickCount != null
      ? String(defaults.styleAccessPickCount)
      : "",
  );

  const initialClassTypes: Set<ClassType> = new Set(
    defaults?.allowedClassTypes
      ?? (defaults?.productType === "membership"
        ? ["class", "student_practice"]
        : ["class"]),
  );
  const [selectedClassTypes, setSelectedClassTypes] =
    useState<Set<ClassType>>(initialClassTypes);

  function toggleClassType(t: ClassType) {
    setSelectedClassTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  function toggleStyle(id: string) {
    setSelectedStyleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleLevel(name: string) {
    setSelectedLevels((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="pf-name">Name *</Label>
        <Input
          id="pf-name"
          name="name"
          defaultValue={defaults?.name ?? ""}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-productType">Type *</Label>
          <select
            id="pf-productType"
            name="productType"
            value={productType}
            onChange={(e) => setProductType(e.target.value as ProductType)}
            className={SELECT_CLASS}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-priceEuros">Price (€) *</Label>
          <Input
            id="pf-priceEuros"
            name="priceEuros"
            type="number"
            min={0}
            step="0.01"
            defaultValue={defaults ? (defaults.priceCents / 100).toFixed(2) : "0.00"}
            required
          />
        </div>
      </div>

      {isMembership && (
        <div className="rounded-lg border border-bpm-100 bg-bpm-50/50 p-3 space-y-3">
          <p className="text-xs font-medium text-bpm-700">Membership allowance</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-classesPerTerm">Classes per Term *</Label>
              <Input
                id="pf-classesPerTerm"
                name="classesPerTerm"
                type="number"
                min={1}
                defaultValue={defaults?.classesPerTerm ?? ""}
                placeholder="e.g. 4, 8, 12, 16"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-durationDays">Duration (days)</Label>
              <Input
                id="pf-durationDays"
                name="durationDays"
                type="number"
                min={0}
                defaultValue={defaults?.durationDays ?? "28"}
                placeholder="28"
              />
            </div>
          </div>
          <input type="hidden" name="creditsModel" value="unlimited" />
        </div>
      )}

      {isPass && (
        <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-3 space-y-3">
          <p className="text-xs font-medium text-amber-700">Pass allowance</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pf-totalCredits">Total Classes / Credits *</Label>
              <Input
                id="pf-totalCredits"
                name="totalCredits"
                type="number"
                min={1}
                defaultValue={defaults?.totalCredits ?? ""}
                placeholder="e.g. 8"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pf-durationDays">Duration (days)</Label>
              <Input
                id="pf-durationDays"
                name="durationDays"
                type="number"
                min={0}
                defaultValue={defaults?.durationDays ?? ""}
                placeholder="No expiry"
              />
            </div>
          </div>
          <input type="hidden" name="creditsModel" value="fixed" />
        </div>
      )}

      {isDropIn && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-1">
          <p className="text-xs font-medium text-gray-600">Drop-in: single-class entry</p>
          <p className="text-xs text-gray-500">1 class, no term commitment, non-recurring.</p>
          <input type="hidden" name="creditsModel" value="single_use" />
          <input type="hidden" name="totalCredits" value="1" />
        </div>
      )}

      {/*
        Style access block — ordered to read top-to-bottom:
          1. Style access mode (drives semantics of #2 + #3)
          2. Allowed Styles (the pool referenced by mode hint text)
          3. Pick count (only when course_group)
          4. Allowed Levels
          5. Allowed class types
        Stripe price ID (advanced / rarely used) stays in the collapsed
        Advanced configuration section further down.
      */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-styleAccessMode">Style access mode</Label>
          <select
            id="pf-styleAccessMode"
            name="styleAccessMode"
            value={styleAccessMode}
            onChange={(e) => setStyleAccessMode(e.target.value as StyleAccessMode)}
            className={SELECT_CLASS}
          >
            {STYLE_ACCESS_MODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            {STYLE_ACCESS_MODE_OPTIONS.find((o) => o.value === styleAccessMode)?.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Allowed Styles</Label>
          {styleAccessMode === "social_only" ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Not used in Socials only mode. Switch the Style access mode above to configure styles.
            </div>
          ) : styleAccessMode === "all" ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Not used in All styles mode. Switch the Style access mode above to restrict styles.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">
                {styleAccessMode === "fixed"
                  ? "These styles are granted directly. Leave all unchecked for unrestricted."
                  : styleAccessMode === "selected_style"
                    ? "The student picks one style from this pool at purchase."
                    : "The student picks the configured number of styles from this pool at purchase."}
              </p>
              {danceStyles.length > 0 ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2">
                  {danceStyles.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStyleIds.has(s.id)}
                        onChange={() => toggleStyle(s.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-600">No dance styles loaded — restrictions cannot be configured.</p>
              )}
            </>
          )}
          {/*
            Always render the hidden inputs (regardless of mode) so that
            toggling between modes does not silently drop saved style
            selections. The server action keeps them; the access engine
            ignores them when the mode is "all" / "social_only".
          */}
          {Array.from(selectedStyleIds).map((id) => {
            const style = danceStyles.find((s) => s.id === id);
            return (
              <span key={id}>
                <input type="hidden" name="allowedStyleIds" value={id} />
                {style && <input type="hidden" name="allowedStyleNames" value={style.name} />}
              </span>
            );
          })}
        </div>

        {styleAccessMode === "course_group" && (
          <div className="space-y-1.5">
            <Label htmlFor="pf-styleAccessPickCount">Pick count</Label>
            <Input
              id="pf-styleAccessPickCount"
              name="styleAccessPickCount"
              type="number"
              min={1}
              max={Math.max(selectedStyleIds.size, 1)}
              value={styleAccessPickCount}
              onChange={(e) => setStyleAccessPickCount(e.target.value)}
              placeholder="e.g. 2"
              required
            />
            <p className="text-xs text-gray-500">
              How many styles the student picks at purchase from the {selectedStyleIds.size}-style pool above.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Allowed Levels</Label>
          {styleAccessMode === "social_only" ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              Not used in Socials only mode. Levels apply to classes, not to socials.
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500">Leave all unchecked for unrestricted (all levels).</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2">
                {LEVEL_OPTIONS.map((lvl) => (
                  <label key={lvl} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLevels.has(lvl)}
                      onChange={() => toggleLevel(lvl)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                    />
                    {lvl}
                  </label>
                ))}
              </div>
            </>
          )}
          {/* Hidden inputs always rendered (see Allowed Styles for rationale). */}
          {Array.from(selectedLevels).map((lvl) => (
            <input key={lvl} type="hidden" name="allowedLevels" value={lvl} />
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Allowed class types</Label>
          <p className="text-xs text-gray-500">
            Which class types the entitlement covers. Leave at the productType default if unsure: memberships cover Class + Student Practice, others cover Class only.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2">
            {CLASS_TYPE_OPTIONS.map((t) => (
              <label key={t.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedClassTypes.has(t.value)}
                  onChange={() => toggleClassType(t.value)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                />
                {t.label}
              </label>
            ))}
          </div>
          {Array.from(selectedClassTypes).map((t) => (
            <input key={t} type="hidden" name="allowedClassTypes" value={t} />
          ))}
        </div>

        {/*
          structuredProvided signals to the server action that the
          structured fields above were rendered by the editor and should
          be persisted (rather than left to legacy productType-derived
          defaults). It must always be sent now that those fields are
          always rendered.
        */}
        <input type="hidden" name="structuredProvided" value="1" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-validityDescription">Validity Summary</Label>
        <Input
          id="pf-validityDescription"
          name="validityDescription"
          defaultValue={defaults?.validityDescription ?? ""}
          placeholder="e.g. Monthly rolling, 8 weeks fixed"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-description">Short Description</Label>
        <textarea
          id="pf-description"
          name="description"
          rows={2}
          defaultValue={defaults?.description ?? ""}
          className={SELECT_CLASS}
          placeholder="Public-facing one-liner shown in product list"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-longDescription">Long Description</Label>
        <textarea
          id="pf-longDescription"
          name="longDescription"
          rows={3}
          defaultValue={defaults?.longDescription ?? ""}
          className={SELECT_CLASS}
          placeholder="Optional — fuller description shown on the catalog detail card"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-benefits">Benefits / Perks (display)</Label>
        <p className="text-xs text-gray-500">
          One per line. Shown to students in the catalog and admins in the product details. These are display text only — for the three real-logic perks (birthday, free weekend Practice, giveaways) use the structured flags below.
        </p>
        <textarea
          id="pf-benefits"
          name="benefits"
          rows={4}
          defaultValue={defaults?.benefits?.join("\n") ?? ""}
          className={SELECT_CLASS}
          placeholder={"e.g.\nFree entry to weekday socials\nMember-only events\nFree BPM T-shirt"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-notes">Internal Notes</Label>
        <textarea
          id="pf-notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          className={SELECT_CLASS}
          placeholder="Admin-only notes"
        />
      </div>

      {isMembership && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 space-y-2">
          <p className="text-xs font-medium text-emerald-700">Real-logic perks</p>
          <p className="text-xs text-gray-500">
            These three flags drive actual entitlement code (birthday free class injection, free weekend Student Practice access, giveaway eligibility). Defaults are on for memberships — uncheck to opt this product out.
          </p>
          <input type="hidden" name="perksProvided" value="1" />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="perkBirthdayFreeClass"
                checked={perkBirthday}
                onChange={(e) => setPerkBirthday(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Birthday free class
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="perkFreeWeekendPractice"
                checked={perkPractice}
                onChange={(e) => setPerkPractice(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Free weekend Student Practice
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="perkMemberGiveaway"
                checked={perkGiveaway}
                onChange={(e) => setPerkGiveaway(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Member giveaway eligibility
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            id="pf-termBound"
            name="termBound"
            type="checkbox"
            defaultChecked={defaults?.termBound ?? isMembership}
            className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
          />
          <Label htmlFor="pf-termBound" className="!mb-0">
            Term-bound
          </Label>
        </div>
        {!isDropIn && (
          <div className="flex items-center gap-2">
            <input
              id="pf-recurring"
              name="recurring"
              type="checkbox"
              defaultChecked={defaults?.recurring ?? isMembership}
              className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
            />
            <Label htmlFor="pf-recurring" className="!mb-0">
              Recurring (per term)
            </Label>
          </div>
        )}
        {!isDropIn && (
          <div className="flex items-center gap-2">
            <input
              id="pf-autoRenew"
              name="autoRenew"
              type="checkbox"
              defaultChecked={defaults?.autoRenew ?? isMembership}
              className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
            />
            <Label htmlFor="pf-autoRenew" className="!mb-0">
              Auto-renew eligible
            </Label>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            id="pf-isProvisional"
            name="isProvisional"
            type="checkbox"
            defaultChecked={defaults?.isProvisional ?? false}
            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <Label htmlFor="pf-isProvisional" className="!mb-0">
            Provisional
          </Label>
        </div>
        {showStatus && (
          <div className="flex items-center gap-2">
            <input
              id="pf-isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={defaults?.isActive ?? true}
              className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
            />
            <Label htmlFor="pf-isActive" className="!mb-0">
              Active
            </Label>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-spanTerms">Spans Terms</Label>
        <Input
          id="pf-spanTerms"
          name="spanTerms"
          type="number"
          min={1}
          defaultValue={defaults?.spanTerms ?? ""}
          placeholder="Leave blank for single-term. Use 2 for promo passes that span two consecutive terms."
        />
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">
          Advanced configuration
        </summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pf-stripePriceId">Stripe price ID</Label>
            <Input
              id="pf-stripePriceId"
              name="stripePriceId"
              defaultValue={defaults?.stripePriceId ?? ""}
              placeholder="price_..."
            />
            <p className="text-xs text-gray-500">
              Optional. Paste an existing Stripe price ID. Auto-create / sync of Stripe prices is not implemented in this phase.
            </p>
          </div>
        </div>
      </details>
    </>
  );
}

// ── Add Product Dialog ───────────────────────────────────────

export function AddProductDialog({ onClose, danceStyles = [] }: { onClose: () => void; danceStyles?: DanceStyleOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createProductAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to create product");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogBody className="space-y-4">
            <ProductFormFields danceStyles={danceStyles} />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Add Product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Product Dialog ──────────────────────────────────────

export function EditProductDialog({
  product,
  onClose,
  danceStyles = [],
}: {
  product: MockProduct;
  onClose: () => void;
  danceStyles?: DanceStyleOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProductAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Failed to save");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <input type="hidden" name="id" value={product.id} />
          <DialogBody className="space-y-4">
            <ProductFormFields defaults={product} showStatus danceStyles={danceStyles} />
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Archive / Unarchive Confirm Dialog ───────────────────────

export function ArchiveProductDialog({
  product,
  onClose,
}: {
  product: MockProduct;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isArchived = !!product.archivedAt;
  const actionLabel = isArchived ? "Unarchive" : "Archive";

  function handleConfirm() {
    const formData = new FormData();
    formData.set("id", product.id);
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveProductAction(formData)
        : await archiveProductAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} Product</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600">
            {isArchived
              ? `Unarchive "${product.name}"? The product will return to the Inactive list. You will need to reactivate it explicitly to make it available for new subscriptions again.`
              : `Archive "${product.name}"? It will be hidden from the catalog and from new-subscription flows. Existing subscriptions are unaffected (they keep their frozen access via the purchase-time snapshot). You can unarchive at any time.`}
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isArchived ? "primary" : "danger"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? `${actionLabel.replace(/e$/, "")}ing…` : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Deactivate / Reactivate Confirm Dialog ───────────────────

export function DeactivateProductDialog({
  product,
  onClose,
}: {
  product: MockProduct;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isActive = product.isActive;
  const actionLabel = isActive ? "Deactivate" : "Reactivate";

  function handleConfirm() {
    const formData = new FormData();
    formData.set("id", product.id);
    startTransition(async () => {
      const result = await toggleProductActiveAction(formData);
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error ?? "Action failed");
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabel} Product</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-gray-600">
            {isActive
              ? `Are you sure you want to deactivate "${product.name}"? It will no longer be available for new subscriptions, but existing subscriptions will not be affected.`
              : `Reactivate "${product.name}"? It will become available for new subscriptions again.`}
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={isActive ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? `${actionLabel.slice(0, -1)}ing…` : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
