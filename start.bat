@echo off
:: Start the Frontend
start "Frontend" cmd /k "cd frontend && npm run dev"

:: Start the Backend
start "Backend" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload"