# ReadyFreddy

A very simple live classroom readiness app.

## Goal

Students click one button to mark themselves as ready for the current exercise.
The teacher sees a live overview of who is ready and who is not.

## Plan

### 1) Build a minimal version first (MVP)

- Student page:
  - Press one big button: "I am ready"
  - Optional toggle: "Not ready"
- Teacher page:
  - Live list of student slots with status (`ready` / `not ready`)
  - Ready counter (example: `14 / 22 ready`)
  - Button to reset all statuses for the next exercise

### 2) Use a simple technical stack

- Backend: Node.js + Express
- Realtime updates: WebSocket via Socket.IO
- Frontend: plain HTML/CSS/JavaScript (no framework for MVP)
- Storage:
  - In-memory storage for MVP (fastest to build)
  - Optional later: SQLite or Postgres if persistence is needed

### 3) Core data model

- `student`:
  - `id`
  - `ready` (boolean)
  - `updatedAt`

### 4) Realtime flow

- Student presses ready button
- Server updates status
- Server broadcasts new class state to all teacher pages instantly
- Teacher reset triggers a broadcast that sets all students to not ready

### 5) Basic routes/pages

- `/` -> landing page with role selection
- `/student` -> student interface
- `/teacher` -> teacher dashboard

### 6) Security and classroom controls (lightweight)

- Add a simple teacher passcode in environment variable for reset actions
- Sanitize student display names
- Rate-limit status updates to reduce accidental spam clicks

### 7) UX priorities

- Very large, obvious ready button
- High-contrast status colors for quick scanning
- Mobile-friendly student view
- Auto-reconnect if network drops

### 8) Testing checklist

- Multiple students can join at the same time
- Teacher view updates instantly when any student changes status
- Refreshing teacher page still shows current state
- Reset clears all students to not ready
- Student statuses remain stable per session

### 9) Deployment approach

- Start local development
- Deploy to a simple host (example: Render, Railway, or Fly.io)
- Share student and teacher URLs with class
- Keep teacher URL private (or protected by passcode)

### 10) Future improvements

- Exercise history
- Group/team readiness
- Attendance export (CSV)
- Authentication with school accounts
- Per-class rooms and scheduled sessions

## Success criteria

- A student can mark ready in one click
- The teacher sees status changes live with no page refresh
- Reset for next exercise works reliably in under 1 second

## Run locally

1. Install dependencies:
  - `npm install`
2. Optional: set a teacher passcode in your shell:
  - PowerShell: `$env:TEACHER_PASSCODE="your-passcode"`
3. Start the app:
  - `npm start`
4. Open in browser:
  - Student view: `http://localhost:3000/student`
  - Teacher view: `http://localhost:3000/teacher`

## What is implemented

- Anonymous student sessions (no names)
- Student page with a single ready/not ready toggle button
- Teacher dashboard with live status list and ready counter
- Live updates using Socket.IO
- Reset-all button for the teacher
- Optional teacher passcode check via environment variable
