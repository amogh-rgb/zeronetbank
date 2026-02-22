# 👤 ADMIN OPERATIONS MANUAL - ZeroNetBank

**Target Audience**: Bank administrators with dual-approval authority  
**Purpose**: Step-by-step procedures for privileged operations

---

## ⚠️ DUAL APPROVAL REQUIREMENT

**CRITICAL**: All money operations require 2+ admin approvals. No exceptions.

**Why?**
- Prevents single-point fraud
- Ensures oversight
- Creates audit trail
- Court-defensible decisions

**Operations requiring dual approval**:
- ✅ Credit issuance (creating new money)
- ✅ Containment mode activation (HEIGHTENED, CONTAINMENT, EMERGENCY_FREEZE)
- ✅ Wallet freeze/unfreeze
- ✅ Admin role creation
- ✅ Credit reversal

---

## 💰 OPERATION 1: Issue Credit to Wallet

**When**: User purchases credits with USD, admin confirms payment received

### Step 1: Verify Payment (First Admin)

```bash
# 1. Confirm USD received in bank account
# - Check transaction ID
# - Verify amount matches invoice
# - Confirm wire transfer cleared

# 2. Document evidence
# - Screenshot bank statement
# - Copy transaction reference
# - Note timestamp

# 3. Log into admin dashboard
https://admin.zeronettbank.com/credits/issue

# Fields:
# - Wallet ID: [from user registration]
# - Amount (USD): $50.00
# - Description: "Wire transfer #ABC123 - $50.00 USD"
# - Payment Reference: "WIRE-2026-01-27-001"

# 4. Click "Initiate Credit Approval"
# - Status: PENDING_APPROVAL (1/2)
```

### Step 2: Review & Approve (Second Admin)

```bash
# 1. Second admin logs in
https://admin.zeronettbank.com/credits/pending

# 2. Review credit request:
# - Amount reasonable? (not $1,000,000 if wire was $50)
# - Payment reference valid?
# - Wallet linked to verified user?
# - No recent freezes on wallet?

# 3. Verify payment independently
# - Check same bank statement
# - Confirm wire cleared
# - Validate amount matches

# 4. Click "Approve Credit"

# 5. Backend creates ledger entry:
# - Signed by bank private key
# - Hash-chained to previous entry
# - Immutable once written

# 6. User receives notification:
# - Type: CREDIT_AVAILABLE
# - User must sync wallet to receive
```

### Step 3: Verify Credit Delivery

```bash
# After user syncs wallet:

# 1. Check audit log
SELECT * FROM audit_log
WHERE action = 'CREDIT_ISSUED'
  AND credit_id = 'CREDIT-2026-01-27-001'
ORDER BY created_at DESC;

# 2. Verify wallet received
SELECT * FROM bank_ledger
WHERE credit_id = 'CREDIT-2026-01-27-001';

# Expected:
# - entry_type = CREDIT
# - wallet_public_key = [user's wallet]
# - amount_cents = 5000 (for $50.00)
# - bank_signature present
# - hash_chain continuous

# 3. Check wallet sync status
SELECT * FROM wallet_sync_log
WHERE wallet_id = '[wallet_id]'
ORDER BY created_at DESC
LIMIT 1;

# Expected: status = 'success'
```

### Error Cases

**Error**: Second admin rejects

```
Action:
- Credit NOT issued
- First admin notified
- Investigate reason for rejection
- If needed, request payment refund to user
```

**Error**: Wallet not syncing

```
Action:
- Credit is in ledger (safe)
- User must fix wallet connectivity
- Credit will arrive on next successful sync
- DO NOT reissue credit (idempotent by credit_id)
```

**Error**: Duplicate payment

```
Action:
- Check ledger for existing credit_id
- If duplicate: REJECT new credit
- Notify user: already credited
- If legit second payment: use NEW credit_id
```

---

## 🛡️ OPERATION 2: Activate Containment Mode

**When**: Security threat detected or preventive measure needed

### Containment Levels

| Mode | Description | Actions Allowed |
|------|-------------|-----------------|
| **NORMAL** | Standard operations | All |
| **HEIGHTENED** | Increased monitoring | All, +extra logging |
| **CONTAINMENT** | Limited operations | Sync only, NO credits |
| **EMERGENCY_FREEZE** | Total lockdown | NO operations |

### Step 1: Assess Threat (First Admin)

```bash
# Triggers for containment:
# - Hash chain break detected
# - Unsigned ledger entry found
# - Mass suspicious activity
# - External security threat
# - Regulatory investigation
# - Penetration test simulation

# Escalation decision tree:
# - Minor issue (single wallet compromise) → HEIGHTENED
# - Multiple wallets affected → CONTAINMENT
# - System integrity compromised → EMERGENCY_FREEZE
```

