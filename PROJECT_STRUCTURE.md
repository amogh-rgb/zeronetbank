# ZeroNetBank Project Structure

## 📁 Directory Layout

```
bank/
├── src/
│   ├── index.ts                    # Main app entry point
│   ├── services/
│   │   ├── bank-crypto.service.ts        # ECDSA P-256 crypto authority
│   │   ├── immutable-ledger.service.ts   # Append-only ledger
│   │   ├── wallet-sync.service.ts        # Wallet sync + credit delivery
│   │   └── admin.service.ts              # RBAC + dual approval
│   ├── database/
│   │   ├── schema.ts               # PostgreSQL schema (immutable ledger)
│   │   ├── migrations.ts           # DB setup script
│   │   └── seed.ts                 # Initial admin creation
│   └── scripts/
│       └── generate-bank-keys.ts   # ECDSA key generation
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Environment template
├── .gitignore                      # Git ignore rules
├── README.md                       # Architecture & quick start
├── DEPLOYMENT.md                   # Production deployment guide
├── THREAT_MODEL.md                 # Security threat analysis
└── secrets/                        # (Generated) Crypto keys
    ├── bank-private-key.pem        # 🔴 KEEP SECURE!
    └── bank-public-key.pem         # Public for wallets
```

## 🎯 What Was Built

### 1. **Bank Cryptographic Authority** ✅
- ECDSA P-256 key pair generation
- Transaction signing & verification
- Public key endpoint for wallets
- Hash-chain integrity verification

### 2. **Immutable Ledger** ✅
- Append-only PostgreSQL table
- Hash-chained entries
- No UPDATE/DELETE allowed (DB triggers)
- Balance calculation from ledger
- Integrity verification

### 3. **Wallet Sync API** ✅
- Wallet-initiated synchronization only
- Nonce-based replay protection
- Signature verification (wallet + bank)
- Credit delivery + ledger entry creation
- Freeze state reporting

### 4. **Admin System** ✅
- Role-based access control (SUPER_ADMIN, FINANCE_ADMIN, AUDITOR, SUPPORT)
- Dual approval for credits
- Full audit logging
- Permission checks on all operations
- Admin privilege revocation

### 5. **Credit Issuance** ✅
- Two-phase approval process
- Batch credit creation
- Distribution tracking
- Delivery signature verification
- Ledger entry creation on sync

### 6. **User Authentication** (TODO)
- Email + Password + OTP
- New device verification
- Password reset flow
- Session management

### 7. **Fraud Detection** (TODO)
- Wallet trust scoring
- Risk level assessment
- Anomaly alerts
- Admin escalation

### 8. **WebSocket Monitoring** (TODO)
- Real-time event streaming
- Read-only access (no spend operations)
- Alert broadcasts
- Admin notifications

### 9. **Security Hardening** ✅
- Rate limiting (100 req/15min)
- CORS configuration
- Helmet.js headers
- HTTPS/TLS ready
- Secure password hashing (bcrypt)

### 10. **Documentation** ✅
- Architecture guide (README.md)
- Threat model (THREAT_MODEL.md)
- Deployment checklist (DEPLOYMENT.md)
- API documentation (inline)
- Key rotation procedures

---

## 🚀 Quick Start

### Setup

```bash
# 1. Install dependencies
cd bank
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Generate bank keys
npm run generate-bank-keys

# 4. Initialize database
npm run migrate

# 5. Create admin users
npm run seed
# Follow prompts to create SUPER_ADMIN, FINANCE_ADMIN, AUDITOR

# 6. Start server
npm run dev
```

### Running on Device

```bash
# From mobile app
POST http://localhost:3000/api/v1/wallet/sync

{
  "walletPublicKey": "02a1b2c3...",
  "lastLedgerHash": "previous_hash",
  "syncNonce": "unique-id-12345",
  "requestSignature": "signed_by_wallet"
}
```

---

## 📊 Core Features

### Immutable Ledger Constraints

```sql
-- No UPDATE allowed
CREATE TRIGGER bank_ledger_no_update
BEFORE UPDATE ON bank_ledger
EXECUTE FUNCTION fn_prevent_modification();

-- No DELETE allowed
CREATE TRIGGER bank_ledger_no_delete
BEFORE DELETE ON bank_ledger
EXECUTE FUNCTION fn_prevent_modification();

-- Hash chain verification
CREATE INDEX idx_bank_ledger_hash_chain ON bank_ledger(hash_chain);
```

