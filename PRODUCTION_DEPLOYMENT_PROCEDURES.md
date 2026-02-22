# 🚀 PRODUCTION DEPLOYMENT PROCEDURES

**CRITICAL**: This order must NEVER be changed.  
Any deviation risks money loss or system compromise.

---

## ⚠️ PRE-DEPLOYMENT SAFETY CHECKLIST

**STOP if ANY item fails:**

- [ ] All tests passing (48 base + 52 red-team = 100 tests)
- [ ] `npm run lint` clean
- [ ] `npm run build` successful
- [ ] Bank private key secured (permissions 0600, NOT in git)
- [ ] Bank public key verified (fingerprint matches)
- [ ] `.env` configured for production
- [ ] PostgreSQL 14+ installed and accessible
- [ ] Redis installed and running
- [ ] SMTP configured for OTP emails
- [ ] TLS/HTTPS certificates ready
- [ ] Database backups configured
- [ ] Monitoring/alerts ready

---

## 📋 DEPLOYMENT SEQUENCE (NON-NEGOTIABLE ORDER)

### **STEP 1: PostgreSQL Database**

**Why First**: All other components depend on database schema + immutability triggers

```bash
# 1.1 Initialize database
createdb zeronettbank -U postgres

# 1.2 Run migrations
cd bank
npm run migrate

# 1.3 CRITICAL: Verify immutability triggers
psql -U postgres -d zeronettbank -c "
  SELECT trigger_name FROM information_schema.triggers
  WHERE trigger_name IN (
    'bank_ledger_no_update',
    'bank_ledger_no_delete',
    'audit_log_no_update',
    'audit_log_no_delete'
  );
"

# Expected: 4 rows
# If less than 4: STOP DEPLOYMENT - System is NOT immutable

# 1.4 Verify no balance tables exist
psql -U postgres -d zeronettbank -c "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name LIKE '%balance%'
  AND table_name != 'wallet_balances';
"

# Expected: 0 rows
# If any found: STOP DEPLOYMENT - Remove balance tables

# 1.5 Create first admin user
npm run seed
```

**Validation Point**: Database must be immutable before proceeding.

---

### **STEP 2: Redis (Nonce + Replay Protection)**

**Why Second**: Required for sync nonce registry and session management

```bash
# 2.1 Start Redis
redis-server --daemonize yes

# 2.2 Test connectivity
redis-cli ping
# Expected: PONG

# 2.3 Configure Redis for persistence (optional but recommended)
redis-cli CONFIG SET save "900 1 300 10 60 10000"
```

**Validation Point**: Redis must be reachable at `REDIS_URL` from .env

---

### **STEP 3: Bank Backend**

**Why Third**: Core money authority - must be up before any clients connect

```bash
# 3.1 Build production bundle
npm run build

# 3.2 Set environment to production
export NODE_ENV=production

# 3.3 Verify bank keys exist
ls -l ./secrets/bank-private-key.pem
# Must have permissions: -rw------- (0600)

ls -l ./secrets/bank-public-key.pem
# Must exist and be readable

# 3.4 Start backend with PM2 (recommended)
pm2 start dist/index.js --name zeronetbank -i 1

# OR with Docker
docker-compose up -d bank-backend

# 3.5 Verify health endpoint
curl https://api.zeronettbank.com/health
# Expected: {"status":"ok","timestamp":"..."}

# 3.6 Verify bank public key endpoint
curl https://api.zeronettbank.com/api/v1/bank/public-key
# Expected: {"publicKey":"04...","algorithm":"ECDSA_P256","version":1}
```

**Validation Point**: Backend must pass `/health` check before proceeding.

---

### **STEP 4: Admin Dashboard**

**Why Fourth**: Admins must be able to manage system before users arrive

```bash
# 4.1 Deploy admin dashboard (web app)
cd admin-dashboard
npm run build
# Deploy dist/ to web server

# 4.2 Login as SUPER_ADMIN
# Email: admin@zeronettbank.local
# Password: (from seed output)

# 4.3 Verify dual-approval workflow
# - Create test credit request
# - Approve with second admin
# - Verify credit appears in pending distributions
```

