# ZeroNetBank Production Checklist

A comprehensive guide to ensure ZeroNetBank backend is production-ready.

## 🔧 Pre-Deployment Verification

### Code Quality

- [ ] **Run Linter**
  ```bash
  npm run lint
  ```
  Expected: 0 errors, warnings reviewed

- [ ] **Build TypeScript**
  ```bash
  npm run build
  ```
  Expected: `dist/` folder generated, 0 errors

- [ ] **Run Unit Tests**
  ```bash
  npm run test
  ```
  Expected: All tests passing

- [ ] **Run Integration Tests**
  ```bash
  npm run test:integration
  ```
  Expected: Wallet sync, ledger, admin flows pass

- [ ] **Check Code Coverage**
  ```bash
  npm run test:coverage
  ```
  Expected: >85% overall coverage, 100% on crypto services

---

## 🔐 Security Verification

### Cryptography

- [ ] **Verify ECDSA P-256 Keys**
  ```bash
  # Check key exists and has correct format
  file ./secrets/bank-private-key.pem
  file ./secrets/bank-public-key.pem
  
  # Verify permissions (private key: 600 only)
  ls -l ./secrets/
  ```
  Expected: Private key mode 600, public key readable

- [ ] **Test Signature Verification**
  ```bash
  npm run test -- --grep "signature"
  ```
  Expected: All signature tests pass

- [ ] **Test Hash Chain Integrity**
  ```bash
  npm run test -- --grep "hash.*chain|integrity"
  ```
  Expected: All integrity tests pass

### Database Security

- [ ] **Verify Immutability Triggers**
  ```sql
  -- Connect to PostgreSQL
  psql -U postgres -d zeronettbank -c "
    SELECT 
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY trigger_name;
  "
  ```
  Expected: 2 triggers on `bank_ledger` table
  - `bank_ledger_no_update` BEFORE UPDATE
  - `bank_ledger_no_delete` BEFORE DELETE

- [ ] **Test Immutability**
  ```sql
  -- This should FAIL
  UPDATE bank_ledger SET amount_cents = 0;
  
  -- This should FAIL
  DELETE FROM bank_ledger;
  ```
  Expected: Both queries error with "Immutable ledger"

- [ ] **Verify Hash Chain**
  ```sql
  SELECT COUNT(*) FROM bank_ledger;
  SELECT * FROM bank_ledger ORDER BY created_at LIMIT 5;
  ```
  Expected: Ledger populated, hash_chain values present

### API Security

- [ ] **Verify CORS Configuration**
  ```bash
  curl -i -X OPTIONS http://localhost:3000/api/v1/wallet/sync
  ```
  Expected: CORS headers present (Access-Control-*)

- [ ] **Verify Rate Limiting**
  ```bash
  # Make 101 requests in 15 minutes
  for i in {1..101}; do 
    curl -s http://localhost:3000/health
  done
  ```
  Expected: 101st request returns 429 Too Many Requests

- [ ] **Verify Helmet Headers**
  ```bash
  curl -i http://localhost:3000/health | grep -i "x-content"
  ```
  Expected: Security headers present (X-Content-Type-Options, X-Frame-Options, etc.)

- [ ] **Test Nonce Replay Protection**
  ```bash
  curl -X POST http://localhost:3000/api/v1/wallet/sync \
    -H "Content-Type: application/json" \
    -d '{
      "walletPublicKey": "...",
      "syncNonce": "same-nonce-123",
      "requestSignature": "..."
    }'
  ```
  Expected: First request succeeds, second request fails with "Nonce already used"

---

## 📊 Database Verification

### Connection & Schema

- [ ] **Test Database Connection**
  ```bash
  npm run test:db:ping
  ```
  Expected: "✅ PostgreSQL connected"

- [ ] **Verify All Tables Exist**
  ```sql
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name;
  ```
  Expected: 14 tables
  - bank_ledger
  - bank_key_versions
  - credit_batches
  - credit_distributions
  - wallet_sync_log
  - wallet_freeze_state
  - wallet_trust_scores
  - fraud_alerts
  - users
  - user_devices
  - admin_users
  - approval_requests
  - audit_log
  - otp_codes

- [ ] **Verify Indexes**
  ```sql
  SELECT 
    tablename,
    indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname;
  ```
  Expected: Performance indexes on critical fields

- [ ] **Test Admin User Creation**
  ```sql
  SELECT id, email, role FROM admin_users ORDER BY created_at DESC LIMIT 3;
  ```
  Expected: SUPER_ADMIN, FINANCE_ADMIN, AUDITOR users present

---

## 🚀 API Endpoint Testing

### Health Checks

