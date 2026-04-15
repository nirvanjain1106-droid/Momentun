# Momentum API

**AI-powered adaptive scheduling** that learns your behaviour patterns and adjusts your daily plan automatically.

Built with FastAPI, PostgreSQL, and a two-pass constraint-based scheduling engine supporting up to 3 concurrent goals, enhanced with LLM-generated coaching.

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Client     │────▶│  FastAPI      │────▶│  PostgreSQL      │
│  (Mobile/    │◀────│  + Uvicorn    │◀────│  (asyncpg)       │
│   Web)       │     │              │     │                  │
└─────────────┘     └──────┬───────┘     └──────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼──────────┐
    │ Two-Pass   │  │  LLM       │  │  Pattern    │
    │ Constraint │  │  Service   │  │  Engine     │
    │ Solver     │  │ (OpenRouter│  │ (insights,  │
    │ (floor +   │  │  /Groq/    │  │  trajectory)│
    │  greedy)   │  │  Ollama)   │  │             │
    └────────────┘  └────────────┘  └─────────────┘
```

### Request Flow
1. **Auth** → JWT-based (register, login, verify email, password reset)
2. **Onboarding** → Academic → Health (encrypted) → Behavioural → Fixed Blocks → Goal
3. **Scheduling** → Portfolio-level two-pass solver (floor + greedy) → LLM enrichment (with token tracking) → Daily schedule
4. **Tasks** → Real-time complete/park (row-locked) → Parking lot management → Quick-add → Undo/reschedule
5. **Check-ins** → Morning (energy/mood) → Day type adjustment → Evening (task completions)
6. **Insights** → Pattern detection (7 detectors + Golden Hour) → Streak tracking → Heatmap → Trajectory → Weekly reports
7. **User Profile** → Settings page (GET/PATCH profile, change password, delete account, data export, feedback, pause/resume)

---

## Features

### Core
- [x] User registration with email verification
- [x] JWT auth (access + refresh tokens)
- [x] Password reset via email
- [x] 5-step onboarding flow
- [x] Constraint-based daily schedule generation
- [x] **Slot reasoning engine** — every task explains WHY it's placed at that time
- [x] LLM-generated coaching (OpenRouter/Groq/Ollama fallback chain)
- [x] **LLM token tracking** — every call logs provider, tokens, latency, success/failure
- [x] Parallel week schedule generation (`asyncio.gather`)
- [x] Schedule regeneration (re-run solver when day goes off-plan)
- [x] Morning check-in → automatic day type adjustment
- [x] Evening review → task completion tracking

### User Profile (Commit 2)
- [x] `GET /users/me` — retrieve profile (decrypted health notes)
- [x] `PATCH /users/me` — update name, timezone, notification preferences
- [x] `POST /users/me/change-password` — secure password change
- [x] `DELETE /users/me` — GDPR-compliant account deletion (cascades all data)
- [x] `GET /users/me/export` — full data export (goals, tasks, logs, feedback)
- [x] `POST /users/me/feedback` — in-app bug reports & feedback with sentiment
- [x] `GET /users/me/day-score` — holistic 0-100 daily score (completion, timing, streaks, mood)
- [x] `POST /users/me/pause` — sick mode / vacation freeze (freezes streaks, shifts deadlines)
- [x] `POST /users/me/resume` — resume from pause

### Task Management (Phase 4)
- [x] Real-time task completion (creates TaskLog immediately, not just at evening review)
- [x] **Row-level locking** — `SELECT FOR UPDATE` on task status changes prevents race conditions
- [x] Manual task parking (move to parking lot)
- [x] Task rescheduling (move parked task to a specific future date)
- [x] One-level undo on any task action
- [x] Parking lot with staleness detection (>14 days = stale)
- [x] Bulk delete for stale parking lot cleanup
- [x] **Quick-add** — zero-friction task capture (title + duration, straight to parking lot)

### Goal Lifecycle (Commit 3 — Multi-Goal Portfolio)
- [x] **Up to 3 concurrent active goals** with rank-based priority
- [x] **Two-pass constraint solver** — Pass 1: best-effort floor (1 Core task/goal), Pass 2: global greedy by rank
- [x] **Rank management** — service-side compaction with `SELECT FOR UPDATE` row-level locks
- [x] **Goal reordering** — negative temp ranks to avoid CHECK constraint violations
- [x] **pre_pause_rank** — snapshots original rank on pause for frontend resume options
- [x] **Expired task status** — horizon line auto-expires tasks past `scheduled_end` + grace window
- [x] **Cross-day cleanup** — zombie active tasks from past schedules are expired on next fetch
- [x] **Stale schedule regeneration** — crash-safe lock with 120s timeout, no-LLM fast path
- [x] List all goals (active + history with progress, `?status=` filter)
- [x] Goal progress percentage (computed from TaskLog data)
- [x] Full status transitions: active → paused / achieved / abandoned, paused → active (cap-enforced)
- [x] Goal CRUD (update, pause, resume, soft-delete)

### Intelligence (Phase 3 + Commit 2)
- [x] **7 behaviour pattern detectors** (day-of-week avoidance, time decay, streak vulnerability, post-bad-day collapse, subject avoidance, overload triggers, **golden hour**)
- [x] **Bumped pattern thresholds** — all detectors now require ≥14 days of data (via `PATTERN_MIN_SAMPLES` constants)
- [x] Goal trajectory & pace projection
- [x] **Streak tracking** — current streak, best streak, configurable completion threshold (≥60%)
- [x] **Activity heatmap** — GitHub-style contribution data (7-365 days)
- [x] Weekly performance reports with coaching notes
- [x] Pattern-aware and trajectory-aware LLM prompts

### Security & Resilience (Commit 2)
- [x] **Field-level encryption** — health notes encrypted with Fernet (AES-128-CBC), derived from SECRET_KEY
- [x] **LLM rate limiting** — 3 calls/hour on schedule generate/regenerate (prevents cost abuse)
- [x] **LLM usage logging** — every call tracked in `llm_usage_logs` table (provider, tokens, latency, success)
- [x] **Row-level locking** — `SELECT FOR UPDATE` on task mutations
- [x] **Schedule bankruptcy** — auto-detects >2 days inactivity, parks stale tasks, enters recovery mode
- [x] **Sick mode / vacation freeze** — pauses streak tracking, shifts goal deadlines
- [x] **Soft-delete everywhere** — schedules use `deleted_at` instead of hard-delete, preserving FK integrity
- [x] **GDPR compliance** — account deletion cascades all user data, data export endpoint

### Infrastructure
- [x] Rate limiting (SlowAPI) on all endpoints
- [x] Structured JSON logging (production) with request IDs
- [x] Prometheus metrics (`/metrics`)
- [x] Sentry error tracking (opt-in)
- [x] GitHub Actions CI (lint, tests, coverage, dep audit)
- [x] Dependabot for automated dependency updates
- [x] Race-safe database operations (PostgreSQL upserts)
- [x] User timezone support (no more hardcoded Asia/Kolkata)
- [x] **Shared constants module** (`app/core/constants.py`) — single source of truth for priorities, statuses, thresholds

---

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register` | Create account (sends verification email) |
| `POST` | `/api/v1/auth/login` | Login with email + password |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET`  | `/api/v1/auth/verify-email` | Verify email with token |
| `POST` | `/api/v1/auth/password-reset/request` | Request password reset email |
| `POST` | `/api/v1/auth/password-reset/confirm` | Reset password with token |
| `POST` | `/api/v1/auth/logout` | Logout (client token discard) |

### Onboarding
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/onboarding/status` | Get onboarding progress |
| `POST` | `/api/v1/onboarding/academic-profile` | Step 2: Academic details |
| `POST` | `/api/v1/onboarding/health-profile` | Optional: Health info (encrypted) |
| `POST` | `/api/v1/onboarding/behavioural-profile` | Step 3: Schedule preferences |
| `POST` | `/api/v1/onboarding/fixed-blocks` | Step 4: Fixed commitments |
| `POST` | `/api/v1/onboarding/goal` | Step 5: Create first goal |

