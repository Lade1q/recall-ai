# Sprint 3 Review

> **Document:** Official Sprint Review ·

> **Related:** Issue #129 (I9.3)

> **Sprint 3:** 13/07/2026 – 26/07/2026 ·

> **Rewritten:** 06/08/2026

> **Author:** @tkiet24

---

## Part 1 — Sprint 3 Overview

### Sprint Information

| Item                      | Details                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Time**                  | 13/07/2026 – 26/07/2026                                                                                                                                 |
| **Team size**             | 5 members                                                                                                                                               |
| **Sprint Goal**           | Complete infrastructure (EPIC #1), Auth Module (EPIC #2), AI Study Planner MVP (EPIC #3), Figma Redesign (EPIC #4), and all PA3 documentation (EPIC #5) |
| **Total Sprint 3 issues** | 30 issues (EPICs + sub-issues)                                                                                                                          |
| **Data source**           | `gh issue list --milestone "Sprint 3" --state all`                                                                                                      |

### Members & Domain Assignment

| Member                | GitHub         | Main Responsibility                              |
| --------------------- | -------------- | ------------------------------------------------ |
| Nguyen The Quan       | @Lade1q        | Backend (EPIC #3 — AI/Graph), Architecture, Docs |
| Nguyen Phuong Gia Bao | @baonguyen1776 | Frontend (Auth, Study Planner UI)                |
| Nguyen Minh Phat      | @NMP039        | Full-stack infra, QA, Docs                       |
| Ngo Van Phong         | @phong0801     | Backend (Auth BE, EPIC #1 infra), Bug fix        |
| Thai Nguyen Tuan Kiet | @tkiet24       | UI Design (Figma), Docs, Management              |

---

## Part 2 — Results Table

### Aggregate Statistics

| Metric                                          | Value                       |
| ----------------------------------------------- | --------------------------- |
| Total Sprint 3 issues                           | 30                          |
| Completed on time (≤ 26/07)                     | 20                          |
| Completed late (27/07 – 09/08, during Sprint 4) | 10                          |
| Completed overall (as of 06/08)                 | 30 / 30                     |
| Actual velocity in Sprint 3                     | ~67% (20/30 issues on time) |

---

### 2A. Issues completed on time in Sprint 3 (≤ 26/07/2026)

| #   | Issue | Title                                                   | Assignee            | Closed at | Domain     |
| --- | ----- | ------------------------------------------------------- | ------------------- | --------- | ---------- |
| 1   | #62   | I1.1 - [BE] Init project Node.js + Express + TypeScript | @phong0801          | 16/07     | BE / Infra |
| 2   | #63   | I1.2 - [BE] Setup Prisma + PostgreSQL Schema            | @Lade1q             | 18/07     | BE / Infra |
| 3   | #64   | I1.3 - [FE] Init project React + Vite + shadcn/ui       | @baonguyen1776      | 18/07     | FE / Infra |
| 4   | #65   | I1.4 - [FE] Setup React Router + Layout System          | @Lade1q             | 20/07     | FE / Infra |
| 5   | #66   | I1.5 - [INFRA] Setup ESLint, Prettier, Husky, CI        | @NMP039             | 19/07     | Infra      |
| 6   | #61   | [EPIC #1] Architecture Setup                            | All                 | 20/07     | EPIC       |
| 7   | #71   | I2.1 - [BE] API Register + Login + JWT                  | @phong0801          | 19/07     | BE / Auth  |
| 8   | #72   | I2.2 - [FE] UI Login / Register Pages                   | @baonguyen1776      | 22/07     | FE / Auth  |
| 9   | #73   | I2.3 - [FE] Auth Context + Protected Routes             | @baonguyen1776      | 22/07     | FE / Auth  |
| 10  | #74   | I2.4 - [QA] Test Cases for Auth Module                  | @NMP039             | 26/07     | QA         |
| 11  | #67   | [EPIC #2] Auth Module - Account Management              | Multi               | 26/07     | EPIC       |
| 12  | #75   | I3.1 - [BE] API Create Study Plan + File Upload         | @phong0801          | 22/07     | BE         |
| 13  | #76   | I3.2 - [BE] Gemini API Integration (extract_concepts)   | @Lade1q             | 25/07     | BE / AI    |
| 14  | #77   | I3.3 - [BE] Concept Graph Engine - DAG Validation       | @Lade1q             | 25/07     | BE         |
| 15  | #81   | I4.1 - [UI] Redesign entire UI on Figma                 | @tkiet24            | 24/07     | UI Design  |
| 16  | #84   | I5.1 - [DOC] Software Architecture Document (SAD)       | @Lade1q, @phong0801 | 26/07     | Docs       |
| 17  | #86   | I5.3 - [DOC] DB Design / ER Model (in SAD)              | @Lade1q, @NMP039    | 26/07     | Docs       |
| 18  | #87   | I5.4 - [DOC] Use-case Specification v2.0 (Revised)      | @Lade1q, @NMP039    | 26/07     | Docs       |
| 19  | #91   | I5.5 [DOC] Weekly Reports (Sprint 3)                    | @tkiet24            | 26/07     | Docs       |
| 20  | #85   | I5.2 - [DOC] Class Diagrams (Section 4.x of SAD) ⭐     | @Lade1q, @NMP039    | 26/07     | Docs       |

> [!NOTE]
> **Issue #85:** In the issue content, the last checkbox (`[ ] Insert diagrams and descriptions into Section 4.x of the SAD document`) is unticked — need to confirm whether this part was actually implemented or just forgotten to be ticked.

---

### 2B. Late completed issues - Carry-over to Sprint 4

The issues below have `closedAt` **after 26/07/2026**, completed during Sprint 4.

| #   | Issue | Title                                                                    | Assignee                 | Closed at | Late by | Notes                         |
| --- | ----- | ------------------------------------------------------------------------ | ------------------------ | --------- | ------- | ----------------------------- |
| 1   | #78   | I3.4 - [FE] UI Create Study Plan Page                                    | @baonguyen1776           | 30/07     | 4 days  | Priority-high                 |
| 2   | #79   | I3.5 - [FE] Concept Graph Viewer (react-flow, mock data)                 | @baonguyen1776           | 31/07     | 5 days  | Priority-high                 |
| 3   | #80   | I3.6 - [QA] Test Cases for Study Planner Module                          | @NMP039                  | 02/08     | 7 days  | Blocked by #78, #79           |
| 4   | #68   | [EPIC #3] AI Study Planner - Ingest & Map                                | Multi                    | 02/08     | 7 days  | EPIC — waiting for sub-issues |
| 5   | #82   | I4.2 - [UI] Design System & Component Library (Figma)                    | @tkiet24                 | 29/07     | 3 days  | Priority-medium               |
| 6   | #83   | I4.3 - [UI] Documentation handoff for Frontend                           | @baonguyen1776, @tkiet24 | 29/07     | 3 days  | Priority-medium               |
| 7   | #69   | [EPIC #4] UI Prototyping - UI Redesign                                   | @tkiet24                 | 29/07     | 3 days  | EPIC — blocked by #82, #83    |
| 8   | #90   | I4.4 - [DOC] "UI Design" Document for PA3 ⭐ GRADE                       | @baonguyen1776, @tkiet24 | 29/07     | 3 days  | PA3 Document                  |
| 9   | #70   | [EPIC #5] Documentation PA3 - Submission Documents                       | Multi                    | 29/07     | 3 days  | EPIC                          |
| 10  | #101  | [Bug] Auth: API Register allows password with only whitespace characters | @Lade1q, @phong0801      | 29/07     | 3 days  | Unplanned bug                 |

---

### 2C. Completely missed issues — Not present in Sprint 3

| Feature/Task             | Reason for missing                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Focus Session Module** | Nobody created an issue. This is a PA3 deliverable but was completely overlooked during Sprint 3 planning. Currently belongs to EPIC #110, will be processed in Sprint 4. |

---

## Part 3 — Root Cause Analysis

> **Method:** Each carry-over task is analyzed following the chain **Phenomenon → Surface cause → Root cause → Error type**.

---

### 3.1. FE Study Planner Group: #78 and #79

**Issues:** `I3.4 - [FE] UI Create Study Plan Page` and `I3.5 - [FE] Concept Graph Viewer`
**Assignee:** @baonguyen1776 (both)

|            | #78    | #79    |
| ---------- | ------ | ------ |
| Created at | 16/07  | 16/07  |
| Closed at  | 30/07  | 31/07  |
| Late by    | 4 days | 5 days |

**Actual evidence:**

- Issue #78 body, updated on 29/07 (3 days after sprint ended): _"code `src/client/src/pages/planning/CreatePlanPage.tsx` is still a **placeholder** → remaining FE build"_
- Issue #79 body, updated on 29/07: _"Route `/plan/:id` **not declared** in `App.tsx` → FE build untouched"_
- Both issues were created on 16/07 but until 29/07 the code was still placeholders — meaning **no substantial progress was made during the first 13 days of the sprint**.

**Actual timeline of @baonguyen1776 in Sprint 3:**

```
16/07 → Assigned #64 (FE Init React+Vite), #78 (Create Plan UI), #79 (Graph Viewer)
18/07 → Finished #64 (Init)
22/07 → Finished #72 (Auth UI), #73 (Auth Context)
      ← Auth tasks done, switched to #78, #79
29/07 → Code for #78 and #79 still placeholders (recorded in issue body)
30/07 → Closed #78
31/07 → Closed #79
```

**Cause analysis:**

| Level             | Explanation                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phenomenon**    | Both FE Study Planner issues had no real code until 29/07                                                                                                                                                                                                                                               |
| **Surface cause** | @baonguyen1776 was busy with Auth FE (#72, #73) for most of Sprint 3                                                                                                                                                                                                                                    |
| **Root cause**    | During planning, Auth and Study Planner FE were assigned to the same person, but Auth is a blocking dependency - #72 was only finished on 22/07, freeing up time for #78, #79. Only 4 days left (22-26/07) - not enough for 2 complex FE tasks (each with 7-9 checklists). No buffer, no backup person. |
| **Error type**    | **Incorrect estimation + Understaffed**                                                                                                                                                                                                                                                                 |

---

### 3.2. #80 — QA Test Cases Study Planner

**Issue:** `I3.6 - [QA] Test Cases for Study Planner Module`
**Assignee:** @NMP039

|            | Value           |
| ---------- | --------------- |
| Created at | (within sprint) |
| Closed at  | 02/08           |
| Late by    | 7 days          |

**Actual evidence:**

- Issue #79 body explicitly states: _"#80 [QA] Test Cases blocked by #78 and #79"_ — meaning QA cannot write test cases for a non-existent UI.
- #78 closed on 30/07, #79 closed on 31/07 → #80 could only start at the earliest on 31/07 → closing on 02/08 is an inevitable consequence.

**Cause analysis:**

| Level             | Explanation                                                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Phenomenon**    | Test Cases could not be written by the end of the sprint                                                                      |
| **Surface cause** | #80 was blocked by unfinished #78 and #79                                                                                     |
| **Root cause**    | See section 3.1 — this is a **cascading consequence** of #78 and #79 being late. #80 itself had no individual planning error. |
| **Error type**    | **Blocked by another task**                                                                                                   |

---

### 3.3. #82 and #83 — Design System & Handoff

**Issues:** `I4.2 - Design System & Component Library` and `I4.3 - Documentation handoff for Frontend`
**Assignees:** @tkiet24 (#82), @baonguyen1776 + @tkiet24 (#83)

|           | #81 (Dependency) | #82    | #83    |
| --------- | ---------------- | ------ | ------ |
| Closed at | 24/07            | 29/07  | 29/07  |
| Late by   | On time          | 3 days | 3 days |

**Actual evidence:**

- Issue #82 body updated on 29/07 stated: _"Design System was delivered using **Claude Design** (not Figma)"_ — the deliverable was changed mid-sprint compared to the initial description ("Create Design System page in Figma").
- #81 (Figma Redesign) closed on 24/07 → #82 depends on #81 → only **2 working days** left (24-26/07) to complete both #82 and #83.
- Both #82 and #83 were mainly assigned to @tkiet24, while @tkiet24 was also managing the project and documentation.

**Cause analysis:**

| Level             | Explanation                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Phenomenon**    | Design System and Handoff finished 3 days past deadline                                                                                                                                                                                          |
| **Surface cause** | Figma Redesign (#81) finished late (24/07), leaving only 2 days for the next 2 tasks                                                                                                                                                             |
| **Root cause**    | The linear dependency chain **#81 → #82 → #83** had no buffer time. When #81 was delayed (even by 2 days), the entire subsequent chain was pushed back. Furthermore, a subjective reason: @tkiet24 did not strictly follow the proposed timeline |
| **Error type**    | **Incorrect estimation + Blocked by another task**                                                                                                                                                                                               |

> [!NOTE]
> **Change in #82 deliverable mid-sprint:** Initially required to be done in Figma, actually executed using Claude Design (HTML). This might be a reasonable technical decision, but it must be formally recorded in the process to avoid inconsistency with the initial acceptance criteria.

---

### 3.4. #90 — UI Design Document for PA3

**Issue:** `I4.4 - [DOC] "UI Design" Document for PA3 ⭐ GRADE`
**Assignees:** @baonguyen1776, @tkiet24

**Cause analysis:**

| Level             | Explanation                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Phenomenon**    | PA3 UI Design document submitted 3 days late                                                        |
| **Surface cause** | Blocked until #82 and #83 were finished                                                             |
| **Root cause**    | **Cascading consequence** from #81 → #82 → #83 → #90. #90 itself had no independent planning error. |
| **Error type**    | **Blocked by another task**                                                                         |

---

### 3.5. #101 — Password with only whitespaces bug

**Issue:** `[Bug] Auth: API Register allows password with only whitespace characters`
**Assignees:** @Lade1q, @phong0801

|            | Value |
| ---------- | ----- |
| Created at | 24/07 |
| Closed at  | 29/07 |

**Actual evidence:**

- `createdAt: 24/07` — discovered after QA Auth (#74) executed test case `TC-AM-01-08`.
- Issue body clearly states the technical reason: _"Zod validation schema only checks `min(8)` but lacks `.trim()` or regex to block entirely whitespace strings"_.
- The issue was not part of the initial Sprint 3 plan, arising from the QA Testing process.

**Cause analysis:**

| Level             | Explanation                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Phenomenon**    | Security bug existed in Auth module after merge                                                                             |
| **Surface cause** | Zod validation schema lacked the `.trim()` rule                                                                             |
| **Root cause**    | Not a planning error. This is a bug discovered solely through QA testing (#74) — impossible to predict before writing code. |
| **Error type**    | **Unplanned**                                                                                                               |

---

### 3.6. Focus Session Module — Did not exist in Sprint 3

**Cause analysis:**

| Level             | Explanation                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phenomenon**    | No code, no issue, nobody assigned to work on it                                                                                                                                                                                                                                 |
| **Surface cause** | Nobody was assigned to build Focus Session                                                                                                                                                                                                                                       |
| **Root cause**    | During Sprint 3 planning, **no cross-checking was done between the PA3 deliverables list and the created issues list**. Focus Session is a mandatory PA3 deliverable but was completely skipped when creating issues. Not an individual's fault — it's a planning process error. |
| **Error type**    | **Forgot to create issue**                                                                                                                                                                                                                                                       |

---

### 3.7. Summary of Error Types

| Error type                     | Affected issues                                                                 | Quantity                             |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------ |
| 🔴 **Incorrect estimation**    | #78, #79 (FE needs 2+ weeks, only planned for 4 days)                           | 2                                    |
| 🟠 **Blocked by another task** | #80 (waiting for #78+#79), #82+#83 (waiting for #81), #90 (waiting for #82+#83) | 5                                    |
| 🔵 **Forgot to create issue**  | Focus Session Module                                                            | 1                                    |
| 🟣 **Unplanned**               | #101 (bug arising from QA)                                                      | 1                                    |
| ⚪ **Understaffed**            | #78, #79 (Only 1 FE for Study Planner)                                          | (combined with incorrect estimation) |

> **Overall comment:** Most delayed tasks (5/9) are **cascading consequences** from 2 primary root causes: (1) FE Study Planner was overloaded onto 1 person after finishing Auth too late, and (2) the UI Design dependency chain lacked buffer time. Fixing these 2 root causes will resolve the majority of carry-overs.

---

## Part 4 — Adjustments for Sprint 4

> **Principle:** Every adjustment must be directly linked to 1 root cause identified in Part 3. Do not provide generic advice ("try harder", "communicate better").

---

### 4.1. Adjusting the sprint planning process

**Linked to root cause:** Section 3.6 — Forgot to create issue for Focus Session

**Actual problem:** During Sprint 3 planning, there was no step to cross-check the deliverables list in the SDP/PA against the created issues. Focus Session was a mandatory PA3 deliverable but nobody noticed until the sprint ended.

**Specific adjustment for Sprint 4:**

> Before finalizing the sprint issue list, the PM must run a checklist: open the SDP document (Deliverables section) and PA spec, cross-check each item against the created issues list. Any deliverable without an issue → create an issue immediately, do not leave it for the next week.

**Evidence of application in Sprint 4:** Focus Session was included in EPIC #110 (`[EPIC #8] Focus Session - Pomodoro Study Session (carry-over from PA3)`) and issue #126 (BE API Focus Session, CLOSED 05/08). This action was taken right at the beginning of Sprint 4.

---

### 4.2. Do not assign the entire FE of a domain to 1 person if that domain has sequential dependencies

**Linked to root cause:** Section 3.1 — FE Study Planner overloaded onto 1 person after finishing Auth

**Actual problem:** Sprint 3 assigned @baonguyen1776 to do Auth FE (#72, #73) first, then Study Planner FE (#78, #79). Auth FE finished on 22/07 → only 4 days left for 2 complex Study Planner FE tasks. Result: both delayed by 4-5 days.

**Specific adjustment for Sprint 4:**

> When one person is in charge of a sequential task chain (A → B → C), the actual time for each task must be estimated and summed up. If the total time > (remaining sprint days - 2 days buffer) → must split to the next sprint OR assign a second person in parallel.

**Evidence of application in Sprint 4:** Sprint 4 has multiple FE issues distributed among more people — for example, #167, #168, #173, #174, #202, #204 are all separate FE issues closed in the first week of Sprint 4. However, note: core Sprint 4 FE issues (#118 — UI Interview, #119 — UI Session Result, #127 — UI Focus Session) are still OPEN as of 06/08, indicating a similar pattern might be recurring.

> [!NOTE]
> **Need to monitor:** As of 06/08 (3 days left until Sprint 4 deadline), major FE issues #118, #119, #127, #169, #225 are still OPEN. If not completed on time, a similar root cause analysis is required for the Sprint 4 retrospective.

---

### 4.3. UI Design dependency chain must have buffer time

**Linked to root cause:** Section 3.3 — Chain #81 → #82 → #83 lacked buffer

**Actual problem:** #81 (Figma Redesign) finished on 24/07 → only 2 days left for #82 and #83. It is very difficult to complete 2 complex design tasks in 2 days even without any other issues.

**Specific adjustment for Sprint 4:**

> For a linear dependency chain (task A → task B → task C), the first task must be finished **at least 3 working days** before the sprint deadline so the next task has time to be executed. If this cannot be guaranteed during planning → cut down tasks, do not keep the plan and end up being late.

**Evidence of application in Sprint 4:** Sprint 4 started UI Design earlier — #112 (Figma Interview/Focus Session) CLOSED on 04/08, 5 days before the deadline. Issue structure is also separated clearer (Design → BE → FE instead of bundled together).

---

### 4.4. Utilize the Relationships section in GitHub Issues to declare dependencies

**Linked to root cause:** Sections 3.2 and 3.4 — multiple tasks were blocked without prior declaration

**Actual problem:** Dependencies between #78/#79 and #80, and between #81 and #82/#83 were not formally declared in the issues upon creation. Only when delayed were they noted in the issue body as manual status updates.

**Specific adjustment for Sprint 4:**

> Each GitHub issue already has a **Relationships** section comprising 3 types: _parent issue_, _blocked by_, _is blocking_. When creating an issue, this section must be filled immediately — do not leave it blank. For example: #80 must be marked as _blocked by_ #78 and #79 right from the start of the sprint, not waiting until it is late to note it in the body.

**Evidence of application in Sprint 4:** Observed that many Sprint 4 issues have declared parent issues (linked to corresponding EPICs). However, the usage of _blocked by_ / _is blocking_ is still inconsistent — many issues still only note dependencies in the body instead of using Relationships.

---

### 4.5. [Note] PRs should not be left hanging for more than 48 hours

**Linked to root cause:** Sprint 3 had PR #103 and PR #104 hanging open when the sprint ended (recorded in issue #129)

**Specific adjustment for Sprint 4:**

> PRs must be reviewed within 48 hours of being opened. If there is no reviewer after 48 hours → the PR creator proactively pings the team in the discussion channel. PRs hanging > 3 days must be reported in daily/weekly reports as a blocker.

---

## Part 5 — Carry-over Decisions

> **Data source:** `gh issue list --milestone "Sprint 4" --state all` executed on 06/08/2026. All Sprint 3 carry-over issues have had their milestones moved to Sprint 4 — there are no issues left hanging in the Sprint 3 milestone.

### Processing status of Sprint 3 carry-over issues

| Sprint 3 Issue | Title                                     | Decision             | Status in Sprint 4 | Closed at |
| -------------- | ----------------------------------------- | -------------------- | ------------------ | --------- |
| #78            | I3.4 - [FE] UI Create Study Plan Page     | Move to Sprint 4     | CLOSED             | 30/07     |
| #79            | I3.5 - [FE] Concept Graph Viewer          | Move to Sprint 4     | CLOSED             | 31/07     |
| #80            | I3.6 - [QA] Test Cases Study Planner      | Move to Sprint 4     | CLOSED             | 02/08     |
| #68            | [EPIC #3] AI Study Planner                | Move to Sprint 4     | CLOSED             | 02/08     |
| #82            | I4.2 - Design System & Component Library  | Move to Sprint 4     | CLOSED             | 29/07     |
| #83            | I4.3 - Documentation handoff for Frontend | Move to Sprint 4     | CLOSED             | 29/07     |
| #69            | [EPIC #4] UI Prototyping                  | Move to Sprint 4     | CLOSED             | 29/07     |
| #90            | I4.4 - UI Design Document PA3 ⭐          | Move to Sprint 4     | CLOSED             | 29/07     |
| #70            | [EPIC #5] Documentation PA3               | Move to Sprint 4     | CLOSED             | 29/07     |
| #101           | Bug: password with only whitespaces       | Move to Sprint 4     | CLOSED             | 29/07     |
| Focus Session  | (no issue)                                | Create new EPIC #110 | OPEN (in progress) | —         |

> **Result:** All 10 carry-over issues were processed in Sprint 4. **There are no issues left hanging in the Sprint 3 milestone.**

---

### Focus Session — current status (06/08)

The issue was newly created in Sprint 4 instead of moving the milestone (because it did not exist in Sprint 3).

| Issue | Title                                            | Status         |
| ----- | ------------------------------------------------ | -------------- |
| #110  | [EPIC #8] Focus Session - Pomodoro Study Session | OPEN           |
| #126  | I8.1 - [BE] API Focus Session + Pomodoro Config  | CLOSED (05/08) |
| #127  | I8.2 - [FE] UI Focus Session                     | OPEN           |

---
