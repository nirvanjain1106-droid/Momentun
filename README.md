# Momentum

**AI-powered adaptive scheduling** — learns your behaviour patterns and adjusts your daily plan automatically.

Full-stack application: **FastAPI + PostgreSQL** backend with a **React + Vite** frontend. Features a two-pass constraint-based scheduling engine, LLM-generated coaching, recurring tasks, notification engine, and a premium mobile-first UI.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  React Frontend  │────▶│  FastAPI Backend  │────▶│   PostgreSQL     │
│  (Vite + TS)     │◀────│  (Uvicorn)       │◀────│   (asyncpg)      │
│  :5173           │     │  :8000           │     │                  │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
          ┌─────────▼──┐  ┌──────▼─────┐  ┌───▼──────────┐
          │ Two-Pass   │  │  LLM       │  │  Pattern     │
          │ Constraint │  │  Service   │  │  Engine      │
          │ Solver     │  │ (OpenRouter│  │ (7 detectors │
          │ (floor +   │  │  /Groq/    │  │  + golden    │
          │  greedy)   │  │  Ollama)   │  │  hour)       │
          └────────────┘  └────────────┘  └──────────────┘
```

### Request Flow
1. **Auth** → JWT (access + refresh tokens), email verification, password reset
2. **Onboarding** → Academic → Health (encrypted) → Behavioural → Fixed Blocks → Goal
3. **Scheduling** → Portfolio two-pass solver → LLM enrichment → Daily schedule
4. **Tasks** → Real-time complete/park (row-locked) → Parking lot → Quick-add → Undo
5. **Check-ins** → Morning (energy/mood) → Evening (task review)
6. **Insights** → 7 pattern detectors + Golden Hour → Streaks → Heatmap → Weekly reports
7. **Recurring** → Rule-based task generation with daily-reset dedup
8. **Notifications** → Event-driven engine with SSE real-time delivery

---

## Features

### Backend — Core Scheduling
- [x] Constraint-based daily schedule generation (two-pass: floor + greedy)
- [x] Slot reasoning engine — every task explains WHY it's placed at that time
- [x] LLM-generated coaching (OpenRouter/Groq/Ollama fallback chain)
- [x] LLM token tracking — every call logs provider, tokens, latency
- [x] Parallel week generation (`asyncio.gather`)
- [x] Schedule regeneration — re-run solver when day goes off-plan
- [x] Morning check-in → automatic day type adjustment
- [x] Evening review → task completion tracking

### Backend — Task Management
- [x] Real-time task completion with `SELECT FOR UPDATE` row-level locking
- [x] Manual parking, rescheduling, one-level undo
- [x] Parking lot with staleness detection (>14 days)
- [x] Quick-add — zero-friction task capture
- [x] Bulk delete for stale parking lot cleanup
- [x] Recurring task rules with daily-reset dedup (Sprint 7)

### Backend — Goal Lifecycle
- [x] Up to 3 concurrent active goals with rank-based priority
- [x] Rank management with row-level locks and compaction
- [x] Full status transitions: active → paused / achieved / abandoned
- [x] Goal progress percentage from TaskLog data
- [x] Goal milestones API (Sprint 7)

### Backend — Intelligence
- [x] 7 behaviour pattern detectors (day-of-week avoidance, time decay, streak vulnerability, post-bad-day collapse, subject avoidance, overload triggers, golden hour)
- [x] Streak tracking with configurable ≥60% threshold
- [x] Activity heatmap (GitHub-style, 7–365 days) with cache layer
- [x] Goal trajectory & pace projection
- [x] Weekly performance reports with coaching notes

### Backend — Security & Infrastructure
- [x] Field-level encryption (Fernet AES-128-CBC) for health notes
- [x] LLM rate limiting (3 calls/hour)
- [x] Schedule bankruptcy detection (>2 days inactivity)
- [x] Sick mode / vacation freeze
- [x] GDPR-compliant account deletion + data export
- [x] Prometheus metrics, Sentry tracking, structured JSON logging
- [x] Rate limiting (SlowAPI), request ID middleware
- [x] SSE real-time event stream (Sprint 7)
- [x] Notification engine with event bus (Sprint 7)
- [x] GitHub Actions CI (lint, tests, coverage, dep audit)

### Frontend — Screens
- [x] Login & Registration with form validation
- [x] Onboarding flow
- [x] Home dashboard (header + content + AI coach banner)
- [x] Tasks screen with category filtering
- [x] Goals screen + empty state
- [x] Goal detail with milestones and progress
- [x] Insights dashboard (streaks, heatmap, patterns)
- [x] Weekly summary report
- [x] Morning check-in (multi-step, energy/mood)
- [x] Evening review (4-step reflective flow)
- [x] AI Coach screen
- [x] Profile & Settings
- [x] Bottom navigation bar

### Frontend — Technical
- [x] Zustand auth store with localStorage hydration + silent token refresh
- [x] Axios API client with interceptors and idempotency headers
- [x] Tailwind CSS v4 design system (warm-toned, mobile-first)
- [x] Framer Motion animations
- [x] Radix UI primitives for accessibility
- [x] Recharts data visualisation
- [x] PWA-ready (vite-plugin-pwa)

---

## Quick Start

### Prerequisites
- Python 3.11+ and PostgreSQL 15+
- Node.js 18+ and npm

### One-Click (Windows)

```bash
# Double-click or run:
start-dev.bat
```

This opens two terminal windows: backend on `:8000`, frontend on `:5173`.

### Manual Setup

```bash
# ── Backend ──────────────────────────────
python -m venv venv
venv\Scripts\activate          # Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # Edit with your DB credentials
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# ── Frontend ─────────────────────────────
cd frontend
npm install --legacy-peer-deps
npm run dev
```

### Docker

```bash
docker-compose up -d
```

---

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register` | Create account |
| `POST` | `/api/v1/auth/login` | Login (email + password) |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET`  | `/api/v1/auth/verify-email` | Verify email with token |
| `POST` | `/api/v1/auth/password-reset/request` | Request password reset |
| `POST` | `/api/v1/auth/password-reset/confirm` | Confirm password reset |
| `POST` | `/api/v1/auth/logout` | Logout |

### Onboarding
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/onboarding/status` | Get onboarding progress |
| `POST` | `/api/v1/onboarding/academic-profile` | Step 2: Academic details |
| `POST` | `/api/v1/onboarding/health-profile` | Optional: Health info (encrypted) |
| `POST` | `/api/v1/onboarding/behavioural-profile` | Step 3: Preferences |
| `POST` | `/api/v1/onboarding/fixed-blocks` | Step 4: Fixed commitments |
| `POST` | `/api/v1/onboarding/goal` | Step 5: Create first goal |

