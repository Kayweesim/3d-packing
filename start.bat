@echo off
:: Start the Frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

:: Start the Backend
start "Backend" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload --timeout-graceful-shutdown 3"

:: Give the servers a moment to spin up (optional but recommended)
timeout /t 5 /nobreak >nul

:: Open the browser to your frontend URL
start http://localhost:5173
