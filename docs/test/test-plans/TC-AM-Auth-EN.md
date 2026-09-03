# Test Cases — Authentication Module (AM)

> **Module:** Account Management — Authentication  
> **Reference Use Cases:** UC-01 (Register), UC-02 (Login)  
> **Created Date:** 2026-07-24  
> **Version:** 1.1  
> **Test Type:** Integration (API) + Functionality (UI/E2E)

---

## Table of Contents

### UC-01: Register

**API Tests**

- [TC-AM-01-01](#tc-am-01-01-successful-registration-with-valid-data) — Successful registration with valid data
- [TC-AM-01-02](#tc-am-01-02-registration-failed-email-already-exists) — Registration failed — Email already exists (409)
- [TC-AM-01-03](#tc-am-01-03-registration-failed-password-less-than-8-characters) — Registration failed — Password < 8 characters (400)
- [TC-AM-01-04](#tc-am-01-04-registration-failed-invalid-email-format) — Registration failed — Invalid email format (400)
- [TC-AM-01-05](#tc-am-01-05-registration-failed-missing-required-fields) — Registration failed — Missing required fields (400)
- [TC-AM-01-06](#tc-am-01-06-registration-failed-name-less-than-2-characters) — Registration failed — `name` < 2 characters (400)
- [TC-AM-01-07](#tc-am-01-07-successful-registration-valid-response-schema) — Successful registration — Valid response schema
- [TC-AM-01-08](#tc-am-01-08-registration-failed-password-is-only-whitespace) — Registration failed — Password is only whitespace (400)

**UI / E2E Tests**

- [TC-AM-01-UI-01](#tc-am-01-ui-01-successful-registration-happy-path) — Successful registration (Happy Path)
- [TC-AM-01-UI-02](#tc-am-01-ui-02-registration-failed-email-already-exists) — Registration failed — Email already exists
- [TC-AM-01-UI-03](#tc-am-01-ui-03-registration-failed-password-too-short) — Registration failed — Password too short (< 8 characters)
- [TC-AM-01-UI-04](#tc-am-01-ui-04-registration-failed-invalid-email-format) — Registration failed — Invalid email format
- [TC-AM-01-UI-05](#tc-am-01-ui-05-registration-failed-name-too-short) — Registration failed — Name too short (< 2 characters)
- [TC-AM-01-UI-06](#tc-am-01-ui-06-registration-failed-passwords-do-not-match) — Registration failed — Passwords do not match

### UC-02: Login

**API Tests**

- [TC-AM-02-01](#tc-am-02-01-successful-login-with-valid-data) — Successful login with valid data
- [TC-AM-02-02](#tc-am-02-02-login-failed-incorrect-password) — Login failed — Incorrect password (401)
- [TC-AM-02-03](#tc-am-02-03-login-failed-email-does-not-exist) — Login failed — Email does not exist (401)
- [TC-AM-02-04](#tc-am-02-04-protected-route-no-token) — Protected route — No token (401)
- [TC-AM-02-05](#tc-am-02-05-protected-route-expired-token) — Protected route — Expired token (401)
- [TC-AM-02-06](#tc-am-02-06-login-failed-missing-required-fields) — Login failed — Missing required fields (400)
- [TC-AM-02-07](#tc-am-02-07-protected-route-valid-token) — Protected route — Valid token (200)
- [TC-AM-02-08](#tc-am-02-08-successful-refresh-token) — Successful Refresh Token (200)
- [TC-AM-02-09](#tc-am-02-09-refresh-token-failed-invalid-token) — Refresh Token failed — Invalid/Expired token (401)
- [TC-AM-02-10](#tc-am-02-10-protected-route-invalid-bearer-format) — Protected route — Invalid Bearer format (401)

**UI / E2E Tests**

- [TC-AM-02-UI-01](#tc-am-02-ui-01-successful-login-happy-path) — Successful login (Happy Path)
- [TC-AM-02-UI-02](#tc-am-02-ui-02-login-failed-incorrect-password) — Login failed — Incorrect password
- [TC-AM-02-UI-03](#tc-am-02-ui-03-login-failed-email-never-registered) — Login failed — Email never registered
- [TC-AM-02-UI-04](#tc-am-02-ui-04-login-failed-leave-required-fields-empty) — Login failed — Leave required fields empty

---

## UC-01: Register

**Endpoint:** `POST /api/v1/auth/register`

---

### TC-AM-01-01: Successful registration with valid data

| Field                  | Content                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Register                                                                                                                                                                                                                                                                                                                                     |
| **TC ID**              | TC-AM-01-01                                                                                                                                                                                                                                                                                                                                          |
| **Title**              | Successful registration with valid data                                                                                                                                                                                                                                                                                                              |
| **Description**        | Send a POST request with a valid email, password with at least 8 characters, and name with at least 2 characters. The system must create a new account and return JWT tokens.                                                                                                                                                                        |
| **Test Type**          | Functionality / Interface                                                                                                                                                                                                                                                                                                                            |
| **Priority**           | High                                                                                                                                                                                                                                                                                                                                                 |
| **Prerequisites**      | - Server is running at `http://localhost:3001`<br>- Test database is connected<br>- Email `newuser@example.com` does not exist in DB (reset by `npm run test:seed`)                                                                                                                                                                                  |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body (see below)<br>4. Send the request<br>5. Check HTTP status code<br>6. Check Response Body                                                                                                                 |
| **Test Data**          | `email: "newuser@example.com"`<br>`password: "SecurePass1"`<br>`name: "Nguyen Van A"`                                                                                                                                                                                                                                                                |
| **Expected Result**    | - HTTP Status: **201 Created**<br>- Response body has `"success": true`<br>- `data.user` contains correct `id`, `email`, `name`<br>- `data.accessToken` is a non-empty JWT string<br>- `data.refreshToken` is a non-empty JWT string<br>- `password` **does not** appear in the response<br>- Database has a new user record with the provided email |
| **Actual Result**      | HTTP 201 Created. `success: true`. `data.user` has exactly 3 fields `id`, `email`, `name`. `accessToken` and `refreshToken` are valid JWTs. `password` is not exposed in the response.                                                                                                                                                               |
| **Status**             | Pass                                                                                                                                                                                                                                                                                                                                                 |
| **Notes**              | This is the main happy path. If this TC fails, other TCs for UC-01 might not be executable.                                                                                                                                                                                                                                                          |

---

### TC-AM-01-02: Registration failed — Email already exists

| Field                  | Content                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Exception Flow [E1]                                                                                                                                                                                                                                     |
| **TC ID**              | TC-AM-01-02                                                                                                                                                                                                                                                     |
| **Title**              | Registration failed when the email already exists in the system                                                                                                                                                                                                 |
| **Description**        | Send a registration request with an email that is already in the DB. The system must reject and return HTTP 409 Conflict with error code `EMAIL_CONFLICT`.                                                                                                      |
| **Test Type**          | Functionality / Database                                                                                                                                                                                                                                        |
| **Priority**           | High                                                                                                                                                                                                                                                            |
| **Prerequisites**      | - Server is running<br>- An account with email `existing@example.com` **already exists** in DB (can be created using TC-AM-01-01 beforehand)                                                                                                                    |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with the existing email<br>4. Send the request<br>5. Check HTTP status code<br>6. Check Response Body and error code |
| **Test Data**          | `email: "existing@example.com"` _(existing email)_<br>`password: "AnotherPass1"`<br>`name: "Nguyen Van B"`                                                                                                                                                      |
| **Expected Result**    | - HTTP Status: **409 Conflict**<br>- Response body has `"success": false`<br>- `error.code` = `"EMAIL_CONFLICT"`<br>- `error.message` contains a message stating the email already exists<br>- **No** new record is created in the DB                           |
| **Actual Result**      | HTTP 409 Conflict. `success: false`. `error.code: "EMAIL_CONFLICT"`. `error.message` describes that the email exists. No duplicate record created in the DB.                                                                                                    |
| **Status**             | Pass                                                                                                                                                                                                                                                            |
| **Notes**              | Important: Double check the DB to make sure there are no duplicate records.                                                                                                                                                                                     |

---

### TC-AM-01-03: Registration failed — Password < 8 characters

| Field                  | Content                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Exception Flow [E2]                                                                                                                                                                                                                          |
| **TC ID**              | TC-AM-01-03                                                                                                                                                                                                                                          |
| **Title**              | Registration failed when the password length is less than 8 characters                                                                                                                                                                               |
| **Description**        | Send a registration request with a password of only 7 characters. The system must reject at the validation layer and return HTTP 400 with error code `VALIDATION_ERROR`.                                                                             |
| **Test Type**          | Functionality                                                                                                                                                                                                                                        |
| **Priority**           | High                                                                                                                                                                                                                                                 |
| **Prerequisites**      | - Server is running<br>- Email `shortpass@example.com` does not exist in DB                                                                                                                                                                          |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with a 7-character password<br>4. Send the request<br>5. Check HTTP status code<br>6. Check Response Body |
| **Test Data**          | `email: "shortpass@example.com"`<br>`password: "Pass123"` _(7 characters)_<br>`name: "Test User"`                                                                                                                                                    |
| **Expected Result**    | - HTTP Status: **400 Bad Request**<br>- Response body has `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` contains error information for the `password` field<br>- **No** record is created in the DB               |
| **Actual Result**      | HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` specifies the `password` field does not meet length requirements.                                                                                          |
| **Status**             | Pass                                                                                                                                                                                                                                                 |
| **Notes**              | Boundary test: password is exactly 7 chars (< 8). Also, testing exactly 8 chars should Pass (see TC-AM-01-01).                                                                                                                                       |

---

### TC-AM-01-04: Registration failed — Invalid email format

| Field                  | Content                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation                                                                                                                                                                                                                                                              |
| **TC ID**              | TC-AM-01-04                                                                                                                                                                                                                                                                     |
| **Title**              | Registration failed with invalid email format                                                                                                                                                                                                                                   |
| **Description**        | Send a registration request with an incorrectly formatted email (missing `@`, missing domain, etc.). The system must reject and return HTTP 400.                                                                                                                                |
| **Test Type**          | Functionality                                                                                                                                                                                                                                                                   |
| **Priority**           | High                                                                                                                                                                                                                                                                            |
| **Prerequisites**      | - Server is running                                                                                                                                                                                                                                                             |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with an invalid email<br>4. Send the request<br>5. Check HTTP status code<br>6. Check Response Body                                  |
| **Test Data**          | The test suite is separated into 4 independent sub-cases (TC-AM-01-04a to 04d):<br>• **04a** `"spaces in@email.com"` _(contains space)_<br>• **04b** `"notanemail"` _(no @)_<br>• **04c** `"missing@"` _(missing domain)_<br>• **04d** `"@nodomain.com"` _(missing local part)_ |
| **Expected Result**    | For each invalid email:<br>- HTTP Status: **400 Bad Request**<br>- Response body has `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` contains error information for the `email` field<br>- **No** record is created in the DB                  |
| **Actual Result**      | All 4 sub-cases returned HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` specifies the `email` is invalid.                                                                                                                            |
| **Status**             | Pass (4/4 sub-cases)                                                                                                                                                                                                                                                            |
| **Notes**              | The test suite is divided into 4 separate `.request.yaml` files (TC-AM-01-04a to 04d) for more detailed reporting.                                                                                                                                                              |

---

### TC-AM-01-05: Registration failed — Missing required fields

| Field                  | Content                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation                                                                                                                                                                                                                                                                                                                                                               |
| **TC ID**              | TC-AM-01-05                                                                                                                                                                                                                                                                                                                                                                      |
| **Title**              | Registration failed when missing required fields in the request body                                                                                                                                                                                                                                                                                                             |
| **Description**        | Send a registration request missing one or more required fields (`email`, `password`, `name`). The system must return HTTP 400.                                                                                                                                                                                                                                                  |
| **Test Type**          | Functionality                                                                                                                                                                                                                                                                                                                                                                    |
| **Priority**           | Medium                                                                                                                                                                                                                                                                                                                                                                           |
| **Prerequisites**      | - Server is running                                                                                                                                                                                                                                                                                                                                                              |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Send request bodies with missing fields (case by case)<br>4. Check HTTP status code and response                                                                                                                                                         |
| **Test Data**          | The test suite is separated into 4 independent sub-cases (TC-AM-01-05a to 05d):<br>• **05a** — Missing `email`: `{ "password": "SecurePass1", "name": "Test" }`<br>• **05b** — Missing `password`: `{ "email": "test@example.com", "name": "Test" }`<br>• **05c** — Missing `name`: `{ "email": "test@example.com", "password": "SecurePass1" }`<br>• **05d** — Empty body: `{}` |
| **Expected Result**    | For each case:<br>- HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` clearly states which field is missing                                                                                                                                                                                                 |
| **Actual Result**      | All 4 sub-cases returned HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` specifies the missing field in each case.                                                                                                                                                                                                                     |
| **Status**             | Pass (4/4 sub-cases)                                                                                                                                                                                                                                                                                                                                                             |
| **Notes**              | The test suite is divided into 4 separate `.request.yaml` files (TC-AM-01-05a to 05d) for more detailed reporting.                                                                                                                                                                                                                                                               |

---

### TC-AM-01-06: Registration failed — name < 2 characters

| Field                  | Content                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation (Zod: name >= 2 chars)                                                                                                                                                                  |
| **TC ID**              | TC-AM-01-06                                                                                                                                                                                                |
| **Title**              | Registration failed when `name` length is less than 2 characters                                                                                                                                           |
| **Description**        | Zod schema requires `name >= 2 characters`. Sending a request with `name` as 1 character must be rejected with HTTP 400.                                                                                   |
| **Test Type**          | Functionality                                                                                                                                                                                              |
| **Priority**           | Medium                                                                                                                                                                                                     |
| **Prerequisites**      | - Server is running<br>- Email `shortname@example.com` does not exist in DB                                                                                                                                |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/register`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with a 1-character `name`<br>4. Send request and check response |
| **Test Data**          | `email: "shortname@example.com"`<br>`password: "SecurePass1"`<br>`name: "A"` _(1 character)_                                                                                                               |
| **Expected Result**    | - HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` contains error information for the `name` field                                   |
| **Actual Result**      | HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` specifies the `name` field does not meet the minimum length of 2 characters.                                     |
| **Status**             | Pass                                                                                                                                                                                                       |
| **Notes**              | Boundary test: name = 1 char (fail) vs name = 2 chars (pass).                                                                                                                                              |

---

### TC-AM-01-07: Successful registration — Valid response schema

| Field                  | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Contract Testing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **TC ID**              | TC-AM-01-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Title**              | Successful registration — Validate full response schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Description**        | Verify the detailed JSON response structure upon successful Registration: all fields are present, correct data types, no sensitive information exposed.                                                                                                                                                                                                                                                                                                                                                                                              |
| **Test Type**          | Interface / Security                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Priority**           | High                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Prerequisites**      | - Server is running<br>- Email `schema@example.com` does not exist in DB                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Steps to Reproduce** | 1. Send a successful Register request with valid data<br>2. Check each field in the response body:<br>&nbsp;&nbsp;a. `success` is `true` (boolean)<br>&nbsp;&nbsp;b. `data.user.id` is a string (UUID format)<br>&nbsp;&nbsp;c. `data.user.email` matches the entered email<br>&nbsp;&nbsp;d. `data.user.name` matches the entered name<br>&nbsp;&nbsp;e. `data.accessToken` is a non-empty string<br>&nbsp;&nbsp;f. `data.refreshToken` is a non-empty string<br>3. Verify that the response **does not have** a `password` or `passwordHash` field |
| **Test Data**          | `email: "schema@example.com"`<br>`password: "SecurePass1"`<br>`name: "Schema Test"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Expected Result**    | - HTTP Status: **201 Created**<br>- `data.user` has exactly 3 fields: `id`, `email`, `name`<br>- `data.user.password` **does not exist**<br>- `data.accessToken` and `data.refreshToken` are valid JWTs (can decode header/payload)                                                                                                                                                                                                                                                                                                                  |
| **Actual Result**      | HTTP 201 Created. `data.user` has exactly 3 fields `id`, `email`, `name`. `password` and `passwordHash` do not appear in the response. `accessToken` and `refreshToken` are valid JWTs.                                                                                                                                                                                                                                                                                                                                                              |
| **Status**             | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Notes**              | Security check: passwords must never be exposed in the response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

### TC-AM-01-08: Registration failed — Password is only whitespace

| Field                  | Content                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation (edge case)                                                                                                                                                    |
| **TC ID**              | TC-AM-01-08                                                                                                                                                                       |
| **Title**              | Registration failed when the password consists only of whitespaces                                                                                                                |
| **Description**        | Password `"        "` (8 whitespaces) technically meets the 8-character requirement but should not be accepted for security reasons. Check how the system handles this edge case. |
| **Test Type**          | Security / Functionality                                                                                                                                                          |
| **Priority**           | Medium                                                                                                                                                                            |
| **Prerequisites**      | - Server is running<br>- Email `spacepass@example.com` does not exist                                                                                                             |
| **Steps to Reproduce** | 1. Send a Register request with a password of 8 whitespaces<br>2. Check HTTP status and response                                                                                  |
| **Test Data**          | `email: "spacepass@example.com"`<br>`password: "        "` _(8 whitespace characters)_<br>`name: "Space Test"`                                                                    |
| **Expected Result**    | - HTTP Status: **400 Bad Request** _(should reject for security reasons)_                                                                                                         |
| **Actual Result**      | **HTTP 400 Bad Request**. The server rejects requests with whitespace-only passwords and returns a validation error.                                                              |
| **Status**             | Pass                                                                                                                                                                              |
| **Notes**              | Security check: Zod validator successfully rejects whitespace-only passwords using `trim()` / whitespace validation.                                                              |

---

## UC-01: UI / E2E Tests — Register

> **Test Type:** UI / End-to-End  
> **Tools:** Browser (Chrome/Firefox) — manual testing on UI  
> **Environment:** Frontend running at `http://localhost:5173` (or equivalent)

---

### TC-AM-01-UI-01: Successful registration (Happy Path)

| Field                  | Content                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Account Registration (UI)                                                                                                                                                                                                                          |
| **TC ID**              | TC-AM-01-UI-01                                                                                                                                                                                                                                             |
| **Title**              | Successful registration with valid data on UI                                                                                                                                                                                                              |
| **Description**        | Fill out the complete registration form with valid data and click the Register button. The system must create the account successfully and automatically redirect the page.                                                                                |
| **Test Type**          | UI / E2E                                                                                                                                                                                                                                                   |
| **Priority**           | High                                                                                                                                                                                                                                                       |
| **Prerequisites**      | - Frontend is running<br>- Email `testuser01@example.com` does not exist in DB                                                                                                                                                                             |
| **Steps to Reproduce** | 1. Open the registration page on a browser<br>2. Enter `Full Name`: `Nguyen Van A`<br>3. Enter `Email`: `testuser01@example.com`<br>4. Enter `Password`: `Password123!`<br>5. Enter `Confirm Password`: `Password123!`<br>6. Click the **Register** button |
| **Test Data**          | `Full Name`: `Nguyen Van A` _(≥ 2 chars)_<br>`Email`: `testuser01@example.com` _(new unregistered email)_<br>`Password`: `Password123!` _(≥ 8 chars)_<br>`Confirm Password`: `Password123!` _(matches)_                                                    |
| **Expected Result**    | - Registration successful, displays a success Toast/Notification<br>- Automatically redirects to the **Dashboard** page (or Login page)                                                                                                                    |
| **Actual Result**      | Registration successful, system automatically redirects to the Dashboard page (`/dashboard`).                                                                                                                                                              |
| **Status**             | Pass                                                                                                                                                                                                                                                       |
| **Notes**              | Main happy path for the UI Register flow.                                                                                                                                                                                                                  |

---

### TC-AM-01-UI-02: Registration failed — Email already exists

| Field                  | Content                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Exception Flow (UI)                                                                                                                                                                 |
| **TC ID**              | TC-AM-01-UI-02                                                                                                                                                                              |
| **Title**              | Registration failed when the email already exists in the system (UI)                                                                                                                        |
| **Description**        | Fill out the registration form with an email that is already in the DB. UI must display an error message and keep the form data intact.                                                     |
| **Test Type**          | UI / E2E                                                                                                                                                                                    |
| **Priority**           | High                                                                                                                                                                                        |
| **Prerequisites**      | - Frontend is running<br>- Email `testuser01@example.com` **already exists** in DB (reuse email from TC-AM-01-UI-01)                                                                        |
| **Steps to Reproduce** | 1. Open the registration page<br>2. Enter `Full Name`: `Nguyen Van B`, `Email`: `testuser01@example.com` _(already exists)_, `Password`: `Password123!`<br>3. Click the **Register** button |
| **Test Data**          | `Full Name`: `Nguyen Van B`<br>`Email`: `testuser01@example.com` _(reuse email from TC-AM-01-UI-01)_<br>`Password`: `Password123!`                                                          |
| **Expected Result**    | - UI displays a clear error message: _"Email đã được đăng ký"_ or _"Email already exists"_<br>- Does not redirect, keeps form data intact                                                   |
| **Actual Result**      | Displays a toast message in the bottom right corner: _"Email already exists"_. Stays on the registration form.                                                                              |
| **Status**             | Pass                                                                                                                                                                                        |
| **Notes**              | Similar to TC-AM-01-02 at the API level; this TC confirms the UI handles the error response from the Backend correctly.                                                                     |

---

### TC-AM-01-UI-03: Registration failed — Password too short

| Field                  | Content                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation UI                                                                                                                                                                                      |
| **TC ID**              | TC-AM-01-UI-03                                                                                                                                                                                             |
| **Title**              | Registration failed when password length is less than 8 characters (UI)                                                                                                                                    |
| **Description**        | Enter a password with only 7 characters. UI must display an inline validation error and prevent sending the request to the backend.                                                                        |
| **Test Type**          | UI / Validation                                                                                                                                                                                            |
| **Priority**           | High                                                                                                                                                                                                       |
| **Prerequisites**      | - Frontend is running                                                                                                                                                                                      |
| **Steps to Reproduce** | 1. Open the registration page<br>2. Enter `Full Name`: `Nguyen Van C`, `Email`: `test02@example.com`, `Password`: `Pass123` _(7 chars)_, `Confirm Password`: `Pass123`<br>3. Click the **Register** button |
| **Test Data**          | `Full Name`: `Nguyen Van C`<br>`Email`: `test02@example.com`<br>`Password`: `Pass123` _(only 7 chars)_<br>`Confirm Password`: `Pass123`                                                                    |
| **Expected Result**    | - Displays an inline error below the password field: _"Mật khẩu phải có ít nhất 8 ký tự"_ / _"Password must be at least 8 characters"_<br>- The Register button is disabled or request sending is blocked  |
| **Actual Result**      | Displays an inline error below the Password field: _"Password must be at least 8 characters"_.                                                                                                             |
| **Status**             | Pass                                                                                                                                                                                                       |
| **Notes**              | Validation occurs at the Frontend (client-side), no request is sent to the Backend.                                                                                                                        |

---

### TC-AM-01-UI-04: Registration failed — Invalid email format

| Field                  | Content                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation UI                                                                                                                                                         |
| **TC ID**              | TC-AM-01-UI-04                                                                                                                                                                |
| **Title**              | Registration failed with invalid email format (UI)                                                                                                                            |
| **Description**        | Enter an incorrectly formatted email. UI must display an inline validation error immediately upon blur or submit.                                                             |
| **Test Type**          | UI / Validation                                                                                                                                                               |
| **Priority**           | High                                                                                                                                                                          |
| **Prerequisites**      | - Frontend is running                                                                                                                                                         |
| **Steps to Reproduce** | 1. Open the registration page<br>2. Try the invalid email formats sequentially in the Email field<br>3. Click outside the input field (Blur) or click the **Register** button |
| **Test Data**          | Invalid email strings to test sequentially:<br>• `user@`<br>• `user@com`<br>• `user.com`<br>• `user@domain..com`                                                              |
| **Expected Result**    | Displays inline error message: _"Email không hợp lệ"_ / _"Invalid email address"_                                                                                             |
| **Actual Result**      | When entering invalid emails (e.g., `user@`), the system displays an inline error message below the Email field: _"Invalid email address"_.                                   |
| **Status**             | Pass                                                                                                                                                                          |
| **Notes**              | Tested 4 invalid formats. Validation occurs at the Frontend.                                                                                                                  |

---

### TC-AM-01-UI-05: Registration failed — Name too short

| Field                  | Content                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation UI                                                                                                                                                  |
| **TC ID**              | TC-AM-01-UI-05                                                                                                                                                         |
| **Title**              | Registration failed when username length is less than 2 characters (UI)                                                                                                |
| **Description**        | Enter a Full Name with only 1 character. UI must display an inline validation error.                                                                                   |
| **Test Type**          | UI / Validation                                                                                                                                                        |
| **Priority**           | Medium                                                                                                                                                                 |
| **Prerequisites**      | - Frontend is running                                                                                                                                                  |
| **Steps to Reproduce** | 1. Open the registration page<br>2. Enter `Full Name`: `A` _(1 char)_, `Email`: `testname@example.com`, `Password`: `Password123!`<br>3. Click the **Register** button |
| **Test Data**          | `Full Name`: `A` _(only 1 char)_<br>`Email`: `testname@example.com`<br>`Password`: `Password123!`                                                                      |
| **Expected Result**    | Displays error message: _"Tên phải có ít nhất 2 ký tự"_ / _"String must contain at least 2 character(s)"_                                                              |
| **Actual Result**      | Displays inline error message below the Full Name field: _"Name must be at least 2 characters"_.                                                                       |
| **Status**             | Pass                                                                                                                                                                   |
| **Notes**              | Boundary test: name = 1 char → fail; name = 2 chars → pass.                                                                                                            |

---

### TC-AM-01-UI-06: Registration failed — Passwords do not match

| Field                  | Content                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-01 — Validation UI                                                                                                                             |
| **TC ID**              | TC-AM-01-UI-06                                                                                                                                    |
| **Title**              | Registration failed when confirm password does not match (UI)                                                                                     |
| **Description**        | Enter a Confirm Password that is different from Password. UI must display an inline validation error.                                             |
| **Test Type**          | UI / Validation                                                                                                                                   |
| **Priority**           | High                                                                                                                                              |
| **Prerequisites**      | - Frontend is running                                                                                                                             |
| **Steps to Reproduce** | 1. Open the registration page<br>2. Enter `Password`: `Password123!`, `Confirm Password`: `DifferentPass123!`<br>3. Click the **Register** button |
| **Test Data**          | `Password`: `Password123!`<br>`Confirm Password`: `DifferentPass123!`                                                                             |
| **Expected Result**    | Displays inline error message: _"Mật khẩu xác nhận không trùng khớp"_ / _"Passwords do not match"_                                                |
| **Actual Result**      | Displays inline error message below the Confirm Password field: _"Passwords do not match"_.                                                       |
| **Status**             | Pass                                                                                                                                              |
| **Notes**              | This validation is only at the Frontend (no Confirm Password field in the API request).                                                           |

---

## UC-02: Login

**Main Endpoint:** `POST /api/v1/auth/login`  
**Protected route used for testing:** `GET /api/v1/auth/me`

---

### TC-AM-02-01: Successful login with valid data

| Field                  | Content                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Login                                                                                                                                                                                                                                                          |
| **TC ID**              | TC-AM-02-01                                                                                                                                                                                                                                                            |
| **Title**              | Successful login with valid email and password                                                                                                                                                                                                                         |
| **Description**        | Send a POST Login request with a correct registered email and password. The system must authenticate successfully and return JWT tokens.                                                                                                                               |
| **Test Type**          | Functionality / Interface                                                                                                                                                                                                                                              |
| **Priority**           | High                                                                                                                                                                                                                                                                   |
| **Prerequisites**      | - Server is running<br>- Account with email `logintest@example.com` and password `SecurePass1` **already exists** in DB (run TC-AM-01-01 prior or seed data)                                                                                                           |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body<br>4. Send the request<br>5. Check HTTP status code<br>6. Check Response Body and save `accessToken` to use for subsequent TCs |
| **Test Data**          | `email: "logintest@example.com"`<br>`password: "SecurePass1"`                                                                                                                                                                                                          |
| **Expected Result**    | - HTTP Status: **200 OK**<br>- Response body has `"success": true`<br>- `data.user` has `id`, `email`, `name`<br>- `data.accessToken` is a valid JWT string<br>- `data.refreshToken` is a valid JWT string<br>- `password` **does not** appear in the response         |
| **Actual Result**      | HTTP 200 OK. `success: true`. `data.user` has `id`, `email`, `name`. `accessToken` and `refreshToken` are valid JWTs. `password` is not exposed in the response. Script automatically saves tokens to Postman Environment.                                             |
| **Status**             | Pass                                                                                                                                                                                                                                                                   |
| **Notes**              | **Save accessToken & refreshToken** from the response — script automatically handles this into Postman Environment for use in upcoming TCs.                                                                                                                            |

---

### TC-AM-02-02: Login failed — Incorrect password

| Field                  | Content                                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Exception Flow [E1]                                                                                                                                                                                                                                                            |
| **TC ID**              | TC-AM-02-02                                                                                                                                                                                                                                                                            |
| **Title**              | Login failed with incorrect password                                                                                                                                                                                                                                                   |
| **Description**        | Send a Login request with a correct email but wrong password. The system must reject and return HTTP 401 with a generic error message (not distinguishing between wrong email/password to prevent User Enumeration Attack).                                                            |
| **Test Type**          | Functionality / Security                                                                                                                                                                                                                                                               |
| **Priority**           | High                                                                                                                                                                                                                                                                                   |
| **Prerequisites**      | - Server is running<br>- Account `logintest@example.com` already exists                                                                                                                                                                                                                |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with a wrong password<br>4. Send request<br>5. Check HTTP status code and response                                                             |
| **Test Data**          | `email: "logintest@example.com"` _(correct email)_<br>`password: "WrongPassword"` _(wrong password)_                                                                                                                                                                                   |
| **Expected Result**    | - HTTP Status: **401 Unauthorized**<br>- Response body has `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Email or password incorrect"` _(generic message, does not reveal if email is correct/incorrect)_<br>- Response **does not** contain tokens |
| **Actual Result**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Email or password incorrect"` — generic message, not distinguishing cause to prevent User Enumeration Attack.                                                                                  |
| **Status**             | Pass                                                                                                                                                                                                                                                                                   |
| **Notes**              | Security check: error message must be identical to TC-AM-02-03 to prevent User Enumeration. Confirmed these two messages are identical.                                                                                                                                                |

---

### TC-AM-02-03: Login failed — Email does not exist

| Field                  | Content                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature** | UC-02 — Exception Flow [E1]                                                                                                                                                                                                                |
| **TC ID**              | TC-AM-02-03                                                                                                                                                                                                                                |
| **Title**              | Login failed when email does not exist in the system                                                                                                                                                                                       |
| **Description**        | Send a Login request with an unregistered email. The system must reject with HTTP 401 and a generic error message (same as the wrong password case).                                                                                       |
| **Test Type**          | Functionality / Security                                                                                                                                                                                                                   |
| **Priority**           | High                                                                                                                                                                                                                                       |
| **Prerequisites**      | - Server is running<br>- Email `notexist@example.com` **does not** exist in DB                                                                                                                                                             |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with a non-existent email<br>4. Send request<br>5. Check HTTP status code and response             |
| **Test Data**          | `email: "notexist@example.com"` _(non-existent email)_<br>`password: "SomePassword1"`                                                                                                                                                      |
| **Expected Result**    | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Email or password incorrect"` _(**identical** message to TC-AM-02-02)_<br>- Response **does not** contain tokens |
| **Actual Result**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Email or password incorrect"` — identical to TC-AM-02-02, confirmed Server does not distinguish between wrong email and wrong password.            |
| **Status**             | Pass                                                                                                                                                                                                                                       |
| **Notes**              | **Critical Security Check:** messages of TC-AM-02-02 and TC-AM-02-03 are **exactly the same** — confirmed, no User Enumeration Vulnerability.                                                                                              |

---

### TC-AM-02-04: Protected route — No token

| Field                  | Content                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Authorization / Middleware                                                                                                                             |
| **TC ID**              | TC-AM-02-04                                                                                                                                                    |
| **Title**              | Access protected route `GET /api/v1/auth/me` without Authorization header                                                                                      |
| **Description**        | Send a request to an authenticated endpoint without attaching a Bearer token. Auth middleware must block and return HTTP 401.                                  |
| **Test Type**          | Security / Functionality                                                                                                                                       |
| **Priority**           | High                                                                                                                                                           |
| **Prerequisites**      | - Server is running                                                                                                                                            |
| **Steps to Reproduce** | 1. Open Postman, create a request `GET /api/v1/auth/me`<br>2. **Do not** add Authorization header<br>3. Send request<br>4. Check HTTP status code and response |
| **Test Data**          | None (request has no Authorization header)                                                                                                                     |
| **Expected Result**    | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Token not provided"` (or equivalent) |
| **Actual Result**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. Auth Middleware successfully blocked request before hitting handler logic.              |
| **Status**             | Pass                                                                                                                                                           |
| **Notes**              | Also test the case where `Authorization` header is present but empty.                                                                                          |

---

### TC-AM-02-05: Protected route — Expired token

| Field                  | Content                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature** | UC-02 — Authorization / Token Expiry                                                                                                                                           |
| **TC ID**              | TC-AM-02-05                                                                                                                                                                    |
| **Title**              | Access protected route `GET /api/v1/auth/me` with an expired Access Token                                                                                                      |
| **Description**        | Send a request to an authenticated endpoint with an expired Access Token. Middleware must detect the invalid token and return HTTP 401.                                        |
| **Test Type**          | Security / Functionality                                                                                                                                                       |
| **Priority**           | High                                                                                                                                                                           |
| **Prerequisites**      | - Server is running<br>- Have an expired JWT Access Token (can be created by using an old token after 15 mins, or manually signing a token with exp in the past)               |
| **Steps to Reproduce** | 1. Open Postman, create a request `GET /api/v1/auth/me`<br>2. Add header: `Authorization: Bearer <expired_token>`<br>3. Send request<br>4. Check HTTP status code and response |
| **Test Data**          | Header: `Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...` _(expired token — hardcoded JWT with exp in the past)_                                                                 |
| **Expected Result**    | - HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`<br>- `error.message` = `"Invalid or expired token"`                           |
| **Actual Result**      | HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. `error.message: "Invalid or expired token"`. Middleware successfully rejected the expired token.        |
| **Status**             | Pass                                                                                                                                                                           |
| **Notes**              | The mock token is hardcoded directly in the test file to ensure test case stability (not relying on wait times).                                                               |

---

### TC-AM-02-06: Login failed — Missing required fields

| Field                  | Content                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Validation                                                                                                                                                                            |
| **TC ID**              | TC-AM-02-06                                                                                                                                                                                   |
| **Title**              | Login failed when request body is missing required fields                                                                                                                                     |
| **Description**        | Send a Login request with only email, missing password (or empty body). The system must reject at the validation layer.                                                                       |
| **Test Type**          | Functionality                                                                                                                                                                                 |
| **Priority**           | Medium                                                                                                                                                                                        |
| **Prerequisites**      | - Server is running                                                                                                                                                                           |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/login`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with only email<br>4. Send request and check response |
| **Test Data**          | Case A: `{ "email": "logintest@example.com" }` _(missing password)_<br>Case B: `{}` _(empty body)_<br>Case C: `{ "password": "SecurePass1" }` _(missing email)_                               |
| **Expected Result**    | - HTTP Status: **400 Bad Request**<br>- `"success": false`<br>- `error.code` = `"VALIDATION_ERROR"`<br>- `error.details` specifies which field is missing                                     |
| **Actual Result**      | All 3 sub-cases returned HTTP 400 Bad Request. `success: false`. `error.code: "VALIDATION_ERROR"`. `error.details` specifies the missing field in each case.                                  |
| **Status**             | Pass (3/3 sub-cases)                                                                                                                                                                          |
| **Notes**              | —                                                                                                                                                                                             |

---

### TC-AM-02-07: Protected route — Valid token

| Field                  | Content                                                                                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Authorization (Happy Path)                                                                                                                                                                                         |
| **TC ID**              | TC-AM-02-07                                                                                                                                                                                                                |
| **Title**              | Access protected route `GET /api/v1/auth/me` with a valid Access Token                                                                                                                                                     |
| **Description**        | After successfully logging in, use the Access Token to call the profile API. The system must return correct user information.                                                                                              |
| **Test Type**          | Functionality / Interface                                                                                                                                                                                                  |
| **Priority**           | High                                                                                                                                                                                                                       |
| **Prerequisites**      | - Server is running<br>- Executed TC-AM-02-01 and saved `accessToken`                                                                                                                                                      |
| **Steps to Reproduce** | 1. Open Postman, create a request `GET /api/v1/auth/me`<br>2. Add header: `Authorization: Bearer <valid_access_token>`<br>3. Send request<br>4. Check HTTP status code and response body                                   |
| **Test Data**          | Header: `Authorization: Bearer <accessToken from TC-AM-02-01>`                                                                                                                                                             |
| **Expected Result**    | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.id` matches the logged-in user<br>- `data.email` = `"logintest@example.com"`<br>- `data.name` matches registered name<br>- `data.password` **does not** appear |
| **Actual Result**      | HTTP 200 OK. `success: true`. `data.email: "logintest@example.com"`. `data.name` and `data.id` exist. `password` is not exposed in the response.                                                                           |
| **Status**             | Pass                                                                                                                                                                                                                       |
| **Notes**              | This TC confirms the end-to-end flow: Register → Login → Use token.                                                                                                                                                        |

---

### TC-AM-02-08: Successful Refresh Token

| Field                  | Content                                                                                                                                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Token Refresh (Session Management)                                                                                                                                                                                                                                                   |
| **TC ID**              | TC-AM-02-08                                                                                                                                                                                                                                                                                  |
| **Title**              | Successful Refresh Token — Receive new Access Token                                                                                                                                                                                                                                          |
| **Description**        | Use a valid `refreshToken` to exchange for a new `accessToken`. This is the mechanism to maintain the session after the access token expires (15 mins).                                                                                                                                      |
| **Test Type**          | Functionality / Interface                                                                                                                                                                                                                                                                    |
| **Priority**           | High                                                                                                                                                                                                                                                                                         |
| **Prerequisites**      | - Server is running<br>- Executed TC-AM-02-01 and saved `refreshToken`                                                                                                                                                                                                                       |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/refresh`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with refreshToken<br>4. Send request<br>5. Check HTTP status code and response<br>6. Confirm the new `accessToken` is different from the old token |
| **Test Data**          | `refreshToken: "<refreshToken from TC-AM-02-01>"`                                                                                                                                                                                                                                            |
| **Expected Result**    | - HTTP Status: **200 OK**<br>- `"success": true`<br>- `data.accessToken` is a new, valid JWT string<br>- `data.accessToken` is **different** from the old accessToken                                                                                                                        |
| **Actual Result**      | HTTP 200 OK. `success: true`. New `accessToken` successfully issued and differs from the old token (thanks to a 1s pre-request delay).                                                                                                                                                       |
| **Status**             | Pass                                                                                                                                                                                                                                                                                         |
| **Notes**              | - Use the new `accessToken` from this TC to call `GET /api/v1/auth/me` again — must return 200. <br> - 1s delay before token generation to prevent duplicate tokens if tests run too fast.                                                                                                   |

---

### TC-AM-02-09: Refresh Token failed — Invalid token

| Field                  | Content                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Token Refresh / Security                                                                                                                                                                                                                                                   |
| **TC ID**              | TC-AM-02-09                                                                                                                                                                                                                                                                        |
| **Title**              | Refresh Token failed when `refreshToken` is invalid or expired                                                                                                                                                                                                                     |
| **Description**        | Send a Refresh request with a fake, expired, or missing token. The system must reject with HTTP 401.                                                                                                                                                                               |
| **Test Type**          | Security / Functionality                                                                                                                                                                                                                                                           |
| **Priority**           | High                                                                                                                                                                                                                                                                               |
| **Prerequisites**      | - Server is running                                                                                                                                                                                                                                                                |
| **Steps to Reproduce** | 1. Open Postman, create a request `POST /api/v1/auth/refresh`<br>2. Set Header: `Content-Type: application/json`<br>3. Enter Request Body with an invalid token<br>4. Send request and check response                                                                              |
| **Test Data**          | The test suite is separated into 2 independent sub-cases (TC-AM-02-09a and 09b):<br>• **09a** — Fake token: `{ "refreshToken": "invalid.token.string" }` → expect **401**<br>• **09b** — Missing field: `{}` → expect **400 VALIDATION_ERROR** (Zod blocks before Auth middleware) |
| **Expected Result**    | **09a:** HTTP 401, `error.code: "UNAUTHORIZED"`, `error.message: "Invalid or expired refresh token"`<br>**09b:** HTTP 400, `error.code: "VALIDATION_ERROR"`, `error.details` specifies `refreshToken` is missing                                                                   |
| **Actual Result**      | **09a:** HTTP 401 Unauthorized. `error.code: "UNAUTHORIZED"`. `error.message: "Invalid or expired refresh token"`. <br>**09b:** HTTP 400 Bad Request. `error.code: "VALIDATION_ERROR"`. `error.details` specifies `refreshToken` expected string, received undefined.              |
| **Status**             | Pass (2/2 sub-cases)                                                                                                                                                                                                                                                               |
| **Notes**              | **Design Note:** Case B (empty body) returns 400 instead of 401 because Zod Validation at the middleware layer blocks it before request enters Auth logic. This is correct RESTful behavior — the test was adjusted to reflect this actual behavior.                               |

---

### TC-AM-02-10: Protected route — Invalid Bearer format

| Field                  | Content                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Authorization / Security                                                                                                                                                                                                                                                                                          |
| **TC ID**              | TC-AM-02-10                                                                                                                                                                                                                                                                                                               |
| **Title**              | Protected route returns 401 when Authorization header has wrong format                                                                                                                                                                                                                                                    |
| **Description**        | Send a valid token but the `Authorization` header is not in the format `Bearer <token>`. The system must reject it.                                                                                                                                                                                                       |
| **Test Type**          | Security                                                                                                                                                                                                                                                                                                                  |
| **Priority**           | Medium                                                                                                                                                                                                                                                                                                                    |
| **Prerequisites**      | - Server is running<br>- Have a valid `accessToken` from TC-AM-02-01 (saved in Environment)                                                                                                                                                                                                                               |
| **Steps to Reproduce** | 1. Open Postman, create a request `GET /api/v1/auth/me`<br>2. Sequentially test various wrong token transmission formats<br>3. Check HTTP status code and response                                                                                                                                                        |
| **Test Data**          | The test suite is separated into 3 independent sub-cases (TC-AM-02-10a to 10c):<br>• **10a** — Wrong prefix: `Authorization: Token {{accessToken}}`<br>• **10b** — Missing "Bearer": `Authorization: {{accessToken}}` _(token directly without prefix)_<br>• **10c** — Fake token: `Authorization: Bearer fake.token.xyz` |
| **Expected Result**    | Each case:<br>- HTTP Status: **401 Unauthorized**<br>- `"success": false`<br>- `error.code` = `"UNAUTHORIZED"`                                                                                                                                                                                                            |
| **Actual Result**      | All 3 sub-cases returned HTTP 401 Unauthorized. `success: false`. `error.code: "UNAUTHORIZED"`. Middleware rejects tokens not properly formatted as Bearer.                                                                                                                                                               |
| **Status**             | Pass (3/3 sub-cases)                                                                                                                                                                                                                                                                                                      |
| **Notes**              | The test suite is divided into 3 separate `.request.yaml` files (TC-AM-02-10a to 10c) for more detailed reporting.                                                                                                                                                                                                        |

---

## UC-02: UI / E2E Tests — Login

> **Test Type:** UI / End-to-End  
> **Tools:** Browser (Chrome/Firefox) — manual testing on UI  
> **Environment:** Frontend running at `http://localhost:5173` (or equivalent)

---

### TC-AM-02-UI-01: Successful login (Happy Path)

| Field                  | Content                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Login (UI)                                                                                                                                                              |
| **TC ID**              | TC-AM-02-UI-01                                                                                                                                                                  |
| **Title**              | Successful login with a valid account on UI                                                                                                                                     |
| **Description**        | Enter the correct registered email and password. UI must redirect to Dashboard and display user information.                                                                    |
| **Test Type**          | UI / E2E                                                                                                                                                                        |
| **Priority**           | High                                                                                                                                                                            |
| **Prerequisites**      | - Frontend is running<br>- Account `testuser01@example.com` / `Password123!` already exists (run TC-AM-01-UI-01 prior)                                                          |
| **Steps to Reproduce** | 1. Open the login page<br>2. Enter `Email`: `testuser01@example.com`<br>3. Enter `Password`: `Password123!`<br>4. Click the **Login** button                                    |
| **Test Data**          | `Email`: `testuser01@example.com` _(successfully registered account)_<br>`Password`: `Password123!`                                                                             |
| **Expected Result**    | - Successful login, redirects to **Dashboard** / homepage<br>- Username (`Nguyen Van A`) or Avatar is displayed in the Header/Sidebar                                           |
| **Actual Result**      | Successful login, system displays a toast notification _"Signed in successfully!"_ in the bottom right corner and automatically redirects to the Dashboard page (`/dashboard`). |
| **Status**             | Pass                                                                                                                                                                            |
| **Notes**              | Main happy path for the UI Login flow.                                                                                                                                          |

---

### TC-AM-02-UI-02: Login failed — Incorrect password

| Field                  | Content                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature** | UC-02 — Exception Flow (UI)                                                                                                                                                                                                                            |
| **TC ID**              | TC-AM-02-UI-02                                                                                                                                                                                                                                         |
| **Title**              | Login failed with correct email but wrong password (UI)                                                                                                                                                                                                |
| **Description**        | Enter the correct email but a wrong password. UI must display an error message and deny access to the Dashboard.                                                                                                                                       |
| **Test Type**          | UI / E2E                                                                                                                                                                                                                                               |
| **Priority**           | High                                                                                                                                                                                                                                                   |
| **Prerequisites**      | - Frontend is running<br>- Account `testuser01@example.com` exists                                                                                                                                                                                     |
| **Steps to Reproduce** | 1. Open the login page<br>2. Enter `Email`: `testuser01@example.com`, `Password`: `WrongPassword999!`<br>3. Click the **Login** button                                                                                                                 |
| **Test Data**          | `Email`: `testuser01@example.com`<br>`Password`: `WrongPassword999!`                                                                                                                                                                                   |
| **Expected Result**    | - Display a generic error message: _"Email hoặc mật khẩu không chính xác"_ (avoiding specific details like "Incorrect password" for security)<br>- Deny access to the Dashboard                                                                        |
| **Actual Result**      | **Sign In** button changes to loading state (spinner) and hangs indefinitely, system does not display the _"Email or password incorrect"_ error message nor does it release the button's loading state.                                                |
| **Status**             | **Fail** _(Bug: Loading hangs upon incorrect password)_                                                                                                                                                                                                |
| **Notes**              | **BUG:** The Sign In button gets stuck in an infinite loading state when the API returns a 401 error. Frontend is not handling the error state, need to check the error handler in the submit function. Create bug report at `docs/test/bug-reports/`. |

---

### TC-AM-02-UI-03: Login failed — Email never registered

| Field                  | Content                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Exception Flow (UI)                                                                                                                        |
| **TC ID**              | TC-AM-02-UI-03                                                                                                                                     |
| **Title**              | Login failed when logging in with an email not present in the system (UI)                                                                          |
| **Description**        | Enter an email that does not exist in DB. UI must display an error message and deny login.                                                         |
| **Test Type**          | UI / E2E                                                                                                                                           |
| **Priority**           | High                                                                                                                                               |
| **Prerequisites**      | - Frontend is running<br>- Email `notfound_user999@example.com` does not exist in DB                                                               |
| **Steps to Reproduce** | 1. Open the login page<br>2. Enter `Email`: `notfound_user999@example.com`, `Password`: `Password123!`<br>3. Click the **Login** button            |
| **Test Data**          | `Email`: `notfound_user999@example.com`<br>`Password`: `Password123!`                                                                              |
| **Expected Result**    | Display error message: _"Email hoặc mật khẩu không chính xác"_ (Email or password incorrect)                                                       |
| **Actual Result**      | Displays error toast message in the bottom right corner: _"Email or password incorrect"_. Login denied.                                            |
| **Status**             | Pass                                                                                                                                               |
| **Notes**              | Compare with TC-AM-02-UI-02 (Wrong password): displayed error message is identical → specific cause is not revealed (User Enumeration prevention). |

---

### TC-AM-02-UI-04: Login failed — Leave required fields empty

| Field                  | Content                                                                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-02 — Validation UI                                                                                                                                                                                                                                                                                           |
| **TC ID**              | TC-AM-02-UI-04                                                                                                                                                                                                                                                                                                  |
| **Title**              | Login failed when required fields are left empty (UI)                                                                                                                                                                                                                                                           |
| **Description**        | Click Login button while leaving Email or Password empty. UI must display inline validation errors and prevent sending request to backend.                                                                                                                                                                      |
| **Test Type**          | UI / Validation                                                                                                                                                                                                                                                                                                 |
| **Priority**           | High                                                                                                                                                                                                                                                                                                            |
| **Prerequisites**      | - Frontend is running                                                                                                                                                                                                                                                                                           |
| **Steps to Reproduce** | **Case A:** Leave Email empty, enter valid Password → Click **Login**<br>**Case B:** Enter valid Email, leave Password empty → Click **Login**                                                                                                                                                                  |
| **Test Data**          | Case A: `Email` = empty, `Password` = `Password123!`<br>Case B: `Email` = `testuser01@example.com`, `Password` = empty                                                                                                                                                                                          |
| **Expected Result**    | - Display error: _"Vui lòng nhập Email / Mật khẩu"_ (Please enter Email / Password)<br>- System does not send request to backend                                                                                                                                                                                |
| **Actual Result**      | **Case A** (Empty Email): Displays inline error immediately below the Email field: _"Email is required"_.<br>**Case B** (Empty Password): Displays inline error immediately below the Password field: _"Password must be at least 8 characters"_.<br>System blocks submit and does not send request to backend. |
| **Status**             | Pass                                                                                                                                                                                                                                                                                                            |
| **Notes**              | Verified both cases A & B. Validation is at the Frontend level.                                                                                                                                                                                                                                                 |

---

## Summary Table — Authentication Module (AM)

> **API Tests — Last Run:** 2026-07-25 | **Tool:** Postman CLI v1.44.0 | **Total Requests:** 29 | **Total Assertions:** 123 | **Time:** 2.6s  
> **UI/E2E Tests — Last Run:** 2026-07-25 | **Tool:** Manual Browser

### API Tests

| TC ID          | Use Case | Title                                                         | Type                     | Priority | Happy/Negative | Status     |
| -------------- | -------- | ------------------------------------------------------------- | ------------------------ | -------- | -------------- | ---------- |
| TC-AM-01-01    | UC-01    | Successful registration with valid data                       | Functionality            | High     | Happy          | Pass       |
| TC-AM-01-02    | UC-01    | Registration failed — Email already exists (409)              | Functionality / Database | High     | Negative       | Pass       |
| TC-AM-01-03    | UC-01    | Registration failed — Password < 8 characters (400)           | Functionality            | High     | Negative       | Pass       |
| TC-AM-01-04a~d | UC-01    | Registration failed — Invalid email format (400) [4 cases]    | Functionality            | High     | Negative       | Pass (4/4) |
| TC-AM-01-05a~d | UC-01    | Registration failed — Missing required fields (400) [4 cases] | Functionality            | Medium   | Negative       | Pass (4/4) |
| TC-AM-01-06    | UC-01    | Registration failed — `name` < 2 characters (400)             | Functionality            | Medium   | Negative       | Pass       |
| TC-AM-01-07    | UC-01    | Successful registration — Validate response schema            | Interface / Security     | High     | Happy          | Pass       |
| TC-AM-01-08    | UC-01    | Registration failed — Password is only whitespace             | Security                 | Medium   | Negative       | Pass       |
| TC-AM-02-01    | UC-02    | Successful login with valid data                              | Functionality            | High     | Happy          | Pass       |
| TC-AM-02-02    | UC-02    | Login failed — Incorrect password (401)                       | Functionality / Security | High     | Negative       | Pass       |
| TC-AM-02-03    | UC-02    | Login failed — Email does not exist (401)                     | Functionality / Security | High     | Negative       | Pass       |
| TC-AM-02-04    | UC-02    | Protected route — No token (401)                              | Security                 | High     | Negative       | Pass       |
| TC-AM-02-05    | UC-02    | Protected route — Expired token (401)                         | Security                 | High     | Negative       | Pass       |
| TC-AM-02-06a~c | UC-02    | Login failed — Missing required fields (400) [3 cases]        | Functionality            | Medium   | Negative       | Pass (3/3) |
| TC-AM-02-07    | UC-02    | Protected route — Valid token → 200 OK                        | Functionality            | High     | Happy          | Pass       |
| TC-AM-02-08    | UC-02    | Successful Refresh Token (200)                                | Functionality            | High     | Happy          | Pass       |
| TC-AM-02-09a~b | UC-02    | Refresh Token failed — Fake token/Empty body [2 cases]        | Security                 | High     | Negative       | Pass (2/2) |
| TC-AM-02-10a~c | UC-02    | Protected route — Invalid Bearer format (401) [3 cases]       | Security                 | Medium   | Negative       | Pass (3/3) |

**API Total:** 18 root test cases → **29 requests** | Happy Path: 5 | Negative: 13 | **Pass: 29** | **Fail: 0** | **Warning: 0**

### UI / E2E Tests

| TC ID          | Use Case | Title                                                  | Type            | Priority | Happy/Negative | Status                         |
| -------------- | -------- | ------------------------------------------------------ | --------------- | -------- | -------------- | ------------------------------ |
| TC-AM-01-UI-01 | UC-01    | Successful registration (Happy Path)                   | UI / E2E        | High     | Happy          | Pass                           |
| TC-AM-01-UI-02 | UC-01    | Registration failed — Email already exists             | UI / E2E        | High     | Negative       | Pass                           |
| TC-AM-01-UI-03 | UC-01    | Registration failed — Password too short               | UI / Validation | High     | Negative       | Pass                           |
| TC-AM-01-UI-04 | UC-01    | Registration failed — Invalid email format [4 formats] | UI / Validation | High     | Negative       | Pass                           |
| TC-AM-01-UI-05 | UC-01    | Registration failed — Name too short (< 2 characters)  | UI / Validation | Medium   | Negative       | Pass                           |
| TC-AM-01-UI-06 | UC-01    | Registration failed — Passwords do not match           | UI / Validation | High     | Negative       | Pass                           |
| TC-AM-02-UI-01 | UC-02    | Successful login (Happy Path)                          | UI / E2E        | High     | Happy          | Pass                           |
| TC-AM-02-UI-02 | UC-02    | Login failed — Incorrect password                      | UI / E2E        | High     | Negative       | **Fail — Bug (Loading hangs)** |
| TC-AM-02-UI-03 | UC-02    | Login failed — Email never registered                  | UI / E2E        | High     | Negative       | Pass                           |
| TC-AM-02-UI-04 | UC-02    | Login failed — Leave required fields empty [2 cases]   | UI / Validation | High     | Negative       | Pass                           |

**UI/E2E Total:** 10 test cases | Happy Path: 2 | Negative: 8 | **Pass: 9** | **Fail: 1 (Frontend Bug)** | **Warning: 0**

---

### Overall Module Summary

| Test Type | Total TCs | Pass   | Fail  | Warning |
| --------- | --------- | ------ | ----- | ------- |
| API       | 18        | 18     | 0     | 0       |
| UI / E2E  | 10        | 9      | 1     | 0       |
| **Total** | **28**    | **27** | **1** | **0**   |

---

## Glossary

### Status

| Status  | Meaning                                                   |
| ------- | --------------------------------------------------------- |
| Not Run | Test has not been executed yet                            |
| Pass    | Actual result matches the expected result                 |
| Fail    | Bug found → create bug report in `docs/test/bug-reports/` |
| Blocked | Cannot test — dependent on an incomplete part             |

### Suggested Test Execution Order

To run TCs with dependencies in the correct order:

```
TC-AM-01-01 (Register)
    ↓
TC-AM-02-01 (Login → save accessToken & refreshToken)
    ↓
TC-AM-02-07 (Call /me with valid token)
TC-AM-02-08 (Refresh token)
    ↓
TC-AM-02-05 (Use expired token)
```

Independent validation TCs (01-02 ~ 01-08, 02-02 ~ 02-06, 02-09, 02-10) can be executed in any order.

---

## PA5 Additions — UC-03 (Personal Profile Management) and UC-04 (Logout)

> Final sources: UC-01 Account Management, UC-03/UC-04, and the Profile mockup. PA5 cases are added after the PA4 content; previous results are unchanged.

### TC-AM-03-01: View current profile information

| Field                  | Content                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-03 (Personal Profile Management) — view name, email, and join date                                                                                                                                                                                                                           |
| **TC ID**              | TC-AM-03-01                                                                                                                                                                                                                                                                                     |
| **Title**              | Display the correct information for the currently signed-in learner                                                                                                                                                                                                                             |
| **Description**        | Open Profile and reload to confirm that only the current session's data appears and that email cannot be edited.                                                                                                                                                                                |
| **Test Type**          | Functionality / Security / UI-E2E                                                                                                                                                                                                                                                               |
| **Execution Method**   | Automation (Playwright)                                                                                                                                                                                                                                                                         |
| **Priority**           | High                                                                                                                                                                                                                                                                                            |
| **Prerequisites**      | The primary learner is logged in; both named and unnamed states can be checked.                                                                                                                                                                                                                 |
| **Steps to Reproduce** | 1. Open Profile.<br>2. Observe the name, email, join date, and locked-email state.<br>3. Reload in both name states.                                                                                                                                                                            |
| **Test Data**          | a) Account with a display name.<br>b) Account without a display name.                                                                                                                                                                                                                           |
| **Expected Result**    | a) The saved name is shown.<br>b) The name field is empty and is not replaced with the email.<br>The current learner's email and join date appear, and the email cannot be edited.                                                                                                              |
| **Actual Result**      | a) Pass on Chromium and Firefox: the profile correctly displayed the current learner's name, email, and join date; the values remained after reload.<br>b) Pass on Chromium and Firefox: an unnamed account showed the empty field and the correct prompt, without replacing it with the email. |
| **Status**             | a) Pass<br>b) Pass<br>Total: Pass                                                                                                                                                                                                                                                               |
| **Tester**             | Nguyễn Minh Phát                                                                                                                                                                                                                                                                                |
| **Date Tested**        | 2026-09-03                                                                                                                                                                                                                                                                                      |
| **Notes**              | Compared with the main flow steps 1–2 of UC-03.                                                                                                                                                                                                                                                 |
| **Comments**           | The learner can verify the account identity and still recognize the profile state when no name has been set.                                                                                                                                                                                    |

### TC-AM-03-02: Update or clear display name

| Field                  | Content                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-03 (Personal Profile Management) — update information                                                                                                                                                                               |
| **TC ID**              | TC-AM-03-02                                                                                                                                                                                                                            |
| **Title**              | Save a valid name and allow the name to be left blank                                                                                                                                                                                  |
| **Description**        | Save a name, reload and check the Dashboard greeting, then clear the name.                                                                                                                                                             |
| **Test Type**          | Functionality / Interface / UI-E2E                                                                                                                                                                                                     |
| **Execution Method**   | Automation (Playwright)                                                                                                                                                                                                                |
| **Priority**           | High                                                                                                                                                                                                                                   |
| **Prerequisites**      | The learner is logged in and Profile is open.                                                                                                                                                                                          |
| **Steps to Reproduce** | 1. Enter a name and save.<br>2. Reload and open Dashboard.<br>3. Clear the name and save again.                                                                                                                                        |
| **Test Data**          | a) `Ngọc An`.<br>b) `  Ngọc An  `.<br>c) Empty string.                                                                                                                                                                                 |
| **Expected Result**    | a/b) The name is normalized, remains after reload, and appears on Dashboard.<br>c) The name is deleted; Dashboard does not concatenate the email as a name, and the profile email is unchanged.                                        |
| **Actual Result**      | a/b) Pass on Chromium and Firefox: the valid name was normalized, persisted after reload, and appeared on Dashboard.<br>c) Pass on Chromium and Firefox: the name was successfully cleared and the greeting did not include the email. |
| **Status**             | a) Pass<br>b) Pass<br>c) Pass<br>Total: Pass                                                                                                                                                                                           |
| **Tester**             | Nguyễn Minh Phát                                                                                                                                                                                                                       |
| **Date Tested**        | 2026-09-03                                                                                                                                                                                                                             |
| **Notes**              | Compared with the main flow of UC-03.                                                                                                                                                                                                  |
| **Comments**           | The display name is synchronized between Profile and Dashboard, keeping the greeting consistent without exposing the email as a substitute for the name.                                                                               |

### TC-AM-03-03: Change password and reject invalid data

| Field                  | Content                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-03 (Personal Profile Management) — change password; E1/E2                                                                                                                                                                                                                                                                       |
| **TC ID**              | TC-AM-03-03                                                                                                                                                                                                                                                                                                                        |
| **Title**              | Change the password only when the data is valid                                                                                                                                                                                                                                                                                    |
| **Description**        | Check success, an incorrect current password, and a short/mismatched new password.                                                                                                                                                                                                                                                 |
| **Test Type**          | Functionality / Security / UI-E2E                                                                                                                                                                                                                                                                                                  |
| **Execution Method**   | Automation (Playwright)                                                                                                                                                                                                                                                                                                            |
| **Priority**           | Critical                                                                                                                                                                                                                                                                                                                           |
| **Prerequisites**      | The learner has a valid current password and has opened the Change Password tab.                                                                                                                                                                                                                                                   |
| **Steps to Reproduce** | 1. Enter the three password fields.<br>2. Submit the change.<br>3. Log out and log in again to verify.                                                                                                                                                                                                                             |
| **Test Data**          | a) Correct current password; new password of 8+ characters with matching confirmation.<br>b) Incorrect current password.<br>c) Short new password or different confirmation.                                                                                                                                                       |
| **Expected Result**    | a) Change succeeds; only the new password can log in.<br>b) An incorrect-current-password error is shown; data is not changed.<br>c) A field error is shown and the change is not submitted.                                                                                                                                       |
| **Actual Result**      | a) Pass on Chromium and Firefox: the valid password was changed successfully and could be used to log in again.<br>b) Pass on Chromium and Firefox: an incorrect old password returned 400 and the password did not change.<br>c) Pass on Chromium and Firefox: mismatched confirmation/insufficient length was blocked by the UI. |
| **Status**             | a) Pass<br>b) Pass<br>c) Pass<br>Total: Pass                                                                                                                                                                                                                                                                                       |
| **Tester**             | Nguyễn Minh Phát                                                                                                                                                                                                                                                                                                                   |
| **Date Tested**        | 2026-09-03                                                                                                                                                                                                                                                                                                                         |
| **Notes**              | Compared with UC-03 E1/E2.                                                                                                                                                                                                                                                                                                         |
| **Comments**           | Input checks protect the account from unintended password changes and accept only valid authentication information.                                                                                                                                                                                                                |

