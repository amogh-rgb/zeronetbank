@echo off
setlocal

set YEAR=%date:~-4,4%
set MONTH=%date:~-7,2%
set DAY=%date:~0,2%
set TODAY=%YEAR%%MONTH%%DAY%

if not exist "prisma\backups" mkdir "prisma\backups"

if exist "prisma\dev.db" (
  copy "prisma\dev.db" "prisma\backups\backup-%TODAY%.db" >nul
  echo [ZeroNetPay Backup] Created: backup-%TODAY%.db
) else (
  echo [ZeroNetPay Backup] sqlite file prisma\dev.db not found.
)

if defined DATABASE_URL (
  echo %DATABASE_URL% | findstr /b /c:"postgresql://" /c:"postgres://" >nul
  if not errorlevel 1 (
    where pg_dump >nul 2>&1
    if not errorlevel 1 (
      pg_dump "%DATABASE_URL%" > "prisma\backups\backup-%TODAY%.sql"
      if errorlevel 1 (
        echo [ZeroNetPay Backup] PostgreSQL backup failed.
      ) else (
        echo [ZeroNetPay Backup] Created: backup-%TODAY%.sql
      )
    ) else (
      echo [ZeroNetPay Backup] pg_dump not found. Install PostgreSQL client tools to enable SQL backups.
    )
  )
)

forfiles /p "prisma\backups" /m "backup-*.db" /d -30 /c "cmd /c del @file" 2>nul
forfiles /p "prisma\backups" /m "backup-*.sql" /d -30 /c "cmd /c del @file" 2>nul
echo [ZeroNetPay Backup] Cleaned old backups.

endlocal
