# Bug Report

| Field                    | Content                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B001                                                                                                                                                       |
| **Title**                | Registration API allows passwords with only spaces                                                                                                         |
| **Description**          | The registration API accepts passwords consisting of eight space characters and successfully creates an account, weakening password strength requirements. |
| **Module / Function ID** | UC-01 — Account Registration / Authentication — `POST /api/v1/auth/register`                                                                               |
| **Severity**             | High                                                                                                                                                       |
| **Priority**             | High                                                                                                                                                       |
| **Status**               | Closed                                                                                                                                                     |
| **Date Reported (Date)** | 25/07/2026                                                                                                                                                 |
| **Found In**             | Sprint 3                                                                                                                                                   |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                           |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                           |
| **Comment**              | Need to add a validation rule to block passwords containing only spaces.                                                                                   |

---

| Field                    | Content                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B002                                                                                                                                                                  |
| **Title**                | Login screen hangs when API returns invalid password                                                                                                                  |
| **Description**          | During initial testing, the loading state on the login form did not end after entering an incorrect password, causing the user to not receive a clear error response. |
| **Module / Function ID** | UC-02 — Login / Authentication — `LoginPage` / Sign In                                                                                                                |
| **Severity**             | Medium                                                                                                                                                                |
| **Priority**             | Medium                                                                                                                                                                |
| **Status**               | Closed                                                                                                                                                                |
| **Date Reported (Date)** | 25/07/2026                                                                                                                                                            |
| **Found In**             | Sprint 3                                                                                                                                                              |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                                      |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                      |
| **Comment**              | Cannot reproduce during re-testing; need to continue monitoring the 401 error handling branch.                                                                        |

---

| Field                    | Content                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID (Defect ID)**   | B003                                                                                                                                                                                                                                             |
| **Title**                | Concurrent retries can create duplicate jobs or permanently lock retries                                                                                                                                                                         |
| **Description**          | The state transitions of `AnalysisJob` are non-atomic read-then-write operations. Two concurrent retry requests can create or process a duplicate job; a stuck `processing` job can also cause all subsequent retries to permanently return 409. |
| **Module / Function ID** | UC-05 — Create New Revision Plan / AI Planning — `AnalysisJob` lifecycle / `processAnalysisJob`                                                                                                                                                  |
| **Severity**             | High                                                                                                                                                                                                                                             |
| **Priority**             | Medium                                                                                                                                                                                                                                           |
| **Status**               | Closed                                                                                                                                                                                                                                           |
| **Date Reported (Date)** | 31/07/2026                                                                                                                                                                                                                                       |
| **Found In**             | Sprint 4                                                                                                                                                                                                                                         |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                                  |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                 |
| **Comment**              | There is a risk of duplicate data creation and retry locking; need atomic claim/retry operations.                                                                                                                                                |

---

| Field                    | Content                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B004                                                                                                                                                                                                                                                |
| **Title**                | Upload accepts encrypted PDF but Gemini cannot analyze it                                                                                                                                                                                           |
| **Description**          | The upload middleware only checks MIME type and size, thus passing PDFs with `/Encrypt`. The file can still be opened by a PDF reader, but the Gemini File API cannot read any pages, causing the analysis job to retry fruitlessly before failing. |
| **Module / Function ID** | UC-05 — Create New Revision Plan / AI Planning — `upload.middleware.ts` / Create Plan                                                                                                                                                               |
| **Severity**             | Medium                                                                                                                                                                                                                                              |
| **Priority**             | Low                                                                                                                                                                                                                                                 |
| **Status**               | Closed                                                                                                                                                                                                                                              |
| **Date Reported (Date)** | 01/08/2026                                                                                                                                                                                                                                          |
| **Found In**             | Sprint 4                                                                                                                                                                                                                                            |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                                     |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                    |
| **Comment**              | Should reject encrypted PDFs immediately upon upload to avoid useless analysis retries.                                                                                                                                                             |

---

| Field                    | Content                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B005                                                                                                                                                             |
| **Title**                | PlanDetailPage displays the deadline one day later                                                                                                               |
| **Description**          | The deadline is consistently displayed in the Plan list but increases by one day on the detail screen, resulting in incorrect deadline information for the user. |
| **Module / Function ID** | UC-07 — View Revision Plan List / Plan Management — `PlanDetailPage` / deadline                                                                                  |
| **Severity**             | Medium                                                                                                                                                           |
| **Priority**             | Medium                                                                                                                                                           |
| **Status**               | Closed                                                                                                                                                           |
| **Date Reported (Date)** | 02/08/2026                                                                                                                                                       |
| **Found In**             | Sprint 4                                                                                                                                                         |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                                 |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                 |
| **Comment**              | Need to unify the timezone handling to prevent the deadline date from shifting.                                                                                  |