### User Profile
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/users/me` | Get profile |
| `PATCH` | `/api/v1/users/me` | Update profile |
| `POST` | `/api/v1/users/me/change-password` | Change password |
| `DELETE` | `/api/v1/users/me` | Delete account (GDPR) |
| `GET` | `/api/v1/users/me/export` | Export all user data |
| `POST` | `/api/v1/users/me/feedback` | Submit feedback |
| `GET` | `/api/v1/users/me/day-score` | Daily score (0–100) |
| `POST` | `/api/v1/users/me/pause` | Sick mode / vacation |
| `POST` | `/api/v1/users/me/resume` | Resume from pause |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedule/generate` | Generate daily schedule |
| `GET` | `/api/v1/schedule/today` | Get/auto-generate today |
| `GET` | `/api/v1/schedule/week` | Get full week |
| `POST` | `/api/v1/schedule/regenerate` | Re-run solver |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/api/v1/tasks/{id}/complete` | Mark done (row-locked) |
| `PATCH` | `/api/v1/tasks/{id}/park` | Move to parking lot |
| `PATCH` | `/api/v1/tasks/{id}/undo` | Undo last action |
| `POST` | `/api/v1/tasks/reschedule` | Reschedule parked task |
| `POST` | `/api/v1/tasks/quick-add` | Quick-capture task |
| `GET` | `/api/v1/tasks/parked` | View parking lot |
| `DELETE` | `/api/v1/tasks/{id}` | Soft-delete |
| `POST` | `/api/v1/tasks/bulk-delete` | Bulk delete stale |

### Check-in
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/checkin/morning` | Morning energy check-in |
| `POST` | `/api/v1/checkin/evening` | Evening task review |

