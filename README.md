# Production Schedule Reflow Challenge

This project implements a **deterministic, capacity-aware reflow scheduler** for manufacturing work orders using a document-based input model.  
It is designed to **respect dependencies, work center constraints, shifts, and maintenance windows**, while producing a reproducible and testable schedule.

The implementation prioritizes **correctness, determinism, and test coverage** over UI or persistence concerns, per the challenge specification.

---

## High-Level Goals

The scheduler must:

- Respect **work order dependencies**
- Produce a **deterministic execution order**
- Enforce **work center capacity and sequencing**
- Respect **shift boundaries and maintenance windows**
- Detect and fail fast on **invalid or impossible schedules**
- Be fully **unit-tested and reproducible**

---

## Technology Stack

- **TypeScript**
- **Node.js (v18+)**
- **Vitest** for unit testing
- **Luxon** for timezone-safe date calculations
- **ESM (ECMAScript Modules)** output

---

## Project Structure

```
src/
├── index.ts                  # CLI entry point
├── reflow/
│   ├── reflow.service.ts     # Core reflow orchestration
│   ├── constraint-checker.ts # Capacity and constraint validation
│   ├── toposort.ts           # Deterministic dependency resolution
│   ├── types.ts              # Shared domain types
│   └── *.test.ts             # Unit tests
└── utils/
├── date-utils.ts         # Shift / maintenance–aware scheduling
└── date-utils.test.ts
```
---

## Input Model

The scheduler operates on a **document array** consisting of:

- `WorkOrderDoc`
- `WorkCenterDoc`
- `ManufacturingOrderDoc`

These documents are **untyped JSON inputs** that are validated and normalized at runtime.

Example stress-test input is provided at: `data/stress_test_docs.json`

---

## Core Algorithm Overview

The reflow process consists of **four deterministic stages**:

### 1. Dependency Resolution (Topological Sort)

- Work orders are sorted using a **stable, deterministic topological sort**
- Tie-breaking is explicit and repeatable
- Cyclic dependencies are detected and rejected
- Missing dependency IDs are treated as already-satisfied (per spec)

📄 Implemented in:  
`src/reflow/toposort.ts`

---

### 2. Constraint Validation

- Validates:
    - Work center existence
    - Capacity rules
    - Document consistency
- Fails early with explicit error messages

📄 Implemented in:  
`src/reflow/constraint-checker.ts`

---

### 3. Schedule Calculation (Shift & Maintenance Aware)

- Scheduling logic:
    - Respects **daily shifts**
    - Skips **weekends**
    - Pauses and resumes across **maintenance windows**
    - Prevents infinite loops via a **guard limit**
- Produces both:
    - `actualStart` (normalized working start)
    - `end` (final completion time)

📄 Implemented in:  
`src/utils/date-utils.ts`

---

### 4. Reflow Orchestration

- Applies the sorted order
- Assigns start/end times
- Produces a final `ReflowResult` with:
    - Schedule changes
    - Change reasons (shift snap, maintenance overlap, etc.)

📄 Implemented in:  
`src/reflow/reflow.service.ts`

---

## Determinism Guarantees

This implementation guarantees:

- Identical input → identical output
- Stable ordering when multiple valid schedules exist
- No reliance on iteration order side-effects
- Explicit tie-breaking rules

---

## Error Handling Philosophy

The scheduler **fails loudly and early** when:

- Cycles are detected
- No valid shifts exist
- Scheduling becomes impossible due to constraints
- Invalid document references are encountered

This behavior is intentional and verified via tests.

---

## Scripts

| Script | Description |
|------|-------------|
| `npm run dev` | Run CLI using tsx (no build step) |
| `npm run test` | Run full Vitest suite |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled output |

---

## Testing

The project includes **comprehensive unit tests** for:

- Topological sorting edge cases
- Constraint validation
- Shift/maintenance scheduling
- Guard-limit failure scenarios
- Determinism and reproducibility

All tests must pass before build or execution.

Run tests with:

```bash
npm run test
```

## Design Notes
- See [PROMPTS.md](./PROMPTS.md) for AI-assisted design rationale

