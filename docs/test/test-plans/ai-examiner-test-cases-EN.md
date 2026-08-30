# Test Case Template — AI Examiner

> **Module:** AI Examiner
> **Reference Use Case:** Epic #108, Use-case_Specification section 2.3
> **Author:** Nguyen Minh Phat
> **Created Date:** 2026-08-04
> **Updated Date:** 2026-08-08
> **Version:** 1.0
> **General Test Type:** Functionality / Security / Integration

---

## TC-AE-001: Good responses for all 3 turns (Basic Flow - Happy Path)

| Field                  | Content                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Basic conversation flow (CF-01)                                                                                                                                                                                        |
| **TC ID**              | TC-AE-001                                                                                                                                                                                                              |
| **Title**              | Good responses for all 3 turns, system asks deeper questions and does not trigger traceback                                                                                                                            |
| **Description**        | Test the flow where the user provides good answers for 3 consecutive turns                                                                                                                                             |
| **Test Type**          | Functionality                                                                                                                                                                                                          |
| **Priority**           | High                                                                                                                                                                                                                   |
| **Prerequisites**      | Prerequisite PDF document is loaded. Started the concept testing session.                                                                                                                                              |
| **Execution Steps**    | 1. Start the testing session with the first concept.<br>2. Enter a detailed and accurate answer.<br>3. Wait for the AI to score and provide the next question.<br>4. Repeat steps 2-3 until all 3 turns are completed. |
| **Input Data**         | Accurate and meaningful answers for each question.                                                                                                                                                                     |
| **Expected Result**    | - System evaluates a high `mastery_score`.<br>- Each turn features a deeper question than the previous one.<br>- Traceback mechanism is not triggered.                                                                 |
| **Actual Result**      | Verdict: `deep` (Score: 1.00). State Machine stops correctly at Turn 3.                                                                                                                                                |
| **Status**             | PASS                                                                                                                                                                                                                   |
| **Note**               |                                                                                                                                                                                                                        |
| **Comment**            |                                                                                                                                                                                                                        |

---

## TC-AE-002: Superficial response (Verdict shallow)

| Field                  | Content                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Basic conversation flow (CF-02)                                                                                                                            |
| **TC ID**              | TC-AE-002                                                                                                                                                  |
| **Title**              | Superficial response, system requests a deeper explanation                                                                                                 |
| **Description**        | Test the system's reaction when the user only provides a basic definition without depth.                                                                   |
| **Test Type**          | Functionality                                                                                                                                              |
| **Priority**           | High                                                                                                                                                       |
| **Prerequisites**      | Started the concept testing session.                                                                                                                       |
| **Execution Steps**    | 1. Receive a question from the system.<br>2. Enter an answer containing only a brief, superficial definition.<br>3. Submit the answer and view the result. |
| **Input Data**         | Answer that just copies the definition, superficial.                                                                                                       |
| **Expected Result**    | - Verdict returned is `shallow`.<br>- The next question is a query forcing a clearer explanation.                                                          |
| **Actual Result**      | Verdict: `shallow` (Score: 0.50). State Machine pivots to ask WHY.                                                                                         |
| **Status**             | PASS                                                                                                                                                       |
| **Note**               |                                                                                                                                                            |
| **Comment**            |                                                                                                                                                            |

---

## TC-AE-003: Incorrect response for a concept WITH prerequisites (Traceback)

| Field                  | Content                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Traceback (CF-03)                                                                                                                                                                                                                                                |
| **TC ID**              | TC-AE-003                                                                                                                                                                                                                                                        |
| **Title**              | Incorrect response on a concept with prerequisites, system runs traceback                                                                                                                                                                                        |
| **Description**        | Ensure the system detects core knowledge gaps and transitions to the prerequisite concept.                                                                                                                                                                       |
| **Test Type**          | Functionality                                                                                                                                                                                                                                                    |
| **Priority**           | High                                                                                                                                                                                                                                                             |
| **Prerequisites**      | Currently testing a concept that has a prerequisite concept in the structure.                                                                                                                                                                                    |
| **Execution Steps**    | 1. Receive a question about the current concept.<br>2. Enter a completely incorrect answer.<br>3. Submit the answer and check the result.                                                                                                                        |
| **Input Data**         | Incorrect answer.                                                                                                                                                                                                                                                |
| **Expected Result**    | - Immediately terminate the current concept.<br>- Traceback mechanism runs and finds the prerequisite concept.<br>- The prerequisite concept is scheduled to be learned immediately (`scheduledFor: now`) at the top of the queue for the next learning session. |
| **Actual Result**      | Verdict: `wrong` (0.00). System terminates the concept, runs Traceback in the background, and schedules the prerequisite at the top of the queue for the next session, exactly as designed in AE-07.                                                             |
| **Status**             | PASS                                                                                                                                                                                                                                                             |
| **Note**               | This scenario must PASS to be demoed.                                                                                                                                                                                                                            |
| **Comment**            |                                                                                                                                                                                                                                                                  |

