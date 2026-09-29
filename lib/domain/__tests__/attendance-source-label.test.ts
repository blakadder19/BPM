import { describe, it, expect } from "vitest";
import {
  describeAttendanceSource,
  ATTENDANCE_SOURCE_LABELS,
} from "../attendance-source-label";

describe("describeAttendanceSource", () => {
  it("labels a booking-sourced record as Booked, not Walk-in", () => {
    // The original defect: `booking` was missing from the badge map and
    // fell through to the walk-in fallback, so a reinstated booking with
    // a consumed credit was reported as an entitlement-free walk-in.
    const d = describeAttendanceSource("booking");
    expect(d.key).toBe("booking");
    expect(d.label).toBe("Booked");
  });

  it.each(Object.entries(ATTENDANCE_SOURCE_LABELS))(
    "maps the known source %s to its own label",
    (source, label) => {
      const d = describeAttendanceSource(source);
      expect(d.key).toBe(source);
      expect(d.label).toBe(label);
    },
  );

  it("never reports an unrecognised source as a walk-in", () => {
    const d = describeAttendanceSource("waitlist_promotion");
    expect(d.key).toBe("unknown");
    expect(d.label).toBe("Waitlist Promotion");
    expect(d.label).not.toBe(ATTENDANCE_SOURCE_LABELS.walk_in);
  });

  it("treats a sourceless record with a booking as Booked", () => {
    // Rows written before the `source` column existed still carry a
    // bookingId; calling those walk-ins misstates whether a credit went.
    expect(describeAttendanceSource(null, true).label).toBe("Booked");
    expect(describeAttendanceSource(undefined, true).label).toBe("Booked");
  });

  it("treats a sourceless record with no booking as a walk-in", () => {
    expect(describeAttendanceSource(null, false).label).toBe("Walk-in");
    expect(describeAttendanceSource(undefined).label).toBe("Walk-in");
  });

  it("does not let an empty string borrow another source's styling", () => {
    expect(describeAttendanceSource("", false).key).toBe("walk_in");
  });
});