### User Profile *(new in Commit 2)*
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/users/me` | Get user profile |
| `PATCH` | `/api/v1/users/me` | Update profile fields |
| `POST` | `/api/v1/users/me/change-password` | Change password |
| `DELETE` | `/api/v1/users/me` | Delete account (GDPR) |
| `GET`  | `/api/v1/users/me/export` | Export all user data |
| `POST` | `/api/v1/users/me/feedback` | Submit feedback / bug report |
| `GET`  | `/api/v1/users/me/day-score` | Get today's holistic score (0-100) |
| `POST` | `/api/v1/users/me/pause` | Enter sick mode / vacation |
| `POST` | `/api/v1/users/me/resume` | Resume from pause |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedule/generate` | Generate daily schedule (LLM rate-limited: 3/hr) |
| `GET`  | `/api/v1/schedule/today` | Get/auto-generate today's schedule |
| `GET`  | `/api/v1/schedule/week` | Get full week schedule |
| `POST` | `/api/v1/schedule/regenerate` | Re-run solver (LLM rate-limited: 3/hr) |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/api/v1/tasks/{id}/complete` | Mark done in real time (row-locked) |
| `PATCH` | `/api/v1/tasks/{id}/park` | Move to parking lot |
| `PATCH` | `/api/v1/tasks/{id}/undo` | Undo last status change |
| `POST`  | `/api/v1/tasks/reschedule` | Move parked task to specific date |
| `POST`  | `/api/v1/tasks/quick-add` | Quick-capture a task (→ parking lot) |
| `GET`   | `/api/v1/tasks/parked` | View parking lot (?stale=true) |
| `DELETE` | `/api/v1/tasks/{id}` | Soft-delete a task |
| `POST`  | `/api/v1/tasks/bulk-delete` | Delete multiple stale tasks |

### Check-in
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/checkin/morning` | Morning energy check-in |
| `POST` | `/api/v1/checkin/evening` | Evening task review |

