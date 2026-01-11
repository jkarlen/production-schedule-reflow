import { describe, it, expect } from "vitest";
import { sortWorkOrders } from "./toposort.js";
import type { WorkOrderDoc } from "./types.js";

function wo(
    id: string,
    dependsOnWorkOrderIds: string[] = [],
    overrides?: Partial<WorkOrderDoc["data"]>
): WorkOrderDoc {
    return {
        docId: id,
        docType: "workOrder",
        data: {
            workOrderNumber: `WO-${id}`,
            manufacturingOrderId: "MO-1",
            workCenterId: "WC-1",
            startDate: "2026-01-06T08:00:00Z",
            endDate: "2026-01-06T09:00:00Z",
            durationMinutes: 60,
            isMaintenance: false,
            dependsOnWorkOrderIds,
            ...overrides,
        },
    };
}

describe("toposort", () => {
    it("returns empty array for empty input", () => {
        expect(sortWorkOrders([])).toEqual([]);
    });

    it("keeps single item", () => {
        const input = [wo("A")];
        const out = sortWorkOrders(input);
        expect(out.map((x) => x.docId)).toEqual(["A"]);
    });

    it("orders linear dependencies A -> B -> C", () => {
        const input = [wo("C", ["B"]), wo("A"), wo("B", ["A"])];
        const out = sortWorkOrders(input);
        expect(out.map((x) => x.docId)).toEqual(["A", "B", "C"]);
    });

    it("orders a diamond: A -> (B,C) -> D", () => {
        const input = [wo("D", ["B", "C"]), wo("C", ["A"]), wo("B", ["A"]), wo("A")];
        const out = sortWorkOrders(input);
        const ids = out.map((x) => x.docId);

        expect(ids.indexOf("A")).toBeLessThan(ids.indexOf("B"));
        expect(ids.indexOf("A")).toBeLessThan(ids.indexOf("C"));
        expect(ids.indexOf("B")).toBeLessThan(ids.indexOf("D"));
        expect(ids.indexOf("C")).toBeLessThan(ids.indexOf("D"));
    });

    it("is deterministic when multiple valid orders exist (stable tie-breaking)", () => {
        // No deps between B and C; both depend on A.
        const input = [wo("C", ["A"]), wo("B", ["A"]), wo("A")];

        const out1 = sortWorkOrders(input).map((x) => x.docId);
        const out2 = sortWorkOrders(input).map((x) => x.docId);

        // determinism is the key property
        expect(out1).toEqual(out2);

        // lock in the CURRENT tie-break behavior your algorithm produces
        // (today this is ["A","C","B"])
        expect(out1).toEqual(["A", "C", "B"]);
    });

    it("throws on missing dependency IDs", () => {
        const input = [wo("B", ["MISSING"]), wo("A")];
        expect(() => sortWorkOrders(input)).toThrow(/Invalid Dependency/i);
    });

    it("throws on a simple cycle A <-> B", () => {
        const input = [wo("A", ["B"]), wo("B", ["A"])];
        expect(() => sortWorkOrders(input)).toThrow(/cycle|circular/i);
    });

    it("throws on a longer cycle A -> B -> C -> A", () => {
        const input = [wo("A", ["C"]), wo("B", ["A"]), wo("C", ["B"])];
        expect(() => sortWorkOrders(input)).toThrow(/cycle|circular/i);
    });
});