# 🙋 USER SUPPORT GUIDE - ZeroNetBank

**Target Audience**: Customer support team helping wallet users  
**Purpose**: Troubleshooting common issues + escalation procedures

---

## 📱 ISSUE 1: Wallet Not Syncing

**Symptoms**: User reports "Sync failed" or "Last sync: Never"

### Diagnosis (Support Agent)

```bash
# Check backend logs for wallet sync attempts
grep "walletId.*[user's wallet ID]" logs/app.log | grep sync | tail -20

# Common causes:
# 1. Network connectivity (user's device)
# 2. Invalid request signature (wallet key issue)
# 3. Clock skew (device time wrong)
# 4. Wallet not registered
```

### Solution Path A: Network Issue

```
User troubleshooting steps:
1. Check internet connection (WiFi or mobile data)
2. Try syncing from different network
3. Disable VPN if active
4. Check firewall settings

Test:
- Open browser on phone
- Visit https://api.zeronettbank.com/health
- Should show: {"status":"ok"}
- If timeout: Network blocked
```

### Solution Path B: Clock Skew

```bash
# Backend rejects requests with timestamp >5 min skew

User fix:
1. Go to phone Settings → Date & Time
2. Enable "Automatic date & time"
3. Enable "Automatic time zone"
4. Restart wallet app
5. Try sync again

Verify in logs:
grep "Clock skew" logs/app.log
# If present: This was the issue
```

### Solution Path C: Wallet Not Registered

```bash
# Check if wallet exists in database
psql -U postgres -d zeronettbank -c "
  SELECT
    wallet_id,
    device_identifier,
    created_at,
    last_sync
  FROM wallet_registrations
  WHERE wallet_id = '[user wallet ID]';
"

# If no rows: Wallet never registered

User fix:
1. In wallet app: Settings → "Resync with Bank"
2. Wallet will re-register automatically
3. Provide: walletId, deviceId, wallet public key
4. Try sync again
```

### Solution Path D: Invalid Signature

```bash
# Wallet signing requests incorrectly

Check logs:
grep "signature verification failed" logs/app.log | grep "[wallet ID]"

# Cause: Wallet private key corruption

User fix (DESTRUCTIVE):
1. Export recovery phrase (12 words)
2. Uninstall wallet app
3. Reinstall wallet app
4. Restore from recovery phrase
5. Wallet regenerates keys
6. Try sync

CRITICAL: User MUST have recovery phrase
Without it: Wallet balance lost
```

### Escalation

**Escalate to engineering if**:
- Sync fails after all troubleshooting steps
- Multiple users reporting sync issues simultaneously
- Error message mentions "hash chain" or "signature"

---

## 🔗 ISSUE 2: Wallet Linking Failed

**Symptoms**: User can't log into web portal, error: "Wallet not linked to email"

### Background

ZeroNetBank requires:
- Wallet = Offline money storage (Flutter app)
- Email account = Online portal access (read-only)
- Linking = Proves wallet belongs to email owner

### Diagnosis

```bash
# Check if wallet linked
psql -U postgres -d zeronettbank -c "
  SELECT
    email,
    wallet_public_key,
    verified,
    created_at
  FROM wallet_links
  WHERE email = '[user email]';
"

# If no rows: Wallet not linked
# If verified = false: Link initiated but not confirmed
```

### Solution Path A: Link Never Created

```
User steps:
1. Open wallet app
2. Go to Settings → "Link to Email"
3. Enter email address
4. Click "Send Verification Link"
5. Check email inbox (+ spam folder)
6. Click link in email (expires in 24 hours)
7. Enter OTP code displayed in wallet app
8. Success: Wallet linked

Why this matters:
- Web portal is READ-ONLY (proof-only sync)
- Portal shows balance + transaction history
- Portal CANNOT send money (only wallet app can)
```

### Solution Path B: Verification Email Not Received

```
Check spam folder first!

If not in spam:
1. Verify email address correct (no typos)
2. Check backend email logs:

grep "OTP email sent" logs/app.log | grep "[user email]"

# If no logs: Email send failed

3. Check SMTP configuration:
psql -U postgres -d zeronettbank -c "
  SELECT * FROM bank_settings WHERE key LIKE 'email%';
"

4. Test email delivery:
curl -X POST https://api.zeronettbank.com/api/v1/auth/test-email \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Solution Path C: OTP Code Expired

```
OTP expires after: 10 minutes

