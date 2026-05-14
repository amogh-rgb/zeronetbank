# ZeroNetPay Render + Supabase Deployment

## 1. Required environment variables

Set these in Render for the `zeronetpay-bank` service:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `EMAIL_USER`
- `EMAIL_PASS`
- `PUBLIC_BASE_URL`
- `JWT_SECRET`
- `REFRESH_TOKEN_SECRET`
- `ADMIN_SECRET`
- `USER_DASHBOARD_SECRET`
- `PORT=10000`

Do not expose `SUPABASE_SERVICE_KEY` to Flutter.

## 2. Apply the database schema

Use `bank/schema.sql` in the Supabase SQL editor.

That file creates:

- `wallets`
- `users`
- `transactions`
- `otp_codes`
- `bank_state`

and also:

- indexes
- RLS
- deny-by-default policies
- `process_transfer(...)` RPC

## 3. Render build/start

Render uses:

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/health`

## 4. Flutter build-time configuration

Use build defines:

```bash
flutter build apk --release ^
  --dart-define=BANK_URL=https://your-render-service.onrender.com ^
  --dart-define=SUPABASE_URL=https://your-project.supabase.co ^
  --dart-define=SUPABASE_ANON_KEY=your-public-anon-key
```

## 5. API endpoints

Main endpoints exposed by the backend:

- `POST /auth/signup`
- `POST /auth/login`
- `POST /auth/account/register`
- `POST /auth/account/login`
- `POST /auth/account/reset-pin`
- `POST /email/send-otp`
- `POST /email/verify-otp`
- `GET /wallet/balance/:walletId`
- `POST /wallet/transfer`
- `GET /wallet/:walletId/transactions`
- `POST /wallet/sync-offline`
- `GET /api/public/directory`
- `GET /api/admin/users`
- `POST /api/admin/add-money`
- `POST /api/admin/remove-money`
- `POST /api/admin/users/:phone/delete`

## 6. Security notes

- Service-role key stays backend-only
- OTP values are hashed before storage
- PINs are hashed with `scrypt`
- RLS is enabled with deny-by-default policies
- Admin routes require `x-admin-token` or `Bearer <token>`
