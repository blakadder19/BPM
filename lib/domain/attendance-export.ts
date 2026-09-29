/**
 * Phase 19 — attendance CSV export.
 *
 * Pure: no IO. The caller resolves and joins the data server-side;
 * this module owns row shaping, escaping and filename generation so
 * all three are testable without a database.
 *
 * Format choice: CSV rather than XLSX. It opens natively in Excel,
 * Numbers and Google Sheets, needs no dependency, and streams as a
 * plain string. An XLSX writer would add a sizeable dependency for no
 * capability Zaria has asked for.
 *
 * Unavailable values are emitted as EMPTY CELLS, never as "N/A" or
 * "unknown" — a blank cell is unambiguous when the sheet is sorted or
 * filtered, and inventing a placeholder would look like data.
 */

// ── Row shape ────────────────────────────────────────────────

/**
 * One export row. Every field maps to something that genuinely
 * exists on the attendance/booking/subscription records; nothing is
 * synthesised.
 */
export interface AttendanceExportRow {
  date: string;
  classTitle: string;
  startTime: string | null;
  teachers: string | null;
  studentName: string;
  studentEmail: string | null;
  attendanceStatus: string;
  /** Booking status when the attendance is linked to a booking. */
  bookingStatus: string | null;
  /** Booking source, e.g. subscription / admin / admin_backdated. */
  bookingSource: string | null;
  /** Product name of the entitlement used, when known. */
  product: string | null;
  /**
   * Whether a credit/class was consumed for this attendance. Blank
   * when there is no entitlement to speak of (e.g. a comped walk-in).
   */
  creditConsumed: "Yes" | "No" | null;
  checkInMethod: string | null;
  markedAt: string | null;
  markedBy: string | null;
}

/**
 * Column order and headings. Declared as a single ordered list so a
 * new column can never be added to the header without also being
 * added to the row serialiser.
 */
export const ATTENDANCE_EXPORT_COLUMNS: ReadonlyArray<{
  header: string;
  get: (r: AttendanceExportRow) => string | null;
}> = [
  { header: "Date", get: (r) => r.date },
  { header: "Class", get: (r) => r.classTitle },
  { header: "Start time", get: (r) => r.startTime },
  { header: "Teacher(s)", get: (r) => r.teachers },
  { header: "Student name", get: (r) => r.studentName },
  { header: "Student email", get: (r) => r.studentEmail },
  { header: "Attendance status", get: (r) => r.attendanceStatus },
  { header: "Booking status", get: (r) => r.bookingStatus },
  { header: "Booking source", get: (r) => r.bookingSource },
  { header: "Product", get: (r) => r.product },
  { header: "Credit consumed", get: (r) => r.creditConsumed },
  { header: "Check-in method", get: (r) => r.checkInMethod },
  { header: "Marked at", get: (r) => r.markedAt },
  { header: "Marked by", get: (r) => r.markedBy },
];

// ── Escaping ─────────────────────────────────────────────────

/**
 * RFC 4180 field escaping.
 *
 * A field is quoted when it contains a comma, a double quote, or any
 * line break (CR, LF, or CRLF). Embedded quotes are doubled. This
 * matters more than it looks: student names contain commas, admin
 * reasons contain quotes, and notes contain newlines — any of which
 * would silently shift every subsequent column if emitted raw.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a single quote to
 * defuse spreadsheet formula injection. A name like `=cmd|...` would
 * otherwise be evaluated by Excel on open.
 */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  let v = String(value);
  if (v === "") return "";

  if (/^[=+\-@]/.test(v)) {
    v = `'${v}`;
  }

  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// ── Serialisation ────────────────────────────────────────────

/** CRLF, which is what Excel expects and every other tool tolerates. */
const CRLF = "\r\n";

/**
 * Byte-order mark. Without it Excel on Windows misreads UTF-8
 * accented characters (BPM has "Bachata Tradicional" and student
 * names with accents), showing mojibake. Harmless everywhere else.
 */
export const UTF8_BOM = "\uFEFF";

export function buildAttendanceCsv(
  rows: AttendanceExportRow[],
  options: { includeBom?: boolean } = {},
): string {
  const header = ATTENDANCE_EXPORT_COLUMNS.map((c) => escapeCsvField(c.header)).join(",");
  const body = rows.map((r) =>
    ATTENDANCE_EXPORT_COLUMNS.map((c) => escapeCsvField(c.get(r))).join(","),
  );
  const csv = [header, ...body].join(CRLF);
  return (options.includeBom === false ? "" : UTF8_BOM) + csv;
}

// ── Filename ─────────────────────────────────────────────────

/** Strip anything that would be awkward in a downloaded filename. */
function slug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Build a self-describing filename so an admin with several exports
 * in their Downloads folder can tell them apart.
 *
 *   single class  → bpm-attendance-bachata-improvers-2026-09-20.csv
 *   single date   → bpm-attendance-2026-09-20.csv
 *   date range    → bpm-attendance-2026-09-01-to-2026-09-30.csv
 *   unfiltered    → bpm-attendance-all-<today>.csv
 */
export function buildAttendanceExportFilename(input: {
  classTitle?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  today: string;
}): string {
  const parts = ["bpm-attendance"];

  if (input.classTitle) {
    const s = slug(input.classTitle);
    if (s) parts.push(s);
  }

  const from = input.dateFrom || null;
  const to = input.dateTo || null;

  if (from && to && from !== to) {
    parts.push(from, "to", to);
  } else if (from || to) {
    parts.push((from ?? to) as string);
  } else if (!input.classTitle) {
    parts.push("all", input.today);
  } else {
    parts.push(input.today);
  }

  return `${parts.join("-")}.csv`;
}
