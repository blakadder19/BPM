"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle, AlertTriangle, Database, Wifi, WifiOff, Info, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "@/lib/actions/settings";
import type { AppSettings } from "@/lib/services/settings-store";
import { ALERT_TYPE_META } from "@/lib/domain/admin-alerts";

export type SupabaseStatus =
  | { state: "connected"; projectUrl: string; tableCount: number }
  | { state: "not_configured" }
  | { state: "error"; detail: string };

interface StyleOption {
  id: string;
  name: string;
}

interface SettingsFormProps {
  initialSettings: AppSettings;
  allStyles: StyleOption[];
  supabaseStatus?: SupabaseStatus;
  isDev?: boolean;
}

export function SettingsForm({ initialSettings, allStyles, supabaseStatus, isDev }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [s, setS] = useState<AppSettings>({
    ...initialSettings,
    roleBalancedStyleNames: initialSettings.roleBalancedStyleNames ?? [],
    disabledAlertIds: initialSettings.disabledAlertIds ?? [],
    provisionalNotes: initialSettings.provisionalNotes ?? "",
  });

  function setNum(field: keyof AppSettings, value: string) {
    setS((prev) => ({ ...prev, [field]: Number(value) || 0 }));
    setSaved(false);
    setError(null);
  }

  function setBool(field: keyof AppSettings, value: boolean) {
    setS((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setError(null);
  }

  function toggleStyle(styleName: string) {
    setS((prev) => {
      const current = prev.roleBalancedStyleNames ?? [];
      const next = current.includes(styleName)
        ? current.filter((n) => n !== styleName)
        : [...current, styleName];
      return { ...prev, roleBalancedStyleNames: next };
    });
    setSaved(false);
    setError(null);
  }

  function setNotes(value: string) {
    setS((prev) => ({ ...prev, provisionalNotes: value }));
    setSaved(false);
    setError(null);
  }

  function toggleAlertId(alertId: string) {
    setS((prev) => {
      const current = prev.disabledAlertIds ?? [];
      const next = current.includes(alertId)
        ? current.filter((id) => id !== alertId)
        : [...current, alertId];
      return { ...prev, disabledAlertIds: next };
    });
    setSaved(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveSettings(formData);
      if (result.success) {
        setS(result.settings);
        setSaved(true);
        setError(null);
        router.refresh();
      } else {
        setError(result.error ?? "Failed to save");
        setSaved(false);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Academy configuration and business rules."
      />

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── 1. Penalty Rules ──────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Penalty Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField
                id="lateCancelFeeCents"
                label="Late cancel fee (cents)"
                value={s.lateCancelFeeCents}
                onChange={(v) => setNum("lateCancelFeeCents", v)}
                hint={`€${(s.lateCancelFeeCents / 100).toFixed(2)}`}
              />
              <NumberField
                id="noShowFeeCents"
                label="No-show fee (cents)"
                value={s.noShowFeeCents}
                onChange={(v) => setNum("noShowFeeCents", v)}
                hint={`€${(s.noShowFeeCents / 100).toFixed(2)}`}
              />
              <NumberField
                id="lateCancelCutoffMinutes"
                label="Late cancel cutoff (minutes before class)"
                value={s.lateCancelCutoffMinutes}
                onChange={(v) => setNum("lateCancelCutoffMinutes", v)}
              />

              <div className="space-y-2 pt-2">
                <CheckboxField
                  name="lateCancelPenaltiesEnabled"
                  label="Late cancel penalties enabled"
                  checked={s.lateCancelPenaltiesEnabled}
                  onChange={(v) => setBool("lateCancelPenaltiesEnabled", v)}
                />
                <CheckboxField
                  name="noShowPenaltiesEnabled"
                  label="No-show penalties enabled"
                  checked={s.noShowPenaltiesEnabled}
                  onChange={(v) => setBool("noShowPenaltiesEnabled", v)}
                />
                <CheckboxField
                  name="penaltiesApplyToClassOnly"
                  label="Penalties apply to class bookings only"
                  checked={s.penaltiesApplyToClassOnly}
                  onChange={(v) => setBool("penaltiesApplyToClassOnly", v)}
                />
                <CheckboxField
                  name="socialsExcludedFromPenalties"
                  label="Socials excluded from penalties"
                  checked={s.socialsExcludedFromPenalties}
                  onChange={(v) => setBool("socialsExcludedFromPenalties", v)}
                />
              </div>

              <p className="pt-2 text-xs text-gray-500">
                Disabling penalty toggles affects future penalty creation only.
                Existing penalties are not removed.
              </p>
            </CardContent>
          </Card>

          {/* ── 2. Role Balance ───────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Role Balance</CardTitle>
                {isDev && <Badge variant="muted">Partially wired</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDev && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-1 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>The imbalance number is saved but booking enforcement still uses a static default. The style checkboxes control display badges in Schedule/Templates.</span>
                </div>
              )}
              <NumberField
                id="allowedRoleImbalance"
                label="Max leader/follower imbalance"
                value={s.allowedRoleImbalance}
                onChange={(v) => setNum("allowedRoleImbalance", v)}
                hint="0 = strict balance, 2 = allow up to 2 extra of one role"
              />

              <div className="space-y-1.5 pt-2">
                <p className="text-sm font-medium text-gray-700">
                  Styles requiring role balance
                </p>
                <div className="space-y-1.5">
                  {allStyles.map((style) => {
                    const checked = (s.roleBalancedStyleNames ?? []).includes(style.name);
                    return (
                      <label
                        key={style.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="roleBalancedStyleNames"
                          value={style.name}
                          checked={checked}
                          onChange={() => toggleStyle(style.name)}
                          className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                        />
                        <span>{style.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 pt-1">
                  Checked styles show role-balance indicators in Schedule and Templates.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── 3. Class Availability ────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Class Availability</CardTitle>
                {isDev && <Badge variant="muted">UI only</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isDev && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>These toggles control display labels only. Booking enforcement uses the event type configuration and is not yet driven by these settings.</span>
                </div>
              )}
              <CheckboxField
                name="socialsBookable"
                label="Socials are bookable"
                checked={s.socialsBookable}
                onChange={(v) => setBool("socialsBookable", v)}
              />
              <CheckboxField
                name="weeklyEventsBookable"
                label="Weekly events are bookable"
                checked={s.weeklyEventsBookable}
                onChange={(v) => setBool("weeklyEventsBookable", v)}
              />
              <CheckboxField
                name="studentPracticeBookable"
                label="Student Practice is bookable"
                checked={s.studentPracticeBookable}
                onChange={(v) => setBool("studentPracticeBookable", v)}
              />
              <p className="text-xs text-gray-400 pt-1">
                When disabled, Student Practice is pay-at-reception only (not bookable online).
              </p>
            </CardContent>
          </Card>

          {/* ── 4. Waitlist ──────────────────────────────────── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Waitlist</CardTitle>
                {isDev && <Badge variant="muted">Not yet wired</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              {isDev && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>This setting is saved but not yet consumed by any waitlist logic. It will be wired when automated waitlist offer expiry is implemented.</span>
                </div>
              )}
              <NumberField
                id="waitlistOfferExpiryHours"
                label="Waitlist offer expiry (hours)"
                value={s.waitlistOfferExpiryHours}
                onChange={(v) => setNum("waitlistOfferExpiryHours", v)}
                hint="How long a student has to accept a waitlist offer before it expires."
              />
            </CardContent>
          </Card>

          {/* ── 5. Attendance & Check-In ────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Attendance & Check-In</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField
                id="attendanceClosureMinutes"
                label="Attendance closure window (minutes after class start)"
                value={s.attendanceClosureMinutes}
                onChange={(v) => setNum("attendanceClosureMinutes", v)}
                hint="After this window, unchecked confirmed bookings become missed."
              />
              <NumberField
                id="selfCheckInOpensMinutesBefore"
                label="Self check-in opens (minutes before class)"
                value={s.selfCheckInOpensMinutesBefore}
                onChange={(v) => setNum("selfCheckInOpensMinutesBefore", v)}
                hint="How early students can check themselves in."
              />
              <CheckboxField
                name="selfCheckInEnabled"
                label="Student self check-in enabled"
                checked={s.selfCheckInEnabled}
                onChange={(v) => setBool("selfCheckInEnabled", v)}
              />
              <CheckboxField
                name="qrCheckInEnabled"
                label="QR code check-in enabled"
                checked={s.qrCheckInEnabled}
                onChange={(v) => setBool("qrCheckInEnabled", v)}
              />

              <div className="border-t border-gray-200 pt-4 mt-2 space-y-2">
                <p className="text-sm font-medium text-gray-700">Absence Policy</p>
                <CheckboxField
                  name="refundCreditOnAbsent"
                  label="Refund class/credit when a student is marked absent"
                  checked={s.refundCreditOnAbsent}
                  onChange={(v) => setBool("refundCreditOnAbsent", v)}
                />
                <p className="text-xs text-gray-400">
                  When enabled, marking a student absent will refund their class credit.
                  Excused absences always refund regardless of this setting.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── 6. Term-bound Policy ─────────────── */}
          <Card>
            <CardHeader><CardTitle>Term-bound Policy</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-500">
                These settings control late entry into term-bound classes (e.g. Beginners courses that run as a closed block).
              </p>
              <CheckboxField
                name="allowAdminLateEntryIntoTermBound"
                label="Allow admin/reception to add students late into a term-bound course"
                checked={s.allowAdminLateEntryIntoTermBound}
                onChange={(v) => setBool("allowAdminLateEntryIntoTermBound", v)}
              />
              <CheckboxField
                name="studentTermSelectionEnabled"
                label="Allow students to choose the term when purchasing"
                checked={s.studentTermSelectionEnabled}
                onChange={(v) => setBool("studentTermSelectionEnabled", v)}
              />
              <p className="text-xs text-gray-400 -mt-1 ml-6">
                When enabled, students can select which term they are purchasing for when buying term-bound products from the catalog.
              </p>

              <div>
                <Label htmlFor="adminLateEntryMaxClassNumber" className="text-sm">
                  Latest class number admin can add a student (e.g. 2 = up to week 2)
                </Label>
                <Input
                  id="adminLateEntryMaxClassNumber"
                  name="adminLateEntryMaxClassNumber"
                  type="number"
                  min={1}
                  max={10}
                  value={s.adminLateEntryMaxClassNumber}
                  onChange={(e) => setNum("adminLateEntryMaxClassNumber", e.target.value)}
                  className="mt-1 w-32"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Students can never self-book once a term-bound course has started. This controls how late admin/reception may still add them.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── 7. Admin Alerts ─────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-gray-400" />
                Admin Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-500">
                Choose which operational alerts appear in the bell icon. Disabled alerts are hidden but can be re-enabled at any time.
              </p>
              <div className="space-y-2">
                {ALERT_TYPE_META.map((meta) => {
                  const isEnabled = !(s.disabledAlertIds ?? []).includes(meta.id);
                  return (
                    <label key={meta.id} className="flex items-start gap-2.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => toggleAlertId(meta.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={isEnabled ? "text-gray-700 font-medium" : "text-gray-400 line-through"}>
                          {meta.label}
                        </span>
                        <p className="text-xs text-gray-400 leading-snug">{meta.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              {(s.disabledAlertIds ?? []).map((id) => (
                <input key={id} type="hidden" name="disabledAlertIds" value={id} />
              ))}
            </CardContent>
          </Card>

          {/* ── 8. Provisional / Pending Decisions ───────────── */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Provisional / Pending Decisions</CardTitle>
                {isDev && <Badge variant="warning">PROVISIONAL</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>
                    Track unresolved academy decisions here. These notes are admin-only.
                  </span>
                </div>
                <textarea
                  name="provisionalNotes"
                  rows={6}
                  value={s.provisionalNotes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Add notes about pending business rule decisions…"
                />
              </div>
            </CardContent>
          </Card>

          {/* ── System Status (read-only) ─────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-gray-400" />
                Supabase
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SupabaseStatusDisplay status={supabaseStatus} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Payments</CardTitle>
                {isDev && <Badge variant="muted">Not implemented</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Stripe integration is placeholder-ready. Payment processing will
                be added in a future iteration.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Save bar ───────────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-gray-200 bg-white/95 backdrop-blur px-4 py-3 md:-mx-6 md:px-6">
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? "Saving…" : "Save settings"}
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle className="h-4 w-4" />
                Settings saved
              </span>
            )}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      </form>
    </div>
  );
}

/* ── Small helper sub-components ─────────────────────────────── */

function NumberField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

function CheckboxField({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-bpm-600 focus:ring-bpm-500"
      />
      <span>{label}</span>
    </label>
  );
}

function SupabaseStatusDisplay({ status }: { status?: SupabaseStatus }) {
  if (!status || status.state === "not_configured") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
          <WifiOff className="h-5 w-5 text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Not configured</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Add <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">SUPABASE_SERVICE_ROLE_KEY</code> to
            your environment to connect.
          </p>
        </div>
      </div>
    );
  }

  if (status.state === "error") {
    return (
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-red-700">Connection error</p>
          <p className="text-xs text-red-600 mt-0.5">{status.detail}</p>
        </div>
      </div>
    );
  }

  const hostname = (() => {
    try {
      return new URL(status.projectUrl).hostname;
    } catch {
      return status.projectUrl;
    }
  })();

  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
        <Wifi className="h-5 w-5 text-emerald-500" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-emerald-700">Connected</p>
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {hostname}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Settings are persisted to the <code className="rounded bg-gray-100 px-1 py-0.5">business_rules</code> table.
        </p>
      </div>
    </div>
  );
}
