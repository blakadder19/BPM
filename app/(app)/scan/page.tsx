import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { MobileScanner } from "@/components/scan/mobile-scanner";

export default async function ScanPage() {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg">
      <MobileScanner userId={user.id} />
    </div>
  );
}
