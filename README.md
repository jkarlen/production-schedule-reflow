# Production Schedule Reflow Challenge

This tool handles capacity-constrained rescheduling for manufacturing work orders using a document-based data model.

## Prerequisites
- Node.js (v18+)
- npm / yarn

## Setup
1. `npm install`
2. Place your stress test data in `data/stress_test_docs.json`.

## Scripts
- `npm run dev`: Run the CLI tool using tsx.
- `npm run test`: Run Vitest test suite.
- `npm run build`: Compile TypeScript to JS.
- `npm run start`: Run compiled code.

## Core Logic
The reflow algorithm utilizes:
1. **Topological Sort**: To ensure dependency chains are honored.
2. **Finite Capacity Logic**: To prevent work center over-scheduling.
3. **Shift Awareness**: Using Luxon to respect Mon-Fri UTC boundaries.