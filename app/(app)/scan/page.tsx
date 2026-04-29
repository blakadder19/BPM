import { requirePermission } from "@/lib/staff-permissions";
import { MobileScanner } from "@/components/scan/mobile-scanner";

export default async function ScanPage() {
  const access = await requirePermission("checkin:scan");
  const user = access.user;

  return (
    <div className="mx-auto max-w-lg">
      <MobileScanner userId={user.id} />
    </div>
  );
}
