**Weekly Report**

**03/08/2026– 09/08/2026**

Group ID: **7**

Project Name: Recall AI

Prepared by: **Thai Nguyen Tuan Kiet**

Team members:

24127597 - **Thai Nguyen Tuan Kiet** _Project manager + UI/UX Designer_

24127514 - **Nguyen The Quan** _System Architect + Fullstack Developer_

24127482 - **Nguyen Minh Phat** _QA + Fullstack Developer_

24127148 - **Nguyen Phuong Gia Bao** _Frontend Leader_

24127487 - **Ngo Van Phong** _Backend Leader_

# **1. Achievements since last week:**

| STT | Description                                                                                            | Due Date | Responsibility        | %Complete |
| --- | :----------------------------------------------------------------------------------------------------- | :------- | :-------------------- | :-------- |
| 1   | I6.4 - [BE] Question Cache (AE-06) + Fallback Flashcard (AE-05)                                        | 03/08/26 | Ngo Van Phong         | 100%      |
| 2   | I6.5 - [BE] Final session result: summarize_session (AE-09)                                            | 04/08/26 | Ngo Van Phong         | 100%      |
| 3   | I9.1 - [UI] Figma: Interview, Session Result, Focus Session screens                                    | 04/08/26 | Thai Nguyen Tuan Kiet | 100%      |
| 4   | [FE] Source excerpt highlight — mark concept name being viewed (DB-06)                                 | 04/08/26 | Nguyen The Quan       | 100%      |
| 5   | [BE] Anchor C5 source on Interview question response (AE-02 step 3)                                    | 04/08/26 | Nguyen The Quan       | 100%      |
| 6   | [BE] Capture source citation snapshot on InterviewTurn at question time (C5)                           | 04/08/26 | Nguyen The Quan       | 100%      |
| 7   | [BE] Early session end and grade partial completion (AE-03)                                            | 05/08/26 | Nguyen The Quan       | 100%      |
| 8   | [DESIGN] Merge AE-09 into screen-interview.html as final session state                                 | 05/08/26 | Nguyen The Quan       | 100%      |
| 9   | I8.1 - [BE] API Focus Session + Pomodoro Config                                                        | 05/08/26 | Ngo Van Phong         | 100%      |
| 10  | [DESIGN] Mockup editable review queue in Study Plan screen                                             | 05/08/26 | Nguyen The Quan       | 100%      |
| 11  | [BE] ReviewQueueItem.status: scheduled-now, user action = remove / re-add only                         | 05/08/26 | Nguyen The Quan       | 100%      |
| 12  | [DESIGN] screen-focus-session — 2 missing states: enter /focus without concept + Pomodoro config panel | 05/08/26 | Nguyen The Quan       | 100%      |
| 13  | [BE] Dashboard Statistics API — study streak, weekly time, mastery ≥ 0.8 (DB-01)                       | 05/08/26 | Ngo Van Phong         | 100%      |
| 14  | [BE] Plan auto-activates on analysis complete, skipping graph validation step (SP-01) — bugfix         | 06/08/26 | Nguyen The Quan       | 100%      |
| 15  | [BE] Validate PDF is readable (not encrypted) at upload time                                           | 06/08/26 | Ngo Van Phong         | 100%      |
| 16  | [FE] Graph validation step (SP-01) — add Cancel button + confirmation note + commit UX                 | 06/08/26 | Thai Nguyen Tuan Kiet | 100%      |
| 17  | [BE] /review-queue/today: fallback A3 overrides due reviews                                            | 06/08/26 | Nguyen The Quan       | 100%      |
| 18  | [BE] Review queue data gaps blocking Dashboard & Study Plan — bugfix                                   | 06/08/26 | Nguyen The Quan       | 100%      |
| 19  | [DESIGN] screen-dashboard — 7 missing states + 2 inconsistent sample data points                       | 06/08/26 | Nguyen The Quan       | 100%      |

# **2. Issues and impacts:**

1. **FE is significantly behind BE (same pattern as Sprint 3).** As of 08/08, major FE issues #119 (UI Session Result + Traceback Panel), and #166 (Profile page) are still Todo, #169 (Dashboard UI) is In Progress.

2. **Several mid-sprint design changes required rework.** Decisions made on 04/08 (merging AE-09 into the Interview screen as the final session state, changing editable review queue behavior) caused cascading updates to DESIGN mockups (#222, #223, #229), BE endpoints (#224), and pending FE tasks. This extended delivery timelines for impacted tasks.

3. **Documentation and QA tasks are partially started but at risk.** Status as of 06/08:

   | Issue | Title                                       | Assignee                                                 | Status      |
   | :---- | :------------------------------------------ | :------------------------------------------------------- | :---------- |
   | #249  | TA Feedback Remediation Tracker (PA2 + PA3) | Thai Nguyen Tuan Kiet, Nguyen The Quan, Nguyen Minh Phat | Todo        |
   | #250  | Revise SAD v2.0                             | Nguyen The Quan, Ngo Van Phong                           | Todo        |
   | #251  | Test Plan + Test Cases (≥5/UC)              | Nguyen Minh Phat                                         | In Progress |
   | #252  | Test Execution Report                       | Nguyen Minh Phat                                         | Todo        |
   | #253  | Final UI Design (PA4 item b)                | Thai Nguyen Tuan Kiet                                    | Todo        |

# **3. Next week's goals:**

| STT | Description                                                                                                                                      | Due Date | Responsibility                                              |
| --- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :------- | :---------------------------------------------------------- |
| 1   | **Focus Session Features (FS-04, FS-05):** Document viewer and quick notes in session (#227, #228)                                               | 16/08/26 | Nguyen Phuong Gia Bao, Ngo Van Phong                        |
| 2   | **History & Progress Dashboard (DB-03, DB-08, DB-09):** Interview history, study sessions tab, skip today's suggestions (#245, #246, #247, #233) | 16/08/26 | Nguyen Phuong Gia Bao, Ngo Van Phong                        |
| 3   | **Study Plan Enhancements (SP-01, SP-05):** Manual concept entry, plan reanalysis, manual difficulty setting (#170, #172, #211)                  | 16/08/26 | Nguyen Phuong Gia Bao, Ngo Van Phong                        |
| 4   | **AI Examiner Edge Cases (AE-10):** Grade feedback logs, NO_MATERIAL plans, question cache invalidation (#216, #248, #272)                       | 16/08/26 | Nguyen Phuong Gia Bao, Ngo Van Phong                        |
| 5   | **UI/UX & Tech Debt:** Accessibility focus rings (Tailwind v4), missing SP-03 mockup states, logic fixes (#244, #269, #271)                      | 16/08/26 | Thai Nguyen Tuan Kiet, Nguyen Phuong Gia Bao, Ngo Van Phong |
