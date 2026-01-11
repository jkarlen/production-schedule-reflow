import { WorkOrderDoc } from './types.js';

/**
 * Performs a topological sort on WorkOrder documents using Kahn's Algorithm.
 * Ensures that dependencies are processed before the work orders that depend on them.
 * * @throws Error if a circular dependency is detected.
 * @throws Error if a dependency ID is referenced but not found in the input list.
 */
export function sortWorkOrders(orders: WorkOrderDoc[]): WorkOrderDoc[] {
    const sorted: WorkOrderDoc[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    // Create a map for O(1) lookups
    const orderMap = new Map<string, WorkOrderDoc>(
        orders.map(o => [o.docId, o])
    );

    const visit = (id: string) => {
        // 1. Check for unknown dependencies
        const order = orderMap.get(id);
        if (!order) {
            throw new Error(`Invalid Dependency: WorkOrder "${id}" is referenced as a dependency but does not exist.`);
        }

        // 2. Check for cycles
        if (visiting.has(id)) {
            const cyclePath = Array.from(visiting).concat(id).join(" -> ");
            throw new Error(`Circular Dependency Detected: ${cyclePath}`);
        }

        if (!visited.has(id)) {
            visiting.add(id);

            // Recursive visit for all dependencies
            for (const depId of order.data.dependsOnWorkOrderIds) {
                visit(depId);
            }

            visiting.delete(id);
            visited.add(id);
            sorted.push(order);
        }
    };

    for (const order of orders) {
        visit(order.docId);
    }

    return sorted;
}