User steps:
1. In wallet app: "Resend OTP"
2. New code generated
3. Check email again
4. Enter new code within 10 minutes
```

### Solution Path D: Wallet Already Linked to Different Email

```bash
# One wallet can only link to ONE email

Check existing link:
psql -U postgres -d zeronettbank -c "
  SELECT email FROM wallet_links
  WHERE wallet_public_key = '[wallet public key]';
"

# If returns different email: Already linked

User options:
A. Unlink from old email (requires admin approval)
B. Use old email for portal access
C. Create new wallet (if old email inaccessible)
```

### Escalation

**Escalate to admin if**:
- User needs to unlink wallet from old email
- User lost access to linked email account
- User claims fraud (someone else linked their wallet)

---

## ❄️ ISSUE 3: Wallet Frozen

**Symptoms**: User sees "Account Frozen - Contact Support"

### What This Means

Wallet is on security hold:
- ✅ Balance is SAFE (not lost)
- ✅ User can still sync (see balance)
- ❌ User CANNOT send money via BLE

### Why Wallets Get Frozen

Common reasons:
1. Suspicious activity (rapid transfers)
2. User reported device stolen
3. Sync payload invariant violation (security issue)
4. Legal hold request
5. Fraud investigation

### Support Response

```
Support script:

"I see your wallet is currently on a temporary security hold.
Your balance is completely safe and unchanged.

To resolve this, I need to:
1. Verify your identity
2. Review the hold reason
3. Connect you with our security team if needed

Can you confirm:
- Your full name:
- Your registered email:
- Wallet ID (in app Settings):
- Last transaction date you remember:
"

DO NOT:
❌ Tell user they "did something wrong"
❌ Share specific security detection methods
❌ Promise immediate unfreeze
```

### Investigation

```bash
# Check freeze reason
psql -U postgres -d zeronettbank -c "
  SELECT
    wallet_public_key,
    freeze_reason,
    frozen_at,
    frozen_by_admin
  FROM wallet_freeze_log
  WHERE wallet_id = '[wallet ID]'
  ORDER BY frozen_at DESC
  LIMIT 1;
"

# Common reasons:
# - "Velocity attack detected" = Too many transfers too fast
# - "User reported theft" = User called support
# - "Sync payload violation" = Wallet sent forbidden data
# - "Legal hold" = Court order
```

### Resolution

**If reason = Velocity attack**:
```
1. Review transaction history
2. Ask user: "Did you make 50 transfers yesterday?"
3. If yes: Explain velocity limits, request slower pace
4. If no: Possible device compromise, recommend:
   - Factory reset device
   - Restore wallet from recovery phrase
   - Change device unlock PIN

5. Escalate to admin for unfreeze approval (dual approval)
```

**If reason = User reported theft**:
```
1. Verify user identity (ask security questions)
2. If verified: User recovered device or false alarm
3. Escalate to admin for unfreeze
```

**If reason = Sync payload violation**:
```
1. Security issue detected in wallet app
2. Check for wallet app updates
3. User must update to latest version
4. If latest version: Escalate to engineering
5. After fix: Admin unfreezes wallet
```

**If reason = Legal hold**:
```
1. Cannot discuss details over phone
2. Direct user to legal@zeronettbank.com
3. Unfreeze requires legal clearance (not support decision)
```

### Escalation

**Escalate to admin if**:
- User identity verified + ready for unfreeze
- User disputes freeze reason
- User reports urgent need (medical emergency, etc.)

---

## 💸 ISSUE 4: Missing Credit After Payment

**Symptoms**: User says "I paid $50 via wire, but wallet balance still zero"

### Diagnosis

```bash
# Step 1: Verify payment received
# - Check bank account for wire transfer
# - Verify amount matches user claim
# - Confirm wire cleared (not pending)

# Step 2: Check if credit issued
psql -U postgres -d zeronettbank -c "
  SELECT
    credit_id,
    wallet_public_key,
    amount_cents,
    description,
    created_at
  FROM bank_ledger
  WHERE description LIKE '%[wire reference]%'
    OR wallet_public_key = '[user wallet public key]';
"

# Scenarios:
# A. No credit found: Admin hasn't issued yet
# B. Credit found: Issued, but wallet hasn't synced
```

### Solution Path A: Credit Not Yet Issued

```
Timeline:
- User sends wire: Day 1
- Bank receives wire: Day 2-3 (wire delay)
- Admin verifies payment: Day 3
- Admin issues credit: Day 3 (requires dual approval)
- User syncs wallet: Day 3

