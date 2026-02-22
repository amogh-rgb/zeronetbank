@echo off
REM ZeroNetBank Backend Setup Script (Windows)
REM Automates key generation, database setup, and initial seeding

setlocal enabledelayedexpansion

cls
echo ========================================================
echo   ZeroNetBank Backend Setup
echo ========================================================
echo.

REM Check Node.js
echo [1/5] Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    color 04
    echo [ERROR] Node.js not found. Please install Node.js 18+
    color 07
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION% installed
echo.

REM Check PostgreSQL
echo [2/5] Checking PostgreSQL installation...
psql --version >nul 2>&1
if errorlevel 1 (
    color 04
    echo [ERROR] PostgreSQL not found. Please install PostgreSQL 13+
    color 07
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('psql --version') do set PG_VERSION=%%i
echo [OK] PostgreSQL %PG_VERSION% installed
echo.

REM Check Redis (optional)
echo [3/5] Checking Redis installation...
redis-cli --version >nul 2>&1
if errorlevel 1 (
    echo [WARN] Redis not found (optional but recommended)
) else (
    for /f "tokens=*" %%i in ('redis-cli --version') do set REDIS_VERSION=%%i
    echo [OK] Redis %REDIS_VERSION% installed
)
echo.

REM Install dependencies
echo [4/5] Installing NPM dependencies...
call npm install
if errorlevel 1 (
    color 04
    echo [ERROR] Failed to install dependencies
    color 07
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

REM Environment setup
echo [5/5] Configuring environment...
if not exist .env (
    copy .env.example .env
    echo [OK] Created .env file ^(update with your settings^)
    echo.
    echo [WARN] Please review and update these critical settings in .env:
    echo   - DATABASE_URL: PostgreSQL connection
    echo   - REDIS_URL: Redis connection (optional^)
    echo   - JWT_SECRET: Random secret for tokens
    echo   - PORT: Server port (default: 3000^)
) else (
    echo [OK] .env already configured
)
echo.

REM Generate keys
echo Generating ECDSA P-256 keys...
call npm run generate-bank-keys
if errorlevel 1 (
    color 04
    echo [ERROR] Failed to generate keys
    color 07
    pause
    exit /b 1
)
echo [OK] Keys generated in ./secrets/
echo.

REM Initialize database
echo Creating database schema...
call npm run migrate
if errorlevel 1 (
    color 04
    echo [ERROR] Failed to initialize database
    color 07
    pause
    exit /b 1
)
echo [OK] Database initialized
echo.

REM Seed initial data
echo Creating initial admin users...
call npm run seed
if errorlevel 1 (
    color 04
    echo [ERROR] Failed to seed database
    color 07
    pause
    exit /b 1
)
echo [OK] Admin users created
echo.

cls
echo ========================================================
echo [SUCCESS] Setup Complete!
echo ========================================================
echo.
echo Next steps:
echo.
echo 1. Start the development server:
echo    npm run dev
echo.
echo 2. Verify the server is running:
echo    curl http://localhost:3000/health
echo.
echo 3. Test wallet sync (use a wallet's public key):
echo    curl -X POST http://localhost:3000/api/v1/wallet/sync ^
echo      -H "Content-Type: application/json" ^
echo      -d "{...wallet request...}"
echo.
echo 4. View generated bank public key:
echo    type .\secrets\bank-public-key.pem
echo.
echo 5. For admin operations, log in with:
echo    SUPER_ADMIN created during seed process
echo.
echo Documentation:
echo   - README.md - Architecture overview
echo   - THREAT_MODEL.md - Security analysis
echo   - DEPLOYMENT.md - Production guide
echo.
pause
