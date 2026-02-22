@echo off
REM Start ZeroNetBank Server
REM This script starts the bank backend server using npm dev (with nodemon for auto-reload)

echo.
echo ====================================
echo ZeroNetBank Server Startup
echo ====================================
echo.

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies
        exit /b 1
    )
)

echo Starting bank server...
echo Server will run on: http://localhost:3000
echo.

call npm run dev

exit /b %errorlevel%
