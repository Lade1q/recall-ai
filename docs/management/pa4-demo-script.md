# PA4 Demo Script - Beta Release 0.5

**Estimated duration:** 5 - 7 minutes

**Objective:** Demonstrate "AI Examiner + trace-back connected to real grading data, demo-ready" (Per SDP 4.2.2 & 4.2.3).

**Note:** Focus on showing the core logic of the Trace-back feature and the Concept Graph Engine; the UI doesn't need to be overly polished (Release 0.5 Beta).

## Pre-Demo Preparation

- **Environment:** Staging (Frontend on Vercel, Backend on Render, DB on Neon/Supabase). Ensure Render is warmed up 5 minutes before the demo.
- **Account:** Use a demo account with pre-prepared data.
- **Data:** 1 Plan with a pre-analyzed concept graph (clear prerequisite relationships) and pre-generated `question_cache`. Avoid waiting 60s for PDF upload during the demo.
- **Backup (Plan B):** Have a local server ready (running via docker compose / npm run dev) and a pre-recorded video in case of network/Gemini API failure.

---

## Detailed Demo Steps

### 1. Login (0:00 - 0:30)

- **Action:** Open the browser, access the staging URL. Log in with the demo account.
- **Script:** _"Good day, Teacher. Group 7 would like to demo the most core feature of Recall AI in Beta Release 0.5."_

### 2. View existing plan & Concept Graph (0:30 - 1:30)

- **Action:** Switch to the Dashboard / Plan screen, show the concept graph.
- **Script:** _"This is the concept graph that the AI Study Planner automatically extracted from the document. The arrows indicate prerequisite relationships. For example, to understand 'Applicability and Trades-off of Agile method', the graph indicates that the learner must first master concepts 'Extreme Programming', 'Scrum' and 'Kanban'."_

### 3. Start Focus Session (1:30 - 2:00)

- **Action:** Click the start study button (Focus Session) for a concept. The Pomodoro countdown timer interface appears.
- **Script:** _"Before taking the test, users can start a Focus Session to review knowledge. The webapplication has an integrated Pomodoro timer to help learners maintain focus. After the theory study time is up, user can go straight to the Examiner section to take the test."_

### 4. Start Interview session (2:00 - 2:30)

- **Action:** Click the start Interview / Verify button for the recently studied concept.
- **Script:** _"Next, our group will demo the AI Examiner. Unlike normal multiple-choice tests, our AI will interview the user in a short essay format to evaluate deep understanding."_

### 5. Scenario 1 - Good answer (2:30 - 4:00)

- **Action:** AI Examiner asks the first question: _"According to the slides, what is Scrum and who developed it?"_. Enter the sample answer below.
- **Sample answer [CORRECT]:** _"Scrum is an Agile framework for managing and developing complex products, especially software. Scrum was not created by one person. The framework was developed primarily by Jeft Sutherland and Ken Schwaber."_
- **Script:** _"For the first question, we will answer correctly. As you can see, the AI Examiner doesn't just grade and move on; it continues to dig deeper or asks real-world scenario questions to check if the user truly understands how to apply it or is just memorizing definitions."_

### 6. Scenario 2 - Wrong prerequisite concept answer [CLIMAX] (4:00 - 5:30)

- **Action:** Continue to dig deeper into the concept. AI asks: _"Based on the Scrum roles and activities outlined in the material, what are the distinct responsibilities of the Product Owner compared to the Scrum Master during the development process?"_. Enter a sample answer demonstrating a fundamental knowledge gap.
- **Sample answer [FUNDAMENTAL ERROR]:** _"Product Owner write code, Scrum Master manage scrum and plan."_
- **Script:** _"Now for the most important part. We intentionally answer incorrectly. According to our limited-turn design, the AI will soon end the interview session to optimize API cost and move to the evaluation step."_

### 7. Results screen & Traceback (5:30 - 6:30)

- **Action:** Complete the Interview, show the Results screen (Score, AI Feedback). Emphasize the **Traceback block**.
- **Script:** _"This is the results screen. The best part of the system is this Traceback block. The system automatically performed a reverse graph traversal and discovered that: The reason the user doesn't understand 'Scrum' is because they are confusing it with 'Agile Manifesto', which means they have a gap in the root concepts of 'Scrum' and 'Agile Manifesto'. Instead of blindly forcing the user to relearn 'Scrum', the system automatically schedules a requirement for them to review 'Agile Manifesto' first."_

### 8. Closing Sale (6:30 - 7:30)

- **Action:** Keep the Traceback screen open.
- **Script:** _"In conclusion, our group has thoroughly surveyed existing tools. **Google NotebookLM** only creates flashcards, but its Spaced Repetition algorithm is incomplete. **Quizlet** and **RemNote** only focus on memorizing single keywords without multi-turn conversational quizzing._
  _The differentiator of Recall AI is the **Concept Graph Engine**. No competitor in the current market has the ability to automatically trace knowledge gaps back to the root concept. This is true active learning and solves the problem of rote memorization."_

---

## Fallback Plans

1. **Weak network in the demo room:**
   - Use the `docker compose up` or `npm run dev` command to run the entire application locally (a `.env.example` file is available). Play the pre-recorded video for narration instead of clicking directly.
   - **Demo Video Link:** [Google Drive](https://drive.google.com/file/d/1J3RqYfyeqjjzvoTVxGUnjqQIm3XdGcxq/view?usp=sharing)
