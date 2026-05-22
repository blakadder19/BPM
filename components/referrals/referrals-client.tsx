"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  Gift,
  Sparkles,
  Inbox,
  Award,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type {
  MockStudentReferral,
  MockReferralReward,
} from "@/lib/mock-data";
import {
  REFERRAL_STATUS_LABELS,
  REWARD_STATUS_LABELS,
  formatReferralReward,
  type ReferralCounts,
  type RewardSummary,
  isRewardEligible,
} from "@/lib/domain/referrals";
import {
  addReferralAction,
  verifyReferralAction,
  rejectReferralAction,
  deleteReferralAction,
  createRewardAction,
  approveRewardAction,
  applyRewardAction,
  cancelRewardAction,
} from "@/lib/actions/referrals";

interface OverviewRow {
  referrerId: string;
  referrerName: string;
  referrerEmail: string | null;
  referralCode: string | null;
  counts: ReferralCounts;
  rewardCounts: RewardSummary;
  eligible: boolean;
}

interface StudentRow {
  id: string;
  fullName: string;
  email: string | null;
}

export interface ReferralsClientPermissions {
  canCreate: boolean;
  canVerify: boolean;
  canReward: boolean;
  canCancel: boolean;
}

interface Props {
  referrals: MockStudentReferral[];
  rewards: MockReferralReward[];
  overview: OverviewRow[];
  students: StudentRow[];
  candidatesByReferrer: Record<string, Array<{ id: string; label: string }>>;
  threshold: number;
  permissions: ReferralsClientPermissions;
}

type Tab = "overview" | "referrals" | "rewards";

function statusBadge(s: MockStudentReferral["status"]) {
  switch (s) {
    case "verified":
      return <Badge variant="success">{REFERRAL_STATUS_LABELS[s]}</Badge>;
    case "rejected":
      return <Badge variant="danger">{REFERRAL_STATUS_LABELS[s]}</Badge>;
    case "rewarded":
      return <Badge variant="info">{REFERRAL_STATUS_LABELS[s]}</Badge>;
    default:
      return <Badge variant="warning">{REFERRAL_STATUS_LABELS[s]}</Badge>;
  }
}

function rewardStatusBadge(s: MockReferralReward["status"]) {
  switch (s) {
    case "applied":
      return <Badge variant="success">{REWARD_STATUS_LABELS[s]}</Badge>;
    case "cancelled":
      return <Badge variant="neutral">{REWARD_STATUS_LABELS[s]}</Badge>;
    case "approved":
      return <Badge variant="info">{REWARD_STATUS_LABELS[s]}</Badge>;
    default:
      return <Badge variant="warning">{REWARD_STATUS_LABELS[s]}</Badge>;
  }
}