### Step 2: Activate Containment (Requires Dual Approval)

```bash
# 1. First admin proposes containment
https://admin.zeronettbank.com/containment/activate

# Fields:
# - Mode: CONTAINMENT
# - Reason: "Hash chain break detected at ledger ID 12345"
# - Duration: Until resolved
# - Affected Operations: Credit issuance suspended

# 2. Second admin reviews
# - Verify threat is real
# - Confirm containment mode appropriate
# - Approve activation

# 3. System immediately:
# - Rejects credit issuance attempts
# - Logs all access attempts
# - Notifies all admins
# - Broadcasts to monitoring dashboard
```

### Step 3: Operate Under Containment

```bash
# CONTAINMENT Mode:
# ✅ Allowed:
# - Wallet sync (users can check balance)
# - Read-only operations
# - Forensics export
# - Statement generation

# ❌ Blocked:
# - Credit issuance (even with dual approval)
# - New wallet registration
# - Admin role creation

# EMERGENCY_FREEZE Mode:
# ❌ ALL operations blocked except:
# - Admin login
# - Forensics export
# - Audit log access
```

### Step 4: Deactivate Containment (Requires Dual Approval)

```bash
# Prerequisites for deactivation:
# ✅ Root cause identified and fixed
# ✅ Full system integrity check passed
# ✅ All unsigned entries resolved
# ✅ Hash chain continuous
# ✅ Red-team tests passing

# Process:
# 1. First admin proposes deactivation
# - Document resolution steps
# - Attach integrity verification results

# 2. Second admin reviews
# - Verify tests passed
# - Confirm threat mitigated
# - Approve deactivation

# 3. System returns to NORMAL
# - Admins notified
# - Resume credit issuance
```

---

## ❄️ OPERATION 3: Freeze/Unfreeze Wallet

**When**: Suspicious activity, user request, legal requirement

### Step 1: Investigate Wallet (First Admin)

```bash
# Reasons to freeze:
# - Suspicious transfer patterns (velocity attack)
# - Wallet linked to fraud complaint
# - User reports device stolen
# - Legal hold request
# - Sync payload invariant violation

# Investigation checklist:
psql -U postgres -d zeronettbank -c "
  -- Wallet transaction history
  SELECT
    entry_type,
    amount_cents,
    description,
    created_at
  FROM bank_ledger
  WHERE wallet_public_key = '[wallet_public_key]'
  ORDER BY id DESC
  LIMIT 20;

  -- Trust score
  SELECT trust_score FROM wallet_trust_scores
  WHERE wallet_public_key = '[wallet_public_key]';

  -- Recent sync activity
  SELECT * FROM wallet_sync_log
  WHERE wallet_id = '[wallet_id]'
  ORDER BY created_at DESC
  LIMIT 10;
"
```

### Step 2: Freeze Wallet (Requires Dual Approval)

```bash
# 1. First admin proposes freeze
https://admin.zeronettbank.com/wallets/freeze

# Fields:
# - Wallet ID: [wallet_id]
# - Reason: "Suspicious velocity - 50 transfers in 5 minutes"
# - Legal Hold: No (or Yes if court order)
# - Duration: Until investigation complete

# 2. Second admin reviews
# - Verify evidence
# - Confirm freeze necessary
# - Approve freeze

# 3. System immediately:
# - Rejects BLE transfer attempts from wallet
# - Wallet can still sync (see balance)
# - Wallet CANNOT send money
# - User sees "Account Frozen - Contact Support"
```

### Step 3: Communicate with User

```bash
# Template email:

Subject: ZeroNetBank - Account Security Hold

Dear [User Name],

Your ZeroNetBank wallet has been placed on a temporary hold
for security verification.

Reason: [Brief non-technical explanation]
Reference: FREEZE-2026-01-27-001
Expected Resolution: [timeframe]

Your balance is safe and unchanged. You can still view your
balance by syncing your wallet.

To resolve this hold, please:
1. Email: support@zeronettbank.com
2. Reference: FREEZE-2026-01-27-001
3. Provide: [requested information]

We apologize for the inconvenience.

- ZeroNetBank Security Team
```

### Step 4: Unfreeze Wallet (Requires Dual Approval)

```bash
# Prerequisites:
# ✅ Investigation complete
# ✅ Suspicious activity explained (or not found)
# ✅ User identity verified (if theft claim)
# ✅ Legal hold lifted (if applicable)

# Process:
# 1. First admin proposes unfreeze
# - Document investigation findings
# - Confirm no ongoing threat

# 2. Second admin reviews
# - Verify resolution adequate
# - Approve unfreeze

# 3. System immediately:
# - Wallet can send money again
# - User notified
# - Normal operations resume
```

