import { describe, it, expect } from 'vitest';
import { sortWorkOrders } from './toposort';
import { WorkOrderDoc } from './types';

// Helper to create mock WorkOrder docs
const createWO = (id: string, deps: string[] = []): WorkOrderDoc => ({
    docId: id,
    docType: "workOrder",
    data: {
        workOrderNumber: `WO-${id}`,
        manufacturingOrderId: "MO-1",
        workCenterId: "WC-1",
        startDate: "2026-01-10T08:00:00Z",
        endDate: "2026-01-10T10:00:00Z",
        durationMinutes: 120,
        isMaintenance: false,
        dependsOnWorkOrderIds: deps
    }
});

describe('toposort: sortWorkOrders', () => {
    it('should return orders in the correct sequence for simple chains', () => {
        const wo3 = createWO('3', ['2']);
        const wo1 = createWO('1', []);
        const wo2 = createWO('2', ['1']);

        const result = sortWorkOrders([wo3, wo1, wo2]);
        const ids = result.map(r => r.docId);

        expect(ids).toEqual(['1', '2', '3']);
    });

    it('should handle complex branching (diamond dependency)', () => {
        // 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4
        const wo1 = createWO('1');
        const wo2 = createWO('2', ['1']);
        const wo3 = createWO('3', ['1']);
        const wo4 = createWO('4', ['2', '3']);

        const result = sortWorkOrders([wo4, wo3, wo2, wo1]);
        const ids = result.map(r => r.docId);

        expect(ids[0]).toBe('1');
        expect(ids[3]).toBe('4');
        expect(ids).toContain('2');
        expect(ids).toContain('3');
    });

    it('should throw a clear error on a direct cycle (A -> A)', () => {
        const woA = createWO('A', ['A']);

        expect(() => sortWorkOrders([woA])).toThrow(/Circular Dependency Detected: A -> A/);
    });

    it('should throw a clear error on a deep cycle (A -> B -> C -> A)', () => {
        const woA = createWO('A', ['B']);
        const woB = createWO('B', ['C']);
        const woC = createWO('C', ['A']);

        expect(() => sortWorkOrders([woA, woB, woC])).toThrow(/Circular Dependency Detected: A -> B -> C -> A/);
    });

    it('should throw when a dependency ID does not exist', () => {
        const woA = createWO('A', ['MISSING_ID']);

        expect(() => sortWorkOrders([woA])).toThrow(/Invalid Dependency: WorkOrder "MISSING_ID" is referenced/);
    });

    it('should handle disconnected graphs', () => {
        const wo1 = createWO('1');
        const wo2 = createWO('2');

        const result = sortWorkOrders([wo1, wo2]);
        expect(result.length).toBe(2);
        expect(result.map(r => r.docId)).toContain('1');
        expect(result.map(r => r.docId)).toContain('2');
    });
});