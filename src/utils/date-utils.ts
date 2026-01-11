import { DateTime, Interval } from "luxon";
import type { ChangeReason, MaintenanceWindow, Shift } from "../reflow/types.js";

export interface ScheduleCalcResult {
    actualStart: DateTime;
    end: DateTime;
    flags: ChangeReason[];
}

export interface ScheduleOptions {
    /**
     * Prevent infinite loops / impossible schedules.
     * Default is intentionally high for production safety.
     */
    guardMaxSteps?: number;
}

/**
 * Convert Luxon weekday (1-7, Mon=1..Sun=7) to spec weekday (0-6, Sun=0).
 */
export function luxonWeekdayToSpec(luxonWeekday: number): number {
    return luxonWeekday % 7; // 7 -> 0
}

export function assertUtc(dt: DateTime, label: string): void {
    if (!dt.isValid) {
        throw new Error(`Invalid DateTime for ${label}: ${dt.invalidReason ?? "unknown"}`);
    }
}

function parseUtcIso(iso: string, label: string): DateTime {
    const dt = DateTime.fromISO(iso, { setZone: true }).toUTC();
    assertUtc(dt, label);
    return dt;
}

function getShiftForDay(shifts: Shift[], specDay: number): Shift | undefined {
    return shifts.find((s) => s.dayOfWeek === specDay);
}

function shiftWindowForDate(dateUtc: DateTime, shift: Shift): { start: DateTime; end: DateTime } {
    if (shift.startHour < 0 || shift.startHour > 23 || shift.endHour < 0 || shift.endHour > 23) {
        throw new Error(`Invalid shift hours: startHour=${shift.startHour}, endHour=${shift.endHour}`);
    }

    // Timebox: same-day shifts only (no overnight).
    // @upgrade: support overnight shifts.
    if (shift.endHour <= shift.startHour) {
        throw new Error("No valid shifts configured (expected dayOfWeek 0-6, endHour > startHour).");
    }

    const start = dateUtc.set({ hour: shift.startHour, minute: 0, second: 0, millisecond: 0 });
    const end = dateUtc.set({ hour: shift.endHour, minute: 0, second: 0, millisecond: 0 });
    return { start, end };
}

function maintenanceIntervalAt(pos: DateTime, maintenance: MaintenanceWindow[]): Interval | null {
    for (const m of maintenance) {
        const mStart = parseUtcIso(m.startDate, "maintenance.startDate");
        const mEnd = parseUtcIso(m.endDate, "maintenance.endDate");
        const interval = Interval.fromDateTimes(mStart, mEnd);

        // Treat boundary as blocked (pos == start is blocked).
        if (interval.contains(pos) || pos.equals(interval.start!)) return interval;
    }
    return null;
}

/**
 * If pos is inside (or exactly at start of) a maintenance window,
 * jump to the end of that window. Repeat until pos is not blocked.
 */
export function jumpPastMaintenance(
    pos: DateTime,
    maintenance: MaintenanceWindow[],
    flags?: Set<ChangeReason>
): DateTime {
    let cursor = pos;

    while (true) {
        const interval = maintenanceIntervalAt(cursor, maintenance);
        if (!interval) return cursor;

        flags?.add("MAINTENANCE_OVERLAP");
        cursor = interval.end!;
    }
}

/**
 * Schedule work for `durationMinutes` starting at (or after) `proposedStartUtc`,
 * respecting shifts (pause/resume) and maintenance windows (blocked).
 *
 * Shift dayOfWeek is spec: 0=Sun..6=Sat.
 */
