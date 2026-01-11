# AI Prompting Notes (Design & Validation)

This repository was developed with the assistance of large language models (LLMs) as **design collaborators**, not code generators.  
The prompts below document how AI was used to **clarify requirements, validate edge cases, and pressure-test algorithmic decisions**, in line with modern engineering workflows.

No code was accepted blindly; all outputs were reviewed, adapted, and covered by unit tests.

---

## Prompt 1: Clarifying the Scheduling Problem

**Purpose:**  
Establish a correct mental model for the reflow problem before writing code.

**Prompt:**
> I’m implementing a production schedule reflow engine.  
> Given work orders with dependencies, work centers with capacity, shifts, and maintenance windows, what are the core algorithmic steps you would expect in a correct solution?

**Outcome:**
- Confirmed need for:
    - Topological sort
    - Deterministic ordering
    - Explicit failure modes
    - Shift-aware time math
- Helped validate overall architecture before implementation

---

## Prompt 2: Deterministic Topological Sort

**Purpose:**  
Ensure reproducible scheduling when multiple valid dependency orders exist.

**Prompt:**
> In a topological sort where multiple nodes have zero in-degree, what deterministic tie-breaking strategies are appropriate for production systems?

**Outcome:**
- Identified acceptable strategies:
    - Lexicographic ordering
    - Original input order
- Resulted in explicit, test-locked tie-breaking logic

---

## Prompt 3: Handling Invalid or Missing Dependencies

**Purpose:**  
Resolve ambiguity in the challenge spec around missing dependency IDs.

**Prompt:**
> If a work order references a dependency that doesn’t exist in the input set, should a scheduler fail or treat it as already satisfied?

**Outcome:**
- Evaluated both approaches
- Selected “treat as satisfied” to align with resilience and spec intent
- Added explicit tests to lock behavior

---

## Prompt 4: Shift and Maintenance Scheduling Semantics

**Purpose:**  
Validate pause/resume behavior around shifts and maintenance windows.

**Prompt:**
> When scheduling work across shifts and maintenance windows, what are the common failure modes that lead to infinite loops or incorrect end times?

**Outcome:**
- Identified need for:
    - Guard limits
    - Defensive time advancement
    - Exact-boundary handling
- Directly informed `date-utils.ts` design and tests

---

## Prompt 5: Guard Limits and Impossible Schedules

**Purpose:**  
Decide how to handle schedules that can never complete.

**Prompt:**
> How should a scheduling engine behave if maintenance windows or shifts make it impossible to ever complete a task?

**Outcome:**
- Chose explicit failure over silent completion
- Implemented guard counter + descriptive error
- Added unit test verifying failure behavior

---

## Prompt 6: Test Coverage Expectations

**Purpose:**  
Ensure the implementation met professional testing standards.

**Prompt:**
> For a scheduling engine like this, which components must be unit-tested independently to demonstrate correctness?

**Outcome:**
- Confirmed need for tests on:
    - Topological sorting
    - Constraint validation
    - Date math
    - Reflow orchestration
- Resulted in full test coverage across all core modules

---

## Summary

AI was used as a **design sounding board**, not an authority.  
All logic decisions were:

- Explicitly documented
- Backed by unit tests
- Verified through deterministic behavior

This reflects a real-world senior engineering workflow where AI accelerates reasoning but does not replace it.