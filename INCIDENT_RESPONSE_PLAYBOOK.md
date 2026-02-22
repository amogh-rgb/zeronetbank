# 🚨 INCIDENT RESPONSE PLAYBOOK - ZeroNetBank

**Purpose**: Rapid response procedures for security incidents  
**Target**: On-call engineers, security team, CTO

---

## 🎯 INCIDENT CLASSIFICATION

| Level | Description | Response Time | Team |
|-------|-------------|---------------|------|
| **P0** | Money loss, data breach, system compromise | 15 minutes | CTO + Security + Engineering |
| **P1** | Service down, security vulnerability active | 30 minutes | Engineering + Security |
| **P2** | Degraded performance, non-critical security | 2 hours | Engineering |
| **P3** | Cosmetic issues, user complaints | Next business day | Support |

---

## 🔴 P0 INCIDENT 1: Hash Chain Break Detected

### Detection

**Symptom**: Monitoring alert: "Hash chain integrity violation"

**Trigger**:
```sql
-- Automated check (runs every 5 minutes)
SELECT COUNT(*) as chain_breaks FROM (
  SELECT
    id,
    prev_hash,
    LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
  FROM bank_ledger
) sub
WHERE id > 1 AND prev_hash != actual_prev_hash;

-- If chain_breaks > 0: CRITICAL ALERT
```

**Alert appears in**:
- Monitoring dashboard (red banner)
- Email to engineering-oncall@zeronettbank.local
- SMS to on-call engineer
- Slack #incidents channel

---

### Initial Response (Within 5 Minutes)

**Step 1: Acknowledge incident**
```bash
# Mark incident as acknowledged
curl -X POST https://monitoring.zeronettbank.com/incidents/acknowledge \
  -d '{"incident_id":"HASH-CHAIN-BREAK-001","acknowledged_by":"[your-name]"}'
```

**Step 2: Activate emergency freeze (IMMEDIATELY)**
```bash
# Stop all money operations
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/activate \
  -H "Authorization: Bearer $EMERGENCY_ADMIN_TOKEN" \
  -d '{
    "mode": "EMERGENCY_FREEZE",
    "reason": "Hash chain break detected - incident HASH-CHAIN-BREAK-001",
    "activated_by": "[your-name]"
  }'

# System now:
# ❌ Blocks all credit issuance
# ❌ Blocks new wallet registration
# ✅ Allows wallet sync (read-only)
# ✅ Allows forensics export
```

**Step 3: Preserve evidence**
```bash
# Create incident directory
mkdir -p /incidents/$(date +%Y%m%d_%H%M%S)_hash_chain_break
cd /incidents/$(date +%Y%m%d_%H%M%S)_hash_chain_break

# Full database dump (DO NOT MODIFY SOURCE)
pg_dump -U postgres -F c -b -v \
  -f evidence_database.dump \
  zeronettbank

# Export forensics JSON
curl https://api.zeronettbank.com/api/v1/admin/forensics/export/json \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  > forensics_export.json

# Copy application logs (last 7 days)
cp /var/log/zeronettbank/app.log* ./

# Compute hashes for chain of custody
sha256sum * > evidence_checksums.txt
```

**Step 4: Notify stakeholders**
```bash
# Automated notification (triggered by emergency freeze)
# Recipients:
# - CTO
# - Security Officer
# - Engineering Team Lead
# - Compliance Officer

# Message template:
"CRITICAL INCIDENT: Hash chain integrity violated

Incident ID: HASH-CHAIN-BREAK-001
Detected: [timestamp]
Status: Emergency freeze activated
Impact: All money operations suspended

War room: https://meet.zeronettbank.com/incident-001
Investigation: In progress

Next update in: 30 minutes"
```

---

### Investigation (Within 30 Minutes)

**Step 5: Identify point of corruption**
```sql
-- Find exact break location
SELECT
  id as broken_entry_id,
  entry_type,
  wallet_public_key,
  amount_cents,
  prev_hash as expected_prev_hash,
  actual_prev_hash,
  created_at,
  created_by,
  bank_signature
FROM (
  SELECT
    id,
    entry_type,
    wallet_public_key,
    amount_cents,
    prev_hash,
    hash_chain,
    LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash,
    created_at,
    created_by,
    bank_signature
  FROM bank_ledger
) sub
WHERE id > 1 AND prev_hash != actual_prev_hash
ORDER BY id;

-- Output:
-- broken_entry_id: 12345
-- prev_hash: 0xABC...
-- actual_prev_hash: 0xDEF...
-- (Hashes don't match = chain broken)
```

