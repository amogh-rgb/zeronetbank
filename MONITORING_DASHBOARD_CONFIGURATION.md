# 📊 MONITORING DASHBOARD CONFIGURATION

**Purpose**: Real-time system health + security monitoring  
**Target**: Grafana + PostgreSQL + Redis

---

## 🎯 CRITICAL METRICS (5 Essential)

### Metric 1: Hash Chain Integrity (Target: 100%)

**Description**: Verifies immutable ledger has no breaks in hash chain

**SQL Query**:
```sql
-- Returns 0 if integrity intact, >0 if compromised
SELECT COUNT(*) as chain_breaks
FROM (
  SELECT
    id,
    prev_hash,
    LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash
  FROM bank_ledger
) sub
WHERE id > 1 AND prev_hash != actual_prev_hash;
```

**Alert Configuration**:
```yaml
alert: HashChainIntegrityViolation
expr: bank_hash_chain_breaks > 0
for: 0m  # Immediate alert
severity: critical
annotations:
  summary: "Hash chain integrity compromised"
  description: "{{ $value }} hash chain breaks detected in bank ledger"
actions:
  - immediate_emergency_freeze
  - notify_cto
  - notify_security_team
  - preserve_evidence
```

**Dashboard Panel**:
- Type: Stat
- Color: Green if 0, Red if >0
- Query interval: 1 minute
- Display: "Integrity: OK" or "COMPROMISED"

---

### Metric 2: Unsigned Entries (Target: 0)

**Description**: All ledger entries MUST be signed by bank

**SQL Query**:
```sql
-- Returns count of unsigned entries
SELECT COUNT(*) as unsigned_entries
FROM bank_ledger
WHERE bank_signature IS NULL
   OR bank_signature = ''
   OR LENGTH(bank_signature) < 100;
```

**Alert Configuration**:
```yaml
alert: UnsignedLedgerEntry
expr: bank_unsigned_entries > 0
for: 0m  # Immediate alert
severity: critical
annotations:
  summary: "Unsigned entry in bank ledger"
  description: "{{ $value }} entries without bank signature"
actions:
  - immediate_emergency_freeze
  - notify_cto
  - forensics_export
```

**Dashboard Panel**:
- Type: Stat
- Color: Green if 0, Red if >0
- Query interval: 1 minute
- Display: "All Signed" or "UNSIGNED FOUND"

---

### Metric 3: Sync Success Rate (Target: >95%)

**Description**: Percentage of successful wallet sync attempts

**SQL Query**:
```sql
-- Last 1 hour sync success rate
SELECT
  ROUND(
    100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) as sync_success_rate_percent
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Alert Configuration**:
```yaml
alert: LowSyncSuccessRate
expr: bank_sync_success_rate < 90
for: 10m
severity: warning
annotations:
  summary: "Wallet sync success rate below threshold"
  description: "Success rate: {{ $value }}% (target: >95%)"
actions:
  - notify_engineering_oncall
  - check_backend_health
  - check_database_performance
```

**Dashboard Panel**:
- Type: Gauge
- Range: 0-100%
- Thresholds:
  - 0-80%: Red (critical)
  - 80-95%: Yellow (warning)
  - 95-100%: Green (healthy)
- Query interval: 1 minute

---

### Metric 4: Trust Score Distribution (Target: Majority >80)

**Description**: Shows wallet trust score distribution

**SQL Query**:
```sql
-- Trust score buckets
SELECT
  CASE
    WHEN trust_score >= 80 THEN 'VERIFIED'
    WHEN trust_score >= 50 THEN 'CAUTION'
    WHEN trust_score >= 20 THEN 'SUSPICIOUS'
    ELSE 'HIGH_RISK'
  END as trust_level,
  COUNT(*) as wallet_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM wallet_trust_scores
WHERE last_updated > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY
  CASE
    WHEN trust_score >= 80 THEN 1
    WHEN trust_score >= 50 THEN 2
    WHEN trust_score >= 20 THEN 3
    ELSE 4
  END;
