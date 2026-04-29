"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Inbox,
  KeyRound,
  Power,
  PowerOff,
  Trash2,
  Pencil,
  Copy,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  PERMISSION_GROUPS,
  ROLE_PRESETS,
  STAFF_ROLE_KEYS,
  STAFF_ROLE_LABELS,
  isSensitivePermission,
  type Permission,
  type StaffRoleKey,
  type StaffStatus,
} from "@/lib/domain/permissions";
import {
  inviteStaffAction,
  revokeStaffInviteAction,
  setStaffStatusAction,
  updateStaffPermissionsAction,
  updateStaffProfileAction,
} from "@/lib/actions/staff";

export interface StaffClientStaffRow {
  id: string;
  email: string;
  fullName: string;
  legacyRole: "admin" | "teacher" | "student";
  roleKey: StaffRoleKey | null;
  permissions: Permission[];
  status: StaffStatus;
  invitedBy: string | null;
  updatedAt: string | null;
  createdAt: string | null;
  isCurrentUser: boolean;
}

export interface StaffClientInviteRow {
  id: string;
  email: string;
  displayName: string | null;
  roleKey: StaffRoleKey;
  permissions: Permission[];
  createdAt: string;
  expiresAt: string | null;
  token: string;
}

interface Props {
  staff: StaffClientStaffRow[];
  invites: StaffClientInviteRow[];
  currentUserId: string;
  currentIsSuperAdmin: boolean;
  isLegacyAdminFallback: boolean;
  baseUrl: string;
}

function statusVariant(status: StaffStatus): "success" | "neutral" | "warning" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  return "neutral";
}

/**
 * Copy text to the clipboard with a synchronous fallback for older
 * browsers / non-HTTPS contexts where `navigator.clipboard` is
 * unavailable. Calls `onSuccess` only when the copy actually
 * succeeds — important so the "copied" toast doesn't lie.
 */
function copyToClipboard(text: string, onSuccess: () => void): void {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => onSuccess(),
      () => fallbackCopy(text, onSuccess),
    );
    return;
  }
  fallbackCopy(text, onSuccess);
}

function fallbackCopy(text: string, onSuccess: () => void): void {
  try {
    if (typeof document === "undefined") return;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    onSuccess();
  } catch {
    // Last resort — let the user copy manually from the visible input.
  }
}

/**
 * If the server-returned URL is already absolute (`http://` /
 * `https://`), return it as-is. Otherwise prefix it with the best
 * origin we have on the client. Used as the last line of defence
 * against a relative `/login?invite=...` ever surfacing in the UI.
 */
function toAbsoluteInviteUrl(maybeUrl: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
  if (baseUrl) return `${baseUrl}${maybeUrl}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${maybeUrl}`;
  }
  return maybeUrl;
}

/**
 * Compose an absolute invite URL for display/copy.
 *
 * Server-side `inviteStaffAction` already returns an absolute URL
 * (resolved from NEXT_PUBLIC_SITE_URL / request host / VERCEL_URL),
 * but the pending-invites table renders links from saved tokens too,
 * and that path uses the `baseUrl` prop. If the prop is missing for
 * any reason (e.g. SSR before headers were fully resolved), fall back
 * to `window.location.origin` on the client so admins always see a
 * shareable absolute link.
 */
