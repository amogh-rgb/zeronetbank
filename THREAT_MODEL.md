# ZeroNetBank Security Threat Model

## Executive Summary

ZeroNetBank is the backend banking system for ZeroNetPay, an offline-first Flutter wallet. Unlike traditional banks, ZeroNetBank **never stores or has access to user private keys**. The wallet remains completely offline and operational without any bank interaction.

This threat model documents:
1. Attack scenarios and mitigations
2. Security guarantees
3. Remaining risks (accepted)
4. Incident response procedures

---

## Threat Model Scope

### What ZeroNetBank Controls

- ✅ User account database (email, password, admin roles)
- ✅ Bank's ECDSA P-256 private key (never transmitted)
- ✅ Immutable ledger (append-only transaction log)
- ✅ Credit issuance and distribution
- ✅ Wallet freeze authority
- ✅ Authentication and OTP delivery

### What ZeroNetBank Does NOT Control

- ❌ User private keys (never sent to bank)
- ❌ Wallet balance (derived from ledger by wallet)
- ❌ Transaction spending (happens offline, wallet signs)
- ❌ Wallet BLE transfers (peer-to-peer, not bank)
- ❌ User biometric unlock (happens on device)

---

## Threat Scenarios & Mitigations

### Scenario 1: Bank Issues False Credits

**Threat**: Bank admin creates credits that don't exist, inflating wallet balances.

**Mitigation**:
```
✅ Dual Approval: All credits require 2 FINANCE_ADMIN approvals
✅ Signatures: All ledger entries signed with bank's private key
✅ Wallet Verification: Wallet verifies bank signature on sync response
✅ Audit Log: All credit approvals logged and timestamped
✅ Public Ledger: Ledger can be publicly verified after freeze
```

**Risk**: If both admins are compromised, false credits possible.
**Residual Risk**: MEDIUM (admin collusion)

---

### Scenario 2: Bank Steals User Private Keys

**Threat**: Bank requests private key from wallet, uses it to spend money.

**Mitigation**:
```
✅ Design Principle: Private keys NEVER sent to bank
✅ Offline Wallet: Wallet works completely offline
✅ No Private Key API: No API endpoint for private key retrieval
✅ PBKDF2 + AES-256: Private key encrypted on device
✅ Source Code Review: Public wallet code proves keys never leave device
```

**Risk**: User could be tricked into exporting private key.
**Residual Risk**: LOW (user responsibility)

---

### Scenario 3: Replay Attacks on Wallet Sync

**Threat**: Attacker captures valid sync request, replays it to deliver same credit twice.

**Mitigation**:
```
✅ Nonce Protection: Each sync includes unique nonce
✅ Nonce Validation: Bank checks nonce hasn't been used (1-hour window)
✅ Audit Log: All syncs with nonce recorded
✅ Signature Verification: Request signed by wallet, nonce verified
✅ Device Fingerprinting: Can add device fingerprint to sync
```

**Risk**: Attacker has 1 hour to replay captured request.
**Residual Risk**: LOW (short time window, signature required)

---

### Scenario 4: Admin Fraud

**Threat**: Admin issues credits to personal wallet, freezes victims, steals wallets.

**Mitigation**:
```
✅ Dual Approval: Cannot issue credits alone
✅ Role Separation: Approve and create roles split
✅ Audit Logging: Every action logged with actor ID
✅ Change Tracking: old_value and new_value stored
✅ Access Revocation: SUPER_ADMIN can revoke privileges
✅ Wallet Freeze: Can detect suspicious activity and freeze
```

**Risk**: Two compromised admins can commit fraud.
**Residual Risk**: MEDIUM (multi-person collusion)

---

### Scenario 5: Ledger Tampering

**Threat**: Attacker modifies existing ledger entry (e.g., removes credit record).

**Mitigation**:
```
✅ Immutable Table: UPDATE and DELETE triggers block modifications
✅ Hash Chain: Each entry includes hash of previous entry
✅ Integrity Check: Can verify entire chain in seconds
✅ Database Constraints: Unique constraint on hash_chain
✅ Audit Trail: All access logged (append operations only)
```

**Risk**: Database-level compromise could bypass triggers.
**Residual Risk**: LOW (requires DB admin compromise + code change)

---

### Scenario 6: Man-in-the-Middle (MITM) Attack

**Threat**: Attacker intercepts communication, modifies sync response.

**Mitigation**:
```
✅ HTTPS/TLS: All communication encrypted
✅ Signature Verification: All responses signed by bank
✅ Certificate Pinning: Wallet can pin bank certificate
✅ Public Key Verification: Wallet verifies bank's signature
✅ Response Integrity: Modifying signature breaks verification
```

**Risk**: Attacker could intercept if TLS is broken or certs stolen.
**Residual Risk**: MEDIUM (depends on TLS implementation)

---

