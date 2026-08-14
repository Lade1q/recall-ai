# Implementation View — Recall AI

> **SAD placement.** This is the content for **Section 6 — Implementation View** of the Software
> Architecture Document. It fulfils **issue #111** (PA4 mục a) and feeds the full SAD assembly
> (**#84 / I5.1**).
>
> **Source of truth.** Main folders below were read directly off the working tree (`find
src/client/src -maxdepth 1`, `find src/server/src -maxdepth 1`, one level deeper for
> `components/`, `features/`, `pages/`, `controllers/`, `services/`, `routes/`, `schemas/`) —
> nothing is invented or copied from a template. No submission image is required for this
> section per the template (`abc/templates/rup_sad.docx` note); the folder trees below **are**
> the deliverable, to be pasted as-is (or as a screenshot of a file tree) into the Google Doc.

## 6.1 `src/client` — Presentation Tier

```
src/client/
├── public/                  # Static assets served as-is (favicon, etc.)
└── src/
    ├── assets/               # Bundled images/icons
    ├── components/
    │   ├── shared/           # Cross-feature composite components
    │   └── ui/               # shadcn/ui primitives (buttons, dialogs, inputs, ...)
    ├── features/             # One folder per product feature, maps 1:1 to §4 components:
    │   ├── auth/              #   → §4.4 Authentication
    │   ├── study-planner/     #   → §4.5 Study-Plan & Concept-Graph
    │   ├── interview/         #   → §4.7 AI Examiner
    │   ├── review-queue/      #   → Scheduling & Remediation Engine (traceback/spaced review)
    │   ├── focus/             #   → Pomodoro / Focus Sessions
    │   └── dashboard/         #   → Dashboard aggregation view
    ├── hooks/                # Shared React hooks
    ├── lib/                  # apiClient.ts, endpoints.ts, utils.ts — HTTP client layer
    ├── pages/                # Route-level page components (auth/, dashboard/, planning/, focus/, history/, profile/, verify/)
    ├── types/                # Shared TS types/interfaces
    └── utils/                # Framework-agnostic helper functions
```

## 6.2 `src/server` — Application Tier

```
src/server/
├── prisma/
│   ├── schema.prisma        # §4.6 Database — single source of the 13-table model
│   └── migrations/
└── src/
    ├── routes/               # Express routers — one file per resource (auth, plan, graph, document,
    │                         #   interview, focus-session, review-queue, dashboard, user)
    ├── controllers/          # HTTP boundary — parses/validates request, calls a service, shapes response
    ├── services/             # Business logic — maps to §4 components:
    │   ├── auth.service.ts, user.service.ts        →  §4.4 Authentication
    │   ├── plan.service.ts, graph.service.ts        →  §4.5 Study-Plan & Concept-Graph (DAG/Kahn)
    │   ├── analysis.service.ts, document.service.ts,
    │   │   storage.service.ts                       →  Document ingestion / upload pipeline
    │   ├── gemini.service.ts                        →  AI Orchestration Boundary (constraint C4)
    │   ├── interview.service.ts, concept-result.service.ts,
    │   │   concept-detail.service.ts, session-summary.service.ts,
    │   │   question-cache.service.ts                →  §4.7 AI Examiner
    │   ├── scheduling.service.ts, traceback.service.ts →  Scheduling & Remediation Engine (SRE)
    │   ├── focus-session.service.ts, session-note.service.ts →  Focus Sessions
    │   └── dashboard.service.ts                     →  Dashboard aggregation
    ├── schemas/              # Zod request/response validation, incl. the 4 fixed AI schemas
    │   │                     #   (ai-extract.schema.ts, ai-interview.schema.ts — constraint C4)
    ├── middleware/            # auth.middleware.ts (JWT), errorHandler.ts, upload.middleware.ts (multer)
    ├── jobs/                  # Background jobs (stale-job-cleanup.job.ts)
    ├── config/                # Environment/config loading
    ├── types/                 # Shared TS types
    ├── utils/                 # Framework-agnostic helpers
    └── __tests__/             # Unit/integration tests
```

## 6.3 Notes

- The `features/` → `services/` naming is intentionally symmetric (e.g. `interview/` client
  feature talks to `interview.service.ts` via `interview.routes.ts`/`interview.controller.ts`),
  making it straightforward to trace a §4 component end-to-end through both tiers.
- `dist/`, `node_modules/`, and `uploads/` under `src/server/` and `node_modules/` under
  `src/client/` are build/runtime artifacts, intentionally omitted — the tree above lists only
  source-controlled main folders, per the AC ("chỉ thư mục chính").
