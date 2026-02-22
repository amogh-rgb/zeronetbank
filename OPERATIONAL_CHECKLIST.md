# 📋 OPERATIONAL CHECKLIST - ZeroNetBank

**Purpose**: Daily, weekly, and incident-response procedures for production operations

---

## 🌅 DAILY OPERATIONS (Every Morning)

### System Health Verification (10 minutes)

```bash
# 1. Check backend health
curl https://api.zeronettbank.com/health
# Expected: {"status":"ok",...}

# 2. Verify database connections
psql -U postgres -d zeronettbank -c "SELECT COUNT(*) FROM bank_ledger;"
# Should return: increasing count

# 3. Check Redis
redis-cli ping
# Expected: PONG

# 4. Verify hash chain integrity
curl https://api.zeronettbank.com/api/v1/admin/forensics/verify \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: {"verified":true,...}
```

**Action if ANY check fails**: Escalate immediately to engineering team

---

### Trust Monitoring (5 minutes)

```sql
-- Check trust score distribution
SELECT
  CASE
    WHEN trust_score >= 80 THEN 'VERIFIED'
    WHEN trust_score >= 50 THEN 'CAUTION'
    ELSE 'RISK'
  END as level,
  COUNT(*) as wallet_count
FROM wallet_trust_scores
GROUP BY 1;
```

**Expected**: Majority in VERIFIED, <5% in RISK

**Action if >10% RISK**: Investigate wallets with low scores

---

### Sync Success Rate (5 minutes)

```sql
-- Last 24 hours sync success
SELECT
  status,
  COUNT(*) as count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Expected**: success rate >95%

**Action if <95%**: Check for:
- Network issues
- Database slow queries
- Redis connectivity
- High load

---

### Containment Mode Check (1 minute)

```sql
SELECT value FROM bank_settings WHERE key = 'containment_mode';
```

**Expected**: NORMAL (unless intentionally changed)

**Action if not NORMAL**: Verify with admin team if change was authorized

---

## 📅 WEEKLY OPERATIONS (Every Monday)

### Full Database Backup (30 minutes)

```bash
# 1. Create timestamped backup
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U postgres -F c -b -v -f \
  "/backups/zeronettbank_$BACKUP_DATE.dump" \
  zeronettbank

# 2. Verify backup integrity
pg_restore --list "/backups/zeronettbank_$BACKUP_DATE.dump" | head -20

# 3. Upload to cloud storage (encrypted)
aws s3 cp "/backups/zeronettbank_$BACKUP_DATE.dump" \
  s3://zeronettbank-backups/ \
  --sse AES256

# 4. Test restore (separate test database)
createdb zeronettbank_test_restore
pg_restore --clean --if-exists -d zeronettbank_test_restore \
  "/backups/zeronettbank_$BACKUP_DATE.dump"

# 5. Verify restored data
psql -U postgres -d zeronettbank_test_restore \
  -c "SELECT COUNT(*) FROM bank_ledger;"

# 6. Drop test database
dropdb zeronettbank_test_restore
```

**Critical**: Backup must be tested weekly. Untested backups are worthless.

---

### Ledger Integrity Audit (20 minutes)

```sql
-- 1. Check for unsigned entries
SELECT COUNT(*) as unsigned FROM bank_ledger
WHERE bank_signature IS NULL OR bank_signature = '';
-- Expected: 0

-- 2. Check for hash chain breaks
SELECT COUNT(*) as broken FROM (
  SELECT
    id,
    prev_hash,
    LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
  FROM bank_ledger
) sub
WHERE id > 1 AND prev_hash != actual_prev_hash;
-- Expected: 0

-- 3. Check audit log integrity
SELECT COUNT(*) as unsigned_audit FROM audit_log
WHERE bank_signature IS NULL OR bank_signature = '';
-- Expected: 0

-- 4. Verify credit idempotency (no duplicates)
SELECT credit_id, COUNT(*) as dupe_count
FROM bank_ledger
WHERE entry_type = 'CREDIT'
GROUP BY credit_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

