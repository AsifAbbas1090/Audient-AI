# Audient AI — End-to-End Testing Guide

This guide covers every feature of the system. Follow each section in order on a running local environment with the backend and frontend both running.

**Prerequisites before starting:**
- Backend running: `http://localhost:5000`
- Frontend running: `http://localhost:5173`
- `GROQ_API_KEY` set in `backend/.env`
- `DATABASE_URL` set and `python migrate.py` completed
- Use Chrome or Edge for voice command tests

---

## Section 1 — Authentication

### 1.1 Register a new account

1. Navigate to `http://localhost:5173`
2. Click **Get Started** or **Sign Up**
3. Fill in: Full Name = `Dr. Test`, Email = `dr@test.com`, Password = `test123`, Role = `Healthcare`
4. Click **Create Account**
5. **Expected:** Redirected to Dashboard, sidebar shows "Dr. Test", no error

### 1.2 Duplicate email rejected

1. Try registering again with the same email `dr@test.com`
2. **Expected:** Error: "An account with this email already exists"

### 1.3 Validation errors

1. Submit the register form with an empty name
2. **Expected:** Inline field error under Name
3. Submit with a 4-character password
4. **Expected:** Error: "Password must be at least 6 characters"

### 1.4 Login

1. Log out (click the logout option in the sidebar)
2. Go to `/login`
3. Enter `dr@test.com` / `test123`
4. **Expected:** Redirected to Dashboard with sessions visible

### 1.5 Wrong credentials

1. On login page enter `dr@test.com` / `wrongpassword`
2. **Expected:** Error: "Invalid email or password" — no redirect

### 1.6 Password reset

1. On login page click **Forgot password** (or go to the reset page)
2. Enter `dr@test.com` and a new password `newpass123`
3. **Expected:** Success message
4. Log in with the new password
5. **Expected:** Login succeeds

### 1.7 Protected routes

1. Log out completely
2. Navigate directly to `http://localhost:5173/dashboard`
3. **Expected:** Redirected to `/login`

---

## Section 2 — Live Recording Session

### 2.1 Start a session

1. Log in as `dr@test.com`
2. Click **New Session** on the Dashboard or navigate to `/live`
3. Click the microphone **Start Recording** button
4. Allow microphone access in the browser permission dialog
5. **Expected:** Waveform animates, timer starts counting, status shows "Recording"

### 2.2 Real-time transcription

1. With recording active, speak clearly: *"Good morning. What brings you in today?"*
2. Wait 5–10 seconds
3. **Expected:** Text appears in the transcript panel on the right side of the screen

### 2.3 Speaker labels appear

1. Continue recording and speak for at least 20–30 seconds (simulate a short conversation — ask a question, pause, answer it in a different tone)
2. Wait up to **15 seconds** after speech (live hook runs `request_diarize` on that interval)
3. **Expected:** Some segments are labelled `[DR]` or `[PT]` (timing depends on diarize interval + Groq/pyannote latency)

### 2.4 Stop recording and complete session

1. Click **Stop Recording**
2. **Expected:** Recording stops, waveform freezes, a "Complete Session" button or automatic redirect to session detail
3. Click **Complete Session** if not auto-redirected
4. **Expected:** Loading indicator while Groq extracts data, then redirected to Session Detail page

### 2.5 Session appears in Dashboard

1. Navigate to Dashboard
2. **Expected:** The new session appears at the top with status badge **Complete**

---

## Section 3 — Vocal Commands

> Requires Chrome or Edge. Microphone must be allowed.

### 3.1 Enable voice commands

1. Navigate to `/live`
2. Find the **microphone icon button** in the top-right of the session header (next to the start button)
3. Click it to enable voice commands
4. **Expected:** Button pulses with animation, a "Listening" indicator appears

### 3.2 Start recording by voice

1. Ensure voice commands are enabled and recording is NOT started
2. Say clearly: **"Start recording"**
3. **Expected:** Recording begins automatically (same as clicking Start)

### 3.3 Stop recording by voice

1. While recording is active
2. Say: **"Stop recording"** or **"End session"**
3. **Expected:** Recording stops automatically

### 3.4 Pause and resume by voice

1. Start recording
2. Say: **"Pause"**
3. **Expected:** Recording pauses (waveform freezes)
4. Say: **"Resume"**
5. **Expected:** Recording resumes

### 3.5 Clear transcript by voice

1. With some transcript text visible
2. Say: **"Clear"** or **"Reset"**
3. **Expected:** Transcript is cleared

