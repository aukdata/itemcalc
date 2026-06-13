# ItemCalc Technical Specification

## 1. Scope

This document defines the implementation environment and selected technologies
for ItemCalc.

Related documents:

- `SPEC.md`: product requirements and calculation rules
- `DESIGN.md`: domain model and calculation engine design

## 2. Application Form

The first release is a client-side web application.

- No application server is required
- Calculation runs locally in the browser
- Project data is stored locally in IndexedDB
- Projects can be imported and exported as versioned JSON files
- Production deployment consists of static files

A Tauri desktop package may be added later. The domain and calculation packages
must not depend on browser APIs so they can be reused by a desktop application.

## 3. Runtime and Package Management

| Component | Selection | Version policy |
| --- | --- | --- |
| Node.js | Node.js LTS | `24.x` |
| Package manager | pnpm | `11.x` |
| Language | TypeScript | latest compatible `5.x` |
| Module system | ECMAScript Modules | ESM only |

Node.js 24 is the active LTS line at the time of this decision.

The exact pnpm version must be recorded in the `packageManager` field of
`package.json`. Node.js must be constrained by the `engines` field and an
`.nvmrc` or equivalent version file.

Conceptual example (`<exact-pnpm-version>` is replaced when scaffolding):

```json
{
  "packageManager": "pnpm@<exact-pnpm-version>",
  "engines": {
    "node": ">=24 <25",
    "pnpm": ">=11 <12"
  }
}
```

The generated lockfile must be committed. CI must use frozen lockfile installs.

## 4. Application Stack

| Area | Selection | Major line |
| --- | --- | --- |
| UI framework | React | `19.x` |
| Build tool | Vite | `8.x` |
| Graph editor | React Flow (`@xyflow/react`) | `12.x` |
| State management | Zustand | latest compatible major |
| Runtime validation | Zod | `4.x` |
| Local database | Dexie | latest compatible major |
| LP solver | `highs` (highs-js package) | version matching a supported HiGHS release |
| Unit tests | Vitest | Vite-compatible major |
| Component tests | Testing Library | latest compatible major |
| Browser tests | Playwright | latest stable major |
| Linting | ESLint | latest compatible major |
| Formatting | Prettier | latest stable major |

Exact package versions are selected when the project is scaffolded and then
fixed by `pnpm-lock.yaml`.

## 5. TypeScript Configuration

TypeScript strict mode is required.

Minimum compiler policy:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true
  }
}
```

Domain data must not use `any`.
Untrusted data from JSON, IndexedDB migrations, and worker messages must be
validated with Zod before use.

## 6. Architecture

The application is divided into packages by responsibility.

```text
src/
  app/
    routes/
    layout/
    providers/

  features/
    editor/
    process-form/
    targets/
    results/
    project-files/

  domain/
    material/
    process/
    production-line/
    schemas/

  calculation/
    validate/
    normalize/
    build-linear-model/
    optimize/
    distribute/
    derive-results/
    verify-results/

  solver/
    linear-solver.ts
    highs-adapter.ts

  workers/
    calculation.worker.ts
    calculation-client.ts

  persistence/
    database.ts
    repositories/
    migrations/

  shared/
    components/
    formatting/
    ids/
    units/
```

Dependency direction:

```text
UI -> application features -> domain/calculation -> solver interface
                              -> persistence interface
```

Rules:

- `domain/` must not import React, Dexie, browser APIs, or `highs`
- `calculation/` must be callable from Node.js tests without a DOM
- `solver/` hides `highs`-specific types behind `LinearSolver`
- `persistence/` stores authored data, not authoritative calculated data
- UI graph objects must be converted to domain objects before calculation

## 7. UI and Graph Editing

React Flow provides the production-line canvas.

Node types:

- Process node
- External input node
- Target output node
- Disposal node

React Flow nodes and edges are presentation data. The calculation engine uses
the `ProductionLine` and `MaterialNetwork` structures defined in `DESIGN.md`.

The editor compiler converts visible edges into material networks before
validation and calculation.

State ownership:

- Zustand stores the current project and editor state
- React local state stores temporary UI interaction state
- Calculated results are cached separately from authored project data
- Undo and redo operate on authored project commands or snapshots

## 8. Calculation Execution

The calculation engine runs in a dedicated Web Worker.

Reasons:

- WebAssembly solver initialization does not block the UI
- Large cyclic graphs do not freeze editor interactions
- Worker messages form a clear calculation API boundary

Worker request:

```ts
interface CalculationRequest {
  requestId: string;
  line: ProductionLine;
}
```

Worker response:

```ts
interface CalculationResponse {
  requestId: string;
  result: CalculationResult;
}
```

Both message structures must have Zod schemas.

Only the latest request result should update the UI. Older responses are
discarded by comparing `requestId`.

## 9. Solver

The selected solver is the npm package `highs`, which provides highs-js, a
WebAssembly build of HiGHS.

The application only requires continuous linear programming for the first
version. Integer machine counts are derived by ceiling after solving and are
not solver variables.

The adapter must support:

- Continuous nonnegative variables
- Equality and bounded constraints
- Minimize objectives
- Infeasible and unbounded statuses
- Repeated solves for lexicographic optimization

The rest of the application must depend on:

```ts
interface LinearSolver {
  solve(model: LinearModel): Promise<LinearSolution>;
}
```

This keeps replacement with native HiGHS, another WebAssembly package, or a
server solver possible without changing the domain engine.

The HiGHS WebAssembly asset must be bundled with the application. It must not be
loaded from a third-party CDN.

## 10. Numeric Policy

The solver and calculation engine use JavaScript `number` values and
double-precision floating-point arithmetic.

Rules:

- Internal flow unit is amount per tick
- Do not round intermediate calculations
- Use the configured epsilon for comparisons
- Normalize values with absolute value below epsilon to zero
- Subtract epsilon before ceiling machine counts
- Round only for UI display and exported reports

The default epsilon is:

```text
1e-9
```

## 11. Persistence

Dexie is used as the IndexedDB wrapper.

Initial tables:

```text
projects
  id
  name
  schemaVersion
  updatedAt
  data