---

## 🔄 OPERATION 4: Reverse/Refund Credit

**When**: Credit issued in error, user requests refund, fraud reversal

### CRITICAL WARNING

⚠️ **Credits are IRREVERSIBLE once spent via BLE transfer**

Why?
- BLE transfers are offline (no centralized control)
- Recipient wallet immediately owns received money
- Bank has NO authority over peer-to-peer transfers

**Only bank → wallet credits can be reversed (if not spent)**

### Step 1: Verify Credit Exists

```bash
psql -U postgres -d zeronettbank -c "
  SELECT
    id,
    credit_id,
    wallet_public_key,
    amount_cents,
    description,
    created_at
  FROM bank_ledger
  WHERE credit_id = 'CREDIT-2026-01-27-001';
"

# Verify:
# - Credit is a BANK-issued credit (entry_type = CREDIT)
# - NOT a peer-to-peer transfer (entry_type = TRANSFER)
# - Check if wallet has spent money since credit
```

### Step 2: Calculate Wallet Balance

```bash
# Wallet's current balance (derived from ledger)
SELECT
  SUM(CASE
    WHEN entry_type IN ('CREDIT', 'RECEIVE') THEN amount_cents
    WHEN entry_type = 'SEND' THEN -amount_cents
    ELSE 0
  END) as current_balance_cents
FROM bank_ledger
WHERE wallet_public_key = '[wallet_public_key]';

# Check if wallet has sufficient balance for reversal
# - If current_balance < credit_amount: Wallet spent money
# - Cannot reverse if spent (would create negative balance)
```

### Step 3: Create Reversal Entry (Requires Dual Approval)

```bash
# Only proceed if wallet balance ≥ credit amount

# 1. First admin proposes reversal
https://admin.zeronettbank.com/credits/reverse

# Fields:
# - Original Credit ID: CREDIT-2026-01-27-001
# - Reason: "Duplicate payment - already credited"
# - Refund USD: Yes (wire back to user's account)

# 2. Second admin reviews
# - Verify credit was error
# - Confirm wallet has balance
# - Approve reversal

# 3. System creates DEBIT entry:
# - entry_type = DEBIT
# - amount_cents = -5000 (negative)
# - description = "Reversal of CREDIT-2026-01-27-001"
# - bank_signature = [signed]
# - hash_chain = [continuous]
```

### Special Case: Insufficient Balance for Reversal

```bash
# If wallet spent credit before reversal:

# Option A: Freeze wallet at current balance
# - Prevent further spending
# - Work out payment plan with user
# - Gradual deduction from future credits

# Option B: Accept loss
# - Bank absorbs error
# - Document for accounting
# - Improve processes to prevent recurrence

# DO NOT:
# ❌ Create negative balance (violates wallet sovereignty)
# ❌ Clawback from other users (peer transfers final)
# ❌ Modify past ledger entries (immutable)
```

---

## 👥 OPERATION 5: Create Admin Account

**When**: New administrator hired

### Step 1: HR Verification

```bash
# Prerequisites:
# ✅ Employee hired (signed contract)
# ✅ Background check passed
# ✅ Security training completed
# ✅ Role assignment approved by CTO

# Document:
# - Full name
# - Email address (company domain only)
# - Phone number (for MFA)
# - Role: admin, super_admin, audit_viewer
# - Start date
```

### Step 2: Create Account (Requires Dual Approval)

```bash
# 1. First admin creates account
https://admin.zeronettbank.com/admins/create

# Fields:
# - Email: admin@zeronettbank.com
# - Name: John Doe
# - Role: admin (for money ops) or audit_viewer (read-only)
# - MFA Required: Yes (enforced)

# 2. Second admin reviews
# - Verify HR approval
# - Confirm role appropriate
# - Approve creation

# 3. System sends invitation email
# - Temporary password (24-hour expiration)
# - Force password change on first login
# - MFA enrollment required
```

### Step 3: Verify MFA Enrollment

```bash
# New admin must:
# 1. Log in with temporary password
# 2. Set strong password (16+ chars)
# 3. Enroll MFA (Authenticator app)
# 4. Backup codes generated

# Verify enrollment:
SELECT
  email,
  mfa_enabled,
  created_at,
  last_login
FROM admin_users
WHERE email = 'admin@zeronettbank.com';

# Expected: mfa_enabled = true
```

### Step 4: Test Permissions

