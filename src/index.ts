import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AnyDoc, WorkCenterDoc, WorkOrderDoc, ManufacturingOrderDoc } from "./reflow/types.js";
import { ReflowService } from "./reflow/reflow.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type StressTestDocFile = {
    workCenters: WorkCenterDoc[];
    workOrders: WorkOrderDoc[];
    manufacturingOrders: ManufacturingOrderDoc[];
};

function loadDocsFromJson(relPath: string): AnyDoc[] {
    const fullPath = path.join(__dirname, "..", relPath);
    const raw = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(raw) as StressTestDocFile;

    if (
        !parsed ||
        !Array.isArray(parsed.workCenters) ||
        !Array.isArray(parsed.workOrders) ||
        !Array.isArray(parsed.manufacturingOrders)
    ) {
        throw new Error(
            `Unexpected JSON shape. Expected {workCenters, workOrders, manufacturingOrders} arrays. Got keys: ${
                parsed ? Object.keys(parsed).join(", ") : "null"
            }`
        );
    }

    return [
        ...parsed.workCenters,
        ...parsed.workOrders,
        ...parsed.manufacturingOrders,
    ];
}

function main() {
    const docs = loadDocsFromJson("data/stress_test_docs.json");

    const reflow = new ReflowService(docs);
    const result = reflow.reflow();

    console.log(JSON.stringify(result, null, 2));
}

main();