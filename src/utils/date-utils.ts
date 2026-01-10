import { DateTime, Interval } from 'luxon';

export interface Shift {
    dayOfWeek: number;
    startHour: number;
    endHour: number;
}

export interface MaintenanceWindow {
    startDate: string;
    endDate: string;
}

/**
 * Calculates the completion date for a task, accounting for shift hours,
 * weekends, and maintenance windows. Logic follows a "pause/resume" pattern.
 */
export function calculateEndDate(
    start: DateTime,
    durationMinutes: number,
    shifts: Shift[],
    maintenance: MaintenanceWindow[]
): DateTime {
    let remainingMinutes = durationMinutes;
    let currentPos = start;

    // 1. If start is inside maintenance, jump to end of maintenance
    for (const m of maintenance) {
        const mInterval = Interval.fromDateTimes(DateTime.fromISO(m.startDate).toUTC(), DateTime.fromISO(m.endDate).toUTC());
        if (mInterval.contains(currentPos) || currentPos.equals(mInterval.start!)) {
            currentPos = mInterval.end!;
        }
    }

    while (remainingMinutes > 0) {
        const shift = shifts.find(s => s.dayOfWeek === currentPos.weekday);
        const shiftStart = currentPos.set({ hour: shift?.startHour ?? 0, minute: 0, second: 0, millisecond: 0 });
        const shiftEnd = currentPos.set({ hour: shift?.endHour ?? 0, minute: 0, second: 0, millisecond: 0 });

        // 2. If outside shift hours or weekend, move to start of next available shift
        if (!shift || currentPos < shiftStart || currentPos >= shiftEnd) {
            if (!shift || currentPos >= shiftEnd) {
                currentPos = currentPos.plus({ days: 1 }).set({ hour: 0, minute: 0 });
            } else {
                currentPos = shiftStart;
            }
            continue;
        }

        // 3. Determine time available in current shift before any maintenance
        let nextInterruption = shiftEnd;
        for (const m of maintenance) {
            const mStart = DateTime.fromISO(m.startDate).toUTC();
            if (mStart > currentPos && mStart < nextInterruption) {
                nextInterruption = mStart;
            }
        }

        const availableMinutes = nextInterruption.diff(currentPos, 'minutes').minutes;
        const workToApply = Math.min(remainingMinutes, availableMinutes);

        remainingMinutes -= workToApply;
        currentPos = currentPos.plus({ minutes: workToApply });

        // 4. If we hit maintenance, jump to the end of it
        for (const m of maintenance) {
            const mInterval = Interval.fromDateTimes(DateTime.fromISO(m.startDate).toUTC(), DateTime.fromISO(m.endDate).toUTC());
            if (currentPos.equals(mInterval.start!)) {
                currentPos = mInterval.end!;
            }
        }
    }

    return currentPos;
}