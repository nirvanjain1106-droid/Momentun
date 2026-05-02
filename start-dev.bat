@echo off
echo ================================================
echo   Momentum — Development Launcher
echo ================================================
echo.
echo Starting backend (FastAPI) on port 8000...
cd /d "%~dp0"
start "Momentum Backend" cmd /k "cd /d %~dp0 && venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000"

echo Starting frontend (Vite) on port 5173...
start "Momentum Frontend" cmd /k "cd /d %~dp0\frontend && npm run dev"

echo.
echo Both servers launching in separate windows.
echo   Backend:  http://localhost:8000/docs
echo   Frontend: http://localhost:5173
echo ================================================