---

## TC-AE-004: Incorrect response for a concept WITHOUT prerequisites (Spaced Repetition)

| Field                  | Content                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Spaced Repetition (CF-04)                                                                                                                                        |
| **TC ID**              | TC-AE-004                                                                                                                                                        |
| **Title**              | Incorrect response on a concept without prerequisites, system falls back to spaced repetition                                                                    |
| **Description**        | Ensure the system does not run traceback when the concept has no dependent prerequisites.                                                                        |
| **Test Type**          | Functionality                                                                                                                                                    |
| **Priority**           | Medium                                                                                                                                                           |
| **Prerequisites**      | Currently testing a base concept (no prerequisites).                                                                                                             |
| **Execution Steps**    | 1. Receive a question about the base concept.<br>2. Enter a completely incorrect answer.<br>3. Submit the answer and check the system's behavior.                |
| **Input Data**         | Incorrect answer.                                                                                                                                                |
| **Expected Result**    | - Immediately terminate the current concept.<br>- Do not trigger traceback (since there are no prerequisites).<br>- System falls back to spaced repetition mode. |
| **Actual Result**      | Verdict: `wrong` (0.00). System immediately terminates the current concept, no Traceback, ends the session, and puts it into Spaced Repetition.                  |
| **Status**             | PASS                                                                                                                                                             |
| **Note**               |                                                                                                                                                                  |
| **Comment**            |                                                                                                                                                                  |

---

## TC-AE-005: AF1 - AI timeout / out of quota (Fallback Flashcard)

| Field                  | Content                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Fallback Mechanism (CF-05)                                                                                                                                                            |
| **TC ID**              | TC-AE-005                                                                                                                                                                             |
| **Title**              | Handle when AI times out or API quota is exhausted                                                                                                                                    |
| **Description**        | Verify the system safely switches to Flashcard mode without crashing the web app when the API fails.                                                                                  |
| **Test Type**          | Functionality                                                                                                                                                                         |
| **Priority**           | High                                                                                                                                                                                  |
| **Prerequisites**      | Started the testing session. Intentionally change `GEMINI_API_KEY` to an incorrect key to simulate API error.                                                                         |
| **Execution Steps**    | 1. Answer any question and submit.<br>2. API returns an error due to incorrect key/exhausted quota.<br>3. Check the UI and DB.                                                        |
| **Input Data**         | Any answer. Incorrect `GEMINI_API_KEY`.                                                                                                                                               |
| **Expected Result**    | - System switches to fallback Flashcard screen (manual grading).<br>- Session does not crash.<br>- Self-graded score is still recorded in DB with appropriate `InterviewTurn.source`. |
| **Actual Result**      | API disconnected -> Smoothly transitions to self-graded Flashcard UI.                                                                                                                 |
| **Status**             | PASS                                                                                                                                                                                  |
| **Note**               | This scenario must PASS to be demoed.                                                                                                                                                 |
| **Comment**            |                                                                                                                                                                                       |

---

## TC-AE-006: AF2 - Student pauses

