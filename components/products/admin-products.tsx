"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Package, Power } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/utils";
import { PRODUCT_ACCESS_RULES, describeAccess } from "@/config/product-access";
import { ProductDetailPanel } from "./product-detail-panel";
import {
  AddProductDialog,
  EditProductDialog,
  DeactivateProductDialog,
} from "./product-dialogs";
import type { MockProduct, MockSubscription } from "@/lib/mock-data";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pass", label: "Pass" },
  { value: "drop_in", label: "Drop-in" },
];

const ACTIVE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const PROVISIONAL_OPTIONS = [
  { value: "provisional", label: "Provisional" },
  { value: "final", label: "Final" },
];

const TABLE_HEADERS = [
  "",
  "Name",
  "Type",
  "Price",
  "Classes / Credits",
  "Term",
  "Scope",
  "Status",
  "",
];

const rulesByProduct = new Map(
  PRODUCT_ACCESS_RULES.map((r) => [r.productId, r])
);

interface AdminProductsProps {
  products: MockProduct[];
  subscriptions: MockSubscription[];
}

export function AdminProducts({
  products,
  subscriptions,
}: AdminProductsProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [provisionalFilter, setProvisionalFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editProduct, setEditProduct] = useState<MockProduct | null>(null);
  const [deactivateProduct, setDeactivateProduct] = useState<MockProduct | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const q = search.toLowerCase();

  const filtered = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (typeFilter && p.productType !== typeFilter) return false;
    if (activeFilter === "active" && !p.isActive) return false;
    if (activeFilter === "inactive" && p.isActive) return false;
    if (provisionalFilter === "provisional" && !p.isProvisional) return false;
    if (provisionalFilter === "final" && p.isProvisional) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Products"
          description="Memberships, passes, and drop-ins. Click a row to see details."
        />
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        <div className="w-full sm:max-w-xs">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name…"
          />
        </div>
        <SelectFilter value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} placeholder="All types" />
        <SelectFilter value={activeFilter} onChange={setActiveFilter} options={ACTIVE_OPTIONS} placeholder="All statuses" />
        <SelectFilter value={provisionalFilter} onChange={setProvisionalFilter} options={PROVISIONAL_OPTIONS} placeholder="All rules" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description="Try a different search or filter."
        />
      ) : (
        <AdminTable headers={TABLE_HEADERS} count={filtered.length}>
          {filtered.map((p) => {
            const isExpanded = expandedId === p.id;
            const rule = rulesByProduct.get(p.id);
            return (
              <Fragment key={p.id}>
                <tr
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <Td className="w-8">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </Td>
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
                  <Td>
                    {p.productType === "membership" && p.classesPerTerm
                      ? `${p.classesPerTerm}/term`
                      : p.creditsModel === "single_use"
                        ? "1 (single)"
                        : p.totalCredits
                          ? `${p.totalCredits} credits`
                          : "∞"}
                  </Td>
                  <Td>
                    {p.termBound ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="text-xs text-indigo-700">Term-bound</span>
                        {p.recurring && (
                          <span className="text-[10px] text-gray-400 ml-1">recurring</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </Td>
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
                    <Badge variant={p.isActive ? "success" : "default"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td className="w-20">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProduct(p);
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit product"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeactivateProduct(p);
                        }}
                        className={`rounded-lg p-1.5 ${
                          p.isActive
                            ? "text-gray-400 hover:bg-red-50 hover:text-red-600"
                            : "text-gray-400 hover:bg-green-50 hover:text-green-600"
                        }`}
                        title={p.isActive ? "Deactivate" : "Reactivate"}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <ProductDetailPanel
                    product={p}
                    subscriptions={subscriptions}
                    colSpan={TABLE_HEADERS.length}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && <AddProductDialog onClose={() => setShowAdd(false)} />}

      {editProduct && (
        <EditProductDialog product={editProduct} onClose={() => setEditProduct(null)} />
      )}

      {deactivateProduct && (
        <DeactivateProductDialog
          product={deactivateProduct}
          onClose={() => setDeactivateProduct(null)}
        />
      )}
    </div>
  );
}