### Scenario 7: Brute-Force Login Attack

**Threat**: Attacker tries thousands of passwords to access admin account.

**Mitigation**:
```
✅ Rate Limiting: Max 100 requests per 15 minutes
✅ Account Lockout: Locks account after 5 failed attempts
✅ Lockout Duration: 15-minute cooldown between attempts
✅ Failed Attempt Logging: All failed logins recorded
✅ OTP Required: New device requires OTP verification
✅ Email Notification: User alerted on login attempts
```

**Risk**: Attacker with dictionary attacks could break weak passwords.
**Residual Risk**: MEDIUM (depends on password strength)

---

### Scenario 8: Device Theft

**Threat**: Thief steals phone with wallet, spends user's money offline.

**Mitigation**:
```
✅ Device Encryption: Phone OS encrypts storage
✅ Biometric Lock: Wallet locked to device biometric
✅ PIN Protection: Additional PIN required for private key
✅ Cold Wallet Pattern: Private key not loaded until needed
✅ User Can Freeze: Contact bank to freeze wallet
✅ Wallet Recovery: Recover with recovery phrase
```

**Risk**: Thief can spend offline if biometric unlocked.
**Residual Risk**: HIGH (physical device possession risk)

---

### Scenario 9: Ledger Database Corruption

**Threat**: Database crash corrupts ledger (bit flip, storage failure).

**Mitigation**:
```
✅ Regular Backups: Daily automated backups
✅ Integrity Checks: Scheduled hash-chain verification
✅ Archive Backups: Immutable snapshots for recovery
✅ Error Detection: Checksums detect corruption
✅ Incident Response: Restore from backup + notify users
```

**Risk**: Data loss between backups.
**Residual Risk**: LOW (backup frequency mitigates)

---

### Scenario 10: Key Compromise

**Threat**: Bank's private key leaked (stolen from HSM, compromised server).

**Mitigation**:
```
✅ HSM Storage: Keys stored in Hardware Security Module (recommended)
✅ Access Logging: All key usage logged
✅ Kill Switch: Can activate emergency key rotation
✅ Key Versioning: Full audit trail of key versions
✅ 90-Day Grace: Old key accepted for 90 days post-rotation
✅ All Signatures Discoverable: Public can verify signatures
```

**Risk**: New key must be distributed to all wallets.
**Residual Risk**: MEDIUM (brief window of signature ambiguity)

---

### Scenario 11: Backend Compromise

**Threat**: Attacker gains root access to backend server.

**Mitigation**:
```
✅ Code Review: No code can read private keys from disk
✅ Read-Only Secrets: Private key in read-only memory
✅ Audit Trail: All database access monitored
✅ Wallet Verification: Wallets can verify ledger independently
✅ Immutable Ledger: Can't change past transactions
✅ Public Records: Ledger entries can be published
```

**Risk**: Attacker can issue new credits.
**Residual Risk**: MEDIUM (requires business controls)

---

### Scenario 12: Fraudulent Credit Reversal

**Threat**: Admin reverses a legitimate credit (removes from ledger).

**Mitigation**:
```
✅ Immutable Ledger: Cannot delete or modify entries
✅ Debit Entry: Must use ADJUSTMENT entry with reason
✅ Dual Approval: Reversal requires 2 approvals
✅ Audit Log: Shows original credit + reversal + actors
✅ Public Verification: Reversal visible to wallet on sync
```

**Risk**: Admin can document false reason in audit log.
**Residual Risk**: MEDIUM (requires oversight)

---

## Security Architecture

### Wallet-Bank Interaction Model

```
User's Phone (Offline Wallet)
├── Private Key (encrypted, never leaves phone)
├── Balance (calculated from ledger, never stored)
├── QR Code (signed by wallet during transfer)
└── BLE Transfer (peer-to-peer, offline)

      ↓ SYNC API (signed requests/responses)

ZeroNetBank Backend
├── Public Key (wallet can verify signatures)
├── Immutable Ledger (append-only, hash-chained)
├── Credit Distribution (signed, verifiable)
└── Freeze Authority (if needed)
```

### Cryptographic Guarantees

| Component | Algorithm | Strength | Notes |
|-----------|-----------|----------|-------|
| Private Keys | ECDSA P-256 | 128-bit equiv | Industry standard |
| Key Derivation | PBKDF2 | 100k+ iterations | Slows brute force |
| Encryption | AES-256-GCM | 256-bit | NIST approved |
| Signatures | ECDSA P-256 | 256-bit | Verifiable |
| Hash Chain | SHA-256 | 256-bit | Integrity check |
| OTP | HMAC-SHA256 | 6-digit | 1 million combinations |

---

## Risk Matrix