### Insights
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/insights/patterns` | Active behaviour patterns |
| `GET` | `/api/v1/insights/trajectory` | Goal pace projection |
| `GET` | `/api/v1/insights/weekly` | Weekly report |
| `GET` | `/api/v1/insights/streak` | Current & best streak |
| `GET` | `/api/v1/insights/heatmap` | Activity heatmap |

### Goals
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/goals` | List all goals |
| `GET` | `/api/v1/goals/{id}` | Get goal detail |
| `GET` | `/api/v1/goals/active` | Highest-ranked active |
| `PUT` | `/api/v1/goals/{id}` | Update goal |
| `PATCH` | `/api/v1/goals/{id}/status` | Transition status |
| `POST` | `/api/v1/goals/{id}/pause` | Pause goal |
| `POST` | `/api/v1/goals/{id}/resume` | Resume goal |
| `PUT` | `/api/v1/goals/reorder` | Reorder by priority |
| `DELETE` | `/api/v1/goals/{id}` | Soft-delete |

### Sprint 7 — New Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/recurring-rules` | List recurring rules |
| `POST` | `/api/v1/recurring-rules` | Create recurring rule |
| `DELETE` | `/api/v1/recurring-rules/{id}` | Delete rule |
| `GET` | `/api/v1/notifications/stream` | SSE event stream |
| `POST` | `/api/v1/milestones` | Create milestone |

### Infrastructure
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | App info |
| `GET` | `/health` | DB connectivity check |
| `GET` | `/metrics` | Prometheus metrics |
| `GET` | `/docs` | Swagger UI |

---

## Project Structure

```
Momentum API/
├── app/                          # Backend (FastAPI)
│   ├── main.py                   # App + middleware + CORS
│   ├── config.py                 # Pydantic settings
│   ├── database.py               # Async SQLAlchemy engine
│   ├── core/
│   │   ├── constants.py          # Shared constants
│   │   ├── dependencies.py       # Auth dependency injection
│   │   ├── email.py              # SMTP / console email
│   │   ├── encryption.py         # Field-level Fernet encryption
│   │   ├── logging.py            # Structured JSON logging
│   │   ├── maintenance.py        # Maintenance mode
│   │   ├── metrics.py            # Prometheus metrics
│   │   ├── middleware.py         # Request ID middleware
│   │   ├── rate_limit.py         # SlowAPI limiter
│   │   ├── security.py           # JWT + password hashing
│   │   ├── session_utils.py      # DB session helpers
│   │   └── timezone.py           # User timezone utilities
│   ├── models/
│   │   ├── goal.py               # Goal, Schedule, Task, TaskLog, etc.
│   │   ├── user.py               # User, profiles, settings
│   │   └── idempotency.py        # Idempotency keys
│   ├── schemas/                  # Pydantic request/response models
│   ├── routers/                  # FastAPI route handlers
│   │   ├── auth.py
│   │   ├── checkin.py
│   │   ├── goals.py
│   │   ├── health.py
│   │   ├── insights.py
│   │   ├── milestones.py         # Sprint 7
│   │   ├── notifications.py      # Sprint 7
│   │   ├── onboarding.py
│   │   ├── recurring_rules.py    # Sprint 7
│   │   ├── schedule.py
│   │   ├── sse.py                # Sprint 7
│   │   ├── tasks.py
│   │   └── users.py
│   └── services/                 # Business logic
│       ├── auth_service.py
│       ├── checkin_service.py
│       ├── constraint_solver.py  # Two-pass multi-goal allocator
│       ├── encryption_helpers.py # Sprint 7
│       ├── event_bus.py          # Sprint 7
│       ├── goal_service.py
│       ├── idempotency_service.py
│       ├── insights_service.py   # 7 detectors + heatmap cache
│       ├── llm_service.py        # Token tracking + fallback chain
│       ├── notification_service.py # Sprint 7
│       ├── onboarding_service.py
│       ├── recurring_task_service.py # Sprint 7
│       ├── schedule_service.py
│       ├── task_service.py
│       └── user_service.py
│
├── frontend/                     # Frontend (React + Vite + TypeScript)
│   ├── .env                      # VITE_API_URL=http://localhost:8000/api/v1
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.tsx              # Entry point
│       ├── api/                  # API client layer
│       │   ├── client.ts         # Axios instance + interceptors
│       │   ├── userApi.ts        # Auth + profile endpoints
│       │   ├── scheduleApi.ts    # Schedule, tasks, goals, check-ins
│       │   └── insightsApi.ts    # Streaks, heatmap, weekly reports
│       ├── stores/
│       │   └── authStore.ts      # Zustand auth state management
│       ├── styles/
│       │   ├── index.css         # Entry CSS (imports)
│       │   ├── globals.css       # Keyframes + base styles
│       │   └── theme.css         # Design tokens + Tailwind theme
│       ├── lib/                  # Utilities
│       │   ├── analytics.ts      # PostHog analytics
│       │   ├── errorUtils.ts     # Error formatting
│       │   ├── idbCache.ts       # IndexedDB cache
│       │   └── offlineQueue.ts   # Offline request queue
│       └── app/
│           ├── App.tsx           # Root router + auth gating
│           └── components/       # 32 UI components
│               ├── screen-login.tsx
│               ├── screen-register.tsx
│               ├── screen-onboarding.tsx
│               ├── screen-home.tsx
│               ├── screen-home-header.tsx
│               ├── screen-home-content.tsx
│               ├── screen-tasks.tsx
│               ├── screen-insights.tsx
│               ├── screen-goals.tsx
│               ├── screen-goal-detail.tsx
│               ├── screen-morning-checkin.tsx
│               ├── screen-evening-review.tsx
│               ├── screen-ai-coach.tsx
│               ├── screen-profile.tsx
│               ├── screen-settings.tsx
│               ├── screen-weekly-summary.tsx
│               ├── molecule-card-*.tsx    # Cards (task, goal, stat, etc.)
│               ├── molecule-nav-bottom-bar.tsx
│               ├── atom-button-*.tsx      # Buttons
│               └── atom-badge-*.tsx       # Badges
│
├── tests/                        # pytest suite (33 test files)
├── alembic/                      # DB migrations (17 revisions)
├── start-dev.bat                 # One-click dev launcher (Windows)
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .github/workflows/            # CI pipeline
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **Prod** | Auto-gen | JWT signing + encryption derivation |
| `POSTGRES_*` | Yes | See .env.example | Database connection |
| `OPENROUTER_API_KEY` | No | — | Primary LLM provider |
| `GROQ_API_KEY` | No | — | Fallback LLM provider |
| `SENTRY_DSN` | No | — | Error tracking |
| `SMTP_HOST` | No | — | Email (empty = console) |
| `VITE_API_URL` | Frontend | `http://localhost:8000/api/v1` | Backend URL |