Support response:
"Wire transfers take 2-3 business days to clear.
Once we confirm receipt, we'll issue your credit within 24 hours.
You'll receive email notification when credit is ready.
Then, sync your wallet to receive."

Check payment status:
- If wire not yet cleared: "Still processing, expect 2-3 days"
- If wire cleared but not credited: Escalate to admin
```

### Solution Path B: Credit Issued, Wallet Not Synced

```bash
# Credit is in bank ledger
psql -U postgres -d zeronettbank -c "
  SELECT
    credit_id,
    amount_cents,
    created_at
  FROM bank_ledger
  WHERE wallet_public_key = '[user wallet public key]'
    AND entry_type = 'CREDIT'
  ORDER BY created_at DESC
  LIMIT 1;
"

# If credit exists:
Support response:
"Your credit was issued [date]. To receive it:
1. Open wallet app
2. Pull down to sync
3. Wait for 'Sync successful'
4. Balance will update immediately

If sync fails, see ISSUE 1: Wallet Not Syncing"
```

### Solution Path C: Wrong Wallet Address Provided

```
User sent wire with reference: WALLET-ABC123
Admin credited: WALLET-ABC123
User's actual wallet: WALLET-XYZ789

This is USER ERROR but fixable:

1. Verify user's actual wallet ID (in app Settings)
2. Check which wallet was credited:

psql -U postgres -d zeronettbank -c "
  SELECT wallet_public_key FROM bank_ledger
  WHERE credit_id = '[credit_id]';
"

3. If wrong wallet: Admin can reverse + reissue
   - Requires dual approval
   - If original wallet hasn't spent credit
```

### Escalation

**Escalate to admin if**:
- Payment confirmed but credit not issued after 24 hours
- Credit issued to wrong wallet (needs reversal)
- User disputes credit amount

---

## 🔄 ISSUE 5: BLE Transfer Failed

**Symptoms**: User says "I tried to send money via Bluetooth, failed"

### Background

BLE transfers are:
- Offline (no internet needed)
- Peer-to-peer (wallet to wallet)
- Immediate (no bank approval needed)
- Final (cannot be reversed by bank)

### Common Failure Causes

**Cause A: Insufficient Balance**
```
User trying to send $50
User's balance: $30
Result: Wallet rejects (before BLE transmission)

Support response:
"Your current balance is $30. To send $50, you need to:
1. Receive a top-up credit from us, or
2. Receive money from another wallet user
3. Then try transfer again"
```

**Cause B: Bluetooth Not Enabled**
```
One or both devices: Bluetooth OFF

User troubleshooting:
1. Sender: Enable Bluetooth
2. Receiver: Enable Bluetooth
3. Devices within 10 meters
4. No obstacles (walls weaken signal)
5. Try again
```

**Cause C: Devices Can't Find Each Other**
```
Scanning fails to detect recipient wallet

Troubleshooting:
1. Receiver: Open wallet app, go to "Receive Money"
2. Receiver wallet: Now advertising via BLE
3. Sender: Open wallet app, go to "Send Money"
4. Sender wallet: Scans for nearby wallets
5. Should see receiver wallet in list
6. Select recipient, enter amount, confirm

If still fails:
- Restart both apps
- Restart Bluetooth on both devices
- Ensure both running latest wallet version
```

**Cause D: Transfer Timed Out**
```
Transfer initiated but didn't complete

Likely: Lost BLE connection mid-transfer

Check wallet ledger:
- In sender wallet: Check "Transaction History"
- If shows "PENDING": Transfer not yet confirmed
- If shows "SEND - [amount]": Transfer succeeded
- If not listed: Transfer never started

Wallet protects against:
- Double-spend (atomic operation)
- Partial transfer (all or nothing)

