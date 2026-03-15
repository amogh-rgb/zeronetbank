# ZeroNetPay PostgreSQL Migration and Deployment

This backend now uses PostgreSQL as the primary Prisma datasource.

## 1. Environment

Copy `bank/.env.production.example` to `bank/.env` and fill in the real values:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/zeronetpay?schema=public&sslmode=require
SQLITE_DATABASE_URL=file:./dev.db
ADMIN_API_TOKEN=replace-with-long-random-token
JWT_SECRET=replace-with-strong-random-secret
REFRESH_TOKEN_SECRET=replace-with-strong-random-secret
```

`SQLITE_DATABASE_URL` is only needed for the one-time migration from the existing SQLite file.

## 2. Generate clients and migrations

```bash
cd bank
npm install
npm run prisma:generate
npm run prisma:generate:sqlite
npm run prisma:migrate:deploy
```

For local development against a fresh PostgreSQL database:

```bash
npm run prisma:migrate:dev
```

## 3. One-time SQLite -> PostgreSQL data migration

Make sure:

- `SQLITE_DATABASE_URL=file:./dev.db`
- `DATABASE_URL` points to the target PostgreSQL database

Then run:

```bash
npm run prisma:generate:sqlite
npm run prisma:generate
npm run db:migrate:sqlite-to-postgres
```

The migration script copies:

- `User`
- `BankState`
- `Transaction`

It also resolves internal PostgreSQL foreign keys:

- `Transaction.fromUserId`
- `Transaction.toUserId`

while preserving immutable `from` and `to` identifier fields used by the wallet app.

## 4. Production startup

```bash
npm run build
npm run start:prod
```

`start:prod` runs `prisma migrate deploy` before launching the compiled backend.

## 5. Render

- Use `bank/render.yaml`
- Provision the attached PostgreSQL database
- Set secrets in the Render dashboard for:
  - `ADMIN_API_TOKEN`
  - `JWT_SECRET`
  - `REFRESH_TOKEN_SECRET`
  - mail credentials
  - bank key material

## 6. Railway / AWS / DigitalOcean

Use these values:

- Build: `npm ci && npm run prisma:generate && npm run build`
- Start: `npm run start:prod`
- Health check: `/health`

Recommended PostgreSQL connection string settings:

```text
?schema=public&sslmode=require&connection_limit=10&pool_timeout=20
```

## 7. Docker

Build and run:

```bash
docker build -t zeronetpay-bank .
docker run --env-file .env -p 3000:3000 zeronetpay-bank
```

## 8. Backups

Daily backup command:

```bash
npm run backup
```

Behavior:

- SQLite source backup: `prisma/backups/backup-YYYYMMDD.db`
- PostgreSQL dump backup: `prisma/backups/backup-YYYYMMDD.sql` when `pg_dump` is installed

## 9. Banking safety notes

- Money values now use `Decimal(18,2)` in PostgreSQL.
- All transfer/deposit/withdraw flows already use Prisma transactions for atomicity.
- Transaction history is preserved and indexed for sync/admin lookups.
- User-facing API responses still return numeric amounts for app compatibility.
