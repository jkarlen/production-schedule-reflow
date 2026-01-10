import fs from 'fs';
import { performance } from 'perf_hooks';
import { ReflowService } from './reflow/reflow.service';
import { ConstraintChecker } from './reflow/constraint-checker';
import { AnyDoc } from './reflow/types';

async function main() {
    const inputPath = './data/stress_test_docs.json';
    const outputPath = './data/stress_test_docs.reflowed.json';

    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Error: Input file not found at ${inputPath}`);
        process.exit(1);
    }

    // 1. Load Data
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const docs: AnyDoc[] = JSON.parse(rawData);

    const workCenters = docs.filter(d => d.docType === "workCenter");
    const workOrders = docs.filter(d => d.docType === "workOrder");

    console.log('-------------------------------------------');
    console.log('🏭 Production Schedule Reflow Engine');
    console.log(`📊 Input: ${workCenters.length} Work Centers, ${workOrders.length} Work Orders`);
    console.log('-------------------------------------------');

    // 2. Run Reflow
    const startTime = performance.now();
    const service = new ReflowService(docs);

    let result;
    try {
        result = service.reflow();
    } catch (err: any) {
        console.error(`❌ Reflow Logic Error: ${err.message}`);
        process.exit(1);
    }
    const endTime = performance.now();

    // 3. Post-Reflow Validation
    try {
        const allDocsAfterReflow: AnyDoc[] = [
            ...docs.filter(d => d.docType !== "workOrder"),
            ...result.updatedWorkOrders
        ];
        ConstraintChecker.validate(allDocsAfterReflow);
        console.log('✅ Validation Passed: No capacity or dependency conflicts.');
    } catch (err: any) {
        console.error(`❌ Post-Reflow Validation Failed: ${err.message}`);
        process.exit(1);
    }

    // 4. Print Metrics
    const runtimeMs = (endTime - startTime).toFixed(2);
    const totalMovedMinutes = result.metadata.totalDelaysIncurredMinutes;

    console.log(`⏱️  Runtime: ${runtimeMs} ms`);
    console.log(`🔄 Changes: ${result.changes.length} Work Orders rescheduled`);
    console.log(`📉 Impact: ${totalMovedMinutes.toLocaleString()} total minutes of delay introduced`);

    // 5. Save Output
    try {
        const outputDocs: AnyDoc[] = [
            ...docs.filter(d => d.docType !== "workOrder"),
            ...result.updatedWorkOrders
        ];
        fs.writeFileSync(outputPath, JSON.stringify(outputDocs, null, 2));
        console.log(`💾 Results written to: ${outputPath}`);
    } catch (err: any) {
        console.error(`❌ Error writing output file: ${err.message}`);
        process.exit(1);
    }

    console.log('-------------------------------------------');
    console.log('🚀 Reflow process completed successfully.');
}

main().catch((err) => {
    console.error('💥 Fatal Unhandled Error:', err);
    process.exit(1);
});