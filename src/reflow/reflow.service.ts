import { DateTime } from 'luxon';
import {
    AnyDoc,
    WorkOrderDoc,
    WorkCenterDoc,
    ReflowResult,
    ScheduleChange,
    ChangeReason
} from './types';
import { sortWorkOrders } from './toposort';
import { calculateEndDate } from '../utils/date-utils';

export class ReflowService {
    private formatUtc(dt: DateTime): string {
        const s = dt.toUTC().toISO({ suppressMilliseconds: true });
        if (!s) throw new Error('Failed to format DateTime to ISO string');
        return s;
    }

    private workOrders: WorkOrderDoc[];
    private workCenters: Map<string, WorkCenterDoc>;
    // Tracks the next available timestamp per Work Center in UTC
    private workCenterAvailability: Map<string, DateTime> = new Map();
    // Tracks the end dates of processed Work Orders for dependency resolution
    private completedOrdersEndDates: Map<string, DateTime> = new Map();

    constructor(documents: AnyDoc[]) {
        this.workOrders = documents.filter((d): d is WorkOrderDoc => d.docType === "workOrder");
        const centers = documents.filter((d): d is WorkCenterDoc => d.docType === "workCenter");
        this.workCenters = new Map(centers.map(wc => [wc.docId, wc]));
    }

    /**
     * Deterministically reflows the schedule.
     * Logic: Topological sort -> Greedy placement in next available valid slot.
     */
    public reflow(): ReflowResult {
        const startTime = DateTime.now().toUTC();
        const sortedOrders = sortWorkOrders(this.workOrders);
        const updatedWorkOrders: WorkOrderDoc[] = [];
        const changes: ScheduleChange[] = [];

        for (const wo of sortedOrders) {
            const originalStart = DateTime.fromISO(wo.data.startDate).toUTC();
            const originalEnd = DateTime.fromISO(wo.data.endDate).toUTC();

            // 1. Skip logic for Fixed Maintenance Work Orders
            if (wo.data.isMaintenance) {
                this.updateAvailability(wo.data.workCenterId, DateTime.fromISO(wo.data.endDate).toUTC());
                this.completedOrdersEndDates.set(wo.docId, DateTime.fromISO(wo.data.endDate).toUTC());
                updatedWorkOrders.push(wo);
                continue;
            }

            const wc = this.workCenters.get(wo.data.workCenterId);
            if (!wc) throw new Error(`WorkCenter ${wo.data.workCenterId} not found for ${wo.docId}`);

            // 2. Determine earliest possible start
            // Earliest = MAX(Original Start, End of all Dependencies, WorkCenter availability)
            let earliestStart = originalStart;
            let reason: ChangeReason[] = [];

            // Check Dependencies
            for (const depId of wo.data.dependsOnWorkOrderIds) {
                const depEnd = this.completedOrdersEndDates.get(depId);
                if (depEnd && depEnd > earliestStart) {
                    earliestStart = depEnd;
                    reason.push("DEPENDENCY_DELAY");
                }
            }

            // Check Work Center Availability
            const nextFree = this.workCenterAvailability.get(wo.data.workCenterId) || earliestStart;
            if (nextFree > earliestStart) {
                earliestStart = nextFree;
                reason.push("CAPACITY_CONFLICT");
            }

            // 3. Calculate actual End Date using Shift and Maintenance constraints
            const newEndDate = calculateEndDate(
                earliestStart,
                wo.data.durationMinutes,
                wc.data.shifts,
                wc.data.maintenanceWindows
            );

            // 4. Record Changes if dates shifted
            if (!earliestStart.equals(originalStart) || !newEndDate.equals(originalEnd)) {
                changes.push({
                    workOrderId: wo.docId,
                    workOrderNumber: wo.data.workOrderNumber,
                    previousStartDate: wo.data.startDate,
                    previousEndDate: wo.data.endDate,
                    newStartDate: this.formatUtc(earliestStart),
                    newEndDate: this.formatUtc(newEndDate),
                    reasons: reason.length > 0 ? [...new Set(reason)] : ["SHIFT_BOUNDARY_ADJUSTMENT"]
                });
            }

            // 5. Update State
            const updatedWO: WorkOrderDoc = {
                ...wo,
                data: {
                    ...wo.data,
                    startDate: this.formatUtc(earliestStart),
                    endDate: this.formatUtc(newEndDate)
                }
            };

            updatedWorkOrders.push(updatedWO);
            this.updateAvailability(wo.data.workCenterId, newEndDate);
            this.completedOrdersEndDates.set(wo.docId, newEndDate);
        }

        return {
            updatedWorkOrders,
            changes,
            explanation: `Reflowed ${updatedWorkOrders.length} orders. Generated ${changes.length} adjustments.`,
            metadata: {
                totalOrdersProcessed: updatedWorkOrders.length,
                totalDelaysIncurredMinutes: this.calculateTotalDelay(changes),
                timestamp: this.formatUtc(DateTime.now())
            }
        };
    }

    private updateAvailability(wcId: string, time: DateTime) {
        const current = this.workCenterAvailability.get(wcId);
        if (!current || time > current) {
            this.workCenterAvailability.set(wcId, time);
        }
    }

    private calculateTotalDelay(changes: ScheduleChange[]): number {
        return changes.reduce((acc, change) => {
            const oldStart = DateTime.fromISO(change.previousStartDate, { setZone: true }).toUTC();
            const newStart = DateTime.fromISO(change.newStartDate, { setZone: true }).toUTC();
            const diff = newStart.diff(oldStart, 'minutes').minutes;
            return acc + (diff > 0 ? diff : 0);
        }, 0);
    }
}