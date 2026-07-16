@echo off
:: build-exe.bat — package the whole app into a single backend\dist\main.exe
::
:: Steps: build the React frontend, refresh backend\frontend_dist (the folder
:: main.spec embeds into the exe), then run PyInstaller. Stops on first error
:: so a failed frontend build can't produce an exe with a stale UI.

setlocal
cd /d "%~dp0"

echo [1/3] Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo Frontend build FAILED — exe not built.
    exit /b 1
)
cd ..

echo [2/3] Refreshing backend\frontend_dist...
if exist backend\frontend_dist rmdir /s /q backend\frontend_dist
xcopy /e /i /q frontend\dist backend\frontend_dist >nul
if errorlevel 1 (
    echo Copy FAILED — exe not built.
    exit /b 1
)

echo [3/3] Running PyInstaller...
:: A running app locks dist\main.exe and PyInstaller can't overwrite it.
taskkill /IM main.exe /F >nul 2>&1
cd backend
python -m PyInstaller main.spec --noconfirm
if errorlevel 1 (
    echo PyInstaller FAILED.
    exit /b 1
)
cd ..

echo.
echo Done: backend\dist\main.exe
