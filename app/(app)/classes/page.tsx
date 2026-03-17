"use client";

import { useState, useMemo } from "react";
import { Inbox } from "lucide-react";
import { CLASSES } from "@/lib/mock-data";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SelectFilter } from "@/components/ui/select-filter";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminTable, Td } from "@/components/ui/admin-table";
import { EmptyState } from "@/components/ui/empty-state";
import { dayName, formatTime } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";
import { ClassBrowser } from "@/components/booking/class-browser";

const DAY_OPTIONS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
];

const TYPE_OPTIONS = [
  { value: "class", label: "Class" },
  { value: "social", label: "Social" },
  { value: "student_practice", label: "Practice" },
];

function AdminClassTemplates() {
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return CLASSES.filter((c) => {
      if (q && !c.title.toLowerCase().includes(q) && !(c.styleName?.toLowerCase().includes(q))) {
        return false;
      }
      if (dayFilter && c.dayOfWeek !== Number(dayFilter)) return false;
      if (typeFilter && c.classType !== typeFilter) return false;
      return true;
    });
  }, [search, dayFilter, typeFilter]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Templates"
        description="Weekly recurring class definitions."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by title or style…"
          />
        </div>
        <SelectFilter
          value={dayFilter}
          onChange={setDayFilter}
          options={DAY_OPTIONS}
          placeholder="All Days"
        />
        <SelectFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={TYPE_OPTIONS}
          placeholder="All Types"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No templates found"
          description="Try adjusting your search or filters."
        />
      ) : (
        <AdminTable
          headers={["Title", "Type", "Style", "Level", "Day", "Time", "Capacity", "Location", "Active"]}
          count={filtered.length}
        >
          {filtered.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <Td className="font-medium text-gray-900">{c.title}</Td>
              <Td><StatusBadge status={c.classType} /></Td>
              <Td>{c.styleName ?? "—"}</Td>
              <Td>{c.level ?? "—"}</Td>
              <Td>{dayName(c.dayOfWeek)}</Td>
              <Td>{formatTime(c.startTime)} – {formatTime(c.endTime)}</Td>
              <Td>
                {c.leaderCap != null && c.followerCap != null
                  ? `${c.leaderCap}L / ${c.followerCap}F`
                  : c.maxCapacity != null
                    ? String(c.maxCapacity)
                    : "—"}
              </Td>
              <Td>{c.location}</Td>
              <Td>
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    c.isActive ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}

export default function ClassesPage() {
  const { role } = useUser();

  if (role === "student") {
    return <ClassBrowser />;
  }

  return <AdminClassTemplates />;
}
