# Momentum API

**AI-powered adaptive scheduling** that learns your behaviour patterns and adjusts your daily plan automatically.

Built with FastAPI, PostgreSQL, and a constraint-based scheduling engine enhanced with LLM-generated coaching.

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
    │ Constraint  │  │  LLM       │  │  Pattern    │
    │ Solver      │  │  Service   │  │  Engine     │
    │ (greedy     │  │ (OpenRouter│  │ (insights,  │
    │  scheduler) │  │  /Groq/    │  │  trajectory)│
    └────────────┘  │  Ollama)   │  └─────────────┘
                    └────────────┘
```

### Request Flow
1. **Auth** → JWT-based (register, login, verify email, password reset)
2. **Onboarding** → Academic → Health → Behavioural → Fixed Blocks → Goal
3. **Scheduling** → Constraint solver → LLM enrichment (background) → Daily schedule
4. **Tasks** → Real-time complete/park → Parking lot management → Undo/reschedule
5. **Check-ins** → Morning (energy/mood) → Day type adjustment → Evening (task completions)
6. **Insights** → Pattern detection → Trajectory projection → Weekly reports

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
- [x] Parallel week schedule generation (`asyncio.gather`)
- [x] Schedule regeneration (re-run solver when day goes off-plan)
- [x] Morning check-in → automatic day type adjustment
- [x] Evening review → task completion tracking

### Task Management (Phase 4)
- [x] Real-time task completion (creates TaskLog immediately, not just at evening review)
- [x] Manual task parking (move to parking lot)
- [x] Task rescheduling (move parked task to a specific future date)
- [x] One-level undo on any task action
- [x] Parking lot with staleness detection (>14 days = stale)
- [x] Bulk delete for stale parking lot cleanup

### Goal Lifecycle (Phase 4)
- [x] List all goals (active + history with progress)
- [x] Goal progress percentage (computed from TaskLog data)
- [x] Full status transitions: active → paused / achieved / abandoned
- [x] Single-active-goal enforcement
- [x] Goal CRUD (update, pause, resume, soft-delete)

### Intelligence (Phase 3)
- [x] 6 behaviour pattern detectors (day-of-week avoidance, time decay, streak vulnerability, post-bad-day collapse, subject avoidance, overload triggers)
- [x] Goal trajectory & pace projection
- [x] Weekly performance reports with coaching notes
- [x] Pattern-aware and trajectory-aware LLM prompts

### Infrastructure
- [x] Rate limiting (SlowAPI) on all endpoints
- [x] Structured JSON logging (production) with request IDs
- [x] Prometheus metrics (`/metrics`)
- [x] Sentry error tracking (opt-in)
- [x] GitHub Actions CI (lint, tests, coverage, dep audit)
- [x] Dependabot for automated dependency updates
- [x] Race-safe database operations (PostgreSQL upserts)
- [x] User timezone support (no more hardcoded Asia/Kolkata)

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
| `POST` | `/api/v1/onboarding/health-profile` | Optional: Health info |
| `POST` | `/api/v1/onboarding/behavioural-profile` | Step 3: Schedule preferences |
| `POST` | `/api/v1/onboarding/fixed-blocks` | Step 4: Fixed commitments |
| `POST` | `/api/v1/onboarding/goal` | Step 5: Create first goal |

### Schedule
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/schedule/generate` | Generate daily schedule |
| `GET`  | `/api/v1/schedule/today` | Get/auto-generate today's schedule |
| `GET`  | `/api/v1/schedule/week` | Get full week schedule |
| `POST` | `/api/v1/schedule/regenerate` | Re-run solver when day goes off-plan |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/api/v1/tasks/{id}/complete` | Mark done in real time |
| `PATCH` | `/api/v1/tasks/{id}/park` | Move to parking lot |
| `PATCH` | `/api/v1/tasks/{id}/undo` | Undo last status change |
| `POST`  | `/api/v1/tasks/reschedule` | Move parked task to specific date |
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
| `GET`  | `/api/v1/insights/patterns` | Active behaviour patterns |
| `GET`  | `/api/v1/insights/trajectory` | Goal pace projection |
| `GET`  | `/api/v1/insights/weekly` | Weekly performance report |

### Goals
| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/goals` | List all goals (active + history) |
| `GET`  | `/api/v1/goals/active` | Get current active goal |
| `PUT`  | `/api/v1/goals/{id}` | Update a goal |
| `PATCH`| `/api/v1/goals/{id}/status` | Transition status (pause/achieve/abandon) |
| `POST` | `/api/v1/goals/{id}/pause` | Pause active goal |
| `POST` | `/api/v1/goals/{id}/resume` | Resume paused goal |
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
| `SECRET_KEY` | **Production** | Auto-generated | JWT signing key (32+ chars) |
| `POSTGRES_*` | Yes | See .env.example | Database connection |
| `OPENROUTER_API_KEY` | No | - | Primary LLM provider |
| `GROQ_API_KEY` | No | - | Fallback LLM provider |
| `SENTRY_DSN` | No | - | Sentry error tracking |
| `SMTP_HOST` | No | - | Email SMTP server (empty = console) |
| `RATE_LIMIT_AUTH` | No | `10/minute` | Auth endpoint rate limit |
| `RATE_LIMIT_SCHEDULE` | No | `10/minute` | Schedule endpoint rate limit |

See [.env.example](.env.example) for all available settings.

---

## Testing

```bash
# Run all tests
pytest -q

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run specific test file
pytest tests/test_constraint_solver.py -v

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
│   ├── dependencies.py    # Auth dependency injection
│   ├── email.py           # Email sender (SMTP/console)
│   ├── logging.py         # Structured logging
│   ├── middleware.py       # Request ID middleware
│   ├── rate_limit.py      # SlowAPI limiter
│   ├── security.py        # JWT + password hashing (PyJWT)
│   └── timezone.py        # User timezone utilities
├── models/
│   ├── user.py            # User, profiles, settings
│   └── goal.py            # Goal, schedule, tasks, logs, patterns
├── schemas/               # Pydantic request/response models
│   ├── auth.py
│   ├── checkin.py
│   ├── goals.py
│   ├── insights.py
│   ├── onboarding.py
│   ├── schedule.py
│   └── tasks.py
├── routers/               # FastAPI route handlers
│   ├── auth.py
│   ├── checkin.py
│   ├── goals.py
│   ├── insights.py
│   ├── onboarding.py
│   ├── schedule.py
│   └── tasks.py
└── services/              # Business logic
    ├── auth_service.py
    ├── checkin_service.py
    ├── constraint_solver.py
    ├── goal_service.py
    ├── insights_service.py
    ├── llm_service.py
    ├── onboarding_service.py
    ├── schedule_service.py
    └── task_service.py
tests/                     # pytest test suite
alembic/                   # Database migrations
```

---

## License

MIT
