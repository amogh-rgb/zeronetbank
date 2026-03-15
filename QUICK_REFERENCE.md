# ZeroNetBank Quick Reference (Rebuilt)

## What runs now
- Single bank authority backend: `bank/src/index.ts` on `:3000`
- Admin UI: `http://localhost:3000/admin/`
- App sync target: same bank server URL

## Start bank server
```powershell
cd E:\zero-net-pay-flutter\bank
npm install
npm run prisma:push
npm run build
# Optional: set admin token for protected admin APIs/smoke tests
$env:ADMIN_API_TOKEN="change-this-admin-token"
npm run dev
```

## PostgreSQL-ready migration path (safe)
- Kept current sqlite flow for stability.
- Added parallel Prisma schema for PostgreSQL: `bank/prisma/schema.postgres.prisma`
- Commands:
```powershell
cd E:\zero-net-pay-flutter\bank
$env:DATABASE_URL="postgresql://user:password@host/db?sslmode=require"
npm run prisma:generate:pg
npm run prisma:migrate:pg
```

## Required app URL
- USB (with adb reverse): `http://127.0.0.1:3000`
- Wi-Fi device: `http://<PC-LAN-IP>:3000`
- Do **not** use `https://127.0.0.1:3000` unless TLS is explicitly configured.

## Core API contract used by app
- `POST /auth/register`
- `POST /wallet/ping`
- `POST /wallet/sync`
- `GET /api/public/directory`
- `POST /wallet/queue-alert`
- `GET /wallet/queue-issues`

## Admin API (simple)
- `GET /api/admin/overview`
- `GET /api/admin/users?q=&limit=`
- `GET /api/admin/users/:phone/transactions?limit=`
- `POST /api/admin/add-money`
- `POST /api/admin/remove-money`
- `GET /api/admin/queue-issues`
- `POST /api/admin/queue-issues/:id/resolve`
- `POST /api/admin/queue-issues/:id/reopen`

## Add money payload
```json
{
  "phone": "9000000001",
  "amount": 5000,
  "note": "cash deposit"
}
```

## Smoke verify (manual)
1. Register/login wallet in app with mobile.
2. Open `http://localhost:3000/admin/` and confirm user row appears.
3. Add money in admin UI.
4. In app tap `Sync Now` and verify wallet balance updates.
5. Send/receive offline transfer, then sync again and verify transaction appears in admin and app history.
6. Optional backend smoke: `npm run smoke:queue-issues` (requires `ADMIN_API_TOKEN`).
   - Recommended env for Windows:
```powershell
$env:ADMIN_API_TOKEN="change-this-admin-token"
$env:BANK_BASE_URL="http://127.0.0.1:3000"
npm run smoke:queue-lifecycle
```
7. Full admin flow smoke (register -> add money -> verify):
```powershell
$env:ADMIN_API_TOKEN="change-this-admin-token"
$env:BANK_BASE_URL="http://127.0.0.1:3000"
# Optional:
# $env:TEST_PHONE="9480268832"
# $env:TEST_AMOUNT="500"
npm run smoke:admin-flow
```

## PowerShell token fix
- If you run `$env:ADMIN_API_TOKEN=change-this-admin-token` without quotes, PowerShell treats it as a command.
- Use quotes:
```powershell
$env:ADMIN_API_TOKEN="change-this-admin-token"
```

## Backup
- Run on demand:
```powershell
cd E:\zero-net-pay-flutter\bank
npm run backup
```
- Output folder: `bank/prisma/backups/`
- Script supports:
  - SQLite backup (`backup-YYYYMMDD.db`) when `prisma/dev.db` exists
  - PostgreSQL dump (`backup-YYYYMMDD.sql`) when `DATABASE_URL` is postgres and `pg_dump` is installed

## Cloudflare tunnel (template)
- Config file: `bank/cloudflare-tunnel.yml`
- Update:
  - `credentials-file` with your local user path
  - `hostname` with your real domain/subdomain
- Run:
```powershell
cloudflared tunnel run zeronetpay-bank
```

## Important behavior
- Bank is the source of truth for synced balance.
- App can transfer offline and queue transactions.
- On next online sync, queued transactions settle and admin sees them.
- Admin deposit/withdraw updates user wallet + bank vault balance + transaction log.
