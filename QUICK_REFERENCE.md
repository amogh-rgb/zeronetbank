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
npm run dev
```

## Required app URL
- USB (with adb reverse): `http://127.0.0.1:3000`
- Wi-Fi device: `http://<PC-LAN-IP>:3000`

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

## Important behavior
- Bank is the source of truth for synced balance.
- App can transfer offline and queue transactions.
- On next online sync, queued transactions settle and admin sees them.
- Admin deposit/withdraw updates user wallet + bank vault balance + transaction log.