### Wallet Balance (Derived, Not Stored)

```sql
CREATE OR REPLACE VIEW wallet_balances AS
SELECT 
  wallet_public_key,
  SUM(amount_cents) as balance_cents,
  COUNT(*) as transaction_count,
  MAX(created_at) as last_transaction
FROM bank_ledger
GROUP BY wallet_public_key;
```

### Dual Approval for Credits

```typescript
// Approval 1: Finance Admin creates request
const approval = await adminService.createApprovalRequest(
  'credit_issuance',
  walletPublicKey,
  amountCents,
  description,
  financeAdmin1Id
);

// Approval 2: Second Finance Admin approves
await adminService.approveRequest(approval.id, financeAdmin2Id);
// Status becomes 'approved' after 2nd approval
```

---

## 🔐 Security Guarantees

| Guarantee | How It's Enforced |
|-----------|-------------------|
| Bank never has private keys | API design, no private key endpoint |
| Credits only from approved admins | Dual approval + audit log |
| Ledger cannot be modified | Database triggers + application logic |
| Signatures verifiable | ECDSA public key distribution |
| Wallet can verify ledger | Hash chain provides proof |
| Replay attacks prevented | Nonce validation (1-hour window) |
| All actions audited | Audit log table with full traces |

---

## 📡 API Endpoints

### Wallet APIs ✅

```
POST /api/v1/wallet/sync
GET  /api/v1/wallet/:publicKey/balance
GET  /api/v1/wallet/:publicKey/ledger
GET  /api/v1/bank/public-key
```

### Admin APIs (TODO)

```
POST /api/v1/admin/credits/create
POST /api/v1/admin/credits/batch
POST /api/v1/admin/wallet/freeze
POST /api/v1/admin/wallet/unfreeze
GET  /api/v1/admin/approval-requests
POST /api/v1/admin/approval/:id/approve
POST /api/v1/admin/approval/:id/reject
GET  /api/v1/admin/audit-logs
GET  /api/v1/admin/ledger
```

### Auth APIs (TODO)

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/verify
POST /api/v1/auth/password/reset
```

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# With coverage report
npm run test:coverage

# Watch mode
npm run test -- --watch

# Lint code
npm run lint

# Format code
npm run format
```

---

## 📦 Production Deployment

### Docker

```bash
# Build image
docker build -t zeronettbank:latest .

# Run with compose
docker-compose up -d
```

### Kubernetes

```bash
# Create secrets
kubectl create secret generic zeronettbank-secrets \
  --from-file=bank-private-key=./secrets/bank-private-key.pem

# Deploy
kubectl apply -f k8s/deployment.yaml
```

### Manual

```bash
# Build
npm run build

# Start with PM2
pm2 start dist/index.js --name zeronettbank
```

See **DEPLOYMENT.md** for full production checklist.

---

## 🎓 Learn More

1. **README.md** - Architecture overview & quick start
2. **THREAT_MODEL.md** - Security analysis & risk assessment
3. **DEPLOYMENT.md** - Production deployment procedures
4. **src/services** - Detailed service implementations
5. **src/database/schema.ts** - Complete database schema

---

## 🔧 Technology Stack

**Language**: TypeScript 5.3+
**Runtime**: Node.js 18+
**Database**: PostgreSQL 13+
**Cache**: Redis 6+
**Security**: ECDSA P-256, AES-256-GCM, PBKDF2
**Framework**: Express 4.18+
**ORM**: Raw library (for immutability control)

---

## 🚨 Important Notes

⚠️ **CRITICAL SECURITY RULES**

1. ❌ NEVER modify the immutable ledger directly
2. ❌ NEVER send private keys over network
3. ❌ NEVER DELETE ledger entries (append only)
4. ✅ ALWAYS verify wallet signatures
5. ✅ ALWAYS sign responses with bank key
6. ✅ ALWAYS log all admin actions
7. ✅ ALWAYS require dual approval for credits

---

## 📞 Support

- **Security Issues**: security@zeronettbank.com
- **Bugs/Features**: GitHub Issues
- **Deployment Help**: See DEPLOYMENT.md
- **Threat Analysis**: Read THREAT_MODEL.md

---

**ZeroNetBank** — Secure banking backend for offline wallets ♥️

Built with TypeScript, PostgreSQL, and cryptographic rigor.
