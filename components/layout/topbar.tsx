"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { switchDevRole, switchDevStudent } from "@/lib/actions/auth";
import { useDevUnlock } from "@/lib/hooks/use-dev-unlock";
import type { AuthUser } from "@/lib/auth";

const ROLE_BADGE: Record<string, "default" | "success" | "info"> = {
  admin: "default",
  teacher: "success",
  student: "info",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

interface StudentOption {
  id: string;
  fullName: string;
}

interface TopbarProps {
  user: AuthUser;
  devStudents?: StudentOption[];
  devStudentId?: string | null;
}

export function Topbar({ user, devStudents, devStudentId }: TopbarProps) {
  const { unlocked: showControls } = useDevUnlock();
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3">
        <Badge variant={ROLE_BADGE[user.role] ?? "default"}>
          {ROLE_LABELS[user.role] ?? user.role}
        </Badge>
        {showControls && (
          <>
            <DevRoleSwitcher currentRole={user.role} />
            {devStudents && devStudents.length > 0 && (
              <DevStudentSwitcher
                students={devStudents}
                currentStudentId={devStudentId ?? null}
              />
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* PROVISIONAL: Future enhancement — admin notifications (e.g. "Some templates need term review") */}
        <button
          disabled
          title="Notifications — coming soon"
          className="relative rounded-lg p-2 text-gray-300 cursor-not-allowed opacity-50"
        >
          <Bell className="h-5 w-5" />
        </button>
        <span className="text-sm text-gray-600">
          {user.role === "student" && devStudentId
            ? `${user.fullName} (${user.email})`
            : user.email}
        </span>
      </div>
    </header>
  );
}

function DevRoleSwitcher({ currentRole }: { currentRole: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("role", e.target.value);
    startTransition(async () => {
      await switchDevRole(fd);
      router.refresh();
    });
  }

  return (
    <select
      value={currentRole}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
    >
      <option value="admin">Dev: Admin</option>
      <option value="teacher">Dev: Teacher</option>
      <option value="student">Dev: Student</option>
    </select>
  );
}

function DevStudentSwitcher({
  students,
  currentStudentId,
}: {
  students: StudentOption[];
  currentStudentId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) return;
    startTransition(async () => {
      await switchDevStudent(id);
      router.refresh();
    });
  }

  return (
    <select
      value={currentStudentId ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="rounded border border-dashed border-pink-300 bg-pink-50 px-2 py-0.5 text-xs font-medium text-pink-700"
    >
      <option value="" disabled>
        Impersonate…
      </option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.fullName}
        </option>
      ))}
    </select>
  );
}