function inviteUrl(baseUrl: string, token: string): string {
  const path = `/login?invite=${encodeURIComponent(token)}`;
  if (baseUrl) return `${baseUrl}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

export function StaffClient({
  staff,
  invites,
  currentUserId,
  currentIsSuperAdmin,
  isLegacyAdminFallback,
  baseUrl,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [showInvite, setShowInvite] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffClientStaffRow | null>(null);
  // After a successful invite we keep the URL + email + role so the
  // sticky banner can show all three. Cleared with the X button.
  const [lastInvite, setLastInvite] = useState<
    | {
        url: string;
        email: string;
        roleKey: StaffRoleKey;
      }
    | null
  >(null);

  const inviteBannerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (lastInvite && inviteBannerRef.current) {
      inviteBannerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [lastInvite]);

  const activeSuperAdmins = useMemo(
    () => staff.filter((s) => s.roleKey === "super_admin" && s.status === "active").length,
    [staff],
  );

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.email.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        (s.roleKey ?? "").toLowerCase().includes(q)
      );
    });
  }, [staff, search, statusFilter]);

  function runRow(id: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setActionError(null);
    setActionInfo(null);
    setPendingId(id);
    startTransition(async () => {
      const r = await fn();
      if (!r.success) setActionError(r.error ?? "Action failed");
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff & Permissions"
        description="Invite teachers and front-desk staff and control exactly which admin pages and actions they can access. The current Super Admin keeps full access — this module layers permissions on top of the existing role system."
        actions={
          <Button onClick={() => { setActionError(null); setShowInvite(true); }}>
            <Plus className="size-4" />
            <span>Invite staff</span>
          </Button>
        }
      />

      {isLegacyAdminFallback && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You currently have full access through the legacy admin role. Once another
          Super Admin is configured, the Staff & Permissions module becomes the
          source of truth for admin-area access.
        </div>
      )}

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {actionInfo && (
        <div className="rounded-md border border-bpm-200 bg-bpm-50 px-3 py-2 text-sm text-bpm-800">
          {actionInfo}
        </div>
      )}

      {lastInvite && (
        <div
          ref={inviteBannerRef}
          className="rounded-md border-2 border-bpm-300 bg-bpm-50 px-4 py-3 text-sm shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="font-semibold text-bpm-900">Invite created</div>
              <div className="text-xs text-bpm-700">
                <span className="font-medium">{lastInvite.email}</span> ·{" "}
                {STAFF_ROLE_LABELS[lastInvite.roleKey]}
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setLastInvite(null)}
              aria-label="Dismiss invite banner"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={lastInvite.url}
              className="w-full rounded border border-bpm-200 bg-white px-2 py-1 font-mono text-xs"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button
              size="sm"
              onClick={() => {
                copyToClipboard(lastInvite.url, () =>
                  setActionInfo("Invite link copied to clipboard."),
                );
              }}
            >
              <Copy className="size-3.5" />
              <span>Copy invite link</span>
            </Button>
          </div>
          <p className="mt-2 text-xs text-bpm-700">
            <strong>Email sending is not configured.</strong> Copy and share this
            invite link manually. The recipient signs in with the invited email and
            their staff role / permissions are activated automatically.
          </p>
        </div>
      )}

      {/* ── Pending invites ── */}
      {invites.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Pending invites ({invites.length})
          </h3>
          <AdminTable headers={["Email", "Role", "Created", "Link", "Actions"]} count={invites.length}>
            {invites.map((inv) => {
              const url = inviteUrl(baseUrl, inv.token);
              return (
                <tr key={inv.id}>
                  <Td>
                    <div className="font-medium text-gray-900">{inv.email}</div>
                    {inv.displayName && (
                      <div className="text-xs text-gray-500">{inv.displayName}</div>
                    )}
                  </Td>
                  <Td>
                    <Badge variant="info">{STAFF_ROLE_LABELS[inv.roleKey]}</Badge>
                  </Td>
                  <Td className="text-xs text-gray-600">{formatDate(inv.createdAt)}</Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        copyToClipboard(url, () =>
                          setActionInfo(`Invite link for ${inv.email} copied.`),
                        );
                      }}
                    >
                      <Copy className="size-3.5" />
                      <span>Copy link</span>
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingId === inv.id}
                      onClick={() =>
                        runRow(inv.id, () => revokeStaffInviteAction({ inviteId: inv.id }))
                      }
                    >
                      <Trash2 className="size-3.5 text-red-600" />
                      <span>Revoke</span>
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </AdminTable>
        </section>
      )}

      {/* ── Staff list ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        <div className="sm:max-w-sm sm:flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, or role" />
        </div>
        <SelectFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "disabled", label: "Disabled" },
          ]}
        />
      </div>

      {filteredStaff.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No staff yet"
          description="Invite a teacher or front-desk staff member to get started."
        />
      ) : (
        <AdminTable
          headers={["Staff", "Role", "Status", "Updated", "Actions"]}
          count={filteredStaff.length}
        >
          {filteredStaff.map((s) => {
            const isLastSuper =
              s.roleKey === "super_admin" && s.status === "active" && activeSuperAdmins <= 1;
            return (
              <tr key={s.id}>
                <Td>
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-3.5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{s.fullName}</div>
                      <div className="text-xs text-gray-500">{s.email}</div>
                      {s.isCurrentUser && (
                        <div className="text-[10px] text-bpm-700">You</div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td>
                  <Badge variant={s.roleKey === "super_admin" ? "info" : "neutral"}>
                    {s.roleKey ? STAFF_ROLE_LABELS[s.roleKey] : "—"}
                  </Badge>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    legacy: {s.legacyRole}
                  </div>
                </Td>
                <Td>
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                </Td>
                <Td className="text-xs text-gray-600">
                  {s.updatedAt ? formatDate(s.updatedAt) : "—"}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pendingId === s.id}
                      onClick={() => { setActionError(null); setEditTarget(s); }}
                    >
                      <Pencil className="size-3.5" />
                      <span>Edit</span>
                    </Button>
                    {s.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === s.id || s.isCurrentUser || isLastSuper}
                        title={
                          s.isCurrentUser
                            ? "You cannot disable your own access"
                            : isLastSuper
                              ? "Cannot disable the last active Super Admin"
                              : undefined
                        }
                        onClick={() =>
                          runRow(s.id, () =>
                            setStaffStatusAction({ userId: s.id, status: "disabled" }),
                          )
                        }
                      >
                        <PowerOff className="size-3.5" />
                        <span>Disable</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingId === s.id}
                        onClick={() =>
                          runRow(s.id, () =>
                            setStaffStatusAction({ userId: s.id, status: "active" }),
                          )
                        }
                      >
                        <Power className="size-3.5" />
                        <span>Enable</span>
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      {showInvite && (
        <InviteModal
          baseUrl={baseUrl}
          currentIsSuperAdmin={currentIsSuperAdmin}
          onClose={() => setShowInvite(false)}
          onError={setActionError}
          onCreated={({ url, email, roleKey }) => {
            setShowInvite(false);
            setLastInvite({ url, email, roleKey });
            setActionError(null);
            setActionInfo(null);
            // Force the pending-invites list and any nav permissions
            // to refetch from the server so the new row appears
            // immediately without a manual reload.
            router.refresh();
          }}
          onUpdatedExisting={(email) => {
            setShowInvite(false);
            setLastInvite(null);
            setActionError(null);
            setActionInfo(
              `${email} already has a BPM account — their staff role and permissions have been updated. They will see the new access on their next sign-in.`,
            );
            router.refresh();
          }}
        />
      )}

      {editTarget && (
        <EditPermissionsModal
          target={editTarget}
          currentIsSuperAdmin={currentIsSuperAdmin}
          activeSuperAdmins={activeSuperAdmins}
          currentUserId={currentUserId}
          onClose={() => setEditTarget(null)}
          onError={setActionError}
          onSaved={() => {
            setEditTarget(null);
            setActionInfo("Staff details updated.");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────

function InviteModal({
  baseUrl,
  currentIsSuperAdmin,
  onClose,
  onError,
  onCreated,
  onUpdatedExisting,
}: {
  baseUrl: string;
  currentIsSuperAdmin: boolean;
  onClose: () => void;
  onError: (msg: string | null) => void;
  onCreated: (payload: {
    url: string;
    email: string;
    roleKey: StaffRoleKey;
  }) => void;
  onUpdatedExisting: (email: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roleKey, setRoleKey] = useState<StaffRoleKey>("teacher");
  const [overrides, setOverrides] = useState<Set<Permission>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    onError(null);
    setSubmitting(true);
    try {
      let r: Awaited<ReturnType<typeof inviteStaffAction>>;
      try {
        r = await inviteStaffAction({
          email,
          displayName: displayName.trim() || null,
          roleKey,
          permissions: [...overrides],
        });
      } catch (err) {
        // Surface unexpected server errors instead of silently closing.
        // Common causes: Supabase unreachable, RLS misconfiguration,
        // missing migration. Without this catch the modal would close
        // with no feedback at all (Round-2 QA bug).
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[invite-staff] action threw:", msg);
        setLocalError(`Could not create invite: ${msg}`);
        return;
      }

      if (!r.success) {
        setLocalError(r.error);
        return;
      }

      const url = r.data?.inviteUrl;
      const resolvedEmail = r.data?.email ?? email;
      if (url) {
        // Ensure the displayed link is absolute even if the server
        // returned a relative one for any reason.
        onCreated({
          url: toAbsoluteInviteUrl(url, baseUrl),
          email: resolvedEmail,
          roleKey,
        });
      } else {
        // Existing user — promoted/updated in place by the action.
        onUpdatedExisting(resolvedEmail);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell title="Invite staff" onClose={onClose} labelId="invite-staff-title">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldLabel label="Email" required>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </FieldLabel>
            <FieldLabel label="Display name (optional)">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </FieldLabel>
          </div>

          <RoleSelect
            value={roleKey}
            onChange={setRoleKey}
            allowSuperAdmin={currentIsSuperAdmin}
          />

          <PermissionsEditor
            roleKey={roleKey}
            overrides={overrides}
            onChange={setOverrides}
          />

          <div className="rounded-md border border-bpm-200 bg-bpm-50 px-3 py-2 text-xs text-bpm-800">
            <p className="font-medium">Email sending is not configured.</p>
            <p className="mt-0.5">
              We will generate a copyable invite link. Copy and share it manually with
              the recipient — they sign in with the invited email and access activates
              automatically.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            <span>Create invite</span>
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Edit permissions modal ────────────────────────────────────

function EditPermissionsModal({
  target,
  currentIsSuperAdmin,
  activeSuperAdmins,
  currentUserId,
  onClose,
  onError,
  onSaved,
}: {
  target: StaffClientStaffRow;
  currentIsSuperAdmin: boolean;
  activeSuperAdmins: number;
  currentUserId: string;
  onClose: () => void;
  onError: (msg: string | null) => void;
  onSaved: () => void;
}) {
  const [roleKey, setRoleKey] = useState<StaffRoleKey>(target.roleKey ?? "teacher");
  const [overrides, setOverrides] = useState<Set<Permission>>(new Set(target.permissions));
  const [fullName, setFullName] = useState<string>(target.fullName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isLastSuper =
    target.roleKey === "super_admin" &&
    target.status === "active" &&
    activeSuperAdmins <= 1;
  const isSelfSuper = target.id === currentUserId && target.roleKey === "super_admin";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    onError(null);

    if (isLastSuper && roleKey !== "super_admin") {
      setLocalError("This is the last active Super Admin — promote someone else first.");
      return;
    }
    if (isSelfSuper && roleKey !== "super_admin") {
      setLocalError("You cannot remove your own Super Admin role.");
      return;
    }

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setLocalError("Display name cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      // Persist name change first if it actually changed. We treat
      // the two saves as independent so a permissions edit still
      // succeeds even if the name save fails (and vice versa).
      if (trimmedName !== (target.fullName ?? "")) {
        const profileResult = await updateStaffProfileAction({
          userId: target.id,
          fullName: trimmedName,
        });
        if (!profileResult.success) {
          setLocalError(profileResult.error);
          return;
        }
      }

      const r = await updateStaffPermissionsAction({
        userId: target.id,
        roleKey,
        permissions: [...overrides],
      });
      if (!r.success) {
        setLocalError(r.error);
        return;
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[edit-staff] action threw:", msg);
      setLocalError(`Could not save changes: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      title={`Edit — ${target.fullName}`}
      onClose={onClose}
      labelId="edit-staff-title"
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {localError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}

          {(isLastSuper || isSelfSuper) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {isLastSuper
                ? "This is the last active Super Admin. The role cannot be changed until another Super Admin is configured."
                : "This is your own account — you cannot remove your own Super Admin role."}
            </div>
          )}

          <FieldLabel
            label="Display name"
            required
            hint="Shown in the sidebar, finance audit, and the staff list. Email cannot be changed here."
          >
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </FieldLabel>

          <div className="text-xs text-gray-500">
            Email: <span className="font-mono">{target.email}</span>
          </div>

          <RoleSelect
            value={roleKey}
            onChange={setRoleKey}
            allowSuperAdmin={currentIsSuperAdmin}
            disabled={isLastSuper || isSelfSuper}
          />

          <PermissionsEditor
            roleKey={roleKey}
            overrides={overrides}
            onChange={setOverrides}
          />
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            <span>Save changes</span>
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── Shared bits ───────────────────────────────────────────────

