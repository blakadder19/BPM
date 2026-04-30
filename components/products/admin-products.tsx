"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pencil, Plus, Package, Power, Trash2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AdminHelpButton } from "@/components/admin/admin-help-panel";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { formatCents } from "@/lib/utils";
import { ProductDetailPanel } from "./product-detail-panel";
import {
  AddProductDialog,
  EditProductDialog,
  DeactivateProductDialog,
  ArchiveProductDialog,
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
  { value: "archived", label: "Archived" },
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

export interface ProductScope {
  styles: string;
  levels: string;
}

interface DanceStyleOption {
  id: string;
  name: string;
}

/**
 * Plain-boolean permissions resolved server-side from the current
 * staff access. Each flag corresponds 1:1 to a permission key
 * checked by the matching server action.
 */
export interface AdminProductsPermissions {
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

interface AdminProductsProps {
  products: MockProduct[];
  subscriptions: MockSubscription[];
  studentNameMap: Record<string, string>;
  danceStyles?: DanceStyleOption[];
  scopeMap?: Record<string, ProductScope>;
  permissions: AdminProductsPermissions;
}

export function AdminProducts({
  products,
  subscriptions,
  studentNameMap,
  danceStyles = [],
  scopeMap = {},
  permissions,
}: AdminProductsProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [provisionalFilter, setProvisionalFilter] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editProduct, setEditProduct] = useState<MockProduct | null>(null);
  const [deactivateProduct, setDeactivateProduct] = useState<MockProduct | null>(null);
  const [archiveProduct, setArchiveProduct] = useState<MockProduct | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MockProduct | null>(null);
  const isReadOnly =
    !permissions.canCreate &&
    !permissions.canEdit &&
    !permissions.canArchive &&
    !permissions.canDelete;

  const q = search.toLowerCase();

  const filtered = products.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (typeFilter && p.productType !== typeFilter) return false;
    // Archive filter: by default (no filter selected) hide archived products so the
    // active workflow stays clean. Choosing "Archived" explicitly shows only those.
    const isArchived = !!p.archivedAt;
    if (activeFilter === "active" && (!p.isActive || isArchived)) return false;
    if (activeFilter === "inactive" && (p.isActive || isArchived)) return false;
    if (activeFilter === "archived" && !isArchived) return false;
    if (!activeFilter && isArchived) return false;
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
        <div className="flex items-center gap-2">
          <AdminHelpButton pageKey="products" />
          {permissions.canCreate && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Product
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          You have view-only access to Products. Create, edit, archive, and
          delete actions are hidden.
        </div>
      )}

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
                    {p.productType === "membership"
                      ? p.classesPerTerm
                        ? `${p.classesPerTerm} classes/term`
                        : "Not set"
                      : p.productType === "drop_in"
                        ? "1 class"
                        : p.productType === "pass" && p.totalCredits
                          ? `${p.totalCredits} classes`
                          : p.totalCredits
                            ? `${p.totalCredits} credits`
                            : "—"}
                  </Td>
                  <Td>
                    {p.termBound ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-bpm-500" />
                        <span className="text-xs text-bpm-700">Term-bound</span>
                        {p.recurring && (
                          <span className="text-[10px] text-gray-400 ml-1">recurring</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-xs text-gray-600">
                      {scopeMap[p.id]
                        ? `${scopeMap[p.id].styles} · ${scopeMap[p.id].levels}`
                        : "—"}
                    </span>
                  </Td>
                  <Td>
                    {p.archivedAt ? (
                      <Badge variant="default">Archived</Badge>
                    ) : (
                      <Badge variant={p.isActive ? "success" : "default"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </Td>
                  <Td className="w-28">
                    <div className="flex items-center gap-1">
                      {permissions.canEdit && (
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
                      )}
                      {permissions.canEdit && (
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
                      )}
                      {permissions.canArchive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setArchiveProduct(p);
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                          title={p.archivedAt ? "Unarchive" : "Archive"}
                        >
                          {p.archivedAt ? (
                            <ArchiveRestore className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>
                      )}
                      {permissions.canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(p);
                          }}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete product"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
                {isExpanded && (
                  <ProductDetailPanel
                    product={p}
                    subscriptions={subscriptions}
                    studentNameMap={studentNameMap}
                    colSpan={TABLE_HEADERS.length}
                    scope={scopeMap[p.id]}
                  />
                )}
              </Fragment>
            );
          })}
        </AdminTable>
      )}

      {showAdd && permissions.canCreate && (
        <AddProductDialog onClose={() => setShowAdd(false)} danceStyles={danceStyles} />
      )}

      {editProduct && permissions.canEdit && (
        <EditProductDialog product={editProduct} onClose={() => setEditProduct(null)} danceStyles={danceStyles} />
      )}

      {deactivateProduct && permissions.canEdit && (
        <DeactivateProductDialog
          product={deactivateProduct}
          onClose={() => setDeactivateProduct(null)}
        />
      )}

      {archiveProduct && permissions.canArchive && (
        <ArchiveProductDialog
          product={archiveProduct}
          onClose={() => setArchiveProduct(null)}
        />
      )}

      {deleteTarget && permissions.canDelete && (
        <DeleteProductDialog
          product={deleteTarget}
          subscriptions={subscriptions}
          studentNameMap={studentNameMap}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function DeleteProductDialog({
  product,
  subscriptions,
  studentNameMap,
  onClose,
}: {
  product: MockProduct;
  subscriptions: MockSubscription[];
  studentNameMap: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const linkedSubs = subscriptions.filter((s) => s.productId === product.id);
  const activeSubs = linkedSubs.filter((s) => s.status === "active");
  const historicalSubs = linkedSubs.filter((s) => s.status !== "active");
  const hasActiveSubs = activeSubs.length > 0;
  const hasHistoricalSubs = historicalSubs.length > 0;
  const blocked = hasActiveSubs || hasHistoricalSubs;

  function handleConfirm() {
    if (blocked) return;
    startTransition(async () => {
      const { deleteProductAction } = await import("@/lib/actions/products");
      const result = await deleteProductAction(product.id);
      if (result.success) {
        onClose();
        router.refresh();
      } else {
        const msg = result.error ?? "";
        if (msg.includes("violates foreign key") || msg.includes("referenced") || msg.includes("constraint")) {
          setError(`Cannot delete "${product.name}" because it still has linked student records. Remove all student subscriptions for this product first.`);
        } else {
          setError(msg || "Failed to delete product. Try deactivating it instead.");
        }
      }
    });
  }

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Product</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {hasActiveSubs ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    Cannot delete &ldquo;{product.name}&rdquo; because it has {activeSubs.length} active student subscription{activeSubs.length !== 1 ? "s" : ""}:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-red-700">
                    {activeSubs.slice(0, 5).map((s) => (
                      <li key={s.id}>{studentNameMap[s.studentId] ?? s.studentId}</li>
                    ))}
                    {activeSubs.length > 5 && <li>&hellip;and {activeSubs.length - 5} more</li>}
                  </ul>
                  <p className="mt-2 text-xs text-red-700 font-medium">
                    Cancel or remove those student subscriptions first, then try again.
                  </p>
                </div>
              </div>
            </div>
          ) : hasHistoricalSubs ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">
                    Cannot delete &ldquo;{product.name}&rdquo; because {historicalSubs.length} historical student record{historicalSubs.length !== 1 ? "s are" : " is"} still linked:
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-amber-700">
                    {historicalSubs.slice(0, 5).map((s) => (
                      <li key={s.id}>{studentNameMap[s.studentId] ?? s.studentId} ({s.status})</li>
                    ))}
                    {historicalSubs.length > 5 && <li>&hellip;and {historicalSubs.length - 5} more</li>}
                  </ul>
                  <p className="mt-2 text-xs text-amber-700 font-medium">
                    Remove these historical records from each student&apos;s profile first (Admin &gt; Students &gt; Product History), then try again.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              Permanently delete <strong>{product.name}</strong>? This cannot be undone.
            </p>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked && (
            <Button variant="danger" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete Permanently"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