```bash
# New admin should test:
# ✅ Can log in
# ✅ Can view pending approvals
# ✅ Can propose credit (if role = admin)
# ✅ Can view audit log
# ❌ Cannot approve own proposals (dual approval enforced)

# Test dual approval:
# - Admin 1: Propose test credit ($1.00)
# - Admin 1: CANNOT approve own proposal (rejected)
# - Admin 2: CAN approve Admin 1's proposal ✅
```

---

## 📊 OPERATION 6: Generate Statement for Wallet

**When**: User requests proof of balance, regulatory audit, dispute resolution

### Step 1: Export Statement

```bash
# UI:
https://admin.zeronettbank.com/statements/generate

# Or API:
curl -X POST https://api.zeronettbank.com/api/v1/admin/statement/generate \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "walletPublicKey": "[wallet_public_key]",
    "startDate": "2026-01-01",
    "endDate": "2026-01-27"
  }'

# Response:
# - PDF with all ledger entries
# - Trust confidence seal (signed)
# - Hash chain verification proof
# - QR code for offline verification
```

### Step 2: Verify Statement Integrity (Offline)

```bash
# Statement includes:
# 1. All ledger entries in date range
# 2. Bank's digital signature on seal
# 3. Hash chain continuity proof
# 4. Trust score at time of export

# Verification (can be done offline):
# - Scan QR code in statement
# - Contains: prev_hash, current_hash, bank_signature
# - Verify signature with bank public key
# - Verify hash chain continuous

# Statement is COURT-DEFENSIBLE proof
```

---

## 📋 ADMIN CHECKLIST (Before First Credit)

- [ ] Two admins trained on dual approval process
- [ ] MFA enabled for all admin accounts
- [ ] Bank private key secured (0600 permissions)
- [ ] Database immutability triggers verified
- [ ] Red-team tests passing (100%)
- [ ] Audit logging enabled
- [ ] Email notifications working (OTP delivery)
- [ ] Containment mode tested (HEIGHTENED → NORMAL)
- [ ] Statement generation tested + verified offline
- [ ] Wallet freeze/unfreeze tested
- [ ] Backup procedures documented + tested

---

## 🚫 PROHIBITED ACTIONS

**NEVER DO THIS (Will Cause System Failure)**:

### ❌ Editing Past Ledger Entries

```sql
-- FORBIDDEN (Trigger will block)
UPDATE bank_ledger SET amount_cents = 6000 WHERE id = 123;
-- Result: ERROR - Immutability trigger prevents UPDATE

-- CORRECT: Append new entry
INSERT INTO bank_ledger (entry_type, amount_cents, description)
VALUES ('DEBIT', -1000, 'Correction to entry 123');
```

### ❌ Deleting Transactions

```sql
-- FORBIDDEN (Trigger will block)
DELETE FROM bank_ledger WHERE id = 123;
-- Result: ERROR - Immutability trigger prevents DELETE

-- NO ALTERNATIVE: Deletions impossible by design
```

### ❌ Creating Balance Table

```sql
-- FORBIDDEN (Violates architecture)
CREATE TABLE wallet_balances (
  wallet_id TEXT PRIMARY KEY,
  balance_cents INTEGER
);
-- Result: Violates immutable ledger principle

-- CORRECT: Derive balance from ledger always
SELECT SUM(amount_cents) FROM bank_ledger WHERE wallet_public_key = '...';
```

### ❌ Single-Admin Approval

```bash
# FORBIDDEN: Approving own credit proposal
# - Admin 1 proposes credit
# - Admin 1 approves ❌ (System rejects)

# CORRECT:
# - Admin 1 proposes
# - Admin 2 approves ✅
```

### ❌ Modifying Bank Private Key

```bash
# FORBIDDEN: Changing key after ledger entries exist
# - Result: Old entries cannot be verified
# - Hash chain breaks
# - System integrity compromised

# CORRECT: Key is PERMANENT after first entry
```

### ❌ Manual SQL for Money Operations

```bash
# FORBIDDEN: Bypassing API for credit issuance
psql -U postgres -d zeronettbank -c "
  INSERT INTO bank_ledger (entry_type, amount_cents, wallet_public_key)
  VALUES ('CREDIT', 5000, '...');
"
# Result: Entry not signed, missing dual approval, audit log bypass

# CORRECT: ALWAYS use admin dashboard or API
```

---

## 📞 SUPPORT ESCALATION

**Level 1**: Admin dashboard (most operations)  
**Level 2**: Engineering team (technical issues)  
**Level 3**: CTO (security incidents, containment)  
**Level 4**: Legal/Compliance (regulatory, fraud)

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Review Frequency**: After each admin personnel change  
**Owner**: Operations Manager