### 3.6 Voice commands on unsupported browser

1. Open Firefox or Safari
2. Navigate to `/live`
3. **Expected:** Voice command toggle button is absent or disabled with tooltip — no JS error

---

## Section 4 — Session Detail Page

### 4.1 Transcript displayed

1. Click any Complete session from Dashboard
2. **Expected:** Session Detail page loads with the full transcript visible, segments colour-coded by speaker

### 4.2 Inline summary editing

1. On Session Detail, find the **Summary** section (right panel or below transcript)
2. Click into the **Name** field
3. Change it to `Ahmed Khan`
4. Click **Save Summary**
5. **Expected:** Toast or success indicator; refresh the page and confirm the name persisted

### 4.3 Field alerts appear after save

1. On Session Detail, save a summary where **Age** and **Gender** are blank
2. **Expected:** Field alert card appears with at least two Critical-level alerts for Age and Gender

### 4.4 Dismiss an alert

1. On a session with active field alerts
2. Click the **resolve / dismiss** button (checkmark icon) on one alert
3. **Expected:** That alert disappears from the list immediately

### 4.5 All critical fields filled — no critical alerts

1. Fill in Name, Age, Gender, and Disease in the summary
2. Save
3. **Expected:** No Critical alerts appear (Important/Optional ones may still show)

---

## Section 5 — AI Clinical Recommendations

### 5.1 Generate recommendations

1. On Session Detail for a completed session that has a transcript
2. Find the **Clinical Insights** card
3. Click **Generate Insights** or the sparkle/AI button
4. **Expected:** Loading spinner while Groq processes (2–5 seconds), then a structured result appears with sections for Differential Diagnosis, Suggested Tests, Treatment Suggestions, Follow-up Notes, and Risk Flags

### 5.2 No crash on empty transcript

1. Find or create a session with minimal or empty transcript text
2. Click Generate Insights
3. **Expected:** Either a graceful "Not enough data" message or a basic response — no 500 error or page crash

### 5.3 Recommendations not saved

1. Note the recommendations shown
2. Refresh the page
3. **Expected:** The recommendations are gone — they are ephemeral AI prompts, not stored in the database

---

## Section 6 — Patient Management

### 6.1 Create a new patient from session detail

1. Open any Complete session
2. Find the **Patient** card in the right panel
3. Click **New Patient** or the add patient icon
4. Enter name: `Mariam Qadeem`, age: `35`, gender: `Female`
5. Click Create
6. **Expected:** Patient created and linked to the session, patient name shown on the card

### 6.2 Search and link an existing patient

1. Open a different session
2. In the Patient card, start typing `Mariam` in the search field
3. **Expected:** Dropdown appears within 300ms showing `Mariam Qadeem`
4. Click her name
5. **Expected:** Patient linked, card shows her details

### 6.3 Unlink patient

1. On a session with a linked patient
2. Click the **unlink** icon (broken chain icon)
3. **Expected:** Patient removed from session, field shows empty

### 6.4 Patient appears in session card

1. Go to Dashboard
2. **Expected:** Sessions with a linked patient show the patient name in the session card body

### 6.5 Cannot link another user's patient

1. Register a second account `dr2@test.com`
2. Log in as `dr2@test.com` and create a patient `Private Patient`
3. Log back in as `dr@test.com`
4. Try to link `Private Patient` to a session
5. **Expected:** Patient does not appear in the search results (scoped to creator)

---

## Section 7 — Session Approval Workflow

### 7.1 Approve a session

1. Open a Complete session
2. Review the summary fields
3. Click **Approve** or **Mark as Done**
4. **Expected:** Status badge changes to **Approved**, an `approved_at` timestamp appears, edit fields become read-only

### 7.2 Approved session locked for editing

1. On an Approved session
2. Try clicking into a summary field to edit it
3. **Expected:** Fields are non-editable; Save Summary button is hidden or disabled

### 7.3 Approved session in Dashboard filter

1. Go to Dashboard
2. Click the **Approved** filter pill
3. **Expected:** Only sessions with Approved status are shown

### 7.4 Approved sessions counted in stats

1. Dashboard stats row should show Completed count that includes approved sessions
2. **Expected:** Approved sessions contribute to the "Completed" stat card

---

## Section 8 — Soft Delete & Restore

### 8.1 Delete a session

1. From Dashboard or Session Detail, delete a session (delete icon or button)
2. **Expected:** Session disappears from Dashboard immediately

