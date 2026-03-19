import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import { getStudentRepo } from "@/lib/repositories";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";
import { DevPanel } from "@/components/dev/dev-panel";
import { BFCacheGuard } from "@/components/layout/bfcache-guard";

/**
 * Single source of truth for the dev-tools email allowlist.
 * True when NODE_ENV is "development" AND the user's email is in
 * the allowlist env var. Accepts both the server-only and NEXT_PUBLIC_
 * variants so it works even when the dev server hasn't been restarted
 * after adding the env var.
 */
function isDevAllowlisted(email: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const raw =
    process.env.DEV_TOOL_ALLOWED_EMAILS ??
    process.env.NEXT_PUBLIC_DEV_TOOL_ALLOWED_EMAILS;
  if (!raw) return false;
  const allowed = raw.split(",").map((e) => e.trim().toLowerCase());
  return allowed.includes(email.toLowerCase());
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  // Hard-guard: unconfirmed email → send back to confirmation waiting screen.
  // This covers browser Back, direct URL navigation, and all (app) routes.
  if (!user.emailConfirmed) {
    redirect("/signup?awaiting=1");
  }

  const isDev = process.env.NODE_ENV === "development";
  const allowlisted = isDevAllowlisted(user.email);

  // Dev students list + current impersonation target
  let devStudents: { id: string; fullName: string }[] | undefined;
  let devStudentId: string | undefined;
  if (isDev) {
    const allStudents = await getStudentRepo().getAll();
    devStudents = allStudents.map((s) => ({ id: s.id, fullName: s.fullName }));
    devStudentId = (await getDevStudentId()) ?? undefined;
  }

  const impersonating = isDev && !!devStudentId;

  // --- Dev-tools visibility ---
  //
  // Floating DevPanel (bottom-right):
  //   visible when EITHER the user is allowlisted OR impersonation is active.
  const showDevPanel = allowlisted || impersonating;

  // DevPanel target: impersonated student takes priority, otherwise
  // fall back to the real authenticated user for allowlisted devs.
  const panelStudentId = devStudentId ?? (allowlisted ? user.id : undefined);
  const panelStudentName = devStudentId
    ? devStudents?.find((s) => s.id === devStudentId)?.fullName ?? user.fullName
    : user.fullName;

  return (
    <div className="flex h-screen bg-gray-50">
      <BFCacheGuard />
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          user={user}
          devStudents={devStudents}
          devStudentId={devStudentId}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <UserProvider
            user={{ role: user.role, fullName: user.fullName, email: user.email }}
          >
            {children}
          </UserProvider>
        </main>
      </div>
      {showDevPanel && panelStudentId && (
        <DevPanel studentId={panelStudentId} studentName={panelStudentName} />
      )}
    </div>
  );
}