| Field                  | Content                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Pause/Resume (CF-06)                                                                                                                                            |
| **TC ID**              | TC-AE-006                                                                                                                                                       |
| **Title**              | Pause session, close tab, and return to resume at the correct progress                                                                                          |
| **Description**        | Ensure the system saves the learning session state (state machine) when the user leaves midway.                                                                 |
| **Test Type**          | Functionality                                                                                                                                                   |
| **Priority**           | High                                                                                                                                                            |
| **Prerequisites**      | In the middle of a testing session.                                                                                                                             |
| **Execution Steps**    | 1. Press F5 or close the browser completely.<br>2. Reopen the browser and re-access the current learning session.                                               |
| **Input Data**         | Browser interaction (F5/close tab).                                                                                                                             |
| **Expected Result**    | - Learning session is accurately restored to the concept currently being learned.<br>- Correctly restore the number of remaining question turns in the session. |
| **Actual Result**      | F5 the web page -> UI remembers the exact position stuck at the Flashcard.                                                                                      |
| **Status**             | PASS                                                                                                                                                            |
| **Note**               |                                                                                                                                                                 |
| **Comment**            |                                                                                                                                                                 |

---

## TC-AE-007: AF3 - Skip concept (Deferred)

| Field                  | Content                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| **Function / Feature** | Skip concept                                                          |
| **TC ID**              | TC-AE-007                                                             |
| **Title**              | Skip the concept currently being learned (AE-04)                      |
| **Description**        | Placeholder for the skip concept feature to be developed in Sprint 5. |
| **Test Type**          | Functionality                                                         |
| **Priority**           | Low                                                                   |
| **Prerequisites**      | TBD                                                                   |
| **Execution Steps**    | TBD                                                                   |
| **Input Data**         | TBD                                                                   |
| **Expected Result**    | TBD                                                                   |
| **Actual Result**      | _(fill in after testing)_                                             |
| **Status**             | Deferred                                                              |
| **Note**               | Belongs to Sprint 5 (AE-04)                                           |
| **Comment**            |                                                                       |

---

## TC-AE-008: AF4 - Appeal grading result (Deferred)

| Field                  | Content                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| **Function / Feature** | Appeal result                                                                  |
| **TC ID**              | TC-AE-008                                                                      |
| **Title**              | Appeal the AI's grading result (AE-10)                                         |
| **Description**        | Placeholder for the appeal grading result feature to be developed in Sprint 5. |
| **Test Type**          | Functionality                                                                  |
| **Priority**           | Low                                                                            |
| **Prerequisites**      | TBD                                                                            |
| **Execution Steps**    | TBD                                                                            |
| **Input Data**         | TBD                                                                            |
| **Expected Result**    | TBD                                                                            |
| **Actual Result**      | _(fill in after testing)_                                                      |
| **Status**             | Deferred                                                                       |
| **Note**               | Belongs to Sprint 5 (AE-10)                                                    |
| **Comment**            |                                                                                |

---

## TC-AE-009: Constraint C6 - Max 3 question turns

| Field                  | Content                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Limit question turns                                                                                                                                          |
| **TC ID**              | TC-AE-009                                                                                                                                                     |
| **Title**              | System stops at a maximum of 3 consecutive deep question turns                                                                                                |
| **Description**        | Check the question turn limit (C6) to prevent the AI from asking endlessly.                                                                                   |
| **Test Type**          | Functionality                                                                                                                                                 |
| **Priority**           | High                                                                                                                                                          |
| **Prerequisites**      | New testing session.                                                                                                                                          |
| **Execution Steps**    | 1. Answer the 1st question (verdict deep/shallow).<br>2. Answer the 2nd question.<br>3. Answer the 3rd question.<br>4. Submit the answer and view the result. |
| **Input Data**         | Answer that triggers a verdict requiring further questioning (continuous deep).                                                                               |
| **Expected Result**    | - System must stop after the 3rd turn.<br>- A 4th question must not be generated.                                                                             |
| **Actual Result**      | System automatically stops at turn 3 (CF-01) according to constraint C6.                                                                                      |
| **Status**             | PASS                                                                                                                                                          |
| **Note**               |                                                                                                                                                               |
| **Comment**            |                                                                                                                                                               |

---

## TC-AE-010: Security - Access Control