### Insights
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/insights/patterns` | Active behaviour patterns (7 detectors) |
| `GET`  | `/api/v1/insights/trajectory` | Goal pace projection |
| `GET`  | `/api/v1/insights/weekly` | Weekly performance report |
| `GET`  | `/api/v1/insights/streak` | Current & best streak |
| `GET`  | `/api/v1/insights/heatmap` | Activity heatmap (?days=90) |

### Goals *(updated in Commit 3)*
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/goals` | List all goals (`?status=active\|paused\|achieved`) |
| `GET`  | `/api/v1/goals/active` | Get highest-ranked active goal |
| `PUT`  | `/api/v1/goals/{id}` | Update a goal |
| `PATCH`| `/api/v1/goals/{id}/status` | Transition status (pause/achieve/abandon/resume) |
| `POST` | `/api/v1/goals/{id}/pause` | Pause active goal (snapshots rank) |
| `POST` | `/api/v1/goals/{id}/resume` | Resume paused goal (assigns bottom rank, enforces 3-goal cap) |
| `PUT`  | `/api/v1/goals/reorder` | Reorder active goals by priority |
| `DELETE`| `/api/v1/goals/{id}` | Soft-delete a goal |

### Infrastructure
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/` | App info |
| `GET`  | `/health` | DB connectivity check |
| `GET`  | `/metrics` | Prometheus metrics |
| `GET`  | `/docs` | Swagger UI |
| `GET`  | `/redoc` | ReDoc |

---

## Quick Start

### Prerequisites
- Python 3.11+
- PostgreSQL 15+
- (Optional) Docker & Docker Compose

### Setup

```bash
# Clone
git clone <repo-url> && cd momentum-api

# Virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install
pip install -r requirements.txt

# Environment
cp .env.example .env
# Edit .env with your database credentials

# Database
alembic upgrade head

# Run
uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
docker-compose up -d
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **Production** | Auto-generated | JWT signing key + encryption key derivation (32+ chars) |
| `POSTGRES_*` | Yes | See .env.example | Database connection |
| `OPENROUTER_API_KEY` | No | - | Primary LLM provider |
| `GROQ_API_KEY` | No | - | Fallback LLM provider |
| `SENTRY_DSN` | No | - | Sentry error tracking |
| `SMTP_HOST` | No | - | Email SMTP server (empty = console) |
| `RATE_LIMIT_AUTH` | No | `10/minute` | Auth endpoint rate limit |
| `RATE_LIMIT_LLM` | No | `3/hour` | LLM-triggering endpoint rate limit |

See [.env.example](.env.example) for all available settings.

---

## Testing

```bash
# Run all tests
pytest -q

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Multi-goal solver tests (12 tests)
pytest tests/test_multi_goal_solver.py -v

# Goal service tests (12 tests)
pytest tests/test_goal_service.py -v

# Schedule logic tests (11 tests)
pytest tests/test_schedule_logic.py -v

# Schema regression tests (3 tests)
pytest tests/test_multi_goal_schemas.py -v

# Lint
ruff check app tests

# Dependency audit
pip-audit
```

