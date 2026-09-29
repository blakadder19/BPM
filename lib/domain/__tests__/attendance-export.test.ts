import { describe, it, expect } from "vitest";
import {
  buildAttendanceCsv,
  buildAttendanceExportFilename,
  escapeCsvField,
  ATTENDANCE_EXPORT_COLUMNS,
  UTF8_BOM,
  type AttendanceExportRow,
} from "@/lib/domain/attendance-export";

function row(over: Partial<AttendanceExportRow> = {}): AttendanceExportRow {
  return {
    date: "2026-09-20",
    classTitle: "Bachata Improvers",
    startTime: "20:30",
    teachers: "Zaria",
    studentName: "Robin Fox",
    studentEmail: "robin@example.com",
    attendanceStatus: "present",
    bookingStatus: "confirmed",
    bookingSource: "subscription",
    product: "Silver Class Pass",
    creditConsumed: "Yes",
    checkInMethod: "manual",
    markedAt: "2026-09-22T10:15:00.000Z",
    markedBy: "Zaria",
    ...over,
  };
}

// ── Escaping ─────────────────────────────────────────────────

describe("escapeCsvField", () => {
  it("leaves a plain value alone", () => {
    expect(escapeCsvField("Bachata")).toBe("Bachata");
  });

  it("renders null and undefined as an empty cell", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
    expect(escapeCsvField("")).toBe("");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvField("Fox, Robin")).toBe('"Fox, Robin"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(escapeCsvField('He said "present"')).toBe('"He said ""present"""');
  });

  it("quotes values containing line breaks", () => {
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
    expect(escapeCsvField("line one\r\nline two")).toBe('"line one\r\nline two"');
    expect(escapeCsvField("carriage\rreturn")).toBe('"carriage\rreturn"');
  });

  it("handles a value with a comma AND a quote", () => {
    expect(escapeCsvField('Smith, "Bo"')).toBe('"Smith, ""Bo"""');
  });

  it("defuses spreadsheet formula injection", () => {
    // Excel would otherwise evaluate these on open.
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
    expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
    expect(escapeCsvField("-2")).toBe("'-2");
    expect(escapeCsvField("@import")).toBe("'@import");
  });

  it("quotes a formula that also contains a comma", () => {
    expect(escapeCsvField("=A1,B1")).toBe(`"'=A1,B1"`);
  });
});

// ── Headings ─────────────────────────────────────────────────

describe("headings", () => {
  it("emits the documented column order", () => {
    const csv = buildAttendanceCsv([], { includeBom: false });
    expect(csv).toBe(
      [
        "Date",
        "Class",
        "Start time",
        "Teacher(s)",
        "Student name",
        "Student email",
        "Attendance status",
        "Booking status",
        "Booking source",
        "Product",
        "Credit consumed",
        "Check-in method",
        "Marked at",
        "Marked by",
      ].join(","),
    );
  });

  it("every column has both a header and a getter", () => {
    for (const c of ATTENDANCE_EXPORT_COLUMNS) {
      expect(c.header.length).toBeGreaterThan(0);
      expect(typeof c.get).toBe("function");
    }
  });
});

// ── Rows ─────────────────────────────────────────────────────

describe("buildAttendanceCsv", () => {
  it("serialises a row in column order", () => {
    const csv = buildAttendanceCsv([row()], { includeBom: false });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      "2026-09-20,Bachata Improvers,20:30,Zaria,Robin Fox,robin@example.com,present,confirmed,subscription,Silver Class Pass,Yes,manual,2026-09-22T10:15:00.000Z,Zaria",
    );
  });

  it("uses CRLF line endings", () => {
    const csv = buildAttendanceCsv([row(), row()], { includeBom: false });
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("prepends a UTF-8 BOM by default so Excel reads accents correctly", () => {
    const csv = buildAttendanceCsv([]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it("leaves unavailable values as EMPTY cells, not placeholders", () => {
    const csv = buildAttendanceCsv(
      [
        row({
          startTime: null,
          teachers: null,
          studentEmail: null,
          bookingStatus: null,
          bookingSource: null,
          product: null,
          creditConsumed: null,
          checkInMethod: null,
          markedAt: null,
          markedBy: null,
        }),
      ],
      { includeBom: false },
    );
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toBe("2026-09-20,Bachata Improvers,,,Robin Fox,,present,,,,,,,");
    expect(dataLine).not.toMatch(/N\/A|null|undefined|unknown/i);
  });

  it("escapes a student name containing a comma without shifting columns", () => {
    const csv = buildAttendanceCsv([row({ studentName: "Fox, Robin" })], {
      includeBom: false,
    });
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain('"Fox, Robin"');
    // The quoted comma must not create an extra field.
    expect(dataLine.split('"')[2].startsWith(",robin@example.com")).toBe(true);
  });

  it("handles an empty result set — headers only", () => {
    const csv = buildAttendanceCsv([], { includeBom: false });
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  it("includes historical rows alongside today's", () => {
    const csv = buildAttendanceCsv(
      [
        row({ date: "2026-09-20", studentName: "Robin Fox" }),
        row({ date: "2026-09-28", studentName: "Ann Doe" }),
      ],
      { includeBom: false },
    );
    expect(csv).toContain("2026-09-20");
    expect(csv).toContain("2026-09-28");
    expect(csv).toContain("Robin Fox");
    expect(csv).toContain("Ann Doe");
  });

  it("marks a backdated correction distinguishably", () => {
    const csv = buildAttendanceCsv(
      [row({ bookingSource: "admin_backdated" })],
      { includeBom: false },
    );
    expect(csv).toContain("admin_backdated");
  });
});

// ── Filename ─────────────────────────────────────────────────

describe("buildAttendanceExportFilename", () => {
  const today = "2026-09-29";

  it("names a single-class export with the class and date", () => {
    expect(
      buildAttendanceExportFilename({
        classTitle: "Bachata Improvers",
        dateFrom: "2026-09-20",
        dateTo: "2026-09-20",
        today,
      }),
    ).toBe("bpm-attendance-bachata-improvers-2026-09-20.csv");
  });

  it("names a date range", () => {
    expect(
      buildAttendanceExportFilename({
        dateFrom: "2026-09-01",
        dateTo: "2026-09-30",
        today,
      }),
    ).toBe("bpm-attendance-2026-09-01-to-2026-09-30.csv");
  });

  it("names a single date", () => {
    expect(
      buildAttendanceExportFilename({ dateFrom: "2026-09-20", dateTo: null, today }),
    ).toBe("bpm-attendance-2026-09-20.csv");
  });

  it("falls back to all + today when unfiltered", () => {
    expect(buildAttendanceExportFilename({ today })).toBe(
      "bpm-attendance-all-2026-09-29.csv",
    );
  });

  it("slugifies awkward class titles", () => {
    expect(
      buildAttendanceExportFilename({
        classTitle: "Bachata Tradicional / Open — Studio A",
        dateFrom: "2026-09-20",
        dateTo: "2026-09-20",
        today,
      }),
    ).toBe("bpm-attendance-bachata-tradicional-open-studio-a-2026-09-20.csv");
  });

  it("always produces a .csv filename with no path separators", () => {
    const name = buildAttendanceExportFilename({
      classTitle: "../../etc/passwd",
      today,
    });
    expect(name.endsWith(".csv")).toBe(true);
    expect(name).not.toContain("/");
    expect(name).not.toContain("..");
  });
});