### TC-AM-04-01: Log out from Profile

| Field                  | Content                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-04 (Logout) — end the session                                                                                                             |
| **TC ID**              | TC-AM-04-01                                                                                                                                  |
| **Title**              | Logout redirects to Login and clears the local session                                                                                       |
| **Description**        | Check that the Logout button in Profile ends the authenticated session.                                                                      |
| **Test Type**          | Functionality / Security / UI-E2E                                                                                                            |
| **Execution Method**   | Automation (Playwright)                                                                                                                      |
| **Priority**           | High                                                                                                                                         |
| **Prerequisites**      | The learner is logged in and Profile is open.                                                                                                |
| **Steps to Reproduce** | 1. Click Logout.<br>2. Observe the destination page.<br>3. Reload.                                                                           |
| **Test Data**          | Valid logged-in session.                                                                                                                     |
| **Expected Result**    | Redirect to Login; the old session state is gone after reload.                                                                               |
| **Actual Result**      | Pass on Chromium and Firefox: logout returned to Login and removed the access token; reload and protected routes did not reopen the session. |
| **Status**             | Pass                                                                                                                                         |
| **Tester**             | Nguyễn Minh Phát                                                                                                                             |
| **Date Tested**        | 2026-09-03                                                                                                                                   |
| **Notes**              | Compared with UC-04 steps 1–3.                                                                                                               |
| **Comments**           | The post-logout path is clear, so the learner knows the session ended and does not accidentally use the old account.                         |