**Validation Point**: Admin dashboard accessible at `https://admin.zeronettbank.com`

---

### **STEP 5: Wallet Registration Test**

**Why Fifth**: Verify wallet can register with bank before public launch

```bash
# 5.1 Create test wallet (Flutter app)
flutter run --release

# 5.2 Complete wallet creation
# - Generate keys (stay offline)
# - Set PIN
# - Backup recovery phrase

# 5.3 Register wallet with bank
# - Enable online mode
# - Tap "Sync with Bank"
# - Should succeed

# 5.4 Verify wallet in admin dashboard
# - Check "Wallets" list
# - Should see test wallet with status: active

# 5.5 Verify audit log
# - Check "Audit Logs"
# - Should see: WALLET_REGISTERED action
```

**Validation Point**: Test wallet successfully registered + appears in admin dashboard

---

###STEP 6: Wallet Sync Test (Critical)**

**Why Sixth**: Verify proof-only sync + credit delivery before real money

```bash
# 6.1 Issue test credit via admin dashboard
# - Navigate to Credits → Issue New
# - Enter test wallet public key
# - Amount: 1000 cents ($10.00)
# - Description: "Test credit"
# - Submit (creates approval request)

# 6.2 Second admin approves
# - Login as different SUPER_ADMIN
# - Navigate to Approvals → Pending
# - Approve test credit

# 6.3 Wallet syncs and receives credit
# - In Flutter app, tap "Sync"
# - Should see: "Syncing..."
# - Should see: "1 new credit received"
# - Balance should update to $10.00

# 6.4 Verify credit in ledger (admin dashboard)
# - Navigate to Ledger
# - Should see: CREDIT entry
# - Should have: bank_signature
# - Should have: hash_chain

# 6.5 Verify sync request in audit log
# - Check "Audit Logs"
# - Should see: WALLET_SYNC action
# - Should have: nonce (different from previous)
```

**Validation Point**: Wallet can sync, receive credit, verify bank signature

---

### **STEP 7: User Portal (Read-Only)**

**Why Seventh**: Users can view statements only after system is verified working

```bash
# 7.1 Deploy user portal
cd user-portal
npm run build
# Deploy dist/ to web server

# 7.2 User registers account
# POST /api/v1/auth/register
# - Email
# - Password

# 7.3 User verifies email with OTP
# POST /api/v1/auth/otp/verify
# - Check email for 6-digit code

# 7.4 User links wallet
# POST /api/v1/user/wallets/link
# - Provide wallet ID
# - Sign with wallet key

# 7.5 User views wallet statement
# GET /api/v1/user/wallets/:walletId/ledger
# - Should see credit entry
# - Should see: bank_signature
# - Should see: confidence_seal

# 7.6 Verify statement verification (offline)
# POST /api/statements/verify
# - Provide statement_hash
# - Provide bank_signature
# - Should return: {"valid":true}
```

**Validation Point**: User portal accessible at `https://portal.zeronettbank.com`

---

## 🔒 POST-DEPLOYMENT SECURITY VERIFICATION

**Run within 1 hour of go-live:**

### 1. Immutability Check

```sql
-- Attempt UPDATE (must fail)
UPDATE bank_ledger SET amount_cents = 999999 WHERE id = 1;
-- Expected: ERROR: Ledger entries are immutable

-- Attempt DELETE (must fail)
DELETE FROM bank_ledger WHERE id = 1;
-- Expected: ERROR: Ledger entries are immutable
```

### 2. Hash Chain Integrity

```bash
curl https://api.zeronettbank.com/api/v1/admin/forensics/verify \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Expected: {"verified":true,"audit_integrity":{"status":"VERIFIED"},...}
```

### 3. Signature Verification

```bash
# Get latest ledger entry
curl https://api.zeronettbank.com/api/v1/admin/ledger \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq '.entries[0]'

# Verify bank_signature is present and non-empty
# Manually verify signature if needed (offline tool)
```

### 4. Red-Team Attack Suite

