import { DateTime, Interval } from 'luxon';
import { WorkOrderDoc, WorkCenterDoc, AnyDoc } from './types';

export class ConstraintChecker {
    /**
     * Validates that a set of documents complies with all manufacturing constraints.
     * Throws an error if any constraint is violated.
     */
    static validate(documents: AnyDoc[]): void {
        const workOrders = documents.filter((d): d is WorkOrderDoc => d.docType === "workOrder");
        const workCenters = documents.filter((d): d is WorkCenterDoc => d.docType === "workCenter");
        const woMap = new Map(workOrders.map(wo => [wo.docId, wo]));
        const wcMap = new Map(workCenters.map(wc => [wc.docId, wc]));

        for (const wo of workOrders) {
            const currentInterval = this.toInterval(wo.data.startDate, wo.data.endDate, wo.docId);

            // 1. Dependency Timing: Parent End <= Child Start
            for (const parentId of wo.data.dependsOnWorkOrderIds) {
                const parent = woMap.get(parentId);
                if (parent) {
                    const parentEnd = DateTime.fromISO(parent.data.endDate, { zone: 'utc' });
                    const childStart = DateTime.fromISO(wo.data.startDate, { zone: 'utc' });
                    if (childStart < parentEnd) {
                        throw new Error(`Dependency Violation: ${wo.docId} starts before parent ${parentId} ends.`);
                    }
                }
            }

            // 2. Work Center Overlaps (Resource Conflict)
            const sameCenterOrders = workOrders.filter(
                other => other.data.workCenterId === wo.data.workCenterId && other.docId !== wo.docId
            );
            for (const other of sameCenterOrders) {
                const otherInterval = this.toInterval(other.data.startDate, other.data.endDate, other.docId);
                if (currentInterval.overlaps(otherInterval)) {
                    throw new Error(`Capacity Conflict: ${wo.docId} and ${other.docId} overlap on ${wo.data.workCenterId}`);
                }
            }

            // 3. Static Maintenance Window Overlaps
            const wc = wcMap.get(wo.data.workCenterId);
            if (wc?.data.maintenanceWindows) {
                for (const mw of wc.data.maintenanceWindows) {
                    const mwInterval = this.toInterval(mw.startDate, mw.endDate, "Maintenance Window");
                    if (currentInterval.overlaps(mwInterval)) {
                        throw new Error(`Maintenance Conflict: ${wo.docId} overlaps with fixed maintenance on ${wo.data.workCenterId}`);
                    }
                }
            }
        }
    }

    private static toInterval(start: string, end: string, context: string): Interval {
        const s = DateTime.fromISO(start, { zone: 'utc' });
        const e = DateTime.fromISO(end, { zone: 'utc' });

        if (!s.isValid || !e.isValid) {
            throw new Error(`Invalid Date format in ${context}`);
        }
        if (e < s) {
            throw new Error(`Logic Error: End date before start date in ${context}`);
        }

        return Interval.fromDateTimes(s, e);
    }
}