---

| Field                    | Content                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID (Defect ID)**   | B006                                                                                                                                                         |
| **Title**                | Plan creation API rejects files exactly 10 MB in size                                                                                                        |
| **Description**          | The upload size constraint handles the boundary value incorrectly: a file exactly 10 MiB is rejected, even though the 10 MB limit should include `<= 10 MB`. |
| **Module / Function ID** | UC-05 — Create New Revision Plan / AI Planning — `POST /api/v1/plans` / upload file                                                                          |
| **Severity**             | Medium                                                                                                                                                       |
| **Priority**             | Medium                                                                                                                                                       |
| **Status**               | Closed                                                                                                                                                       |
| **Date Reported (Date)** | 02/08/2026                                                                                                                                                   |
| **Found In**             | Sprint 4                                                                                                                                                     |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                             |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                             |
| **Comment**              | The size limit condition must include the exact value of 10 MiB.                                                                                             |

---

| Field                    | Content                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B007                                                                                                                      |
| **Title**                | Concept search by name does not work when all concepts are untested                                                       |
| **Description**          | The search-by-name function on the concept graph has no effect when all concepts in the plan have `mastery_score = null`. |
| **Module / Function ID** | UC-17 — View and Interact with Concept Graph / DB-05 — Concept Graph, View Mode                                           |
| **Severity**             | High                                                                                                                      |
| **Priority**             | High                                                                                                                      |
| **Status**               | Closed                                                                                                                    |
| **Date Reported (Date)** | 02/08/2026                                                                                                                |
| **Found In**             | Sprint 4                                                                                                                  |
| **Reporter**             | Nguyen The Quan                                                                                                           |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                          |
| **Comment**              | Need to separate the name search condition from the mastery score filtering condition.                                    |

---

| Field                    | Content                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B008                                                                                                                                                                                                           |
| **Title**                | Post-session score must be inferred from the turns of that session itself, not reading Concept.masteryScore                                                                                                    |
| **Description**          | The summary of an old session retrieves `Concept.masteryScore` at the time of reopening instead of the score generated by the answers in that specific session, causing the history to display incorrect data. |
| **Module / Function ID** | UC-18 — View Interview Session History / DB-03 — AI Examiner Session Summary/History                                                                                                                           |
| **Severity**             | Medium                                                                                                                                                                                                         |
| **Priority**             | Medium                                                                                                                                                                                                         |
| **Status**               | Closed                                                                                                                                                                                                         |
| **Date Reported (Date)** | 05/08/2026                                                                                                                                                                                                     |
| **Found In**             | Sprint 4                                                                                                                                                                                                       |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                               |
| **Comment**              | Historical scores must be calculated from the answering turns of that specific session.                                                                                                                        |

---

| Field                    | Content                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B009                                                                                                                                                                                  |
| **Title**                | Plan switches to active immediately after analysis is complete, bypassing the graph verification step                                                                                 |
| **Description**          | After the analysis job completes, the plan is immediately switched to `active`. As a result, the graph verification screen, which only shows when the plan is `draft`, never appears. |
| **Module / Function ID** | UC-06 — View and Edit Concept Graph / SP-01 — Generate and Confirm Concept Graph                                                                                                      |
| **Severity**             | High                                                                                                                                                                                  |
| **Priority**             | High                                                                                                                                                                                  |
| **Status**               | Closed                                                                                                                                                                                |
| **Date Reported (Date)** | 06/08/2026                                                                                                                                                                            |
| **Found In**             | Sprint 4                                                                                                                                                                              |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                       |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                      |
| **Comment**              | Only activate the plan after the user confirms the concept graph.                                                                                                                     |

---

| Field                    | Content                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B010                                                                                                                                                                                                          |
| **Title**                | State Machine does not Traceback / Spaced Repetition on incorrect answer                                                                                                                                      |
| **Description**          | When a student completely answers incorrectly (`0.00`, verdict `wrong`), the State Machine still asks the next question for the same concept instead of switching to the Traceback or Spaced Repetition flow. |
| **Module / Function ID** | UC-13 — Traceback Prerequisite Concepts / AI Examiner — CF-03 and CF-04                                                                                                                                       |
| **Severity**             | High                                                                                                                                                                                                          |
| **Priority**             | High                                                                                                                                                                                                          |
| **Status**               | Closed                                                                                                                                                                                                        |
| **Date Reported (Date)** | 06/08/2026                                                                                                                                                                                                    |
| **Found In**             | Sprint 4                                                                                                                                                                                                      |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                                                                              |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                              |
| **Comment**              | Need to properly trigger Traceback or Spaced Repetition upon a completely wrong answer.                                                                                                                       |

