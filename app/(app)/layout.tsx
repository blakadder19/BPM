import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { canAccessRoute } from "@/lib/role-config";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { UserProvider } from "@/components/providers/user-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const headerList = await headers();
  const pathname = headerList.get("x-next-pathname") ?? headerList.get("x-invoke-path") ?? "/dashboard";

  if (!canAccessRoute(user.role, pathname)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar user={user} />
        <main className="flex-1 overflow-y-auto p-6">
          <UserProvider user={{ role: user.role, fullName: user.fullName, email: user.email }}>
            {children}
          </UserProvider>
        </main>
      </div>
    </div>
  );
}