---

## CI/CD

GitHub Actions runs on every push and PR:
1. **Static check** — `python -m compileall app`
2. **Lint** — `ruff check app tests`
3. **Dependency scan** — `pip-audit --strict`
4. **Tests + Coverage** — `pytest --cov` with minimum threshold
5. **Model validation** — Ensures all SQLAlchemy models load correctly

---

## Project Structure

```
app/
├── config.py              # Pydantic settings
├── database.py            # Async SQLAlchemy engine
├── main.py                # FastAPI app + middleware
├── core/
│   ├── constants.py       # Shared constants (priorities, statuses, thresholds)
│   ├── dependencies.py    # Auth dependency injection
│   ├── email.py           # Email sender (SMTP/console)
│   ├── encryption.py      # Field-level Fernet encryption
│   ├── logging.py         # Structured logging
│   ├── middleware.py       # Request ID middleware
│   ├── rate_limit.py      # SlowAPI limiter
│   ├── security.py        # JWT + password hashing (PyJWT)
│   └── timezone.py        # User timezone utilities
├── models/
│   ├── user.py            # User, profiles, settings
│   └── goal.py            # Goal, schedule, tasks, logs, patterns, LLMUsageLog, Feedback
├── schemas/               # Pydantic request/response models
│   ├── auth.py
│   ├── checkin.py
│   ├── goals.py
│   ├── insights.py        # + StreakResponse, HeatmapResponse
│   ├── onboarding.py
│   ├── schedule.py        # + recovery_mode, is_paused
│   ├── tasks.py           # + QuickAddRequest
│   └── users.py           # (new) Profile, password, feedback, pause, export schemas
├── routers/               # FastAPI route handlers
│   ├── auth.py
│   ├── checkin.py
│   ├── goals.py
│   ├── insights.py        # + /streak, /heatmap
│   ├── onboarding.py
│   ├── schedule.py
│   ├── tasks.py           # + /quick-add
│   └── users.py           # (new) /users/me endpoints
└── services/              # Business logic
    ├── auth_service.py
    ├── checkin_service.py
    ├── constraint_solver.py  # + two-pass multi-goal allocator, GoalTaskGroup
    ├── goal_service.py       # + rank management, reorder, compaction, stale marking
    ├── insights_service.py   # + golden_hour, get_streak, get_heatmap
    ├── llm_service.py        # + token tracking, usage logging
    ├── onboarding_service.py # + field-level encryption on health notes
    ├── schedule_service.py   # + portfolio generation, horizon line, stale regen, cross-day cleanup
    ├── task_service.py       # + row-locking, quick-add
    └── user_service.py       # (new) profile, export, feedback, pause, day-score
tests/                     # pytest test suite (97 tests)
alembic/                   # Database migrations (005 = multi-goal portfolio)
```

---

## Database Models Added (Commit 2)

| Table | Purpose |
|-------|---------|
| `llm_usage_logs` | Track every LLM call (provider, model, tokens, latency, success) |
| `feedback` | User bug reports and sentiment feedback |
| `tasks.slot_reasons` | JSONB column explaining why each task was placed at its time slot |
| `users.paused_at/until/reason` | Sick mode / vacation freeze state |

## Database Changes (Commit 3 — Multi-Goal)

| Change | Purpose |
|--------|---------|
| `goals.priority_rank` | Active goal rank (1=highest). NULL when inactive. |
| `goals.pre_pause_rank` | Cached rank before pause, for frontend resume options |
| `tasks.goal_id` | Foreign key linking task to its parent goal |
| `tasks.goal_rank_snapshot` | Historical rank at scheduling time |
| `tasks.task_status` += `expired` | New status for horizon-line and cross-day expired tasks |
| `schedules.is_stale` | Signals schedule needs regeneration after rank/goal changes |
| `schedules.is_regenerating` | Crash-safe concurrent regen lock (120s timeout) |
| `schedules.regeneration_started_at` | Timestamp for regen lock timeout calculation |
| Partial unique index | `(user_id, priority_rank) WHERE status='active'` — prevents rank collisions |
| Bidirectional CHECK | `(active ↔ rank NOT NULL)` and `(inactive ↔ rank NULL)` |

---

## License

MIT
