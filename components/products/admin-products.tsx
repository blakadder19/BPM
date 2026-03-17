"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
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
import { formatCents } from "@/lib/utils";
import { PRODUCT_ACCESS_RULES, describeAccess } from "@/config/product-access";
import { updateProductAction } from "@/lib/actions/products";
import type { MockProduct } from "@/lib/mock-data";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pack", label: "Pack" },
  { value: "drop_in", label: "Drop-in" },
  { value: "promo_pass", label: "Promo Pass" },
];

const rulesByProduct = new Map(
  PRODUCT_ACCESS_RULES.map((r) => [r.productId, r])
);

interface AdminProductsProps {
  products: MockProduct[];
}

export function AdminProducts({ products }: AdminProductsProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [editProduct, setEditProduct] = useState<MockProduct | null>(null);

  const q = search.toLowerCase();

  const filtered = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (typeFilter && p.productType !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Memberships, passes, and drop-ins. Provisional rules are marked and configurable."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name…"
          />
        </div>
        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
          placeholder="All types"
        />
      </div>

      <AdminTable
        headers={[
          "Name",
          "Type",
          "Price",
          "Credits",
          "Duration",
          "Access Rule",
          "Active",
          "",
        ]}
        count={filtered.length}
      >
        {filtered.map((p) => {
          const rule = rulesByProduct.get(p.id);
          return (
            <tr key={p.id}>
              <Td className="font-medium text-gray-900">
                <span className="flex items-center gap-2">
                  {p.name}
                  {p.isProvisional && <StatusBadge status="provisional" />}
                </span>
              </Td>
              <Td>
                <StatusBadge status={p.productType} />
              </Td>
              <Td>{formatCents(p.priceCents)}</Td>
              <Td>{p.totalCredits === null ? "∞" : p.totalCredits}</Td>
              <Td>{p.durationDays ? `${p.durationDays} days` : "—"}</Td>
              <Td>
                {rule ? (
                  <span className="text-xs text-gray-600">
                    {describeAccess(rule)}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">No rule</span>
                )}
              </Td>
              <Td>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    p.isActive ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
              </Td>
              <Td className="w-10">
                <button
                  onClick={() => setEditProduct(p)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  title="Edit product"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </Td>
            </tr>
          );
        })}
      </AdminTable>

      {editProduct && (
        <EditProductDialog
          product={editProduct}
          onClose={() => setEditProduct(null)}
        />
      )}
    </div>
  );
}

function EditProductDialog({
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
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={product.name}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="priceCents">Price (cents)</Label>
                <Input
                  id="priceCents"
                  name="priceCents"
                  type="number"
                  min={0}
                  defaultValue={product.priceCents}
                  required
                />
                <p className="text-xs text-gray-400">
                  €{(product.priceCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="totalCredits">Credits</Label>
                <Input
                  id="totalCredits"
                  name="totalCredits"
                  type="number"
                  min={0}
                  defaultValue={product.totalCredits ?? ""}
                  placeholder="∞ (unlimited)"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durationDays">Duration (days)</Label>
              <Input
                id="durationDays"
                name="durationDays"
                type="number"
                min={0}
                defaultValue={product.durationDays ?? ""}
                placeholder="No expiry"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                id="isActive"
                name="isActive"
                type="checkbox"
                defaultChecked={product.isActive}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <Label htmlFor="isActive" className="!mb-0">
                Active
              </Label>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