### TC-AM-04-02: Block protected routes after logout

| Field                  | Content                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Function / Feature** | UC-04 (Logout) — do not reuse the ended session                                                                                                 |
| **TC ID**              | TC-AM-04-02                                                                                                                                     |
| **Title**              | Do not access Dashboard or Profile again after logout                                                                                           |
| **Description**        | Access protected routes directly and use the Back button after the session ends.                                                                |
| **Test Type**          | Security / UI-E2E                                                                                                                               |
| **Execution Method**   | Automation (Playwright)                                                                                                                         |
| **Priority**           | Critical                                                                                                                                        |
| **Prerequisites**      | Logout has been completed.                                                                                                                      |
| **Steps to Reproduce** | 1. Open Dashboard.<br>2. Open Profile.<br>3. Use Back.                                                                                          |
| **Test Data**          | Protected URLs after the session has been removed.                                                                                              |
| **Expected Result**    | Each action returns to Login without exposing the name, email, or learning data.                                                                |
| **Actual Result**      | Pass on Chromium and Firefox: after logout, `/dashboard` and `/profile` both redirected to Login; going back in history did not restore access. |
| **Status**             | Pass                                                                                                                                            |
| **Tester**             | Nguyễn Minh Phát                                                                                                                                |
| **Date Tested**        | 2026-09-03                                                                                                                                      |
| **Notes**              | Compared with UC-04 and the protected route of UC-02.                                                                                           |
| **Comments**           | Protected routes remain secured after logout, so personal data is not exposed by reopening a URL or using browser history.                      |

