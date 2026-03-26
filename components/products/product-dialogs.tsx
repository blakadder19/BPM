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
} from "@/lib/actions/products";
import type { MockProduct } from "@/lib/mock-data";
import type { ProductType } from "@/types/domain";

interface DanceStyleOption {
  id: string;
  name: string;
}

const LEVEL_OPTIONS = ["Beginner 1", "Beginner 2", "Intermediate", "Open"];

const SELECT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pass", label: "Pass" },
  { value: "drop_in", label: "Drop-in" },
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
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
          <p className="text-xs font-medium text-indigo-700">Membership allowance</p>
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

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Allowed Styles</Label>
          <p className="text-xs text-gray-500">Leave all unchecked for unrestricted (all styles).</p>
          {danceStyles.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2">
              {danceStyles.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedStyleIds.has(s.id)}
                    onChange={() => toggleStyle(s.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600">No dance styles loaded — restrictions cannot be configured.</p>
          )}
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
        <div className="space-y-1.5">
          <Label>Allowed Levels</Label>
          <p className="text-xs text-gray-500">Leave all unchecked for unrestricted (all levels).</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 bg-gray-50/50 px-3 py-2">
            {LEVEL_OPTIONS.map((lvl) => (
              <label key={lvl} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLevels.has(lvl)}
                  onChange={() => toggleLevel(lvl)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                {lvl}
              </label>
            ))}
          </div>
          {Array.from(selectedLevels).map((lvl) => (
            <input key={lvl} type="hidden" name="allowedLevels" value={lvl} />
          ))}
        </div>
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
        <Label htmlFor="pf-description">Description</Label>
        <textarea
          id="pf-description"
          name="description"
          rows={2}
          defaultValue={defaults?.description ?? ""}
          className={SELECT_CLASS}
          placeholder="Public-facing description"
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
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            id="pf-termBound"
            name="termBound"
            type="checkbox"
            defaultChecked={defaults?.termBound ?? isMembership}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
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
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Label htmlFor="pf-recurring" className="!mb-0">
              Recurring (auto-renew eligible)
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
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <Label htmlFor="pf-isActive" className="!mb-0">
              Active
            </Label>
          </div>
        )}
      </div>
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
