import { describe, it, expect } from "vitest";
import { sortWorkOrders } from "./toposort.js";
import type { WorkOrderDoc } from "./types.js";

function wo(docId: string, dependsOnWorkOrderIds: string[] = []): WorkOrderDoc {
    return {
        docId,
        docType: "workOrder",
        data: {
            workOrderNumber: docId,
            manufacturingOrderId: "MO-1",
            workCenterId: "WC-1",
            startDate: "2026-01-01T00:00:00Z",
            endDate: "2026-01-01T01:00:00Z",
            durationMinutes: 60,
            isMaintenance: false,
            dependsOnWorkOrderIds,
        },
    };
}

function ids(list: WorkOrderDoc[]): string[] {
    return list.map((x) => x.docId);
}

/**
 * Validates that `order` is a topological ordering for the given input set.
 */
function expectValidTopoOrder(input: WorkOrderDoc[], order: WorkOrderDoc[]) {
    const pos = new Map(order.map((x, i) => [x.docId, i]));

    // same elements
    expect(new Set(ids(order))).toEqual(new Set(ids(input)));

    for (const node of input) {
        const nodePos = pos.get(node.docId);
        expect(nodePos).toBeTypeOf("number");

        for (const dep of node.data.dependsOnWorkOrderIds) {
            // if dep is missing, implementation should throw before this point
            const depPos = pos.get(dep);
            expect(depPos).toBeTypeOf("number");
            expect(depPos!).toBeLessThan(nodePos!);
        }
    }
}

describe("toposort", () => {
    it("returns empty when no work orders are provided", () => {
        expect(sortWorkOrders([])).toEqual([]);
    });

    it("sorts a simple linear dependency chain", () => {
        const input = [wo("C", ["B"]), wo("B", ["A"]), wo("A")];
        const result = sortWorkOrders(input);
        expect(ids(result)).toEqual(["A", "B", "C"]);
        expectValidTopoOrder(input, result);
    });

    it("is deterministic when multiple valid orders exist (stable tie-breaking)", () => {
        // A must be first, then B/C are both eligible.
        // This test locks in *stable behavior*: keep the relative order from input
        // among nodes that become eligible at the same time.
        const input = [wo("A"), wo("C", ["A"]), wo("B", ["A"])];

        const run1 = ids(sortWorkOrders(input));
        const run2 = ids(sortWorkOrders(input));
        expect(run1).toEqual(run2);

        // With the above input ordering, stable behavior yields A, C, B
        expect(run1).toEqual(["A", "C", "B"]);
        expectValidTopoOrder(input, sortWorkOrders(input));
    });

    it("preserves input order for independent roots (stable ordering)", () => {
        const input = [wo("X"), wo("Z"), wo("Y")];
        const result = sortWorkOrders(input);
        expect(ids(result)).toEqual(["X", "Z", "Y"]);
        expectValidTopoOrder(input, result);
    });

    it("throws on missing dependency IDs", () => {
        const input = [wo("B", ["MISSING"]), wo("A")];
        expect(() => sortWorkOrders(input)).toThrow(/Invalid Dependency/i);
    });

    it("throws on cyclic dependencies", () => {
        const input = [wo("A", ["C"]), wo("B", ["A"]), wo("C", ["B"])];
        expect(() => sortWorkOrders(input)).toThrow(/circular dependency/i);
    });
});