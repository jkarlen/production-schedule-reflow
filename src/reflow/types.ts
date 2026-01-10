export type DocType = "workOrder" | "workCenter" | "manufacturingOrder";

/**
 * CORE DOCUMENT SHAPES
 */

export interface WorkOrderDoc {
  docId: string;
  docType: "workOrder";
  data: {
    workOrderNumber: string;
    manufacturingOrderId: string;
    workCenterId: string;
    startDate: string; // ISO-8601 UTC
    endDate: string;   // ISO-8601 UTC
    durationMinutes: number;
    isMaintenance: boolean;
    dependsOnWorkOrderIds: string[];
  };
}

export interface WorkCenterDoc {
  docId: string;
  docType: "workCenter";
  data: {
    name: string;
    shifts: {
      dayOfWeek: number; // 1 (Mon) - 7 (Sun)
      startHour: number;
      endHour: number;
    }[];
    maintenanceWindows: {
      startDate: string; // ISO-8601 UTC
      endDate: string;   // ISO-8601 UTC
      reason?: string;
    }[];
  };
}

export interface ManufacturingOrderDoc {
  docId: string;
  docType: "manufacturingOrder";
  data: {
    manufacturingOrderNumber: string;
    itemId: string;
    quantity: number;
    dueDate: string; // ISO-8601 UTC
  };
}

export type AnyDoc = WorkOrderDoc | WorkCenterDoc | ManufacturingOrderDoc;

/**
 * REFLOW OPERATION TYPES
 */

export type ChangeReason =
    | "DEPENDENCY_DELAY"
    | "CAPACITY_CONFLICT"
    | "MAINTENANCE_OVERLAP"
    | "SHIFT_BOUNDARY_ADJUSTMENT"
    | "MANUFACTURING_ORDER_PRIORITY";

export interface ScheduleChange {
  workOrderId: string;
  workOrderNumber: string;
  previousStartDate: string;
  previousEndDate: string;
  newStartDate: string;
  newEndDate: string;
  reasons: ChangeReason[];
  affectedByDocId?: string; // e.g., the ID of the WorkCenter or WorkOrder that caused the shift
}

export interface ReflowInput {
  allDocuments: AnyDoc[];
  targetWorkOrderId?: string; // Optional: trigger reflow starting from a specific point
  anchorDate?: string;        // Optional: do not move jobs before this date
}

export interface ReflowResult {
  updatedWorkOrders: WorkOrderDoc[];
  changes: ScheduleChange[];
  explanation: string;
  metadata: {
    totalOrdersProcessed: number;
    totalDelaysIncurredMinutes: number;
    timestamp: string;
  };
}