```

**Alert Configuration**:
```yaml
alert: HighRiskWalletsSpiking
expr: bank_high_risk_wallets_percent > 10
for: 30m
severity: warning
annotations:
  summary: "Unusual spike in high-risk wallets"
  description: "{{ $value }}% of wallets classified as HIGH_RISK"
actions:
  - notify_security_team
  - review_recent_wallets
  - consider_containment_heightened
```

**Dashboard Panel**:
- Type: Pie chart
- Colors:
  - VERIFIED: Green
  - CAUTION: Yellow
  - SUSPICIOUS: Orange
  - HIGH_RISK: Red
- Query interval: 5 minutes

---

### Metric 5: Containment Mode Status

**Description**: Current system containment level

**SQL Query**:
```sql
-- Current containment mode
SELECT value as containment_mode
FROM bank_settings
WHERE key = 'containment_mode';

-- Possible values:
-- NORMAL, HEIGHTENED, CONTAINMENT, EMERGENCY_FREEZE
```

**Alert Configuration**:
```yaml
alert: ContainmentModeActivated
expr: bank_containment_mode != "NORMAL"
for: 0m  # Immediate notification
severity: info  # Not an error, but important
annotations:
  summary: "System containment activated"
  description: "Containment mode: {{ $value }}"
actions:
  - notify_all_admins
  - dashboard_highlight
  - user_broadcast
```

**Dashboard Panel**:
- Type: Stat
- Color mapping:
  - NORMAL: Green
  - HEIGHTENED: Yellow
  - CONTAINMENT: Orange
  - EMERGENCY_FREEZE: Red
- Font: Large, bold
- Query interval: 30 seconds

---

## 📈 SECONDARY METRICS (Performance)

### Metric 6: Database Connection Pool

**SQL Query**:
```sql
SELECT
  COUNT(*) FILTER (WHERE state = 'active') as active_connections,
  COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
  COUNT(*) as total_connections
FROM pg_stat_activity
WHERE datname = 'zeronettbank';
```

**Dashboard Panel**:
- Type: Time series
- Thresholds:
  - active_connections > 80: Warning
  - active_connections > 100: Critical
- Query interval: 30 seconds

---

### Metric 7: Average Sync Response Time

**SQL Query**:
```sql
SELECT
  ROUND(AVG(response_time_ms), 2) as avg_response_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_response_time_ms
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Alert Configuration**:
```yaml
alert: SlowSyncResponse
expr: bank_sync_p95_response_time_ms > 1000
for: 10m
severity: warning
annotations:
  summary: "Wallet sync response time degraded"
  description: "P95 response time: {{ $value }}ms (target: <500ms)"
```

**Dashboard Panel**:
- Type: Time series
- Lines:
  - Average (blue)
  - P95 (yellow)
  - P99 (red)
- Target line: 500ms (green dashed)
- Query interval: 1 minute

---

### Metric 8: Ledger Growth Rate

**SQL Query**:
```sql
-- Entries created in last hour
SELECT COUNT(*) as entries_per_hour
FROM bank_ledger
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Projected growth per day
SELECT
  COUNT(*) * 24 as projected_entries_per_day,
  ROUND(
    pg_size_pretty(
      pg_total_relation_size('bank_ledger')
    )::numeric / COUNT(*) * COUNT(*) * 24,
    2
  ) as projected_growth_per_day_mb
FROM bank_ledger
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Dashboard Panel**:
- Type: Stat + Sparkline
- Display: "1,234 entries/hour" + trend graph
- Query interval: 5 minutes

---

### Metric 9: Redis Memory Usage (Nonce Registry)

**Redis Command**:
```bash
redis-cli info memory | grep used_memory_human
redis-cli dbsize  # Number of nonces stored
```

**Alert Configuration**:
```yaml
alert: RedisMemoryHigh
expr: redis_used_memory_percent > 80
for: 10m
severity: warning
annotations:
  summary: "Redis memory usage high"
  description: "Memory usage: {{ $value }}%"