| Scenario | Likelihood | Impact | Mitigation | Risk Level |
|----------|-----------|--------|-----------|-----------|
| False credits | LOW | HIGH | Dual approval, signatures | MEDIUM |
| Key theft | VERY LOW | CRITICAL | Design principle, offline | LOW |
| Replay attack | MEDIUM | MEDIUM | Nonce, signatures | LOW |
| Admin fraud | LOW | HIGH | Dual approval, audit | MEDIUM |
| Ledger tampering | LOW | CRITICAL | Hash chain, immutable | LOW |
| MITM | MEDIUM | HIGH | HTTPS, signatures | MEDIUM |
| Brute force | MEDIUM | MEDIUM | Rate limit, lockout | LOW |
| Device theft | MEDIUM | HIGH | Biometric, PIN, freeze | MEDIUM |
| DB corruption | LOW | HIGH | Backups, checksums | LOW |
| Key compromise | LOW | CRITICAL | HSM, key rotation | MEDIUM |
| Backend compromise | LOW | CRITICAL | Code review, audit | MEDIUM |
| False reversal | LOW | MEDIUM | Immutable, audit | MEDIUM |

---

## Accepted Risks

### Risk 1: Regional Government Banning

**Scenario**: Government forbids operation in region.

**Mitigation**:
- Cannot technically prevent (legal matter)
- Can freeze all regional wallets
- Can exit gracefully with notice

**Decision**: ACCEPTED (legal responsibility)

---

### Risk 2: Quantum Computing

**Scenario**: Quantum computers break ECDSA P-256.

**Mitigation**:
- Migrate to post-quantum cryptography (NIST PQC)
- Plan key rotation for future

**Decision**: ACCEPTED (future risk, timeline: 10+ years)

---

### Risk 3: Device Theft with Biometric Unlocked

**Scenario**: Thief has stolen phone with biometric already unlocked.

**Mitigation**:
- User can contact bank to freeze wallet
- Wallet recovery with phrase (separate device)
- Can't prevent physical device compromise

**Decision**: ACCEPTED (inherent to mobile devices)

---

### Risk 4: Insider Threat (Two Compromised Admins)

**Scenario**: Two finance admins collude to issue false credits.

**Mitigation**:
- SOC 2 compliance required
- Background checks
- Continuous monitoring
- Can be detected post-facto

**Decision**: ACCEPTED (reduce via controls, not eliminate)

---

## Compliance Framework

### Applicable Standards

- **PCI-DSS**: Payment Card Industry Data Security Standard
- **AML/KYC**: Anti-Money Laundering / Know Your Customer
- **GDPR**: General Data Protection Regulation (if EU users)
- **SOC 2**: Service Organization Control

### Audit Requirements

- Monthly integrity checks
- Quarterly access reviews
- Annual penetration testing
- Continuous monitoring

---

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|-------|-----------|----------------|
| CRITICAL | Loss of funds, key compromise | 1 hour |
| HIGH | Unauthorized access, fraud | 4 hours |
| MEDIUM | Suspicious activity, anomalies | 1 day |
| LOW | Policy violations, audit issues | 1 week |

### Incident Response Plan

#### Phase 1: Detection
- Monitor fraud alerts
- Automated integrity checks
- User reports
- Anomaly detection

#### Phase 2: Assessment
- Determine scope (affected wallets, amounts)
- Root cause analysis
- Containment decision

#### Phase 3: Containment
- Freeze affected wallets
- Stop new operations
- Preserve audit logs
- Isolate compromised systems

#### Phase 4: Recovery
- Restore from backup
- Rebuild ledger if needed
- Verify integrity
- Re-enable operations

#### Phase 5: Communication
- Notify affected users (48 hours)
- Regulatory reporting (per jurisdiction)
- Publish post-incident report
- Update threat model

---

## Future Improvements

### Phase 2

- [ ] Decentralized ledger verification (blockchain backup)
- [ ] Multi-signature for approval (>2 signatures)
- [ ] Zero-knowledge proofs for private validations
- [ ] End-to-end encryption for admin API
- [ ] Hardware wallet support

### Phase 3

- [ ] Post-quantum cryptography migration
- [ ] Fully decentralized consensus
- [ ] Regulatory compliance automation
- [ ] Geographic redundancy
- [ ] Disaster recovery guarantee (RTO < 1 hour)

---

## Validation Checklist

- [ ] Threat model reviewed by security team
- [ ] Penetration test completed (pass)
- [ ] Code audit completed (pass)
- [ ] OWASP Top 10 review (100% compliant)
- [ ] Cryptography verified (peer review)
- [ ] Incident response plan tested
- [ ] Backup/recovery tested
- [ ] Compliance audit passed

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12 | Initial threat model |

---

## References

- [OWASP Threat Model](https://owasp.org/www-community/Threat_Model_Information)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CWE Top 25](https://cwe.mitre.org/top25/)
- [PCI-DSS Standard](https://www.pcisecuritystandards.org/)

---

**Last Review**: December 2024
**Next Review**: June 2025
