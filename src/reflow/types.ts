export type DocType = "workOrder" | "workCenter" | "manufacturingOrder";

/**
 * Core document envelope
 */
export interface BaseDoc<TDocType extends DocType, TData> {
  docId: string;
  docType: TDocType;
  data: TData;
}

/**
 * SPEC-COMPLIANT SHIFT MODEL
 * Spec: dayOfWeek 0-6, Sunday = 0
 */
export interface Shift {
  dayOfWeek: number; // 0-6, Sunday=0
  startHour: number; // 0-23
  endHour: number;   // 0-23 (assumes same-day shift, endHour > startHour)
}

export interface MaintenanceWindow {
  startDate: string; // ISO-8601 UTC
  endDate: string;   // ISO-8601 UTC
  reason?: string;
}

/**
 * Document shapes
 */
export type WorkOrderDoc = BaseDoc<
    "workOrder",
    {
      workOrderNumber: string;
      manufacturingOrderId: string;
      workCenterId: string;

      startDate: string; // ISO-8601 UTC
      endDate: string;   // ISO-8601 UTC
      durationMinutes: number;

      isMaintenance: boolean; // fixed/pinned if true
      dependsOnWorkOrderIds: string[]; // all must complete before start
    }
>;

export type WorkCenterDoc = BaseDoc<
    "workCenter",
    {
      name: string;
      shifts: Shift[];
      maintenanceWindows: MaintenanceWindow[];
    }
>;

export type ManufacturingOrderDoc = BaseDoc<
    "manufacturingOrder",
    {
      manufacturingOrderNumber: string;
      itemId: string;
      quantity: number;
      dueDate: string; // ISO-8601 UTC
    }
>;

export type AnyDoc = WorkOrderDoc | WorkCenterDoc | ManufacturingOrderDoc;

/**
 * Reflow output types
 */
export type ChangeReason =
    | "DEPENDENCY_DELAY"
    | "CAPACITY_CONFLICT"
    | "MAINTENANCE_OVERLAP"
    | "SHIFT_BOUNDARY_ADJUSTMENT"
    | "MANUFACTURING_ORDER_PRIORITY"; // reserved / @upgrade

export interface ScheduleChange {
  workOrderId: string;
  workOrderNumber: string;
  previousStartDate: string;
  previousEndDate: string;
  newStartDate: string;
  newEndDate: string;
  reasons: ChangeReason[];
  affectedByDocId?: string;
}

export interface ReflowInput {
  /**
   * Optional: only reflow a particular work order and all downstream dependents.
   * If omitted, reflow the entire set.
   */
  targetWorkOrderId?: string;

  /**
   * Optional: jobs whose original start is strictly before this date are treated as pinned blocks
   * (i.e., we will not move them earlier/later; we schedule around them).
   */
  anchorDate?: string; // ISO-8601 UTC
}

export interface ReflowResult {
  updatedWorkOrders: WorkOrderDoc[];
  changes: ScheduleChange[];
  explanation: string;
  metadata: {
    totalOrdersProcessed: number;
    totalDelaysIncurredMinutes: number;
    timestamp: string; // ISO-8601 UTC
  };
}