actions:
  - notify_engineering_oncall
  - consider_nonce_ttl_reduction
```

**Dashboard Panel**:
- Type: Gauge
- Range: 0-100%
- Thresholds:
  - 0-70%: Green
  - 70-85%: Yellow
  - 85-100%: Red
- Query interval: 1 minute

---

### Metric 10: Failed Login Attempts (Brute Force Detection)

**SQL Query**:
```sql
-- Failed logins in last hour
SELECT
  email,
  COUNT(*) as failed_attempts,
  MAX(created_at) as last_attempt
FROM audit_log
WHERE action IN ('LOGIN_FAILED', 'OTP_FAILED')
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY email
ORDER BY COUNT(*) DESC
LIMIT 10;
```

**Alert Configuration**:
```yaml
alert: BruteForceAttack
expr: bank_failed_login_attempts_per_email > 10
for: 5m
severity: warning
annotations:
  summary: "Possible brute force attack on email: {{ $labels.email }}"
  description: "{{ $value }} failed login attempts in last hour"
actions:
  - rate_limit_email
  - notify_security_team
  - consider_ip_block
```

**Dashboard Panel**:
- Type: Table
- Columns: Email, Failed Attempts, Last Attempt
- Sort: Failed Attempts (descending)
- Query interval: 1 minute

---

## 🚨 ALERT ROUTING

### Critical Alerts (P0)
- Hash chain integrity violation
- Unsigned entries detected
- Containment mode: EMERGENCY_FREEZE

**Routes**:
- Email: cto@zeronettbank.local, security@zeronettbank.local
- SMS: On-call engineer
- Slack: #incidents (with @channel)
- PagerDuty: High priority

---

### Warning Alerts (P1)
- Sync success rate < 90%
- Response time > 1s
- High-risk wallets > 10%
- Redis memory > 80%

**Routes**:
- Email: engineering-oncall@zeronettbank.local
- Slack: #engineering (no @channel)

---

### Info Alerts
- Containment mode changed (not EMERGENCY_FREEZE)
- Deployment completed
- Backup completed

**Routes**:
- Slack: #operations
- Email: Weekly digest

---

## 📺 DASHBOARD LAYOUTS

### Layout 1: Executive View (For CTO/Leadership)

**Panels** (single screen, no scrolling):
1. **System Status** (top left, large)
   - Containment Mode (colored badge)
   - Uptime: 99.9%
   - Last incident: 7 days ago

2. **Critical Metrics** (top right, 3 gauges)
   - Hash Chain Integrity: ✅ OK
   - Unsigned Entries: 0
   - Sync Success Rate: 97.3%

3. **Trust Score Distribution** (bottom left, pie chart)

4. **Recent Activity** (bottom right, sparklines)
   - Syncs per hour
   - Credits issued per day
   - Active wallets

**Refresh**: 1 minute  
**Access**: CTO, Security Officer, Board

---

### Layout 2: Operations View (For Engineering Team)

**Panels** (multi-screen, detailed):
1. **Critical Metrics** (row 1)
   - Hash Chain Integrity
   - Unsigned Entries
   - Sync Success Rate
   - Containment Mode
   - Trust Score Distribution

2. **Performance Metrics** (row 2)
   - Database connections
   - Sync response time (avg, p95, p99)
   - Redis memory usage
   - Ledger growth rate

3. **Security Metrics** (row 3)
   - Failed login attempts (table)
   - Suspicious wallets (table)
   - Replay attack attempts
   - Audit log activity

4. **System Health** (row 4)
   - Backend health endpoints
   - Database slow queries
   - Error rate
   - Request volume

**Refresh**: 30 seconds  
**Access**: All engineering team, on-call

---

### Layout 3: Security View (For Security Team)

**Panels**:
1. **Integrity Monitoring** (row 1)
   - Hash chain status
   - Signature verification status
   - Trigger status (all 4 triggers enabled?)

2. **Attack Detection** (row 2)
   - Replay attacks (table)
   - Brute force attempts (table)
   - Suspicious IPs (table)
   - Containment mode history

3. **Wallet Risk Analysis** (row 3)
   - Trust score distribution
   - Frozen wallets (table)
   - High-velocity wallets (table)
   - Recently registered wallets

4. **Audit Trail** (row 4)
   - Recent admin actions (table)
   - Credit issuance log
   - Freeze/unfreeze events
   - Containment mode changes

**Refresh**: 30 seconds  
**Access**: Security Officer, CTO, Compliance

---

### Layout 4: Public Status Page

**URL**: https://status.zeronettbank.com

**Panels** (simplified, user-friendly):
1. **System Status** (large badge)
   - 🟢 All Systems Operational
   - 🟡 Degraded Performance
   - 🔴 Service Disruption

2. **Services** (list with status indicators)
   - ✅ Wallet Sync: Operational
   - ✅ Credit Issuance: Operational
   - ✅ BLE Transfers: Operational (always operational - offline)
   - ✅ Web Portal: Operational

3. **Uptime** (last 90 days)
   - Calendar view with green/red squares

4. **Recent Incidents** (last 30 days)
   - Date, Title, Duration, Resolution

**Refresh**: 1 minute (or real-time via WebSocket)  
**Access**: Public (no authentication)

---

## 🛠️ IMPLEMENTATION GUIDE

### Step 1: Install Grafana

```bash
# Ubuntu/Debian
sudo apt-get install -y grafana