| Field                  | Content                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | Security                                                                                                               |
| **TC ID**              | TC-AE-010                                                                                                              |
| **Title**              | User A accessing User B's session API is denied with a 404 code                                                        |
| **Description**        | Ensure user learning session data is secured and cannot be accessed cross-privilege.                                   |
| **Test Type**          | Security                                                                                                               |
| **Priority**           | High                                                                                                                   |
| **Prerequisites**      | Have accounts for User A and User B. User B has created a testing session (has session ID).                            |
| **Execution Steps**    | 1. Log in as User A and get the JWT Token.<br>2. Call the API to access User B's testing session using User A's Token. |
| **Input Data**         | User A's Token, API URL containing User B's session ID.                                                                |
| **Expected Result**    | - API returns a `404 Not Found` error code (not 403 to avoid leaking information about the ID's existence).            |
| **Actual Result**      | API returns `404 Not Found` as designed.                                                                               |
| **Status**             | PASS                                                                                                                   |
| **Note**               | Tested on 2026-08-08 using the `test-api.ts` script.                                                                   |
| **Comment**            | System returning 404 (not 403) is exactly as designed — hiding the existence of the session ID.                        |

---

## TC-AE-011: Idempotency

| Field                  | Content                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | API Idempotency                                                                                                                                                                                                                               |
| **TC ID**              | TC-AE-011                                                                                                                                                                                                                                     |
| **Title**              | Sending 2 consecutive POST /answers requests only creates 1 turn                                                                                                                                                                              |
| **Description**        | Ensure the system does not create garbage data or duplicate turns when the user double-clicks.                                                                                                                                                |
| **Test Type**          | Interface / Database                                                                                                                                                                                                                          |
| **Priority**           | High                                                                                                                                                                                                                                          |
| **Prerequisites**      | Currently on the question answering screen of a testing session.                                                                                                                                                                              |
| **Execution Steps**    | 1. Create a learning session via API, let the question appear on the UI (do not answer).<br>2. Run the `test-idempotency.ts` script with the actual `SESSION_ID` and `TOKEN`, fire 2 `POST /answers` requests concurrently via `Promise.all`. |
| **Input Data**         | Learning session with a pending question; the same answer payload is sent 2 times simultaneously.                                                                                                                                             |
| **Expected Result**    | - Only 1 answer turn is created in the Database.<br>- System safely handles duplicate requests (e.g., the second request waits for the first and returns the same result).                                                                    |
| **Actual Result**      | DB only created 1 turn. Both requests are 200, but 1 request returned with the flag `replayed: true`. Working as designed.                                                                                                                    |
| **Status**             | PASS                                                                                                                                                                                                                                          |
| **Note**               | Tested on 2026-08-08 using the `test-idempotency.ts` script. Removed the bug report due to re-analyzing the system.                                                                                                                           |
| **Comment**            | The system design is very smart! Returning 200 with `replayed: true` instead of `409` helps the client avoid writing automatic retry code.                                                                                                    |

---

## Summary Table — AI Examiner

| TC ID     | Title                                                                                         | Type                 | Priority | Status   |
| --------- | --------------------------------------------------------------------------------------------- | -------------------- | -------- | -------- |
| TC-AE-001 | Good responses for all 3 turns, system asks deeper questions and does not trigger traceback   | Functionality        | High     | `PASS`   |
| TC-AE-002 | Superficial response, system requests a deeper explanation                                    | Functionality        | High     | `PASS`   |
| TC-AE-003 | Incorrect response on a concept with prerequisites, system runs traceback                     | Functionality        | High     | `PASS`   |
| TC-AE-004 | Incorrect response on a concept without prerequisites, system falls back to spaced repetition | Functionality        | Medium   | `PASS`   |
| TC-AE-005 | Handle when AI times out or API quota is exhausted                                            | Functionality        | High     | `PASS`   |
| TC-AE-006 | Pause session, close tab, and return to resume at the correct progress                        | Functionality        | High     | `PASS`   |
| TC-AE-007 | Skip the concept currently being learned (AE-04)                                              | Functionality        | Low      | Deferred |
| TC-AE-008 | Appeal the AI's grading result (AE-10)                                                        | Functionality        | Low      | Deferred |
| TC-AE-009 | System stops at a maximum of 3 consecutive deep question turns                                | Functionality        | High     | `PASS`   |
| TC-AE-010 | User A accessing User B's session API is denied with a 404 code                               | Security             | High     | `PASS`   |
| TC-AE-011 | Sending 2 consecutive POST /answers requests only creates 1 turn                              | Interface / Database | High     | `PASS`   |