**Step 6: Determine cause**

**Scenario A: Database direct modification**
```sql
-- Check for UPDATE/DELETE attempts (should be blocked by triggers)
SELECT * FROM audit_log
WHERE table_name = 'bank_ledger'
  AND action IN ('UPDATE', 'DELETE')
  AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- If found: Someone bypassed triggers (CRITICAL)
-- Next: Check recent database role changes
SELECT * FROM pg_roles WHERE rolname NOT LIKE 'pg_%';

-- Check trigger status
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE trigger_name IN ('bank_ledger_no_update', 'bank_ledger_no_delete');

-- If trigger MISSING: Someone dropped it (insider threat?)
```

**Scenario B: Code bug in hash computation**
```bash
# Check recent code deployments
git log --since="7 days ago" --grep="ledger\|hash" --oneline

# Review hash-chaining code
cat bank/src/services/immutable-ledger.service.ts | grep -A 20 "computeHashChain"

# Common bugs:
# - Wrong fields included in hash
# - Encoding issue (UTF-8 vs ASCII)
# - Timestamp precision issue
# - Race condition in multi-threaded append
```

**Scenario C: Key rotation corrupted chain**
```bash
# Check if bank private key changed
sha256sum /secrets/bank-private-key.pem
# Compare with key fingerprint in first ledger entry

# If mismatch: Key rotation broke signatures
# Result: Old entries cannot be verified
```

**Scenario D: Database corruption (hardware)**
```bash
# Check PostgreSQL logs for corruption
grep -i "corruption\|checksum\|block" /var/log/postgresql/postgresql-*.log

# Run database integrity check
psql -U postgres -d zeronettbank -c "
  SELECT pg_catalog.pg_check_postgresql();
"

# If hardware corruption: Restore from backup
```

---

### Resolution (Hours to Days)

**If cause = Code bug**:
```bash
# 1. Fix bug in code
git checkout -b hotfix/hash-chain-break-001
# [Fix code]
git commit -m "HOTFIX: Fix hash chain computation bug"
git push origin hotfix/hash-chain-break-001

# 2. Test fix extensively
npm run test:integration
npm run test:red-team

# 3. Deploy fix (requires CTO approval)
npm run deploy:production

# 4. Verify fix
curl https://api.zeronettbank.com/api/v1/admin/forensics/verify

# 5. If verified: Deactivate emergency freeze
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/deactivate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"reason":"Hash chain bug fixed, system verified","deactivated_by":"[name]"}'
```

**If cause = Insider threat (trigger disabled)**:
```bash
# 1. DO NOT fix immediately (evidence preservation)
# 2. Contact legal/HR
# 3. Identify who disabled trigger
SELECT
  usename,
  query,
  query_start
FROM pg_stat_activity
WHERE query LIKE '%DROP TRIGGER%bank_ledger%';

# 4. Review access logs for suspect's account
SELECT * FROM audit_log
WHERE actor_id = '[suspect-id]'
ORDER BY created_at DESC;

# 5. Preserve all evidence
# 6. Terminate suspect's access
# 7. Re-enable triggers
# 8. Verify no money stolen
# 9. Law enforcement notification (if theft confirmed)

# Recovery: Restore from last known good backup
# (Before trigger was disabled)
```

**If cause = Hardware corruption**:
```bash
# 1. Restore from most recent backup
pg_restore --clean --if-exists \
  -d zeronettbank \
  /backups/zeronettbank_[latest].dump

# 2. Verify restored database integrity
psql -U postgres -d zeronettbank -c "
  SELECT COUNT(*) as chain_breaks FROM (
    SELECT
      id,
      prev_hash,
      LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
    FROM bank_ledger
  ) sub
  WHERE id > 1 AND prev_hash != actual_prev_hash;
"

# Expected: chain_breaks = 0

# 3. Notify users of downtime
"We experienced a database issue and restored from backup.
All balances verified. Transactions after [backup_time] may need re-sync."

# 4. Monitor for corruption recurrence (check hardware)
```

---

### Post-Incident (Within 7 Days)

**Step 7: Root cause analysis**
- Document exact cause
- Timeline of events
- Why detection didn't catch earlier
- Why prevention didn't work

**Step 8: Preventive measures**
- New monitoring alerts
- Code review process changes
- Access control tightening
- Backup frequency increase

**Step 9: Incident report**
- Share with all stakeholders
- Legal review (if needed)
- User communication (if affected)
- Public disclosure (if required)

---

