# Momentum — Development Setup

## Prerequisites

- Python 3.11+ with `venv` already set up in project root
- Node.js 18+ and npm

## Quick Start

**Windows (one-click):**
```
start-dev.bat
```

**Manual start:**

```bash
# Terminal 1 — Backend
cd "Momentum API"
venv\Scripts\activate
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd "Momentum API\frontend"
npm run dev
```

## URLs

| Service  | URL                           |
|----------|-------------------------------|
| Frontend | http://localhost:5173         |
| Backend  | http://localhost:8000/api/v1  |
| API Docs | http://localhost:8000/docs    |

## Environment Variables

Copy `.env.example` to `.env` in the `frontend/` directory:

```
VITE_API_URL=http://localhost:8000/api/v1
```

## Architecture

```
Momentum API/
├── app/                    # FastAPI backend (Python)
│   ├── routers/            # API endpoints
│   ├── services/           # Business logic
│   └── models/             # SQLAlchemy models
├── frontend/               # React + Vite frontend
│   ├── src/
│   │   ├── app/            # New Figma UI (screens, components)
│   │   ├── api/            # Axios API clients (real backend)
│   │   ├── stores/         # Zustand state management
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities (offline queue, cache)
│   │   └── styles/         # Tailwind v4 + design tokens
│   └── _old_ui/            # Backed-up previous UI
└── start-dev.bat           # One-click dev launcher
```