See [.env.example](.env.example) for all settings.

---

## Testing

```bash
# All tests
pytest -q

# With coverage
pytest --cov=app --cov-report=term-missing

# Specific suites
pytest tests/test_multi_goal_solver.py -v     # 12 solver tests
pytest tests/test_sprint7_recurring_tasks.py -v  # Recurring task tests
pytest tests/test_sprint7_notification_engine.py -v  # Notification tests

# Lint
ruff check app tests

# Dependency audit
pip-audit
```

---

## Database Migrations

| Migration | Purpose |
|-----------|---------|
| `001` | Initial schema (users, goals, tasks, schedules, logs) |
| `002` | Phase 2 improvements |
| `003` | Peak energy varchar + preferred model |
| `004` | Nullable scheduled times |
| `005` | Multi-goal portfolio (ranks, snapshots, constraints) |
| `f011` | Encryption columns |
| `f011b` | Dead letter queue |
| `f012` | Notification hardening |
| `f013` | Recurring task rules |
| `f014` | Task recurring columns |
| + merge/index migrations | Cleanup & performance |

---

## Sprint History

| Sprint | Focus | Key Deliverables |
|--------|-------|------------------|
| 1–2 | Foundation | Auth, onboarding, schedule engine, LLM coaching |
| 3 | User Profile | Settings, GDPR, pause/resume, day-score, feedback |
| 4 | Task Management | Row-locking, parking lot, quick-add, undo |
| 5 | Multi-Goal | 3-goal portfolio, two-pass solver, rank management |
| 6 | Hardening | Encryption migration, security audit, supply chain |
| 7 | Scale | Recurring tasks, notification engine, milestones, heatmap cache, SSE |
| UI | Frontend | React/Vite integration, 15 screens, design system, API wiring |

---

## Tech Stack

### Backend
- **Python 3.11+** / FastAPI / Uvicorn
- **PostgreSQL 15+** / SQLAlchemy 2 (async) / asyncpg
- **Alembic** for migrations
- **PyJWT** for auth, **Fernet** for field encryption
- **OpenRouter / Groq / Ollama** for LLM

### Frontend
- **React 19** / TypeScript / Vite 8
- **Tailwind CSS v4** / Framer Motion
- **Radix UI** primitives
- **Zustand** state management
- **Axios** HTTP client
- **Recharts** data visualisation
- **Lucide** icons

---

## License

MIT