```

Persistence requirements:

- Autosave changes after a short debounce
- Preserve `schemaVersion` on every project
- Apply explicit migrations when the schema changes
- Keep calculated results out of persisted authoritative project data
- Export and import UTF-8 JSON
- Validate imported JSON before storing it

## 12. Browser Support

Supported browsers:

- Current and previous major versions of Chrome
- Current and previous major versions of Edge
- Current and previous major versions of Firefox
- Current and previous major versions of Safari

Legacy browsers are not supported.

Required platform features:

- ES modules
- Web Workers
- WebAssembly
- IndexedDB
- File download and upload through browser APIs

## 13. Styling

Styling uses plain CSS with CSS Modules or locally scoped feature styles.

Policy:

- Global CSS defines design tokens and application layout
- Components own their local styles
- React Flow theme overrides are centralized
- No runtime CSS-in-JS dependency is required
- Mobile and desktop layouts must both remain usable

A component library is not selected initially. Shared controls should be built
from accessible HTML elements and project-owned styles. A library may be added
later if repeated complex widgets justify it.

## 14. Testing

### Unit Tests

Vitest covers:

- Unit conversion
- Tier and overclock calculation
- Validation and normalization
- LP model construction
- Split redistribution
- Machine and power derivation
- Result verification

### Solver Integration Tests

Tests run the real `highs` adapter for:

- A simple line
- Multiple outputs
- Merge and split
- External input limits
- Disposal constraints
- Feasible cycles
- Infeasible cycles
- Unbounded models
- Lexicographic objectives

### UI Tests

Testing Library covers forms, validation messages, and result rendering.

Playwright covers:

- Create and connect processes
- Set a target
- Calculate a line
- Save and reload a project
- Export and import JSON

## 15. Quality Gates

Every change must pass:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Before release:

```text
pnpm test:e2e
```

CI should run on Windows and Linux because local development is currently on
Windows while static deployment commonly builds on Linux.

## 16. Build and Deployment

Development:

```text
pnpm dev
```

Production build:

```text
pnpm build
```

Local production preview:

```text
pnpm preview
```

The initial deployment target is a static host supporting HTTPS.
No runtime environment variables or secrets are required for the first version.

Project data remains in IndexedDB and is not uploaded automatically.

## 17. Security and Privacy

- All calculations and project storage remain local by default
- Imported JSON is treated as untrusted input
- No dynamic code execution is allowed
- No third-party CDN is required at runtime
- No analytics are enabled by default
- HTML derived from material names or labels must be escaped by React

## 18. License Constraints

Selected runtime dependencies must permit distribution of the application
without requiring the ItemCalc source code to use a copyleft license.

HiGHS and the `highs` package use the MIT license.
React Flow uses the MIT license.

`glpk.js` is not selected because its GPL-3.0 license would introduce stronger
distribution obligations.

Dependency licenses must be checked before each release.

## 19. Deferred Technologies

The following are intentionally deferred:

- Tauri desktop packaging
- Cloud synchronization
- User accounts
- Server-side solver
- Collaborative editing
- Recipe database import
- Native file-system integration
- Telemetry and analytics

Their later introduction must preserve the UI-independent domain and
calculation packages.

## 20. References

- Node.js releases: https://nodejs.org/en/about/previous-releases
- pnpm installation and compatibility: https://pnpm.io/installation
- React versions: https://react.dev/versions
- Vite guide: https://vite.dev/guide/
- React Flow: https://reactflow.dev/
- HiGHS: https://highs.dev/
- highs package repository: https://github.com/lovasoa/highs-js
- Zod: https://zod.dev/
- Dexie: https://dexie.org/