## 🔴 P0 INCIDENT 2: Unsigned Ledger Entry Found

### Detection

```sql
-- Automated check (runs every 5 minutes)
SELECT COUNT(*) as unsigned
FROM bank_ledger
WHERE bank_signature IS NULL
   OR bank_signature = ''
   OR LENGTH(bank_signature) < 100;  -- Signatures are ~512 chars

-- If unsigned > 0: CRITICAL ALERT
```

---

### Response (Within 15 Minutes)

**Step 1: Freeze system**
```bash
# Emergency freeze (same as hash chain incident)
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/activate \
  -H "Authorization: Bearer $EMERGENCY_ADMIN_TOKEN" \
  -d '{"mode":"EMERGENCY_FREEZE","reason":"Unsigned entry detected"}'
```

**Step 2: Identify unsigned entry**
```sql
SELECT
  id,
  entry_type,
  wallet_public_key,
  amount_cents,
  credit_id,
  description,
  created_at,
  created_by,
  bank_signature  -- Will be NULL or empty
FROM bank_ledger
WHERE bank_signature IS NULL OR bank_signature = ''
ORDER BY id DESC;
```

**Step 3: Determine impact**
```sql
-- How many unsigned entries?
SELECT entry_type, COUNT(*) as count
FROM bank_ledger
WHERE bank_signature IS NULL OR bank_signature = ''
GROUP BY entry_type;

-- If entry_type = CREDIT: Money created without signature (CRITICAL)
-- If entry_type = DEBIT: Money removed without signature (CRITICAL)
```

---

### Investigation

**Cause A: Code deployed without signing**
```bash
# Check recent deployments
git log --since="7 days ago" --oneline

# Find commit that touched ledger code
git log --since="7 days ago" -p -- "**/immutable-ledger.service.ts"

# Look for:
# - Comment out signing code
# - Skip signature for "testing"
# - Conditional that bypasses signing
```

**Cause B: Signing key missing/inaccessible**
```bash
# Check if bank private key exists
ls -la /secrets/bank-private-key.pem

# Check permissions
# Expected: -rw------- (0600) postgres postgres

# Check if backend can read key
curl https://api.zeronettbank.com/api/v1/bank/public-key
# If returns error: Backend can't access keys
```

**Cause C: Database direct INSERT bypassing API**
```sql
-- Check who created unsigned entries
SELECT
  id,
  wallet_public_key,
  amount_cents,
  created_at,
  created_by,  -- Should be 'bank_api', if different: suspect
  pg_backend_pid()
FROM bank_ledger
WHERE bank_signature IS NULL OR bank_signature = ''
ORDER BY id DESC;

-- Check connection info
SELECT
  usename,
  application_name,
  client_addr,
  query_start,
  query
FROM pg_stat_activity
WHERE usename = '[suspect_user]';
```

---

### Resolution

**If unsigned entries are fraudulent**:
```bash
# DO NOT DELETE (immutable ledger)
# Instead: Mark as fraudulent in audit log

psql -U postgres -d zeronettbank -c "
  INSERT INTO audit_log (
    action,
    table_name,
    record_id,
    description,
    severity,
    actor_id
  ) VALUES (
    'FRAUD_DETECTED',
    'bank_ledger',
    [unsigned_entry_id],
    'Unsigned entry detected - created without bank authority',
    'CRITICAL',
    'system'
  );
"

# Notify authorities (if money stolen)
# Freeze affected wallet
# Legal/compliance notification
```

**If unsigned entries are legitimate but bug caused missing signature**:
```bash
# Option A: Retrospectively sign entries
# (Only if entries verified legitimate)

psql -U postgres -d zeronettbank -c "
  UPDATE bank_ledger
  SET bank_signature = [computed_signature]
  WHERE id IN ([unsigned_entry_ids]);
"

# PROBLEM: This violates immutability trigger
# Trigger will block UPDATE

# Option B: Accept as historical anomaly
# - Document incident
# - Add entry to exceptions log
# - Fix code to prevent recurrence
# - Accept that these entries cannot be verified
# - Consider balance adjustment if needed
```

---

## 🔴 P0 INCIDENT 3: Replay Attack Detected

### Detection

```bash
# Monitoring alert: "Duplicate sync nonce detected"

# Or audit log:
grep "REPLAY_ATTACK" logs/app.log
```

```sql
-- Check for duplicate nonces
SELECT sync_nonce, COUNT(*) as usage_count
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY sync_nonce
HAVING COUNT(*) > 1;
```

---

### Response (Within 15 Minutes)