### 8.2 Deleted session not accessible

1. Copy the session's URL before deleting it (e.g., `/session/<id>`)
2. Delete the session
3. Navigate to that URL
4. **Expected:** 404 error page or "Session not found"

### 8.3 Admin restores deleted session

1. Log in as an admin account (register with `role: admin` or update via admin panel)
2. Navigate to Admin Panel → find the deleted session in the audit log or via restore endpoint
3. Use the restore action
4. **Expected:** Session returns to Dashboard for its owner

---

## Section 9 — Dashboard

### 9.1 Sessions load from API

1. Log in
2. Dashboard should show real sessions from the database
3. **Expected:** Sessions are ordered newest-first, each with title, time ago, status badge

### 9.2 Search by title

1. In the search box, type part of a session title
2. **Expected:** Only matching sessions shown, others hidden

### 9.3 Search by language

1. If any sessions have a detected language, search that language code (e.g., `english`)
2. **Expected:** Matching sessions shown

### 9.4 Status filter pills

1. Click **Processing**
2. **Expected:** Only sessions with Processing status shown
3. Click **Failed**
4. **Expected:** Only Failed sessions shown (or empty state if none)
5. Click **All**
6. **Expected:** All sessions restored

### 9.5 Refresh button

1. In another tab, start a new session
2. On the Dashboard tab, click the Refresh icon (top right)
3. **Expected:** New session appears without full page reload

### 9.6 Empty state

1. Log in with a fresh account that has no sessions
2. **Expected:** Empty state illustration with a "Start Recording" CTA button

### 9.7 Stats row accuracy

1. Create 2 complete sessions, approve 1, leave 1 in processing
2. **Expected:** Stats row shows accurate counts for Total Sessions, Completed (should include approved), This Week

---

## Section 10 — Analytics Page

### 10.1 Page loads without error

1. Navigate to Analytics in the sidebar
2. **Expected:** Charts render with your actual session data (or empty charts if no data)

### 10.2 Status breakdown includes Approved

1. Approve at least one session
2. Go to Analytics
3. **Expected:** Status breakdown shows an **Approved** row with a count ≥ 1

### 10.3 Completion rate includes Approved

1. Check the completion rate percentage shown
2. **Expected:** Approved sessions count toward completed (not shown as a separate incomplete category)

---

## Section 11 — Admin Panel

> Requires an account with `role = admin`.

### 11.1 Access as admin

1. Log in as an admin account
2. Navigate to Admin in the sidebar
3. **Expected:** Admin panel loads with stats, user list, and audit log

### 11.2 Non-admin cannot access Admin

1. Log in as a healthcare user
2. Try navigating to `/admin`
3. **Expected:** Redirected away or shown "Access denied"

### 11.3 Platform stats are accurate

1. Check that:
   - Total users matches actual registered users
   - Total conversations matches actual sessions
   - Complete count includes both `complete` and `approved` statuses
   - Deleted sessions are NOT counted
2. **Expected:** All figures accurate

### 11.4 User role update

1. In the user list, find a healthcare user
2. Change their role to `admin`
3. **Expected:** Role updates in the table, audit log records a `user_role_changed` event

### 11.5 Cannot change own role

1. As an admin, try to PATCH your own user account
2. **Expected:** Error: "Cannot modify your own account via admin endpoint"

### 11.6 Delete a user

1. Create a test account `todelete@test.com`
2. In Admin panel, delete that account
3. **Expected:** User removed from the list, audit log records `user_deleted`

### 11.7 Audit log shows events

1. Perform several actions: approve a session, delete a session, change a user role
2. In Admin → Audit Log section
3. **Expected:** Each action appears as a colour-coded entry with timestamp, actor name, and action type

### 11.8 Restore a soft-deleted session

1. Delete a session from Dashboard (soft delete)
2. In Admin panel, restore it using the restore endpoint or button
3. **Expected:** Session reappears in the owner's Dashboard, audit log records `session_restored`

---

## Section 12 — Record & Extract (ASR Page)

### 12.1 Upload and transcribe a file

1. Navigate to **ASR / Record & Extract** in the sidebar
2. Click the upload area and select any audio file (WAV, MP3, or WebM)
3. **Expected:** Transcription starts, progress indicator shows, then transcript appears

### 12.2 Speaker labels on upload

1. Upload a recording with two distinct voices (doctor + patient conversation)
2. **Expected:** Transcript segments labelled `[DR]` and `[PT]` (requires Groq LLM diarization)

