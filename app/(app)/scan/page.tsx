import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { MobileScanner } from "@/components/scan/mobile-scanner";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function ScanPage({ searchParams }: Props) {
  const user = await getAuthUser();
  if (!user || (user.role !== "admin" && user.role !== "teacher")) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <MobileScanner initialCode={params.code} />
    </div>
  );
}
