"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettings } from "@/lib/actions/settings";
import type { AppSettings } from "@/lib/services/settings-store";

interface SettingsFormProps {
  initialSettings: AppSettings;
  roleBalancedStyles: string[];
}

export function SettingsForm({
  initialSettings,
  roleBalancedStyles,
}: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(initialSettings);

  function handleChange(field: keyof AppSettings, value: string) {
    setSettings((prev) => ({ ...prev, [field]: Number(value) || 0 }));
    setSaved(false);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveSettings(formData);
      if (result.success) {
        setSettings(result.settings);
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
          <Card>
            <CardHeader>
              <CardTitle>Penalty Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="lateCancelFeeCents">Late cancel fee (cents)</Label>
                <Input
                  id="lateCancelFeeCents"
                  name="lateCancelFeeCents"
                  type="number"
                  min={0}
                  value={settings.lateCancelFeeCents}
                  onChange={(e) =>
                    handleChange("lateCancelFeeCents", e.target.value)
                  }
                />
                <p className="text-xs text-gray-400">
                  Currently €{(settings.lateCancelFeeCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="noShowFeeCents">No-show fee (cents)</Label>
                <Input
                  id="noShowFeeCents"
                  name="noShowFeeCents"
                  type="number"
                  min={0}
                  value={settings.noShowFeeCents}
                  onChange={(e) =>
                    handleChange("noShowFeeCents", e.target.value)
                  }
                />
                <p className="text-xs text-gray-400">
                  Currently €{(settings.noShowFeeCents / 100).toFixed(2)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lateCancelCutoffMinutes">
                  Late cancel cutoff (minutes before class)
                </Label>
                <Input
                  id="lateCancelCutoffMinutes"
                  name="lateCancelCutoffMinutes"
                  type="number"
                  min={0}
                  value={settings.lateCancelCutoffMinutes}
                  onChange={(e) =>
                    handleChange("lateCancelCutoffMinutes", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="allowedRoleImbalance">
                  Max leader/follower imbalance
                </Label>
                <Input
                  id="allowedRoleImbalance"
                  name="allowedRoleImbalance"
                  type="number"
                  min={0}
                  value={settings.allowedRoleImbalance}
                  onChange={(e) =>
                    handleChange("allowedRoleImbalance", e.target.value)
                  }
                />
                <p className="text-xs text-gray-400">
                  0 = strict balance, 2 = allow up to 2 extra of one role
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Role-Balanced Styles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {roleBalancedStyles.map((style) => (
                    <Badge key={style} variant="info">
                      {style}
                    </Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  Managed via dance style configuration. These styles enforce
                  leader/follower balance when booking.
                </p>
              </CardContent>
            </Card>

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
                  Stripe integration is placeholder-ready. Payment processing
                  will be added in a future iteration.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

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
          {error && (
            <span className="text-sm text-red-600">{error}</span>
          )}
        </div>
      </form>
    </div>
  );
}
