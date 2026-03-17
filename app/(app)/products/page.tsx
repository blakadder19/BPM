"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { formatCents } from "@/lib/utils";
import { PRODUCTS } from "@/lib/mock-data";
import {
  PRODUCT_ACCESS_RULES,
  describeAccess,
} from "@/config/product-access";

const TYPE_OPTIONS = [
  { value: "membership", label: "Membership" },
  { value: "pack", label: "Pack" },
  { value: "drop_in", label: "Drop-in" },
  { value: "promo_pass", label: "Promo Pass" },
];

const rulesByProduct = new Map(
  PRODUCT_ACCESS_RULES.map((r) => [r.productId, r])
);

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const q = search.toLowerCase();

  const filtered = PRODUCTS.filter((p) => {
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
            </tr>
          );
        })}
      </AdminTable>
    </div>
  );
}