function ModalShell({
  title,
  labelId,
  onClose,
  children,
}: {
  title: string;
  labelId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="flex w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-lg max-h-[calc(100dvh-2rem)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <h2 id={labelId} className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-gray-100"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
}

function RoleSelect({
  value,
  onChange,
  allowSuperAdmin,
  disabled,
}: {
  value: StaffRoleKey;
  onChange: (v: StaffRoleKey) => void;
  allowSuperAdmin: boolean;
  disabled?: boolean;
}) {
  return (
    <FieldLabel label="Role preset">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as StaffRoleKey)}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-500"
      >
        {STAFF_ROLE_KEYS.map((k) => {
          if (k === "super_admin" && !allowSuperAdmin) return null;
          return (
            <option key={k} value={k}>
              {STAFF_ROLE_LABELS[k]}
            </option>
          );
        })}
      </select>
    </FieldLabel>
  );
}

function PermissionsEditor({
  roleKey,
  overrides,
  onChange,
}: {
  roleKey: StaffRoleKey;
  overrides: Set<Permission>;
  onChange: (next: Set<Permission>) => void;
}) {
  if (roleKey === "super_admin") {
    return (
      <div className="rounded-md border border-bpm-200 bg-bpm-50 px-3 py-2 text-xs text-bpm-800">
        Super Admin always has every permission. Per-permission overrides are not used.
      </div>
    );
  }

  const presetSet = new Set<Permission>(ROLE_PRESETS[roleKey]);

  function toggle(key: Permission) {
    const next = new Set(overrides);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        Checked = permission is granted. The role preset auto-grants the highlighted
        permissions; toggle additional ones below.{" "}
        {roleKey === "custom" && (
          <span className="text-amber-700">
            Custom mode: only the permissions you explicitly enable are granted.
          </span>
        )}
      </div>
      <div className="space-y-3">
        {PERMISSION_GROUPS.map((g) => (
          <div key={g.key} className="rounded-md border border-gray-200 px-3 py-2">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-600">
              {g.label}
            </div>
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
              {g.permissions.map((p) => {
                const inPreset = roleKey !== "custom" && presetSet.has(p.key);
                const explicit = overrides.has(p.key);
                const granted = inPreset || explicit;
                const sensitive = isSensitivePermission(p.key);
                return (
                  <label
                    key={p.key}
                    className={`flex items-start gap-2 rounded px-1 py-0.5 text-xs ${
                      sensitive && granted ? "bg-amber-50" : ""
                    }`}
                    title={p.description ?? p.key}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={granted}
                      onChange={() => toggle(p.key)}
                    />
                    <span className="flex-1">
                      <span className={inPreset ? "font-medium text-gray-900" : "text-gray-700"}>
                        {p.label}
                      </span>
                      {sensitive && granted && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700">
                          <AlertTriangle className="size-3" />
                          sensitive
                        </span>
                      )}
                      {p.description && (
                        <span className="block text-[11px] text-gray-500">{p.description}</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