**Step 1: Identify attacker wallet**
```sql
SELECT
  wallet_id,
  sync_nonce,
  COUNT(*) as replay_attempts,
  array_agg(created_at ORDER BY created_at) as timestamps,
  array_agg(client_ip) as ips
FROM wallet_sync_log
WHERE sync_nonce = '[duplicate_nonce]'
GROUP BY wallet_id, sync_nonce;
```

**Step 2: Freeze attacker wallet immediately**
```bash
curl -X POST https://api.zeronettbank.com/api/v1/admin/wallet/freeze \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "walletPublicKey": "[attacker_wallet_key]",
    "reason": "Replay attack detected - nonce reuse",
    "legal_hold": false
  }'
```

**Step 3: Check if attack succeeded**
```sql
-- Did attacker receive duplicate credits?
SELECT
  credit_id,
  COUNT(*) as occurrences
FROM bank_ledger
WHERE wallet_public_key = '[attacker_wallet_key]'
  AND entry_type = 'CREDIT'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY credit_id
HAVING COUNT(*) > 1;

-- If occurrences > 1: Attack succeeded (money duplicated)
```

---

### Resolution

**If attack failed (idempotency worked)**:
```bash
# Good: Duplicate credit_id rejected
# Action: Keep wallet frozen
# Notify security team
# Investigate attacker identity
# Consider law enforcement notification
```

**If attack succeeded (money duplicated)**:
```bash
# CRITICAL: Attacker stole money

# Step 1: Calculate stolen amount
SELECT
  credit_id,
  amount_cents,
  COUNT(*) - 1 as duplicate_count,  -- -1 because first is legitimate
  (COUNT(*) - 1) * amount_cents as stolen_cents
FROM bank_ledger
WHERE wallet_public_key = '[attacker_wallet_key]'
  AND credit_id = '[duplicated_credit_id]'
GROUP BY credit_id, amount_cents;

# Step 2: Reverse fraudulent credits
# (Create offsetting DEBIT entries)
for each_duplicate_credit:
  INSERT INTO bank_ledger (
    entry_type,
    wallet_public_key,
    amount_cents,  -- NEGATIVE
    description,
    bank_signature
  ) VALUES (
    'DEBIT',
    '[attacker_wallet_key]',
    -[stolen_amount],
    'Reversal of fraudulent duplicate credit [credit_id]',
    [signature]
  );

# Step 3: Notify law enforcement
# - Attacker's IP addresses
# - Wallet identity (if KYC data available)
# - Amount stolen
# - Forensic evidence

# Step 4: Fix replay vulnerability
# - Check nonce registry working
# - Increase nonce entropy
# - Add timestamp validation
# - Deploy fix immediately
```

---

## 🟡 P1 INCIDENT 4: MITM Attack Suspected

### Detection

```bash
# User reports: "Bank public key mismatch" in wallet app

# Or monitoring: Multiple key mismatch reports
grep "key_mismatch" logs/app.log | wc -l
```

---

### Response (Within 30 Minutes)

**Step 1: Verify bank's actual key**
```bash
# Expected bank public key fingerprint
sha256sum /secrets/bank-public-key.pem
# Output: abc123def456... (known good value)

# Check what key API is serving
curl https://api.zeronettbank.com/api/v1/bank/public-key | sha256sum
# Output: ??? (compare with known good)
```

**Step 2: If mismatch confirmed**
```bash
# CRITICAL: Someone intercepting traffic

# Immediate actions:
# 1. Emergency freeze
curl -X POST https://api.zeronettbank.com/api/v1/admin/containment/activate \
  -d '{"mode":"EMERGENCY_FREEZE","reason":"MITM attack confirmed"}'

# 2. Broadcast to all users
"⚠️ SECURITY ALERT: Do NOT use wallet until further notice.
Potential security issue detected. Your funds are safe.
We are investigating. Updates at: https://status.zeronettbank.com"

# 3. Check for DNS hijacking
dig api.zeronettbank.com
# Expected: [known good IP]
# If different: DNS compromised

# 4. Check TLS certificate
openssl s_client -connect api.zeronettbank.com:443 < /dev/null 2>&1 | openssl x509 -fingerprint -noout
# Expected: [known good fingerprint]
# If different: Certificate replaced (MITM proxy)

# 5. Check WAF logs for suspicious traffic
# - Unknown reverse proxy
# - SSL stripping attempts
# - Certificate injection attempts
```

---

### Resolution