```bash
npm run test:red-team

# Expected: All 52 tests passing
# Any failure: INVESTIGATE IMMEDIATELY
```

---

## 📊 MONITORING SETUP (Within 24 Hours)

### Critical Metrics to Monitor:

1. **Sync Success Rate** (target: >99%)
   ```sql
   SELECT
     COUNT(CASE WHEN status = 'success' THEN 1 END) * 100.0 / COUNT(*) as success_rate
   FROM wallet_sync_log
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Hash Chain Continuity** (target: 100%)
   ```sql
   SELECT COUNT(*) as broken_chains FROM (
     SELECT id, prev_hash, LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
     FROM bank_ledger
   ) sub
   WHERE id > 1 AND prev_hash != actual_prev_hash;
   -- Expected: 0
   ```

3. **Unsigned Entries** (target: 0)
   ```sql
   SELECT COUNT(*) FROM bank_ledger WHERE bank_signature IS NULL;
   SELECT COUNT(*) FROM audit_log WHERE bank_signature IS NULL;
   -- Both: Expected 0
   ```

4. **Trust Score Distribution**
   ```sql
   SELECT
     trust_score,
     COUNT(*) as wallet_count
   FROM wallet_trust_scores
   GROUP BY trust_score
   ORDER BY trust_score DESC;
   ```

5. **Containment Mode** (should be NORMAL)
   ```sql
   SELECT value FROM bank_settings WHERE key = 'containment_mode';
   -- Expected: NORMAL
   ```

---

## 🚨 ROLLBACK PROCEDURES (Emergency Only)

**If critical issue detected within 1 hour of launch:**

### Option A: Database Rollback (Preferred)

```bash
# 1. Stop backend immediately
pm2 stop zeronetbank

# 2. Restore database from pre-launch backup
pg_restore --clean --if-exists -d zeronettbank backup_pre_launch.dump

# 3. Verify backup integrity
psql -U postgres -d zeronettbank -c "SELECT COUNT(*) FROM bank_ledger;"

# 4. Restart backend
pm2 start zeronetbank
```

### Option B: Containment Mode (Temporary)

```bash
# 1. Activate EMERGENCY_FREEZE
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/activate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"mode":"EMERGENCY_FREEZE"}'

# 2. All wallets frozen - no new transactions
# 3. Investigate issue
# 4. Fix and re-deploy
# 5. Return to NORMAL mode after verification
```

---

## 📋 GO-LIVE CHECKLIST

**Sign-off required from:**

- [ ] Lead Engineer (technical verification)
- [ ] Security Officer (security audit)
- [ ] Compliance Officer (regulatory approval)
- [ ] Operations Manager (runbook verified)

**Final checks:**

- [ ] All 100 tests passing (48 base + 52 red-team)
- [ ] Database immutability verified
- [ ] Hash chain continuous
- [ ] All entries bank-signed
- [ ] Test wallet sync successful
- [ ] Admin dual-approval working
- [ ] User portal read-only verified
- [ ] Statement verification working
- [ ] Monitoring dashboards live
- [ ] Alert rules configured
- [ ] Backup procedures tested
- [ ] Rollback plan validated
- [ ] On-call rotation assigned

---

## 🎯 SUCCESS CRITERIA (First 24 Hours)

- [x] Zero system crashes
- [x] Zero hash chain breaks
- [x] Zero unsigned entries
- [x] Sync success rate >95%
- [x] No balance table creation attempts
- [x] No ledger UPDATE/DELETE attempts
- [x] Trust seal signature verification 100%
- [x] All red-team tests still passing
- [x] Containment mode = NORMAL
- [x] No critical security alerts

---

## 📞 EMERGENCY CONTACTS

**System Down**: engineering-oncall@zeronettbank.local  
**Security Breach**: security@zeronettbank.local  
**Compliance Issue**: compliance@zeronettbank.local  
**Database Emergency**: dba@zeronettbank.local

**Escalation Path**: Engineer → Lead → CTO → CEO

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Status**: Production Ready  
**Approval Required**: Yes (3 signatures)
