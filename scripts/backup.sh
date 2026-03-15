#!/bin/bash
set -euo pipefail

TODAY=$(date +%Y%m%d)
mkdir -p prisma/backups

if [ -f prisma/dev.db ]; then
  cp prisma/dev.db "prisma/backups/backup-${TODAY}.db"
  echo "[ZeroNetPay Backup] Created: backup-${TODAY}.db"
else
  echo "[ZeroNetPay Backup] sqlite file prisma/dev.db not found."
fi

if [[ "${DATABASE_URL:-}" == postgresql* || "${DATABASE_URL:-}" == postgres* ]]; then
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "${DATABASE_URL}" > "prisma/backups/backup-${TODAY}.sql" \
      && echo "[ZeroNetPay Backup] Created: backup-${TODAY}.sql" \
      || echo "[ZeroNetPay Backup] PostgreSQL backup failed."
  else
    echo "[ZeroNetPay Backup] pg_dump not found. Install PostgreSQL client tools to enable SQL backups."
  fi
fi

find prisma/backups -name "backup-*.db" -mtime +30 -delete || true
find prisma/backups -name "backup-*.sql" -mtime +30 -delete || true
echo "[ZeroNetPay Backup] Cleaned old backups."
