import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { calculateEndDate, calculateSchedule } from "./date-utils.js";
import type { Shift, MaintenanceWindow } from "../reflow/types.js";

const standardShifts: Shift[] = [
    // Spec dayOfWeek: 0=Sun..6=Sat. Mon–Fri are 1..5.
    { dayOfWeek: 1, startHour: 8, endHour: 17 },
    { dayOfWeek: 2, startHour: 8, endHour: 17 },
    { dayOfWeek: 3, startHour: 8, endHour: 17 },
    { dayOfWeek: 4, startHour: 8, endHour: 17 },
    { dayOfWeek: 5, startHour: 8, endHour: 17 },
];

describe("date-utils", () => {
    it("pauses at end of shift and resumes next morning", () => {
        const start = DateTime.fromISO("2026-01-12T16:00:00Z").toUTC(); // Monday
        const end = calculateEndDate(start, 120, standardShifts, []);
        expect(end.toISO()).toBe("2026-01-13T09:00:00.000Z");
    });

    it("snaps actualStart to shift start when starting before shift hours", () => {
        const start = DateTime.fromISO("2026-01-12T06:00:00Z").toUTC();
        const schedule = calculateSchedule(start, 60, standardShifts, []);
        expect(schedule.actualStart.toISO()).toBe("2026-01-12T08:00:00.000Z");
        expect(schedule.end.toISO()).toBe("2026-01-12T09:00:00.000Z");
    });

    it("snaps actualStart to maintenance end when starting inside maintenance", () => {
        const start = DateTime.fromISO("2026-01-12T10:30:00Z").toUTC();
        const maintenance: MaintenanceWindow[] = [
            { startDate: "2026-01-12T10:00:00Z", endDate: "2026-01-12T12:00:00Z" },
        ];

        const schedule = calculateSchedule(start, 60, standardShifts, maintenance);
        expect(schedule.actualStart.toISO()).toBe("2026-01-12T12:00:00.000Z");
        expect(schedule.end.toISO()).toBe("2026-01-12T13:00:00.000Z");
        expect(schedule.flags).toContain("MAINTENANCE_OVERLAP");
    });

    it("splits work around a maintenance window mid-job", () => {
        const start = DateTime.fromISO("2026-01-12T09:30:00Z").toUTC();
        const maintenance: MaintenanceWindow[] = [
            { startDate: "2026-01-12T10:00:00Z", endDate: "2026-01-12T12:00:00Z" },
        ];

        // 9:30-10:00 = 30m, pause 2h, resume 12:00. remaining 150m -> ends 14:30
        const end = calculateEndDate(start, 180, standardShifts, maintenance);
        expect(end.toISO()).toBe("2026-01-12T14:30:00.000Z");
    });

    it("skips weekends correctly", () => {
        const start = DateTime.fromISO("2026-01-16T16:00:00Z").toUTC(); // Friday
        const end = calculateEndDate(start, 120, standardShifts, []);
        // Friday 16-17 = 60m, weekend pause, Monday 8-9 = 60m
        expect(end.toISO()).toBe("2026-01-19T09:00:00.000Z");
    });

    it("throws when no shifts are configured", () => {
        const start = DateTime.fromISO("2026-01-12T10:00:00Z").toUTC();
        expect(() => calculateSchedule(start, 30, [], [])).toThrow(
            "No shifts configured for work center; cannot schedule any work."
        );
    });

    it("throws when only invalid shifts are configured", () => {
        const start = DateTime.fromISO("2026-01-12T10:00:00Z").toUTC();
        const badShifts: Shift[] = [{ dayOfWeek: 1, startHour: 22, endHour: 6 }];

        expect(() => calculateSchedule(start, 30, badShifts, [])).toThrow(
            "No valid shifts configured (expected dayOfWeek 0-6, endHour > startHour)."
        );
    });

    it("throws when scheduling exceeds guard limit (maintenance blocks all work)", () => {
        const start = DateTime.fromISO("2026-01-11T00:00:00Z").toUTC(); // Sunday
        const sundayShiftOnly: Shift[] = [{ dayOfWeek: 0, startHour: 8, endHour: 9 }];

        // Block the only shift window for enough consecutive Sundays.
        // With a small guardMaxSteps this should fail fast.
        const maintenance: MaintenanceWindow[] = [];
        let sunday = DateTime.fromISO("2026-01-11T00:00:00Z").toUTC(); // Sunday

        for (let i = 0; i < 80; i++) {
            maintenance.push({
                startDate: sunday.set({ hour: 8, minute: 0, second: 0, millisecond: 0 }).toISO()!,
                endDate: sunday.set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toISO()!,
            });
            sunday = sunday.plus({ days: 7 });
        }

        expect(() =>
            calculateSchedule(start, 120, sundayShiftOnly, maintenance, { guardMaxSteps: 200 })
        ).toThrow(
            "Scheduling exceeded guard limit; likely impossible constraints (e.g., no workable shift time due to maintenance)."
        );
    });
});