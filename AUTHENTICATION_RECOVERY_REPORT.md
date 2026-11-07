# ForenSight — Authentication Recovery Report

**Execution Date:** 2026-11-07  
**Authoritative Workspace:** `F:\Projects\ForenSight`  
**Target Repository:** `https://github.com/kharbashpriyanshu/ForenSight.git` (Branch: `main`, Commit: `e0641f110d5ab7651cef070d4ac9daf4557f2bc6`)  

---

## A. Initial State

- **Git Repository & Branch:** `F:\Projects\ForenSight` on branch `main` at commit `e0641f110d5ab7651cef070d4ac9daf4557f2bc6`.
- **Database Location:** `F:\Projects\ForenSight\backend\forensight.db` (SQLite, 368,640 bytes).
- **Initial User Count:** Prior to remediation, the SQLite database contained 17 schema tables, but the `users` table contained **0 rows**.
- **Installed Passlib and bcrypt Versions:**
  - `passlib==1.7.4`
  - `bcrypt==5.0.0` (installed in the virtual environment prior to pinning `bcrypt==4.0.1`).
- **Original Authentication Failure:**
  The frontend login form submitted credentials to `/api/auth/login` and received HTTP `401 Unauthorized` (`{"detail": "Incorrect username or password"}`). When `VITE_API_URL` was unset, Vite proxy forwarded to port 8000 while the backend ran on port 8001, triggering `Failed to fetch`.

---

## B. Root Cause Analysis

### 1. Confirmed Primary Root Cause: Empty Users Table
- **Evidence:** Querying `SELECT count(*) FROM users;` in `backend/forensight.db` returned `0`.
- **Impact:** Any login attempt against any username returned HTTP 401 (`Incorrect username or password`) because user records for `admin`, `user_a`, and `user_b` had never been seeded into the database.

### 2. Confirmed Secondary Blocker: Passlib / bcrypt 5.0.0 Compatibility
- **Evidence:** `passlib==1.7.4` relies on internal bcrypt attributes removed or altered in `bcrypt>=4.1.0` / `5.0.0` (`ValueError: password cannot be longer than 72 bytes` during wrap-bug detection and `AttributeError`).
- **Resolution:** Pinning `bcrypt==4.0.1` in `backend/requirements.txt` restores full compatibility with `passlib==1.7.4`'s bcrypt hashing and verification handlers without altering application security architecture.

### 3. Contributing Port Configuration Issue: Vite Proxy Mismatch
- **Evidence:** `frontend/vite.config.ts` proxied `/api` to `http://localhost:8000`, while the backend application was running on port `8001`.
- **Resolution:** `frontend/vite.config.ts` proxy target was aligned to `http://localhost:8001`. In addition, `frontend/.env` defines `VITE_API_URL="http://localhost:8001"`, ensuring that both direct CORS requests and reverse-proxy requests consistently reach port 8001.

---

## C. Changes Made

1. **`backend/requirements.txt`:**
   - Added explicit pin `bcrypt==4.0.1` directly below `passlib[bcrypt]`.
   - Installed `bcrypt==4.0.1` into the active virtual environment (`F:\Projects\ForenSight\backend\venv`).

2. **`frontend/vite.config.ts`:**
   - Updated the proxy target for `/api` from `http://localhost:8000` to `http://localhost:8001`.

3. **`backend/scripts/seed_demo.py`:**
   - Executed the idempotent seed script against `F:\Projects\ForenSight\backend\forensight.db`.
   - Seeded demo users and initial demo cases without dropping or resetting existing tables.

---

## D. Database Recovery

- **Database Path Verified:** `F:\Projects\ForenSight\backend\forensight.db` (matches `settings.DATABASE_URL="sqlite:///./forensight.db"` when executed from `backend/`).
- **Seed Script Used:** `backend/scripts/seed_demo.py`.
- **Demo Accounts Initialized:**
  1. `admin` (Role: `ADMIN`) — Initial Demo Case: `FS-CASE-D92640C6` (*Recruiter Demonstration Case*)
  2. `user_a` (Role: `INVESTIGATOR`) — Initial Demo Case: `FS-CASE-3F8D5F7C` (*Case Alpha (User A)*)
  3. `user_b` (Role: `INVESTIGATOR`) — Initial Demo Case: `FS-CASE-046A7789` (*Case Beta (User B)*)
- **Data Integrity Preservation:**
  - All 17 existing tables preserved.
  - Zero tables dropped or schema altered.
  - No existing data deleted or overwritten.
  - Script idempotency verified (subsequent runs report `User <username> is up to date`).

---

## E. Authentication Verification Results

Direct endpoint verification was executed against the active database and authentication service:

| Test | Result | HTTP Status | Notes |
|---|---|---|---|
| **Admin login (`admin`)** | **PASS** | 200 OK | Authenticated successfully; Role returned: `ADMIN`; Session cookies `fs_access`, `fs_refresh`, `fs_csrf` issued. |
| **User A login (`user_a`)** | **PASS** | 200 OK | Authenticated successfully; Role returned: `INVESTIGATOR`; Session cookies issued. |
| **User B login (`user_b`)** | **PASS** | 200 OK | Authenticated successfully; Role returned: `INVESTIGATOR`; Session cookies issued. |
| **Invalid password check** | **PASS** | 401 Unauthorized | Rejected with detail `"Incorrect username or password"`; `auth_failed_attempts` incremented. |
| **Non-existent user check** | **PASS** | 401 Unauthorized | Rejected with detail `"Incorrect username or password"`. |
| **Session verification (`GET /api/auth/session`)** | **PASS** | 200 OK | Successfully decoded `fs_access` cookie and verified active session; returned identity and role. |
| **Logout (`POST /api/auth/logout`)** | **PASS** | 204 No Content | Session marked revoked in `user_sessions` table; cleared cookies. |
| **Post-logout access check** | **PASS** | 401 Unauthorized | Revoked session cookies rejected with `"Could not validate credentials"`. |
| **Frontend login alignment** | **PASS** | N/A | Form payload `application/x-www-form-urlencoded` matches FastAPI `OAuth2PasswordRequestForm`; CORS allows `http://localhost:5173`. |

---

## F. Remaining Issues

- None regarding core authentication, demo identities, or database initialization.
- Note: The background Celery worker and Redis broker remain external services for heavy asynchronous analysis jobs, but are not required for user authentication, session management, or case navigation.

---

## G. Final Status

**RECOVERED**

**Evidence:**
1. Password hashing compatibility verified with `passlib==1.7.4` and `bcrypt==4.0.1`.
2. SQLite database at `backend/forensight.db` contains 3 verified demo users with valid password hashes.
3. Backend endpoints `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout` pass all credential verification, session issuance, role assignment, and revocation tests.
4. Both direct API calls (`VITE_API_URL=http://localhost:8001`) and Vite proxy fallback target port 8001 consistently.