---

| Field                    | Content                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID (Defect ID)**   | B011                                                                                                                                                               |
| **Title**                | Idempotency API blocks both requests instead of just the duplicate                                                                                                 |
| **Description**          | The idempotency mechanism incorrectly handles two identical answer requests sent concurrently: both are rejected with `409 Conflict`, and neither answer is saved. |
| **Module / Function ID** | UC-11 — Multi-turn Interview Session / AI Examiner — `POST /api/v1/interviews/:id/answers`                                                                         |
| **Severity**             | High                                                                                                                                                               |
| **Priority**             | High                                                                                                                                                               |
| **Status**               | Closed                                                                                                                                                             |
| **Date Reported (Date)** | 06/08/2026                                                                                                                                                         |
| **Found In**             | Sprint 4                                                                                                                                                           |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                                   |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                   |
| **Comment**              | The first request must be processed; only the duplicate request should be blocked or return the saved result.                                                      |

---

| Field                    | Content                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B012                                                                                                                                                            |
| **Title**                | Tooltip display error in Concept Graph                                                                                                                          |
| **Description**          | The tooltip showing concept details on the graph overflows its content and is overlapped by adjacent nodes, preventing users from reading the full information. |
| **Module / Function ID** | UC-17 — View and Interact with Concept Graph / Concept Detail Tooltip                                                                                           |
| **Severity**             | Low                                                                                                                                                             |
| **Priority**             | Low                                                                                                                                                             |
| **Status**               | Closed                                                                                                                                                          |
| **Date Reported (Date)** | 07/08/2026                                                                                                                                                      |
| **Found In**             | Sprint 4                                                                                                                                                        |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                                |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                |
| **Comment**              | Need to limit the content and increase the z-index so the tooltip is not obscured.                                                                              |

---

| Field                    | Content                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B013                                                                                                                                                    |
| **Title**                | Concept detail sidebar shows raw variable names instead of friendly labels                                                                              |
| **Description**          | The Concept detail sidebar displays internal variable names instead of user-friendly labels, making the interface inconsistent with nodes on the graph. |
| **Module / Function ID** | UC-17 — View and Interact with Concept Graph / Concept Detail Sidebar                                                                                   |
| **Severity**             | Low                                                                                                                                                     |
| **Priority**             | Low                                                                                                                                                     |
| **Status**               | Closed                                                                                                                                                  |
| **Date Reported (Date)** | 08/08/2026                                                                                                                                              |
| **Found In**             | Sprint 4                                                                                                                                                |
| **Reporter**             | Nguyen Minh Phat                                                                                                                                        |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                        |
| **Comment**              | Need to replace internal variable names with friendly labels, consistent with the interface.                                                            |

---

| Field                    | Content                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B014                                                                                                                                                                                                                                                                      |
| **Title**                | Requests that lost claim rights still record results and advance the state machine                                                                                                                                                                                        |
| **Description**          | The command to claim a turn checks if the turn is still valid, but the commands to write `score`, `feedback`, and `verdict` only lock by `id`. Therefore, a request that has lost its claim can still overwrite the result and trigger a transition to the next question. |
| **Module / Function ID** | UC-11 — Multi-turn Interview Session / AI Examiner — `submitAnswer`                                                                                                                                                                                                       |
| **Severity**             | High                                                                                                                                                                                                                                                                      |
| **Priority**             | Medium                                                                                                                                                                                                                                                                    |
| **Status**               | Closed                                                                                                                                                                                                                                                                    |
| **Date Reported (Date)** | 08/08/2026                                                                                                                                                                                                                                                                |
| **Found In**             | Sprint 4                                                                                                                                                                                                                                                                  |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                                                           |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                                          |
| **Comment**              | Only requests holding a valid claim right should be allowed to record scores and change the session state.                                                                                                                                                                |

---