**Action if ANY integrity check fails**: 
1. STOP all credit issuance immediately
2. Activate EMERGENCY_FREEZE containment mode
3. Export forensics: `GET /api/v1/admin/forensics/export/json`
4. Escalate to CTO + security team
5. DO NOT fix manually - investigate root cause first

---

### Trust Seal Verification (15 minutes)

```bash
# Run red-team trust seal tests
npm run test -- --testPathPattern=trust-seal

# Expected: All passing

# Verify random wallet trust seals
curl https://api.zeronettbank.com/api/v1/wallet/<RANDOM_WALLET_ID>/sync \
  -d '{"walletId":"...","..."}' \
  -H "Content-Type: application/json"

# Check trustSeal.signature is present and valid
```

---

### Performance Review (20 minutes)

```sql
-- Slow queries (>1 second)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Alert if bank_ledger > 50GB: Consider partitioning strategy
```

---

### Security Posture Check (15 minutes)

```sql
-- Failed login attempts (brute force detection)
SELECT
  email,
  COUNT(*) as failed_attempts,
  MAX(created_at) as last_attempt
FROM audit_log
WHERE action IN ('LOGIN_FAILED', 'OTP_FAILED')
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY email
HAVING COUNT(*) > 10
ORDER BY COUNT(*) DESC;

-- Suspicious admin actions
SELECT
  actor_id,
  action,
  COUNT(*) as count
FROM audit_log
WHERE actor_type = 'admin'
  AND created_at > NOW() - INTERVAL '7 days'
  AND action IN ('CREDIT_ISSUED', 'CONTAINMENT_ACTIVATED', 'WALLET_FROZEN')
GROUP BY actor_id, action
ORDER BY COUNT(*) DESC;
```

**Action if suspicious activity**: Notify security team for investigation

---

## 🚨 INCIDENT RESPONSE PROCEDURES

### Incident 1: Hash Chain Break Detected

**Symptoms**: `GET /api/v1/admin/forensics/verify` returns `"status":"COMPROMISED"`

**Response (IMMEDIATE)**:

```bash
# 1. Activate emergency freeze (< 5 minutes)
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/activate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"mode":"EMERGENCY_FREEZE"}'

# 2. Export full forensics report
curl https://api.zeronettbank.com/api/v1/admin/forensics/export/json \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  > forensics_$(date +%Y%m%d_%H%M%S).json

# 3. Preserve evidence (DO NOT MODIFY DATABASE)
pg_dump -U postgres -F c -f incident_evidence.dump zeronettbank

# 4. Identify point of corruption
psql -U postgres -d zeronettbank -c "
  SELECT * FROM (
    SELECT
      id,
      entry_type,
      wallet_public_key,
      amount_cents,
      prev_hash,
      hash_chain,
      LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash,
      created_at
    FROM bank_ledger
  ) sub
  WHERE id > 1 AND prev_hash != actual_prev_hash
  ORDER BY id;
"

# 5. Notify stakeholders
# - CTO
# - Security Officer
# - Compliance Officer
# - Legal (if tampering confirmed)

# 6. DO NOT proceed without forensic analysis
```

**Recovery**: Requires root cause analysis + senior engineering approval

---

### Incident 2: Unsigned Ledger Entry Found

**Symptoms**: Unsigned entry detected in daily check

**Response (IMMEDIATE)**:

```bash
# 1. Freeze affected wallets
psql -U postgres -d zeronettbank -c "
  SELECT id, wallet_public_key, amount_cents, created_at
  FROM bank_ledger
  WHERE bank_signature IS NULL OR bank_signature = '';
"

# 2. Investigate how entry was created
# - Check audit_log for CREDIT_ISSUED action
# - Check admin_actions for approvals
# - Check code commits in last 7 days

# 3. Quarantine affected credits
# - Add affected wallets to watch list
# - Mark credits as "under_review"

# 4. Root cause analysis required before resuming
```

---

### Incident 3: Sync Payload Contains Balance Data

**Symptoms**: invariant violation logged: "Wallet sync payload must NOT contain transaction data"

**Response (IMMEDIATE)**:

```bash
# 1. Identify wallet
grep "INVARIANT VIOLATION" logs/app.log | tail -1

# 2. Freeze wallet immediately
curl -X POST https://api.zeronettbank.com/api/v1/admin/wallet/freeze \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"walletPublicKey":"...","reason":"Payload invariant violation"}'

# 3. Check if wallet is compromised
# - Review recent transactions
# - Check device fingerprints
# - Notify wallet owner (potential malware)

# 4. Update Flutter wallet if bug found
# - Release emergency patch
# - Force update before unfreeze
```

---

### Incident 4: Duplicate Credit ID Detected

**Symptoms**: Credit idempotency violation

**Response (IMMEDIATE)**:

```bash
# 1. Identify duplicate
psql -U postgres -d zeronettbank -c "
  SELECT credit_id, COUNT(*), array_agg(id) as ledger_ids
  FROM bank_ledger
  WHERE entry_type = 'CREDIT'
  GROUP BY credit_id
  HAVING COUNT(*) > 1;
"

# 2. Determine victim wallet (first entry is correct)
# - Second entry = fraudulent

# 3. Reverse fraudulent credit (create offsetting entry)
# - Amount: negative of duplicate
# - Description: "Reversed duplicate credit [credit_id]"
# - Requires dual admin approval

# 4. Investigate root cause
# - Check replay attack logs
# - Check nonce registry
# - Review sync_sessions table
```

---

### Incident 5: Bank Public Key Mismatch (MITM)

**Symptoms**: Wallet reports "Bank public key mismatch"

**Response (IMMEDIATE - CRITICAL)**:

```bash
# 1. DO NOT dismiss as "key rotation"
# - This indicates Man-In-The-Middle attack

# 2. Verify bank's actual public key
cat ./secrets/bank-public-key.pem

# 3. Compare with key endpoint
curl https://api.zeronettbank.com/api/v1/bank/public-key

# 4. If mismatch confirmed:
# - EMERGENCY_FREEZE immediately
# - Notify all users via broadcast
# - Rotate TLS certificates
# - Check for DNS hijacking
# - Review WAF logs

# 5. Notify security incident response team
```

---

## 🔧 MAINTENANCE PROCEDURES

### Monthly: Database Vacuum & Analyze

```bash
# Run during low-traffic window
psql -U postgres -d zeronettbank -c "VACUUM ANALYZE;"

# Check table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size,
  n_live_tup,
  n_dead_tup,
  (n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) * 100)::int as bloat_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

---

### Quarterly: Security Audit

```bash
# 1. Run full red-team test suite
npm run test:red-team

# 2. Penetration testing (external vendor)
# - Schedule
# - Define scope
# - Review findings
# - Remediate + retest

# 3. Code review
# - Focus on money logic
# - Check for new balance tables
# - Verify immutability preserved

# 4. Compliance review
# - Audit log completeness
# - Forensics export readiness
# - Statement verification working
```

---

### Annual: Disaster Recovery Drill

```bash
# Simulate TOTAL system failure + restore

# 1. Document current state
# 2. Destroy test environment
# 3. Restore from backups only
# 4. Verify:
#    - All ledger entries intact
#    - Hash chain continuous
#    - All signatures valid
#    - Wallets can sync
# 5. Time the recovery process
# 6. Update runbooks with lessons learned
```

---

## 📊 KEY METRICS (SLAs)

| Metric | Target | Action Threshold |
|--------|--------|------------------|
| Uptime | 99.9% | <99.5% - incident review |
| Sync Success Rate | >95% | <90% - investigate |
| Hash Chain Integrity | 100% | Any break - FREEZE |
| Unsigned Entries | 0 | Any found - FREEZE |
| Trust Seal Signature | 100% | <100% - investigate |
| Response Time (p95) | <500ms | >1s - optimize |
| Database Size Growth | <10GB/month | >20GB - review |

---

## 📞 ON-CALL ROTATION

**Primary**: engineering-oncall@zeronettbank.local  
**Backup**: engineering-oncall-backup@zeronettbank.local  
**Escalation**: CTO

**Response Times**:
- P0 (Money loss, data breach): 15 minutes
- P1 (Service down, security issue): 30 minutes
- P2 (Degraded performance): 2 hours
- P3 (Non-urgent): Next business day

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Review Frequency**: Monthly  
**Owner**: Operations Team