# Start Grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server

# Access: http://localhost:3000
# Default login: admin / admin
```

---

### Step 2: Add PostgreSQL Data Source

```bash
# In Grafana UI:
# 1. Configuration → Data Sources → Add data source
# 2. Select PostgreSQL
# 3. Configure:
Name: ZeroNetBank-DB
Host: localhost:5432
Database: zeronettbank
User: grafana_readonly  # Create read-only user (below)
Password: [secure_password]
SSL Mode: require
Version: 12+

# Test connection → Save
```

**Create read-only user**:
```sql
-- PostgreSQL
CREATE USER grafana_readonly WITH PASSWORD '[secure_password]';
GRANT CONNECT ON DATABASE zeronettbank TO grafana_readonly;
GRANT USAGE ON SCHEMA public TO grafana_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_readonly;
```

---

### Step 3: Add Redis Data Source

```bash
# Install Redis datasource plugin
grafana-cli plugins install redis-datasource

# Restart Grafana
sudo systemctl restart grafana-server

# In Grafana UI:
# 1. Configuration → Data Sources → Add data source
# 2. Select Redis
# 3. Configure:
Name: ZeroNetBank-Redis
Address: redis://localhost:6379
Password: [redis_password]
Pool Size: 5

# Test connection → Save
```

---

### Step 4: Import Dashboard JSON

**Create dashboard.json** (available in `/monitoring/grafana-dashboard.json`):
```json
{
  "dashboard": {
    "title": "ZeroNetBank - Operations",
    "panels": [
      {
        "id": 1,
        "title": "Hash Chain Integrity",
        "type": "stat",
        "targets": [
          {
            "datasource": "ZeroNetBank-DB",
            "rawSql": "SELECT COUNT(*) as chain_breaks FROM (SELECT id, prev_hash, LAG(hash_chain) OVER (ORDER BY id) as actual_prev_hash FROM bank_ledger) sub WHERE id > 1 AND prev_hash != actual_prev_hash;",
            "format": "table"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 1, "color": "red"}
              ]
            }
          }
        }
      },
      // ... more panels
    ]
  }
}
```

**Import**:
```bash
# In Grafana UI:
# 1. Create → Import
# 2. Upload dashboard.json
# 3. Select data source: ZeroNetBank-DB
# 4. Click Import
```

---

### Step 5: Configure Alerting

**Create alert rules** (Grafana → Alerting → Alert rules):

**Alert 1: Hash Chain Break**
```yaml
Name: Hash Chain Integrity Violation
Query: bank_hash_chain_breaks
Condition: Value > 0
Evaluation: Every 1m, For 0m
Severity: Critical
Notification:
  - Email: cto@zeronettbank.local
  - Slack: #incidents
  - PagerDuty: High priority