**If DNS hijacking**:
```bash
# 1. Contact DNS provider (Cloudflare, etc.)
# 2. Verify DNS records
# 3. Enable DNSSEC
# 4. Rotate TLS certificates (assume compromised)
# 5. Force users to update wallet app (pin new cert)
```

**If certificate compromised**:
```bash
# 1. Revoke compromised certificate
# 2. Issue new certificate (different CA if needed)
# 3. Update all backend servers
# 4. Wallet app update (pin new cert fingerprint)
# 5. Notify users to update immediately
```

**If false alarm (user error)**:
```bash
# User might have:
# - Old wallet app version (old pinned key)
# - Modified app (from unofficial source)
# - Proxy/VPN causing issues

# Verify:
# - User's app version
# - Download source (official store?)
# - Network environment
```

---

## 🟡 P1 INCIDENT 5: Mass Sync Failures

### Detection

```bash
# Monitoring: Sync success rate < 50%
# (Normal: >95%)

# Alert: "Wallet sync success rate: 32%"
```

---

### Investigation

**Step 1: Check backend health**
```bash
curl https://api.zeronettbank.com/health
# Expected: {"status":"ok",...}
# If timeout or error: Backend down

# Check recent deployments
git log --since="6 hours ago" --oneline
# Recent deployment might be buggy
```

**Step 2: Check database**
```bash
# Database connections
psql -U postgres -d zeronettbank -c "
  SELECT COUNT(*) as active_connections
  FROM pg_stat_activity
  WHERE state = 'active';
"

# If > 100: Connection pool exhausted

# Slow queries
psql -U postgres -d zeronettbank -c "
  SELECT query, state, wait_event, NOW() - query_start as duration
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND NOW() - query_start > INTERVAL '10 seconds'
  ORDER BY duration DESC;
"
```

**Step 3: Check Redis (nonce registry)**
```bash
redis-cli ping
# Expected: PONG
# If timeout: Redis down (nonce checks failing)

# Check memory
redis-cli info memory
# If used_memory > 90%: Out of memory
```

**Step 4: Check logs for patterns**
```bash
# Common error messages
grep "ERROR" logs/app.log | tail -100 | sort | uniq -c | sort -rn

# Common errors:
# - "Connection timeout" = Network issue
# - "ECONNREFUSED" = Service down
# - "Out of memory" = Resource exhaustion
# - "Rate limit exceeded" = DDoS attack
```

---

### Resolution

**If backend overloaded**:
```bash
# Horizontal scaling (add more instances)
# Or: Restart backend (if memory leak)

# Check traffic volume
tail -1000 logs/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
# If one IP dominating: Block attacker
```

**If database slow**:
```bash
# Add index if missing
psql -U postgres -d zeronettbank -c "
  CREATE INDEX CONCURRENTLY idx_bank_ledger_wallet
  ON bank_ledger(wallet_public_key);
"

# Or vacuum if bloated
psql -U postgres -d zeronettbank -c "VACUUM ANALYZE bank_ledger;"
```

**If Redis down**:
```bash
# Restart Redis
systemctl restart redis

# Check persistence
redis-cli config get dir
redis-cli config get save

# Ensure data persisted (RDB or AOF)
```

---

## 📋 POST-INCIDENT PROCEDURES

**For ALL incidents**:

1. **Incident timeline**
   - Detection time
   - Response time
   - Resolution time
   - Total duration

2. **Impact assessment**
   - Users affected
   - Money lost (if any)
   - Data exposed (if any)
   - Reputational damage

3. **Root cause analysis**
   - What happened
   - Why it happened
   - Why detection didn't catch earlier
   - Why prevention didn't work

4. **Corrective actions**
   - Immediate fixes
   - Long-term improvements
   - New monitoring
   - Process changes

5. **Communication**
   - Internal stakeholders
   - External users (if affected)
   - Regulators (if required)
   - Press (if public interest)

6. **Documentation**
   - Incident report (stored in `/incidents/`)
   - Update runbooks
   - Update this playbook
   - Training materials

---

## 📞 EMERGENCY CONTACTS

**Engineering On-Call**: +1-XXX-XXX-XXXX  
**Security Officer**: security@zeronettbank.local  
**CTO**: cto@zeronettbank.local  
**Legal**: legal@zeronettbank.local  
**PR/Communications**: pr@zeronettbank.local  

**Escalation Chain**:
1. On-call engineer (15 min response)
2. Engineering Team Lead (30 min response)
3. CTO (1 hour response)
4. CEO (if company-threatening)

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Review Frequency**: After each P0/P1 incident  
**Owner**: Security Officer + CTO
