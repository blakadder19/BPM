import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { getDevStudentId } from "@/lib/actions/auth";
import { STUDENTS } from "@/lib/mock-data";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";
import { DevPanel } from "@/components/dev/dev-panel";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const isDev = process.env.NODE_ENV === "development";
  const devStudents = isDev
    ? STUDENTS.map((s) => ({ id: s.id, fullName: s.fullName }))
    : undefined;
  const devStudentId = isDev ? await getDevStudentId() : undefined;

  const showDevPanel = isDev && user.role === "student" && devStudentId;

  return (
    <div className="flex h-screen bg-gray-50">
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
      {showDevPanel && (
        <DevPanel studentId={devStudentId} studentName={user.fullName} />
      )}
    </div>
  );
}