export function ReferralsClient({
  referrals,
  rewards,
  overview,
  students,
  candidatesByReferrer,
  threshold,
  permissions,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [rewardFor, setRewardFor] = useState<OverviewRow | null>(null);
  const [applyFor, setApplyFor] = useState<MockReferralReward | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  function studentLabel(id: string | null): string {
    if (!id) return "—";
    const s = studentById.get(id);
    if (!s) return id.slice(0, 8);
    return s.fullName;
  }

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setActionError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.success) setActionError(res.error ?? "Action failed.");
    });
  }

  // ── filtering for the referrals table ──────────────────
  const filteredReferrals = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return referrals.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!needle) return true;
      const refName = studentById.get(r.referrerStudentId)?.fullName ?? "";
      const refdName = r.referredStudentId
        ? studentById.get(r.referredStudentId)?.fullName ?? ""
        : "";
      const haystack = [
        refName,
        refdName,
        r.referredEmail ?? "",
        r.referralCode ?? "",
        r.note ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [referrals, search, statusFilter, studentById]);

  const aggregatedTotals = useMemo(() => {
    return overview.reduce(
      (acc, row) => {
        acc.pending += row.counts.pending;
        acc.verified += row.counts.verified;
        acc.rewarded += row.counts.rewarded;
        acc.eligible += row.eligible ? 1 : 0;
        acc.rewardsPending += row.rewardCounts.pending;
        acc.rewardsApproved += row.rewardCounts.approved;
        acc.rewardsApplied += row.rewardCounts.applied;
        return acc;
      },
      {
        pending: 0,
        verified: 0,
        rewarded: 0,
        eligible: 0,
        rewardsPending: 0,
        rewardsApproved: 0,
        rewardsApplied: 0,
      },
    );
  }, [overview]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Referrals"
        description="Track when existing students refer beginners and approve rewards for the referrer's next membership. Rewards are reviewed and applied manually."
        actions={
          permissions.canCreate ? (
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add referral
            </Button>
          ) : null
        }
      />

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200">
        {(["overview", "referrals", "rewards"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-bpm-600 text-bpm-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "overview"
              ? "Overview"
              : t === "referrals"
                ? `Referrals (${referrals.length})`
                : `Rewards (${rewards.length})`}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Pending referrals" value={aggregatedTotals.pending} />
            <StatCard label="Verified referrals" value={aggregatedTotals.verified} />
            <StatCard
              label={`Referrers eligible (≥ ${threshold})`}
              value={aggregatedTotals.eligible}
            />
            <StatCard
              label="Rewards (pending / approved / applied)"
              value={`${aggregatedTotals.rewardsPending} / ${aggregatedTotals.rewardsApproved} / ${aggregatedTotals.rewardsApplied}`}
            />
          </div>

          {overview.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No referrals yet"
              description="Add a referral to start tracking who brings new beginners to BPM."
            />
          ) : (
            <AdminTable
              headers={[
                "Referrer",
                "Code",
                "Pending",
                "Verified",
                "Rewarded",
                "Rewards",
                "Eligible",
                "",
              ]}
              count={overview.length}
            >
              {overview.map((row) => (
                <tr key={row.referrerId} className="hover:bg-gray-50">
                  <Td>
                    <div className="font-medium text-gray-900">{row.referrerName}</div>
                    {row.referrerEmail && (
                      <div className="text-xs text-gray-500">{row.referrerEmail}</div>
                    )}
                  </Td>
                  <Td>
                    {row.referralCode ? (
                      <code className="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono">
                        {row.referralCode}
                      </code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>{row.counts.pending}</Td>
                  <Td>{row.counts.verified}</Td>
                  <Td>{row.counts.rewarded}</Td>
                  <Td>
                    <span className="text-xs text-gray-600">
                      {row.rewardCounts.pending}p / {row.rewardCounts.approved}a /{" "}
                      {row.rewardCounts.applied}✓
                    </span>
                  </Td>
                  <Td>
                    {row.eligible ? (
                      <Badge variant="success">Yes</Badge>
                    ) : (
                      <Badge variant="neutral">No</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {permissions.canReward && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setRewardFor(row)}
                      >
                        <Gift className="h-3 w-3" /> Create reward
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </div>
      )}

      {tab === "referrals" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="flex-1 min-w-[240px]">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search referrer, referred, code, note…"
              />
            </div>
            <SelectFilter
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "pending", label: "Pending" },
                { value: "verified", label: "Verified" },
                { value: "rejected", label: "Rejected" },
                { value: "rewarded", label: "Rewarded" },
              ]}
            />
          </div>

          {filteredReferrals.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No referrals match"
              description="Try clearing filters or adding a referral."
            />
          ) : (
            <AdminTable
              headers={[
                "Referrer",
                "Referred",
                "Code",
                "Status",
                "Created",
                "Verified",
                "Note",
                "",
              ]}
              count={filteredReferrals.length}
            >
              {filteredReferrals.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <Td>{studentLabel(r.referrerStudentId)}</Td>
                  <Td>
                    {r.referredStudentId ? (
                      studentLabel(r.referredStudentId)
                    ) : r.referredEmail ? (
                      <span className="text-xs">{r.referredEmail}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>
                    {r.referralCode ? (
                      <code className="text-xs font-mono text-gray-600">
                        {r.referralCode}
                      </code>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Td>
                  <Td>{statusBadge(r.status)}</Td>
                  <Td className="text-xs text-gray-500">{formatDate(r.createdAt)}</Td>
                  <Td className="text-xs text-gray-500">
                    {r.verifiedAt ? formatDate(r.verifiedAt) : "—"}
                  </Td>
                  <Td className="max-w-[200px] truncate text-xs text-gray-600">
                    {r.note || "—"}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {permissions.canVerify && r.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", r.id);
                              run(() => verifyReferralAction(fd));
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Verify
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("id", r.id);
                              run(() => rejectReferralAction(fd));
                            }}
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                        </>
                      )}
                      {permissions.canCancel && r.status !== "rewarded" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-500 hover:text-red-700"
                          onClick={() => {
                            if (!confirm("Delete this referral? This cannot be undone.")) return;
                            const fd = new FormData();
                            fd.set("id", r.id);
                            run(() => deleteReferralAction(fd));
                          }}
                          aria-label="Delete referral"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </div>
      )}

      {tab === "rewards" && (
        <div className="space-y-3">
          {rewards.length === 0 ? (
            <EmptyState
              icon={Award}
              title="No rewards yet"
              description="Create a reward for a referrer once they have enough verified referrals."
            />
          ) : (
            <AdminTable
              headers={[
                "Referrer",
                "Discount",
                "Status",
                "Verified at creation",
                "Approved",
                "Applied to",
                "",
              ]}
              count={rewards.length}
            >
              {rewards.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <Td>{studentLabel(r.referrerStudentId)}</Td>
                  <Td>
                    <span className="font-semibold">{formatReferralReward(r)}</span>
                    <span className="ml-1 text-xs text-gray-500">
                      ({r.discountKind === "percentage" ? "percent" : "fixed"})
                    </span>
                  </Td>
                  <Td>{rewardStatusBadge(r.status)}</Td>
                  <Td className="text-xs text-gray-500">{r.verifiedReferralCount}</Td>
                  <Td className="text-xs text-gray-500">
                    {r.approvedAt ? formatDate(r.approvedAt) : "—"}
                  </Td>
                  <Td className="text-xs text-gray-500">
                    {r.appliedSubscriptionId ? (
                      <code className="font-mono">
                        {r.appliedSubscriptionId.slice(0, 12)}…
                      </code>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      {permissions.canReward && r.status === "pending" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const fd = new FormData();
                            fd.set("id", r.id);
                            run(() => approveRewardAction(fd));
                          }}
                        >
                          Approve
                        </Button>
                      )}
                      {permissions.canReward && r.status === "approved" && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setApplyFor(r)}
                        >
                          Mark applied
                        </Button>
                      )}
                      {permissions.canCancel &&
                        (r.status === "pending" || r.status === "approved") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-500 hover:text-red-700"
                            onClick={() => {
                              if (!confirm("Cancel this reward?")) return;
                              const fd = new FormData();
                              fd.set("id", r.id);
                              run(() => cancelRewardAction(fd));
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                    </div>
                  </Td>
                </tr>
              ))}
            </AdminTable>
          )}
        </div>
      )}

      {/* Add referral dialog */}
      <AddReferralDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        students={students}
        onSubmit={(fd) =>
          startTransition(async () => {
            setActionError(null);
            const res = await addReferralAction(fd);
            if (!res.success) {
              setActionError(res.error ?? "Failed.");
              return;
            }
            setShowAdd(false);
          })
        }
      />

      {/* Create reward dialog */}
      <CreateRewardDialog
        open={Boolean(rewardFor)}
        row={rewardFor}
        threshold={threshold}
        onClose={() => setRewardFor(null)}
        onSubmit={(fd) =>
          startTransition(async () => {
            setActionError(null);
            const res = await createRewardAction(fd);
            if (!res.success) {
              setActionError(res.error ?? "Failed.");
              return;
            }
            setRewardFor(null);
          })
        }
      />

      {/* Apply reward dialog */}
      <ApplyRewardDialog
        open={Boolean(applyFor)}
        reward={applyFor}
        candidates={
          applyFor ? candidatesByReferrer[applyFor.referrerStudentId] ?? [] : []
        }
        onClose={() => setApplyFor(null)}
        onSubmit={(fd) =>
          startTransition(async () => {
            setActionError(null);
            const res = await applyRewardAction(fd);
            if (!res.success) {
              setActionError(res.error ?? "Failed.");
              return;
            }
            setApplyFor(null);
          })
        }
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase text-gray-500">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
      </CardContent>
    </Card>
  );
}

// ── Dialogs ────────────────────────────────────────────────

function AddReferralDialog({
  open,
  onClose,
  students,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentRow[];
  onSubmit: (fd: FormData) => void;
}) {
  const [referrerId, setReferrerId] = useState("");
  const [referredId, setReferredId] = useState("");
  const [referredEmail, setReferredEmail] = useState("");
  const [note, setNote] = useState("");

  function reset() {
    setReferrerId("");
    setReferredId("");
    setReferredEmail("");
    setNote("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add referral</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("referrerStudentId", referrerId);
            if (referredId) fd.set("referredStudentId", referredId);
            if (referredEmail) fd.set("referredEmail", referredEmail);
            if (note) fd.set("note", note);
            onSubmit(fd);
          }}
        >
          <DialogBody className="space-y-4">
            <Field label="Referrer (existing student)" required>
              <select
                value={referrerId}
                onChange={(e) => setReferrerId(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none"
              >
                <option value="">Select referrer…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} {s.email ? `· ${s.email}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Referred beginner (existing student, optional)">
              <select
                value={referredId}
                onChange={(e) => setReferredId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none"
              >
                <option value="">— None / use email below —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === referrerId}>
                    {s.fullName} {s.email ? `· ${s.email}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Referred email (if not yet a student)">
              <input
                type="email"
                value={referredEmail}
                onChange={(e) => setReferredEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none"
                placeholder="beginner@example.com"
              />
            </Field>
            <Field label="Note (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-bpm-500 focus:outline-none"
                placeholder="Internal note — e.g. how this referral happened."
              />
            </Field>
            <p className="text-xs text-gray-500">
              New referrals start as <strong>pending</strong> — they must be
              verified before they count toward a reward.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={handleClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Add referral
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateRewardDialog({
  open,
  row,
  threshold,
  onClose,
  onSubmit,
}: {
  open: boolean;
  row: OverviewRow | null;
  threshold: number;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [discountKind, setDiscountKind] = useState<"percentage" | "fixed_cents">(
    "percentage",
  );
  const [discountValue, setDiscountValue] = useState("10");
  const [note, setNote] = useState("");

  if (!row) return null;
  const eligible = isRewardEligible(row.counts, threshold);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create reward for {row.referrerName}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("referrerStudentId", row.referrerId);
            fd.set("discountKind", discountKind);
            fd.set("discountValue", discountValue);
            if (note) fd.set("note", note);
            onSubmit(fd);
          }}
        >
          <DialogBody className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <div>
                Verified referrals: <strong>{row.counts.verified}</strong>{" "}
                (threshold: {threshold})
              </div>
              <div className="mt-1">
                {eligible ? (
                  <span className="text-emerald-700">
                    This referrer meets the threshold for a reward.
                  </span>
                ) : (
                  <span className="text-amber-700">
                    Below threshold — you can still create the reward, but
                    consider verifying more referrals first.
                  </span>
                )}
              </div>
            </div>
            <Field label="Discount kind">
              <select
                value={discountKind}
                onChange={(e) =>
                  setDiscountKind(e.target.value as "percentage" | "fixed_cents")
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_cents">Fixed (cents)</option>
              </select>
            </Field>
            <Field
              label={
                discountKind === "percentage"
                  ? "Discount percentage (1–100)"
                  : "Discount amount in cents (e.g. 1000 = €10)"
              }
              required
            >
              <input
                type="number"
                min={1}
                max={discountKind === "percentage" ? 100 : undefined}
                step={1}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Note (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Spring term referral reward."
              />
            </Field>
            <p className="text-xs text-gray-500">
              The reward is created in <strong>pending</strong> status. You must
              approve it separately, and then manually apply it when the referrer
              purchases their next membership.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create reward
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplyRewardDialog({
  open,
  reward,
  candidates,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reward: MockReferralReward | null;
  candidates: Array<{ id: string; label: string }>;
  onClose: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const [subscriptionId, setSubscriptionId] = useState("");
  const [note, setNote] = useState("");

  if (!reward) return null;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark reward as applied</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData();
            fd.set("id", reward.id);
            if (subscriptionId) fd.set("subscriptionId", subscriptionId);
            if (note) fd.set("note", note);
            onSubmit(fd);
          }}
        >
          <DialogBody className="space-y-4">
            <p className="text-sm text-gray-600">
              Record that this reward has been honoured on the referrer&apos;s
              next membership. The reward is never auto-applied at purchase —
              it must be applied manually at reception (or via Discount Rules).
            </p>
            <Field label="Referrer's membership subscription (optional)">
              <select
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— None / record without link —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Note (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Applied as €20 off renewal at reception."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Mark as applied
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