User should:
1. Check recipient's wallet
2. If recipient received: Transfer successful
3. If recipient didn't receive: Safe to retry
```

### Critical Rules

**Support MUST explain**:

1. **BLE transfers are final**
   - Bank cannot reverse
   - Only sender/receiver involved
   - If sent to wrong person: Receiver must return voluntarily

2. **Network not required**
   - Works offline
   - Works in airplane mode
   - Works underground
   - Only needs Bluetooth

3. **Verify recipient before sending**
   - Check wallet ID
   - Check name (if known contact)
   - Cannot undo mistake

### Escalation

**DO NOT escalate BLE transfer issues to admin**
- Bank has no control over peer-to-peer transfers
- Only escalate if:
  - Fraud suspected (user reports unauthorized send)
  - Wallet bug suspected (funds disappeared)

---

## 🔐 ISSUE 6: Lost Recovery Phrase

**Symptoms**: User lost phone, needs to restore wallet on new device

### CRITICAL Assessment

**User HAS recovery phrase** (12 words):
✅ Funds are SAFE
✅ Can restore on new device
✅ Balance + history will be restored

**User LOST recovery phrase**:
❌ Funds are UNRECOVERABLE
❌ Wallet is wallet-sovereign (no bank backup)
❌ Balance is lost forever

### Solution Path: User Has Recovery Phrase

```
User steps:
1. Install ZeroNetBank wallet app on new device
2. Open app, select "Restore Wallet"
3. Enter 12-word recovery phrase (in correct order)
4. Wallet regenerates:
   - Private key (same as before)
   - Public key (same as before)
   - Wallet ID (same as before)
5. Sync with bank
6. Balance + history restored

Support tips:
- Recovery phrase is CASE-SENSITIVE
- Must be exact words in exact order
- 12 words, separated by spaces
- No punctuation
```

### Solution Path: User Lost Recovery Phrase

```
Support script (difficult conversation):

"I understand this is extremely stressful. Unfortunately,
ZeroNetBank wallets are designed to be self-sovereign,
which means:

- Your wallet is protected by YOUR recovery phrase only
- We (the bank) do not have a backup of your phrase
- This is intentional for your financial privacy
- Without the phrase, the wallet cannot be recovered

Your balance was: $[amount]

Options:
1. Thoroughly search for recovery phrase
   - Check notes, emails, photos
   - Check cloud storage backups
   - Ask family members if you shared it
2. If old device is accessible (even if broken):
   - Professional data recovery services
   - May be able to extract wallet data
3. If absolutely lost:
   - Balance is unrecoverable
   - Consider it a lesson learned
   - Start new wallet with new recovery phrase

Prevention for next time:
- Write phrase on paper (not digital)
- Store in safe place (fireproof safe, bank vault)
- Make 2-3 copies in different locations
- NEVER share phrase with anyone (including us)
"

DO NOT:
❌ Offer false hope of recovery
❌ Say "we'll try to recover it" (impossible)
❌ Transfer balance to new wallet (no authority)
```

### Escalation

**Only escalate if**:
- User has recovery phrase but restoration fails
- User reports wallet compromised (someone else has phrase)

---

## 📊 ISSUE 7: Balance Discrepancy

**Symptoms**: User says "My balance is wrong"

### Diagnosis

```bash
# Check bank's ledger for wallet
psql -U postgres -d zeronettbank -c "
  SELECT
    entry_type,
    amount_cents,
    description,
    created_at
  FROM bank_ledger
  WHERE wallet_public_key = '[wallet public key]'
  ORDER BY id;
"

# Calculate bank's view of balance:
SELECT
  SUM(CASE
    WHEN entry_type IN ('CREDIT', 'RECEIVE') THEN amount_cents
    WHEN entry_type = 'SEND' THEN -amount_cents
    ELSE 0
  END) / 100.0 as balance_usd
FROM bank_ledger
WHERE wallet_public_key = '[wallet public key]';
```

### Common Causes

**Cause A: BLE Transfers Not in Bank Ledger**
```
Bank only knows about:
- CREDIT: Bank → Wallet (recorded)
- Wallet ↔ Wallet BLE transfers: NOT recorded by bank

User's wallet tracks:
- All transactions (including BLE)

This is NORMAL:
- Bank balance = Credits only
- Wallet balance = Credits + BLE sends/receives

Support response:
"The bank ledger only shows credits we've issued to you.
Peer-to-peer Bluetooth transfers are offline and private.
Your wallet app tracks your complete balance including
BLE transfers. The balance in your wallet app is correct."
```

**Cause B: Wallet Not Synced Recently**
```
User's wallet showing old balance

Check last sync:
psql -U postgres -d zeronettbank -c "
  SELECT last_sync FROM wallet_registrations
  WHERE wallet_id = '[wallet ID]';
"

If last_sync > 24 hours ago:
"Your wallet hasn't synced recently. To update:
1. Pull down to refresh in wallet app
2. Wait for sync completion
3. Balance will update if new credits available"
```

**Cause C: User Confused About Credit vs Activity**
```
User: "I was supposed to get $100"
Bank issued: $100 credit
User then sent: $50 to friend via BLE
User's current balance: $50
User's expectation: $100

