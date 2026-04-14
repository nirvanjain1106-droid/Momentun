# Momentum API

AI-powered adaptive scheduling that learns your behaviour patterns
and adjusts your daily plan automatically.

---

## Prerequisites

- Python 3.11+
- Docker + Docker Compose
- Git

---

## Setup — Run These Commands Exactly In Order

### 1. Clone and enter the project
```bash
cd "Momentum API"
```

### 2. Create and activate virtual environment
```bash
python -m venv venv

# On Windows:
venv\Scripts\activate

# On Mac/Linux:
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 3.1 Configure environment
```bash
cp .env.example .env
```

### 4. Start the database
```bash
docker-compose up -d
```

Wait ~5 seconds for PostgreSQL to be ready. Verify:
```bash
docker-compose ps
# Both services should show "healthy"
```

### 5. Run database migrations
```bash
alembic upgrade head
```

You should see:
```
INFO  [alembic.runtime.migration] Running upgrade  -> 001_initial_schema, Initial schema
```

### 6. Start the API server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 7. Open the API docs
```
http://localhost:8000/docs
```

---

## API Endpoints — Phase 1

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login |
| POST | `/api/v1/auth/refresh` | Refresh access token |

### Onboarding
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/onboarding/status` | Get onboarding progress |
| POST | `/api/v1/onboarding/academic-profile` | Step 2: College details |
| POST | `/api/v1/onboarding/health-profile` | Optional: Health data |
| POST | `/api/v1/onboarding/behavioural-profile` | Step 3: Chronotype + commitment |
| POST | `/api/v1/onboarding/fixed-blocks` | Step 4: Fixed time commitments |
| POST | `/api/v1/onboarding/goal` | Step 5: First goal (completes onboarding) |

---

## Testing the API Manually

### Register a new user
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arjun Singh",
    "email": "arjun@example.com",
    "password": "Test1234",
    "user_type": "student"
  }'
```

Expected response:
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user_id": "uuid-here",
  "onboarding_complete": false,
  "onboarding_step": 1
}
```

### Save behavioural profile (Step 3)
```bash
curl -X POST http://localhost:8000/api/v1/onboarding/behavioural-profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "wake_time": "06:30",
    "sleep_time": "23:00",
    "chronotype": "early_bird",
    "daily_commitment_hrs": 4.0,
    "heavy_days": [3, 6],
    "light_days": [1],
    "preferred_study_style": "pomodoro",
    "max_focus_duration_mins": 45
  }'
```

### Save fixed blocks (Step 4)
```bash
curl -X POST http://localhost:8000/api/v1/onboarding/fixed-blocks \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blocks": [
      {
        "title": "Sleep",
        "block_type": "sleep",
        "applies_to_days": [1,2,3,4,5,6,7],
        "start_time": "23:00",
        "end_time": "06:30",
        "is_hard_constraint": true,
        "buffer_before": 0,
        "buffer_after": 30
      },
      {
        "title": "College",
        "block_type": "college",
        "applies_to_days": [2,3,4,5,6],
        "start_time": "09:00",
        "end_time": "16:00",
        "is_hard_constraint": true,
        "buffer_before": 0,
        "buffer_after": 0
      },
      {
        "title": "Travel to college",
        "block_type": "travel",
        "applies_to_days": [2,3,4,5,6],
        "start_time": "08:00",
        "end_time": "09:00",
        "is_hard_constraint": true,
        "buffer_before": 0,
        "buffer_after": 0
      },
      {
        "title": "Lunch",
        "block_type": "meal",
        "applies_to_days": [1,2,3,4,5,6,7],
        "start_time": "13:00",
        "end_time": "13:30",
        "is_hard_constraint": true,
        "buffer_before": 0,
        "buffer_after": 15
      }
    ]
  }'
```

### Create first goal (Step 5 — completes onboarding)
```bash
curl -X POST http://localhost:8000/api/v1/onboarding/goal \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Crack GATE 2026",
    "goal_type": "exam",
    "target_date": "2026-02-01",
    "motivation": "Get into IIT for M.Tech",
    "consequence": "Will have to appear again next year",
    "success_metric": "Score 650+ out of 1000",
    "metadata": {
      "subjects": ["Engineering Maths", "Computer Networks", "OS", "DBMS", "Algorithms"],
      "weak_subjects": ["Computer Networks", "OS"],
      "strong_subjects": ["Engineering Maths"],
      "exam_pattern": "MCQ",
      "total_marks": 100
    }
  }'
```

---

## Automated validation

```bash
pytest -q
python -m compileall app
```

CI runs these checks on every push and pull request via `.github/workflows/ci.yml`.

---

## Project Structure

```
momentum/
├── app/
│   ├── main.py               ← FastAPI app entry point
│   ├── config.py             ← Settings from .env
│   ├── database.py           ← Async SQLAlchemy engine + session
│   ├── models/
│   │   ├── user.py           ← User + profile tables
│   │   └── goal.py           ← Goal + schedule + log tables
│   ├── schemas/
│   │   ├── auth.py           ← Auth request/response schemas
│   │   └── onboarding.py     ← Onboarding request/response schemas
│   ├── routers/
│   │   ├── auth.py           ← Auth endpoints
│   │   └── onboarding.py     ← Onboarding endpoints
│   ├── services/
│   │   ├── auth_service.py   ← Register/login business logic
│   │   └── onboarding_service.py ← Onboarding business logic
│   └── core/
│       ├── security.py       ← JWT + password hashing
│       └── dependencies.py   ← FastAPI dependencies (auth guard)
├── alembic/
│   ├── env.py                ← Migration environment
│   └── versions/
│       └── 001_initial_schema.py ← Full DB schema
├── alembic.ini
├── docker-compose.yml        ← PostgreSQL + Redis
├── requirements.txt
├── .env                      ← Dev environment variables
└── .env.example              ← Template for new devs
```

---

## What's Built (Phase 1)

- ✅ User registration with JWT tokens
- ✅ Login with timing-attack-safe password verification
- ✅ Token refresh flow
- ✅ Auth guard (Bearer token dependency)
- ✅ Full onboarding flow (5 steps)
- ✅ Academic profile with intern support
- ✅ Health profile (optional)
- ✅ Behavioural profile with auto-derived peak energy
- ✅ Fixed blocks bulk creation with date range support
- ✅ Goal creation with single-active-goal enforcement
- ✅ Soft deletes everywhere
- ✅ Full DB schema with all constraints and partial indexes
- ✅ Onboarding status/resume endpoint

## What's Next (Phase 2)

- [ ] Constraint solver service
- [ ] Schedule generation endpoint
- [ ] GET /schedule/today
- [ ] GET /schedule/week

---

## Resetting the Database (During Development)

```bash
# Stop and remove containers + volumes
docker-compose down -v

# Restart fresh
docker-compose up -d

# Re-run migrations
alembic upgrade head
```
