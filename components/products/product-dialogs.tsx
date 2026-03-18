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

const SELECT_CLASS =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pass", label: "Pass" },
  { value: "drop_in", label: "Drop-in" },
];

const CREDITS_MODEL_OPTIONS = [
  { value: "unlimited", label: "Unlimited" },
  { value: "fixed", label: "Fixed credits" },
  { value: "single_use", label: "Single use" },
];

// ── Shared form fields ───────────────────────────────────────

function ProductFormFields({
  defaults,
  showStatus,
}: {
  defaults?: MockProduct;
  showStatus?: boolean;
}) {
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
            defaultValue={defaults?.productType ?? "membership"}
            className={SELECT_CLASS}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-creditsModel">Credits Model *</Label>
          <select
            id="pf-creditsModel"
            name="creditsModel"
            defaultValue={defaults?.creditsModel ?? "unlimited"}
            className={SELECT_CLASS}
          >
            {CREDITS_MODEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-priceCents">Price (cents) *</Label>
          <Input
            id="pf-priceCents"
            name="priceCents"
            type="number"
            min={0}
            defaultValue={defaults?.priceCents ?? 0}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-totalCredits">Total Credits</Label>
          <Input
            id="pf-totalCredits"
            name="totalCredits"
            type="number"
            min={0}
            defaultValue={defaults?.totalCredits ?? ""}
            placeholder="∞"
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
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-styleName">Scope / Styles</Label>
          <Input
            id="pf-styleName"
            name="styleName"
            defaultValue={defaults?.styleName ?? ""}
            placeholder="e.g. All styles, Yoga only"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-allowedLevels">Allowed Levels</Label>
          <Input
            id="pf-allowedLevels"
            name="allowedLevels"
            defaultValue={defaults?.allowedLevels?.join(", ") ?? ""}
            placeholder="e.g. Beginner 1, Beginner 2"
          />
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
      <div className="flex items-center gap-4">
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

export function AddProductDialog({ onClose }: { onClose: () => void }) {
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
            <ProductFormFields />
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
}: {
  product: MockProduct;
  onClose: () => void;
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
            <ProductFormFields defaults={product} showStatus />
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