Support response:
"You received $100 credit from us [date].
Since then, you sent $50 to [recipient].
Your current balance: $100 - $50 = $50.

Transaction history (in wallet app):
+ $100 CREDIT [date]
- $50 SEND to [wallet ID] [date]
Balance: $50"
```

### Escalation

**Escalate to engineering if**:
- Bank ledger and wallet ledger clearly don't match
- User reports balance decreased without any transactions
- Multiple users reporting same issue

---

## 🛠️ GENERAL TROUBLESHOOTING TIPS

### Before Escalating, Always Ask:

1. **What version is the wallet app?**
   - Settings → About → Version
   - If not latest: "Please update app first"

2. **When did this start happening?**
   - Helps correlate with backend changes
   - "Did this work before?"

3. **Has user tried restarting the app?**
   - Solves 50% of issues
   - "Close app completely, reopen"

4. **Is this affecting multiple users?**
   - If yes: System-wide issue, escalate immediately
   - If no: Likely user-specific

5. **Can user provide screenshot?**
   - Error messages
   - Transaction history
   - Settings screen

### Support Agent Checklist

- [ ] Verified user identity (email, wallet ID)
- [ ] Checked backend logs for wallet activity
- [ ] Reviewed wallet's bank ledger entries
- [ ] Confirmed wallet app version is latest
- [ ] Attempted at least 2 troubleshooting steps
- [ ] If still broken: Escalate with full context

### Escalation Email Template

```
Subject: [URGENT/NORMAL] Wallet Support Escalation - [Issue Type]

User Details:
- Email: user@example.com
- Wallet ID: WALLET-ABC123
- Wallet Public Key: [hex string]
- App Version: 1.2.3
- Device: iPhone 14, iOS 17.2

Issue Description:
[Brief description from user perspective]

Troubleshooting Attempted:
1. [Step 1] - Result: [outcome]
2. [Step 2] - Result: [outcome]
3. [Step 3] - Result: [outcome]

Backend Investigation:
- Last sync: [timestamp]
- Bank ledger balance: $[amount]
- Wallet claimed balance: $[amount]
- Recent credits: [list]
- Recent audit log: [relevant entries]

Agent Assessment:
[Your analysis of root cause]

Recommended Next Steps:
[What engineering/admin should do]

Priority:
- URGENT: User cannot access funds
- NORMAL: User experiencing inconvenience

Ticket ID: SUPPORT-2026-01-27-001
```

---

## 📞 ESCALATION PATHS

**Level 1**: Support agent (handles 80% of issues)  
**Level 2**: Engineering team (technical issues, wallet bugs)  
**Level 3**: Admin team (freeze/unfreeze, credit issues)  
**Level 4**: CTO/Security (fraud, system compromise)

### When to Escalate to Engineering

- Wallet sync failing after all troubleshooting
- Wallet app crash/bug suspected
- Balance discrepancy not explained by BLE transfers
- Error messages mentioning "signature" or "hash"
- Multiple users reporting same issue

### When to Escalate to Admin

- User needs wallet unfrozen
- Credit issued but not received (after 48 hours)
- User needs wallet unlinked from old email
- Suspected fraud case
- Legal hold request

### When to Escalate to Security/CTO

- User reports unauthorized transactions
- Potential security vulnerability discovered
- Mass wallet compromise suspected
- Media inquiry about security
- Law enforcement request

---

## 💬 SUPPORT TEMPLATES

### Template: General Issue Acknowledgment

```
Subject: ZeroNetBank Support - [Issue Type]

Dear [User Name],

Thank you for contacting ZeroNetBank Support.

Issue: [Brief description]
Ticket ID: SUPPORT-2026-01-27-001
Expected Resolution: [timeframe]

We're investigating and will update you within [timeframe].
In the meantime, your balance is safe and unchanged.

If you have additional information, please reply to this email
with ticket ID in subject line.

Best regards,
[Agent Name]
ZeroNetBank Support Team
support@zeronettbank.com
```

### Template: Issue Resolved

```
Subject: [RESOLVED] ZeroNetBank Support - Ticket #[ID]

Dear [User Name],

Your issue has been resolved.

Issue: [description]
Resolution: [what was done]
Verified: [timestamp]

Please verify in your wallet app that everything is working correctly.
If you experience any further issues, reply to this email.

Thank you for your patience.

Best regards,
[Agent Name]
ZeroNetBank Support Team
```

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Review Frequency**: Monthly (or after major app updates)  
**Owner**: Customer Support Team Lead
