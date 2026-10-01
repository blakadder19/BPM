import { type ReactNode } from "react";
import { getStaffAccess } from "@/lib/staff-permissions";
import { visibleClassesTabs } from "@/lib/classes-tabs";
import { ClassesTabs } from "@/components/classes/classes-tabs";

export default async function ClassesLayout({ children }: { children: ReactNode }) {
  const access = await getStaffAccess();
  // Display only; each page enforces its own permission server-side.
  const tabs = visibleClassesTabs(access.user.role, access);

  return (
    <div className="space-y-6">
      {tabs.length > 0 && <ClassesTabs tabs={tabs} />}
      {children}
    </div>
  );
}