| Field                    | Content                                                                                                                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B015                                                                                                                                                                                                                              |
| **Title**                | Gemini calls have no timeout/AbortSignal and can hang indefinitely                                                                                                                                                                |
| **Description**          | `GoogleGenAI` is initialized without `httpOptions` timeout, and SDK calls do not pass `AbortSignal`. An unresponsive Gemini request will hang indefinitely, preventing the AE-02 retry and AE-05 Flashcard fallback from running. |
| **Module / Function ID** | UC-11 / UC-12 — Interview and Fallback Flashcard / Gemini Service                                                                                                                                                                 |
| **Severity**             | High                                                                                                                                                                                                                              |
| **Priority**             | Medium                                                                                                                                                                                                                            |
| **Status**               | Closed                                                                                                                                                                                                                            |
| **Date Reported (Date)** | 09/08/2026                                                                                                                                                                                                                        |
| **Found In**             | Sprint 4                                                                                                                                                                                                                          |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                   |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                  |
| **Comment**              | Need to add timeout and cancellation mechanisms so retries/fallbacks can always be triggered.                                                                                                                                     |

---

| Field                    | Content                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID (Defect ID)**   | B016                                                                                                                                                                                                               |
| **Title**                | Vietnamese uploaded filenames turn into mojibake right upon saving to the database                                                                                                                                 |
| **Description**          | Multer/busboy decodes `file.originalname` in latin1 instead of UTF-8. The corrupted filename is saved directly into `Document.filename`, making this a data error from the upload layer, not just a display issue. |
| **Module / Function ID** | UC-05 — Create New Revision Plan / Document Upload — `upload.middleware.ts`                                                                                                                                        |
| **Severity**             | Medium                                                                                                                                                                                                             |
| **Priority**             | Medium                                                                                                                                                                                                             |
| **Status**               | Closed                                                                                                                                                                                                             |
| **Date Reported (Date)** | 09/08/2026                                                                                                                                                                                                         |
| **Found In**             | Sprint 4                                                                                                                                                                                                           |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                    |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                   |
| **Comment**              | Need to configure UTF-8 encoding when receiving filenames and handle corrupted data separately.                                                                                                                    |

---

| Field                    | Content                                                                                                                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bug ID (Defect ID)**   | B017                                                                                                                                                                                                                                                                                             |
| **Title**                | Review queue and auto-pick do not filter out deprecated concepts                                                                                                                                                                                                                                 |
| **Description**          | The `resolvePlanQueue` read path only filters `ReviewQueueItem` statuses, but not related concept statuses. A review item of a `deprecated` concept still appears in the queue and can be auto-picked to create an interview session on a concept that has been removed from the plan and graph. |
| **Module / Function ID** | UC-19 — Receive Proactive Revision Reminders / Review Queue — `resolvePlanQueue`                                                                                                                                                                                                                 |
| **Severity**             | High                                                                                                                                                                                                                                                                                             |
| **Priority**             | Medium                                                                                                                                                                                                                                                                                           |
| **Status**               | Closed                                                                                                                                                                                                                                                                                           |
| **Date Reported (Date)** | 13/08/2026                                                                                                                                                                                                                                                                                       |
| **Found In**             | Sprint 4                                                                                                                                                                                                                                                                                         |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                                                                                  |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                                                                 |
| **Comment**              | Need to filter out deprecated concepts at the read paths of the review queue.                                                                                                                                                                                                                    |

---

| Field                    | Content                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bug ID (Defect ID)**   | B018                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Title**                | Empty-state review queue shows incorrect message and CTA state                                                                                                                                                                                                                                                                                                                                                             |
| **Description**          | After the queue filters out deprecated concepts, a plan that already has interview results but where all previously scheduled concepts have been removed might fall into the fallback. The UI then incorrectly says the plan has no interview sessions/results. For plans with no active concepts left, the UI also displays congratulations and a CTA to start a session, leading to a `409 NO_CONCEPTS_TO_REVIEW` error. |
| **Module / Function ID** | UC-19 — Receive Proactive Revision Reminders / Review Queue — Today Nudge                                                                                                                                                                                                                                                                                                                                                  |
| **Severity**             | Medium                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Priority**             | Medium                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Status**               | Closed                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Date Reported (Date)** | 13/08/2026                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Found In**             | Sprint 4                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Reporter**             | Nguyen The Quan                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Environment**          | Chrome · Arch Linux (Linux 7.1.4-arch1-1 x86_64)                                                                                                                                                                                                                                                                                                                                                                           |
| **Comment**              | Need to display appropriate messages and CTAs based on the revision history and graph state.                                                                                                                                                                                                                                                                                                                               |