- [ ] **Server Health**
  ```bash
  curl http://localhost:3000/health
  ```
  Expected:
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-25T12:00:00Z",
    "uptime": 123.45
  }
  ```

### Wallet APIs

- [ ] **Get Bank Public Key**
  ```bash
  curl http://localhost:3000/api/v1/bank/public-key
  ```
  Expected: ECDSA P-256 public key in PEM format

- [ ] **Get Wallet Balance**
  ```bash
  curl http://localhost:3000/api/v1/wallet/02a1b2c3.../balance
  ```
  Expected: 
  ```json
  {
    "walletPublicKey": "02a1b2c3...",
    "balanceCents": 0,
    "currency": "USD",
    "lastUpdate": "2024-01-25T12:00:00Z"
  }
  ```

- [ ] **Get Wallet Ledger**
  ```bash
  curl http://localhost:3000/api/v1/wallet/02a1b2c3.../ledger
  ```
  Expected: Ledger array with hash-chained entries

- [ ] **Wallet Sync (Full Flow)**
  ```bash
  # See DEPLOYMENT.md for full request format
  curl -X POST http://localhost:3000/api/v1/wallet/sync \
    -H "Content-Type: application/json" \
    -d @wallet-sync-request.json
  ```
  Expected: 200 OK with credits and ledger response, signed by bank

---

## 📈 Performance Testing

### Load Testing

- [ ] **Install Artillery**
  ```bash
  npm install -g artillery
  ```

- [ ] **Run Load Test**
  ```bash
  artillery run --target http://localhost:3000 load-test.yml
  ```
  Expected: p95 response time < 100ms

### Database Performance

- [ ] **Check Slow Queries**
  ```sql
  -- Enable query logging
  SET log_min_duration_statement = 100; -- Log queries > 100ms
  
  -- Run wallet sync
  -- Check logs
  SELECT query FROM pg_stat_statements 
  WHERE mean_time > 100 
  ORDER BY mean_time DESC 
  LIMIT 10;
  ```
  Expected: No queries >1000ms

- [ ] **Verify Index Usage**
  ```sql
  SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans
  FROM pg_stat_user_indexes
  ORDER BY idx_scan DESC;
  ```
  Expected: Indexes on critical fields are being used

---

## 🔄 Backup & Recovery

### Backup Process

- [ ] **Create Database Backup**
  ```bash
  pg_dump zeronettbank > backup-$(date +%Y%m%d-%H%M%S).sql
  ```
  Expected: Backup file created, >1MB

- [ ] **Test Restore**
  ```bash
  # Create test database
  createdb zeronettbank_restore
  
  # Restore backup
  psql zeronettbank_restore < backup-latest.sql
  
  # Verify tables
  psql zeronettbank_restore -c "SELECT COUNT(*) FROM bank_ledger;"
  ```
  Expected: Restore succeeds, ledger data present

### Key Backup

- [ ] **Backup Crypto Keys (SECURE)**
  ```bash
  # Create encrypted backup
  tar -czf bank-keys-backup.tar.gz \
    --exclude='*.js' \
    --exclude='node_modules' \
    ./secrets/
  
  # Encrypt with gpg
  gpg --encrypt --recipient admin@example.com bank-keys-backup.tar.gz
  ```
  Expected: Encrypted archive created

- [ ] **Store Offsite**
  - [ ] Copy to secure storage (AWS S3 encrypted, Azure KeyVault, etc.)
  - [ ] Document recovery procedure
  - [ ] Test recovery from backup once monthly

---

## 🌐 Deployment Checklist

### Pre-Production

- [ ] **Environment Variables**
  - [ ] DATABASE_URL configured
  - [ ] REDIS_URL configured (if using Redis)
  - [ ] JWT_SECRET set to random 32+ char string
  - [ ] NODE_ENV = "production"
  - [ ] PORT accessible

- [ ] **TLS/SSL Configuration**
  - [ ] Certificate installed (/etc/ssl/certs/)
  - [ ] Private key secured (/etc/ssl/private/)
  - [ ] Nginx/reverse proxy configured
  - [ ] HTTPS enforced (redirect HTTP → HTTPS)

- [ ] **Firewall Rules**
  - [ ] Port 443 (HTTPS) open to internet
  - [ ] Port 3000 (app) closed to internet
  - [ ] Port 5432 (PostgreSQL) closed to internet
  - [ ] Admin IPs whitelisted

### Production Deployment

- [ ] **Start Application**
  ```bash
  npm run build
  pm2 start dist/index.js --name zeronettbank
  pm2 save
  pm2 startup
  ```
  Expected: App running, restarting on reboot

- [ ] **Verify Application**
  ```bash
  curl https://zeronettbank.com/health
  pm2 logs zeronettbank
  ```
  Expected: Health check passes, no errors in logs

- [ ] **Monitor Logs**
  ```bash
  # Watch logs in real-time
  pm2 logs zeronettbank --lines 100
  ```
  Expected: No errors, rate limiting working

- [ ] **Setup Monitoring**
  - [ ] Configure CloudWatch/DataDog/New Relic
  - [ ] Monitor response times (p95 < 100ms)
  - [ ] Monitor error rates (< 0.1%)
  - [ ] Monitor database connections
  - [ ] Setup alerts for anomalies

---

## 🔒 Security Hardening (Post-Deploy)

### Access Control

- [ ] **Restrict Admin Access**
  ```bash
  # Only admins can access /admin endpoints
  # All requests require valid JWT with admin role
  ```

- [ ] **Database User Isolation**
  ```sql
  -- Create read-only user for analytics
  CREATE USER analytics_user WITH PASSWORD 'secure_password';
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_user;
  GRANT CONNECT ON DATABASE zeronettbank TO analytics_user;
  ```

### Key Rotation

- [ ] **Monthly Key Rotation**
  ```bash
  # 1. Generate new keys
  npm run generate-bank-keys
  
  # 2. Store old key in key_versions table
  INSERT INTO bank_key_versions (key_type, public_key, retired_at)
  VALUES ('ECDSA_P256', 'old_key_pem', NOW());
  
  # 3. Wallets update their stored bank public key
  ```

### Audit Review

- [ ] **Weekly Audit Log Review**
  ```sql
  SELECT 
    actor_id,
    action,
    resource_type,
    change_summary,
    created_at
  FROM audit_log
  WHERE created_at > NOW() - INTERVAL '7 days'
  ORDER BY created_at DESC;
  ```
  Expected: No unauthorized modifications

- [ ] **Monthly Admin Review**
  ```sql
  SELECT * FROM approval_requests 
  WHERE created_at > NOW() - INTERVAL '30 days'
  ORDER BY created_at DESC;
  ```
  Expected: All credits properly approved

---

## 📱 Mobile App Integration

### QR Code Validation

- [ ] **Wallet Generates Signed QR**
  ```
  Expected format:
  zeronett://sync?
    wallet=02a1b2c3...
    nonce=unique-id-12345
    sig=304502...
  ```

- [ ] **Wallet Verifies Bank Signature**
  ```
  Bank responds with:
  {
    "credits": [...],
    "bankSignature": "304502...",
    "timestamp": "2024-01-25T12:00:00Z"
  }
  ```

### End-to-End Testing

- [ ] **Create Test Wallets**
  ```bash
  # Generate 3 test wallet key pairs
  npm run test:setup:wallets
  ```

- [ ] **Test Credit Issuance**
  1. Admin creates credit batch (2 approvals required)
  2. Wallet syncs with bank
  3. Wallet receives credits in ledger
  4. Wallet's local balance increases

- [ ] **Test Wallet Transfer**
  1. Wallet A generates send QR
  2. Wallet B scans and syncs (BLE or QR)
  3. Bank records transfer in both ledgers
  4. Balances updated on next sync

---

## 📋 Final Sign-Off Checklist

### Development Lead

- [ ] Code reviewed by 2 engineers
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] No critical security issues
- [ ] Documentation up to date
- [ ] Deployment guide tested

### Security Officer

- [ ] ECDSA keys properly secured
- [ ] Immutable ledger verified
- [ ] Rate limiting functional
- [ ] CORS configured correctly
- [ ] No hardcoded credentials
- [ ] Threat model reviewed

### DevOps Lead

- [ ] PostgreSQL backup automated
- [ ] Monitoring configured
- [ ] Alerts setup for failures
- [ ] SSL/TLS certificates valid
- [ ] Auto-scaling configured
- [ ] Disaster recovery tested

### Product Owner

- [ ] All 11 steps implemented
- [ ] API contracts finalized
- [ ] Mobile app integration tested
- [ ] Admin dashboard works
- [ ] Wallets can sync securely
- [ ] No offline wallet is blocked

---

## ✅ Phase 2: Final Hardening (February 5, 2026)

### Admin Wallet-Link Approval

- [ ] **Wallet link approval table created**
  ```bash
  psql -U postgres -d zeronettbank -c "SELECT * FROM wallet_link_approvals LIMIT 1;"
  ```
  Expected: Table exists with status, reason, decided_by_admin columns

- [ ] **Admin can approve wallet links**
  ```bash
  curl -X POST http://localhost:3000/api/v1/admin/wallet-links/{id}/approve \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json"
  ```
  Expected: 200 OK, link status → active

- [ ] **Admin can reject wallet links**
  ```bash
  curl -X POST http://localhost:3000/api/v1/admin/wallet-links/{id}/reject \
    -H "Authorization: Bearer {token}" \
    -H "Content-Type: application/json" \
    -d '{"reason": "Suspicious activity detected"}'
  ```
  Expected: 200 OK, link status → rejected

- [ ] **Rejection blocks access**
  ```bash
  # Try to access ledger with rejected link
  curl http://localhost:3000/api/v1/user/wallets/{walletId}/ledger
  ```
  Expected: 403 Forbidden

- [ ] **Audit logs wallet link events**
  ```sql
  SELECT action FROM audit_log WHERE action LIKE 'WALLET_LINK_%' ORDER BY created_at DESC LIMIT 5;
  ```
  Expected: WALLET_LINK_APPROVED, WALLET_LINK_REJECTED actions

### Statement Verification API

- [ ] **Public endpoint works (no auth)**
  ```bash
  curl -X POST http://localhost:3000/api/statements/verify \
    -H "Content-Type: application/json" \
    -d '{
      "statement_hash": "abc123",
      "bank_signature": "..."
    }'
  ```
  Expected: 200 OK with valid=true or valid=false

- [ ] **Invalid signatures rejected**
  ```bash
  curl -X POST http://localhost:3000/api/statements/verify \
    -d '{"statement_hash": "abc", "bank_signature": "deadbeef"}'
  ```
  Expected: 400 Bad Request, valid=false

- [ ] **Endpoint returns bank fingerprint**
  ```bash
  curl -X POST http://localhost:3000/api/statements/verify \
    -d '{...}' | jq .bank_key_fingerprint
  ```
  Expected: SHA256 hash of bank public key

### Read-Only Guard

- [ ] **GET allowed in READ_ONLY mode**
  ```bash
  curl http://localhost:3000/api/v1/user/wallets
  ```
  Expected: 200 OK

- [ ] **POST blocked in READ_ONLY mode**
  ```bash
  curl -X POST http://localhost:3000/api/dangerous \
    -H "X-Statement-Mode: READ_ONLY"
  ```
  Expected: 403 Forbidden

- [ ] **DELETE blocked in READ_ONLY mode**
  ```bash
  curl -X DELETE http://localhost:3000/api/dangerous \
    -H "X-Statement-Mode: READ_ONLY"
  ```
  Expected: 403 Forbidden

### Ledger Snapshot (Cold Storage)

- [ ] **Snapshot endpoint works**
  ```bash
  curl http://localhost:3000/api/v1/admin/proofs/ledger-snapshot \
    -H "Authorization: Bearer {admin-token}"
  ```
  Expected: 200 OK with total_entries, latest_hash, bank_signature

- [ ] **Snapshot is bank-signed**
  ```bash
  curl http://localhost:3000/api/v1/admin/proofs/ledger-snapshot | jq .bank_signature
  ```
  Expected: 128-character hex string (valid ECDSA signature)

- [ ] **Can verify snapshot offline**
  ```bash
  # Save snapshot, export public key, verify locally
  npm run verify-snapshot ./snapshot.json
  ```
  Expected: Signature verified successfully

### Security Tests

- [ ] **Run statement integrity tests**
  ```bash
  npm run test -- tests/statement_integrity.test.ts
  ```
  Expected: All 7 tests pass

- [ ] **Run pagination security tests**
  ```bash
  npm run test -- tests/pagination_security.test.ts
  ```
  Expected: All 11 tests pass

- [ ] **Run wallet link approval tests**
  ```bash
  npm run test -- tests/wallet_link_approval.test.ts
  ```
  Expected: All 8 tests pass

- [ ] **Run read-only guard tests**
  ```bash
  npm run test -- tests/readonly_guard.test.ts
  ```
  Expected: All 15 tests pass

### Overall Coverage

- [ ] **All 48 test scenarios passing**
  ```bash
  npm run test
  ```
  Expected: 48 passing, 0 failing

- [ ] **Documentation updated**
  - IMPLEMENTATION_SUMMARY.md includes Phase 2
  - PRODUCTION_CHECKLIST.md includes hardening steps
  - API docs show new endpoints

---

## 🎉 Production Ready Sign-Off

```
Date: _______________

Development:  _________________ (signature)
Security:     _________________ (signature)
DevOps:       _________________ (signature)
Product:      _________________ (signature)

APPROVED FOR PRODUCTION DEPLOYMENT ✅

---

**Phase 1 Completion**: January 25, 2026 ✅
**Phase 2 Hardening**: February 5, 2026 ✅
**Final Status**: Enterprise-Ready, Security-Hardened, Production-Grade
```

---

## 📞 Post-Deployment Support

### Escalation Contacts

- **Critical Issue (Down)**: security@zeronettbank.com + on-call
- **High Priority**: engineering-lead@zeronettbank.com
- **Security Issue**: security@zeronettbank.com (encrypted)
- **Database Issue**: dba@zeronettbank.com

### Runbooks

- **Incident Response**: See THREAT_MODEL.md
- **Key Rotation**: See docs/key-rotation.md
- **Database Recovery**: See docs/disaster-recovery.md

---

**Last Updated**: January 25, 2026
**Status**: Ready for Production
**Maintained By**: Security & DevOps Teams