export function calculateSchedule(
    proposedStartUtc: DateTime,
    durationMinutes: number,
    shifts: Shift[],
    maintenance: MaintenanceWindow[],
    options: ScheduleOptions = {}
): ScheduleCalcResult {
    if (durationMinutes < 0) throw new Error(`durationMinutes must be >= 0 (got ${durationMinutes})`);
    assertUtc(proposedStartUtc, "proposedStartUtc");

    if (!shifts || shifts.length === 0) {
        throw new Error("No shifts configured for work center; cannot schedule any work.");
    }

    const hasAnyValidShift = shifts.some(
        (s) =>
            s.dayOfWeek >= 0 &&
            s.dayOfWeek <= 6 &&
            s.startHour >= 0 &&
            s.startHour <= 23 &&
            s.endHour >= 0 &&
            s.endHour <= 23 &&
            s.endHour > s.startHour
    );
    if (!hasAnyValidShift) {
        throw new Error("No valid shifts configured (expected dayOfWeek 0-6, endHour > startHour).");
    }

    const flags = new Set<ChangeReason>();

    // Guard against infinite loops under impossible constraints.
    let guardSteps = 0;
    const MAX_GUARD_STEPS = options.guardMaxSteps ?? 20000;

    if (!Number.isFinite(MAX_GUARD_STEPS) || MAX_GUARD_STEPS <= 0) {
        throw new Error(`guardMaxSteps must be a positive number (got ${MAX_GUARD_STEPS}).`);
    }

    const bumpGuard = () => {
        guardSteps += 1;
        if (guardSteps > MAX_GUARD_STEPS) {
            throw new Error(
                "Scheduling exceeded guard limit; likely impossible constraints (e.g., no workable shift time due to maintenance)."
            );
        }
    };

    let remaining = durationMinutes;
    let pos = proposedStartUtc.toUTC();

    // Normalize start: maintenance first.
    pos = jumpPastMaintenance(pos, maintenance, flags);

    // Snap to a valid shift moment (pos must be within a shift window).
    while (true) {
        bumpGuard();

        const daySpec = luxonWeekdayToSpec(pos.weekday);
        const shift = getShiftForDay(shifts, daySpec);

        if (!shift) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = pos.plus({ days: 1 }).startOf("day");
            pos = jumpPastMaintenance(pos, maintenance, flags);
            continue;
        }

        const { start: shiftStart, end: shiftEnd } = shiftWindowForDate(pos, shift);

        if (pos < shiftStart) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = shiftStart;
            pos = jumpPastMaintenance(pos, maintenance, flags);
            continue;
        }

        if (pos >= shiftEnd) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = pos.plus({ days: 1 }).startOf("day");
            pos = jumpPastMaintenance(pos, maintenance, flags);
            continue;
        }

        break;
    }

    const actualStart = pos;

    // Apply working minutes (pause/resume across shift boundaries & maintenance).
    while (remaining > 0) {
        bumpGuard();

        // Always jump past maintenance before doing any work.
        pos = jumpPastMaintenance(pos, maintenance, flags);

        const daySpec = luxonWeekdayToSpec(pos.weekday);
        const shift = getShiftForDay(shifts, daySpec);

        if (!shift) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = pos.plus({ days: 1 }).startOf("day");
            continue;
        }

        const { start: shiftStart, end: shiftEnd } = shiftWindowForDate(pos, shift);

        if (pos < shiftStart) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = shiftStart;
            continue;
        }

        if (pos >= shiftEnd) {
            flags.add("SHIFT_BOUNDARY_ADJUSTMENT");
            pos = pos.plus({ days: 1 }).startOf("day");
            continue;
        }

        // Next interruption is shift end or next maintenance start, whichever is first.
        let nextInterruption = shiftEnd;
        for (const m of maintenance) {
            const mStart = parseUtcIso(m.startDate, "maintenance.startDate");
            if (mStart > pos && mStart < nextInterruption) {
                nextInterruption = mStart;
            }
        }

        const available = nextInterruption.diff(pos, "minutes").minutes;
        if (available <= 0) {
            pos = nextInterruption;
            continue;
        }

        const work = Math.min(remaining, available);
        remaining -= work;
        pos = pos.plus({ minutes: work });

        // If we land exactly on a maintenance boundary, jump immediately.
        const mi = maintenanceIntervalAt(pos, maintenance);
        if (mi && pos.equals(mi.start!)) {
            flags.add("MAINTENANCE_OVERLAP");
            pos = mi.end!;
        }
    }

    return {
        actualStart,
        end: pos,
        flags: Array.from(flags),
    };
}

/**
 * Back-compat wrapper used by your reflow service.
 */
export function calculateEndDate(
    start: DateTime,
    durationMinutes: number,
    shifts: Shift[],
    maintenance: MaintenanceWindow[],
    options: ScheduleOptions = {}
): DateTime {
    return calculateSchedule(start, durationMinutes, shifts, maintenance, options).end;
}