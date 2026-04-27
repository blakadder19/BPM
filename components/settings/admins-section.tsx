"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, Mail, ShieldCheck, UserPlus, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  inviteAdminAction,
  listAdminsAction,
} from "@/lib/actions/admins";
import {
  type AdminUserSummary,
  isProbablyValidEmail,
} from "@/lib/domain/admins";

export function AdminsSection() {
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUserSummary[] | null>(null);
  const [supabaseEnabled, setSupabaseEnabled] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setLoadError(null);
    const result = await listAdminsAction();
    if (!result.success) {
      setLoadError(result.error ?? "Failed to load admins");
      setAdmins(null);
    } else {
      setAdmins(result.admins ?? []);
    }
    setSupabaseEnabled(result.supabaseEnabled);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (!isProbablyValidEmail(email)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    startTransition(async () => {
      const result = await inviteAdminAction({ email });
      if (!result.success) {
        setInviteError(result.error ?? "Failed to invite admin.");
        return;
      }
      if (result.alreadyAdmin) {
        setInviteSuccess(`${result.email} is already an admin.`);
      } else if (result.promoted) {
        setInviteSuccess(`${result.email} was promoted to admin.`);
      } else if (result.invited) {
        setInviteSuccess(
          `Invite sent to ${result.email}. They will become an admin after accepting the email link.`
        );
      } else {
        setInviteSuccess("Done.");
      }
      setEmail("");
      await load();
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-bpm-600" />
          <CardTitle>Admins</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-gray-500">
          Add or invite other admin users. New admins get the same access as you.
          Finance and audit actions remain attributed to whoever performs them.
        </p>

        {!supabaseEnabled && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Supabase service role is not configured in this environment.
              Inviting and promoting admins is disabled here.
            </span>
          </div>
        )}

        {/* Current admins list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Current admins</p>
            {admins && (
              <Badge variant="muted">{admins.length}</Badge>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : admins && admins.length > 0 ? (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {admins.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {a.fullName || a.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{a.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {a.isCurrentUser && (
                      <Badge variant="muted">You</Badge>
                    )}
                    <Badge variant="muted">admin</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No admins found.</p>
          )}
        </div>

        {/* Invite form */}
        {supabaseEnabled && (
          <form onSubmit={handleInvite} className="space-y-2">
            <Label htmlFor="invite-admin-email">Invite or promote by email</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="invite-admin-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError(null);
                  setInviteSuccess(null);
                }}
                disabled={pending}
                autoComplete="email"
              />
              <Button type="submit" disabled={pending || email.trim().length === 0}>
                {pending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Working…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" /> Invite admin
                  </span>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 flex items-start gap-1.5">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                If the email already belongs to a user, they are promoted to admin
                immediately. Otherwise an invite email is sent and they become
                admin after accepting it.
              </span>
            </p>
            {inviteError && (
              <p className="text-sm text-red-600">{inviteError}</p>
            )}
            {inviteSuccess && (
              <p className="flex items-center gap-1 text-sm text-emerald-600">
                <CheckCircle className="h-4 w-4" />
                {inviteSuccess}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