### TC-AM-04-03: Log in again after logout

| Field                  | Content                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Function / Feature** | UC-04 (Logout) combined with UC-02 (Login) — create a new session                                                                                                                    |
| **TC ID**              | TC-AM-04-03                                                                                                                                                                          |
| **Title**              | Re-login does not use the previous learner's cache                                                                                                                                   |
| **Description**        | Log out the current learner, log in as another learner, and verify the new session identity.                                                                                         |
| **Test Type**          | Functionality / Security / UI-E2E                                                                                                                                                    |
| **Execution Method**   | Automation (Playwright)                                                                                                                                                              |
| **Priority**           | High                                                                                                                                                                                 |
| **Prerequisites**      | Two accounts with different emails/names are available.                                                                                                                              |
| **Steps to Reproduce** | 1. Log out the first learner.<br>2. Log in as the second learner.<br>3. Open Profile and Dashboard.                                                                                  |
| **Test Data**          | Two independent accounts with different emails and display names.                                                                                                                    |
| **Expected Result**    | The new session belongs only to the second learner; no email, name, or private data of the first learner remains.                                                                    |
| **Actual Result**      | Pass on Chromium and Firefox: after the first learner logged out and the second logged in, Profile showed only the second learner's data, with no email/name from the first learner. |
| **Status**             | Pass                                                                                                                                                                                 |
| **Tester**             | Nguyễn Minh Phát                                                                                                                                                                     |
| **Date Tested**        | 2026-09-03                                                                                                                                                                           |
| **Notes**              | Client isolation check after UC-04.                                                                                                                                                  |
| **Comments**           | Session isolation ensures that shared devices or account switching do not mix learners' personal data.                                                                               |

## PA5 Additions Summary — Authentication

| TC ID       | Title                                   | Type                     | Priority | Status |
| ----------- | --------------------------------------- | ------------------------ | -------- | ------ |
| TC-AM-03-01 | View current profile information        | Functionality / Security | High     | Pass   |
| TC-AM-03-02 | Update or clear display name            | Functionality            | High     | Pass   |
| TC-AM-03-03 | Change password and reject invalid data | Security                 | Critical | Pass   |
| TC-AM-04-01 | Log out from Profile                    | Functionality            | High     | Pass   |
| TC-AM-04-02 | Block protected routes after logout     | Security                 | Critical | Pass   |
| TC-AM-04-03 | Log in again after logout               | Security                 | High     | Pass   |
