import { CalendarDays } from "lucide-react";
import { formatShortDate } from "@/lib/utils";

interface TermBannerProps {
  name: string;
  startDate: string;
  endDate: string;
  weekNumber?: number;
}

export function TermBanner({ name, startDate, endDate, weekNumber }: TermBannerProps) {
  const totalWeeks = Math.ceil(
    (new Date(endDate + "T12:00:00Z").getTime() - new Date(startDate + "T12:00:00Z").getTime())
    / (7 * 24 * 60 * 60 * 1000),
  );
  const progressPct = weekNumber != null && totalWeeks > 0
    ? Math.min(100, Math.round((weekNumber / totalWeeks) * 100))
    : null;

  return (
    <div data-tour="term-banner" className="rounded-md border border-indigo-100 bg-indigo-50/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          <span className="text-xs font-semibold text-indigo-800 truncate">{name}</span>
          <span className="text-[11px] text-indigo-600 hidden sm:inline">
            {formatShortDate(startDate)} – {formatShortDate(endDate)}
          </span>
        </div>
        {weekNumber != null && (
          <span className="text-[10px] font-medium text-indigo-600 shrink-0">
            Week {weekNumber}{totalWeeks > 0 ? ` / ${totalWeeks}` : ""}
          </span>
        )}
      </div>
      {progressPct !== null && (
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-1.5 rounded-full bg-indigo-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
      <div className="mt-0.5 text-[10px] text-indigo-500 sm:hidden">
        {formatShortDate(startDate)} – {formatShortDate(endDate)}
      </div>
    </div>
  );
}