### 12.3 Extraction auto-fills form

1. After transcription completes
2. **Expected:** Extracted fields (Name, Age, Gender, Disease, etc.) auto-populate in the form on the right

### 12.4 Edit extracted fields

1. In the extraction form, clear the Name field and type a new name
2. **Expected:** Field accepts input; you can correct AI mistakes inline

### 12.5 Download transcript

1. Click **Download Transcript**
2. **Expected:** A `.txt` file downloads with the full transcript text

---

## Section 13 — Settings Page

### 13.1 Page loads

1. Navigate to Settings in the sidebar
2. **Expected:** Settings page renders with profile, notification, and privacy sections

### 13.2 Theme toggle works

1. On Settings or via the sidebar theme toggle
2. Toggle between light and dark mode
3. **Expected:** UI switches theme immediately and persists after page refresh (stored in localStorage)

> Note: Language preference and privacy settings are UI-only in the current build — they do not persist to the backend.

---

## Section 14 — Session Persistence Across Login

### 14.1 Anonymous session claimed on login

1. **Log out** completely
2. Navigate to `/live` without logging in
3. Start a recording session, speak a few words, complete the session
4. Note the session ID from the URL
5. Now **log in** as `dr@test.com`
6. **Expected:** That session now appears on the Dashboard under your account — it was auto-claimed

### 14.2 Multiple logins see same sessions

1. Log in as `dr@test.com` in one browser tab
2. Open a new incognito tab and log in as the same `dr@test.com`
3. **Expected:** Both tabs show the same session list

---

## Section 15 — Error States & Edge Cases

### 15.1 Backend down — Dashboard shows error

1. Stop the Flask backend
2. Go to Dashboard and click Refresh
3. **Expected:** Error banner: "Could not load sessions — is the backend running?" No page crash

### 15.2 Groq unavailable — transcription graceful

1. Set `GROQ_API_KEY=invalid_key` in `.env` and restart backend
2. Start a live session and speak
3. **Expected:** Live path surfaces error via WebSocket (`session_error` or missing updates); ASR upload would fail `POST /api/transcribe` — page should not white-screen

### 15.3 Empty audio chunk skipped

1. Start a session, stay completely silent for 5 seconds
2. **Expected:** No meaningless empty segments added to transcript (silence is detected by file size and skipped)

### 15.4 Session not found

1. Navigate to `/session/00000000-0000-0000-0000-000000000000`
2. **Expected:** 404 state shown — "Session not found" or redirect to Dashboard

### 15.5 Approve locked session cannot be re-edited via API

1. Approve a session
2. Try directly calling `PATCH /api/conversations/:id` with `Authorization` header from a healthcare user
3. **Expected:** `403 Forbidden` — "Record is approved and locked"

---

## API-Level Testing (with curl / Postman)

### Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr Test","email":"dr@test.com","password":"test123","role":"healthcare"}'
# → 201 { "token": "eyJ...", "user": { ... } }
```

### Login and capture token

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dr@test.com","password":"test123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo $TOKEN
```

### List conversations

```bash
curl http://localhost:5000/api/conversations \
  -H "Authorization: Bearer $TOKEN"
# → 200 { "conversations": [...] }
```

### Create a patient

```bash
curl -X POST http://localhost:5000/api/patients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ahmed Khan","age":"45","gender":"Male","contact":"0300-1234567"}'
# → 201 { "patient": { "id": "...", "name": "Ahmed Khan", ... } }
```

### Get admin stats (admin token required)

```bash
curl http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# → 200 { "users": {...}, "conversations": {...} }
```

### Health check

```bash
curl http://localhost:5000/health
# → 200 { "status": "ok", "redis_queue_enabled": ..., "diarization_available": ..., ... }
```

---

## Quick Smoke Test Checklist

Run through this list to confirm a healthy deployment in under 10 minutes:

- [ ] Backend `/health` returns 200
- [ ] Register a new user
- [ ] Login returns JWT
- [ ] Dashboard loads real sessions (or empty state)
- [ ] Start a live session and see transcript update
- [ ] Complete a session and see it in Dashboard as Complete
- [ ] Open Session Detail and see transcript + extracted summary
- [ ] Save summary → field reminders appear
- [ ] Approve session → status changes to Approved, fields locked
- [ ] Admin panel loads with accurate stats
- [ ] Audit log shows recent events
- [ ] Delete a session → gone from Dashboard
- [ ] Admin restores deleted session → back in Dashboard
