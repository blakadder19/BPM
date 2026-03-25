"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "@/lib/actions/settings";
import type { AppSettings } from "@/lib/services/settings-store";

interface StyleOption {
  id: string;
  name: string;
}

interface SettingsFormProps {
  initialSettings: AppSettings;
  allStyles: StyleOption[];
}

export function SettingsForm({ initialSettings, allStyles }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [s, setS] = useState<AppSettings>({
    ...initialSettings,
    roleBalancedStyleNames: initialSettings.roleBalancedStyleNames ?? [],
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
              <CardTitle>Role Balance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{style.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 pt-1">
                  Checked styles enforce leader/follower balance when booking.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── 3. Class Availability ────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Class Availability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
              <div className="flex items-center gap-2">
                <CheckboxField
                  name="studentPracticeBookable"
                  label="Student Practice is bookable"
                  checked={s.studentPracticeBookable}
                  onChange={(v) => setBool("studentPracticeBookable", v)}
                />
                <Badge variant="warning">PROVISIONAL</Badge>
              </div>
              <p className="text-xs text-gray-400 pt-1">
                Student Practice bookability is pending academy confirmation.
              </p>
            </CardContent>
          </Card>

          {/* ── 4. Waitlist ──────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Waitlist</CardTitle>
            </CardHeader>
            <CardContent>
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

          {/* ── 7. Provisional / Pending Decisions ───────────── */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Provisional / Pending Decisions</CardTitle>
                <Badge variant="warning">PROVISIONAL</Badge>
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

          {/* ── 6. System Status (read-only) ─────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Supabase</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Database connection not configured. Add your Supabase
                credentials to{" "}
                <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                  .env.local
                </code>{" "}
                to connect.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
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
        <div className="mt-6 flex items-center gap-3">
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
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}
