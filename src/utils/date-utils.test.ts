import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { calculateEndDate, Shift, MaintenanceWindow } from './date-utils';

const standardShifts: Shift[] = [
    { dayOfWeek: 1, startHour: 8, endHour: 17 },
    { dayOfWeek: 2, startHour: 8, endHour: 17 },
    { dayOfWeek: 3, startHour: 8, endHour: 17 },
    { dayOfWeek: 4, startHour: 8, endHour: 17 },
    { dayOfWeek: 5, startHour: 8, endHour: 17 },
];

describe('date-utils: calculateEndDate', () => {
    // 1) Shift boundary pause/resume
    it('should pause at end of shift and resume next morning', () => {
        const start = DateTime.fromISO('2026-01-12T16:00:00Z').toUTC(); // Monday
        const duration = 120; // 2 hours
        const result = calculateEndDate(start, duration, standardShifts, []);

        // 1 hr Monday (16:00-17:00), 1 hr Tuesday (08:00-09:00)
        expect(result.toISO()).toBe('2026-01-13T09:00:00.000Z');
    });

    // 2) Start outside shift
    it('should snap to shift start if initial start is before hours', () => {
        const start = DateTime.fromISO('2026-01-12T06:00:00Z').toUTC(); // Monday early
        const duration = 60;
        const result = calculateEndDate(start, duration, standardShifts, []);

        // Starts at 08:00, finishes at 09:00
        expect(result.toISO()).toBe('2026-01-12T09:00:00.000Z');
    });

    // 3) Start inside maintenance
    it('should wait for maintenance to finish if start is inside window', () => {
        const start = DateTime.fromISO('2026-01-12T10:30:00Z').toUTC();
        const maintenance: MaintenanceWindow[] = [
            { startDate: '2026-01-12T10:00:00Z', endDate: '2026-01-12T12:00:00Z' }
        ];
        const duration = 60;
        const result = calculateEndDate(start, duration, standardShifts, maintenance);

        // Starts at 12:00, ends at 13:00
        expect(result.toISO()).toBe('2026-01-12T13:00:00.000Z');
    });

    // 4) Maintenance splitting
    it('should split work around a maintenance window mid-job', () => {
        const start = DateTime.fromISO('2026-01-12T09:30:00Z').toUTC();
        const duration = 180; // 3 hours
        const maintenance: MaintenanceWindow[] = [
            { startDate: '2026-01-12T10:00:00Z', endDate: '2026-01-12T12:00:00Z' }
        ];
        const result = calculateEndDate(start, duration, standardShifts, maintenance);

        // 09:30-10:00 (30m) -> Maintenance (2h) -> 12:00-14:30 (150m)
        expect(result.toISO()).toBe('2026-01-12T14:30:00.000Z');
    });

    // 5) Weekend skip
    it('should skip weekends correctly', () => {
        const start = DateTime.fromISO('2026-01-16T16:00:00Z').toUTC(); // Friday
        const duration = 120; // 2 hours
        const result = calculateEndDate(start, duration, standardShifts, []);

        // 1 hr Friday (16:00-17:00), skips Sat/Sun, 1 hr Monday (08:00-09:00)
        expect(result.toISO()).toBe('2026-01-19T09:00:00.000Z');
    });
});