```

**Alert 2: Unsigned Entries**
```yaml
Name: Unsigned Ledger Entry
Query: bank_unsigned_entries
Condition: Value > 0
Evaluation: Every 1m, For 0m
Severity: Critical
Notification:
  - Email: cto@zeronettbank.local
  - Slack: #incidents
```

**Alert 3: Low Sync Rate**
```yaml
Name: Low Sync Success Rate
Query: bank_sync_success_rate
Condition: Value < 90
Evaluation: Every 1m, For 10m
Severity: Warning
Notification:
  - Email: engineering-oncall@zeronettbank.local
  - Slack: #engineering
```

---

### Step 6: Set Up Notification Channels

**Slack**:
```bash
# In Grafana:
# 1. Alerting → Contact points → New contact point
# 2. Select Slack
# 3. Webhook URL: [from Slack app]
# 4. Channel: #incidents
# 5. Test → Save
```

**Email**:
```bash
# Edit /etc/grafana/grafana.ini
[smtp]
enabled = true
host = smtp.gmail.com:587
user = alerts@zeronettbank.com
password = [app_password]
from_address = alerts@zeronettbank.com
from_name = ZeroNetBank Monitoring

# Restart Grafana
sudo systemctl restart grafana-server
```

**PagerDuty** (for P0 alerts):
```bash
# In Grafana:
# 1. Alerting → Contact points → New contact point
# 2. Select PagerDuty
# 3. Integration Key: [from PagerDuty]
# 4. Severity: critical
# 5. Test → Save
```

---

## 📊 SAMPLE QUERIES (Copy-Paste Ready)

### Query 1: Real-time Sync Activity

```sql
SELECT
  DATE_TRUNC('minute', created_at) as time,
  COUNT(*) FILTER (WHERE status = 'success') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(response_time_ms) as avg_response_time
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY 1
ORDER BY 1;
```

### Query 2: Top Active Wallets (Last 24 Hours)

```sql
SELECT
  wallet_id,
  COUNT(*) as sync_count,
  MAX(created_at) as last_sync
FROM wallet_sync_log
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY wallet_id
ORDER BY COUNT(*) DESC
LIMIT 10;
```

### Query 3: Credit Issuance Trend

```sql
SELECT
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as credits_issued,
  SUM(amount_cents) / 100.0 as total_usd
FROM bank_ledger
WHERE entry_type = 'CREDIT'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

### Query 4: Database Table Sizes

```sql
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;
```

### Query 5: Audit Log Recent Actions

```sql
SELECT
  action,
  actor_type,
  actor_id,
  description,
  created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 50;
```

---

## ✅ PRE-DEPLOYMENT CHECKLIST

- [ ] Grafana installed and accessible
- [ ] PostgreSQL data source configured (read-only user)
- [ ] Redis data source configured
- [ ] All 5 critical metrics displaying correctly
- [ ] Alert rules created for P0 incidents
- [ ] Notification channels tested (Slack, Email, PagerDuty)
- [ ] Operations dashboard imported
- [ ] Security dashboard imported
- [ ] Executive dashboard created
- [ ] Public status page deployed
- [ ] Documentation provided to on-call team
- [ ] Historical data backfilled (if migrating)
- [ ] Alerting tested with synthetic incidents

---

## 🔁 MONITORING MAINTENANCE

**Weekly**:
- Review alert noise (false positives?)
- Adjust thresholds if needed
- Check dashboard performance (slow queries?)

**Monthly**:
- Review alert response times
- Update dashboards with new metrics
- Archive old data (if needed)

**Quarterly**:
- Security audit of monitoring access
- Review and update severity levels
- Test disaster recovery (simulate P0 incident)

---

**Document Version**: 1.0  
**Last Updated**: January 27, 2026  
**Owner**: Engineering Team + Operations  
**Maintained By**: On-call rotation
