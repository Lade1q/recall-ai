# Sprint 4 Retrospective

**Date:** 09/08/2026
**Sprint:** 4 (27/07/2026 – 09/08/2026)

---

## 1. Sprint Overview

Sprint 4 focused heavily on delivering the core functional epics for PA4:

- EPIC #6: AI Examiner - Multi-turn Interview
- EPIC #7: Concept Graph Engine - Traceback & Remediation
- EPIC #8: Focus Session - Pomodoro
- EPIC #9: PA4 Delivery - Design, Docs & Beta Release 0.5

While the Backend team made excellent progress on complex AI and graph algorithms, the Sprint faced significant bottlenecks in Frontend implementation, Quality Assurance (QA), and Documentation, mirroring some of the systemic issues identified in Sprint 3.

### Aggregate Statistics

| Metric                               | Value   |
| ------------------------------------ | ------- |
| Total Sprint 4 issues                | 65      |
| Completed within Sprint 4 (by 09/08) | 48      |
| Remaining OPEN                       | 17      |
| Completed overall (as of 09/08)      | 48 / 65 |
| Actual velocity in Sprint 4          | ~73%    |

---

## 2. What Went Well

- **Backend Velocity:** The BE team successfully implemented highly complex features, including the BFS Traceback algorithm (I7.1), Weighted Mastery Score (I7.2), Interview State Machine (I6.3), and Focus Session APIs (I8.1).
- **Adaptability to Design Changes:** When design flaws were identified mid-sprint (e.g., merging AE-09 into the Interview screen, editable review queue), the team quickly updated the Figma mockups and BE endpoints to accommodate the new flow.
- **Issue Tracking:** GitHub Projects and issue dependencies were utilized more effectively this sprint to track blocking tasks.

---

## 3. What Didn't Go Well

### A. Frontend Delivery Lag

- **Issue:** Similar to Sprint 3, the Frontend is significantly behind the Backend. As of the final days of the sprint, major UI integrations (#118 Interview UI, #119 Session Result, #127 Focus Session, #169 Dashboard) remain open.
- **Root Cause:** FE capacity is bottlenecked. The volume of UI tasks exceeds the available FE bandwidth, especially when dealing with complex state management (e.g., multi-turn interview states).

### B. Late Start on QA and Documentation

- **Issue:** All 6 major documentation and QA tasks (#249, #250, #251, #252, #253, #226) were either unassigned or barely started with only 3 days left in the sprint.
- **Root Cause:** The team prioritized code over docs/tests during the first week and a half. Additionally, QA was waiting on UI completion to execute tests (#252), creating a hard dependency block.

### C. Scope Creep and Mid-Sprint Rework

- **Issue:** Decisions made on 04/08 (Week 8) to change the editable review queue behavior and session states caused cascading updates across DESIGN, BE, and pending FE tasks.
- **Root Cause:** Incomplete edge-case analysis during Sprint Planning led to design flaws being discovered during actual implementation, extending delivery timelines.

### D. Late Bug Triage

- **Issue:** Critical bugs like #267 (State Machine Traceback failure) and #268 (API Idempotency blocking) were flagged late in the sprint and only resolved on 08/08 (PR #281, #289) — one day before the deadline, leaving almost no margin.
- **Root Cause:** Lack of a dedicated bug-triage process during the sprint execution phase; developers were too focused on new features to circle back to bugfixes until the final days.

---

## 4. Action Items for Sprint 5

To address the root causes identified above, we should:

1. **Balance the FE/BE Workload:**
   - Shift some BE capacity to assist with FE integration, or reduce the scope of "nice-to-have" UI features to ensure core functionality is testable.
2. **"Docs & Tests First" Rule:**
   - Test Plans (#251) and Architecture revisions (#250) must be started in Week 1 of the sprint. Do not wait for code completion to write test cases.
3. **Design Freeze:**
   - Enforce a strict design freeze after the first 3 days of the sprint. Any UI/UX changes discovered after this point must be logged as technical debt for the next sprint unless they completely block user flows.
4. **Active Bug Triage:**
   - Team will review the bug backlog every standup/sync. Critical bugs must be addressed before picking up new feature tasks.
