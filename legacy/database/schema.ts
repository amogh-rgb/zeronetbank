/**
 * ZeroNetBank Database Schema
 * 
 * Core principles:
 * - Immutable ledger (append-only)
 * - Hash-chained entries
 * - No UPDATE or DELETE on ledger entries
 * - Full audit trail
 */

export const schema = `
-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, suspended, locked
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  failed_login_attempts INT DEFAULT 0,
  locked_until TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Wallet registry (bank-side identity)
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id VARCHAR(64) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  public_key VARCHAR(255) NOT NULL,
  device_fingerprint VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, frozen, closed
  created_at TIMESTAMP DEFAULT NOW(),
  last_sync_at TIMESTAMP
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_wallets_status ON wallets(status);
CREATE INDEX idx_wallets_public_key ON wallets(public_key);

-- User devices for OTP
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  trusted BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used TIMESTAMP
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_fingerprint ON user_devices(device_fingerprint);

-- ============================================================================
-- ADMIN & RBAC
-- ============================================================================

CREATE TYPE admin_role AS ENUM (
  'SUPER_ADMIN',
  'FINANCE_ADMIN',
  'AUDITOR',
  'SUPPORT'
);

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role admin_role NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  granted_by UUID REFERENCES admin_users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- Dual approval system for credits
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type VARCHAR(50) NOT NULL, -- credit_issuance, freeze_wallet, unfreeze_wallet
  wallet_public_key VARCHAR(255) NOT NULL,
  amount_cents BIGINT,
  description TEXT,
  created_by UUID NOT NULL REFERENCES admin_users(id),
  approvals JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  decision_at TIMESTAMP,
  decided_by UUID REFERENCES admin_users(id)
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_created_at ON approval_requests(created_at);

-- Admin action log with dual approval support
CREATE TABLE IF NOT EXISTS admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type VARCHAR(50) NOT NULL, -- credit_issuance, freeze_wallet, unfreeze_wallet
  wallet_id VARCHAR(64) NOT NULL,
  amount_cents BIGINT,
  description TEXT,
  created_by UUID NOT NULL REFERENCES admin_users(id),
  approvals JSONB DEFAULT '[]'::jsonb,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  created_at TIMESTAMP DEFAULT NOW(),
  decision_at TIMESTAMP,
  decided_by UUID REFERENCES admin_users(id)
);

CREATE INDEX idx_admin_actions_status ON admin_actions(status);
CREATE INDEX idx_admin_actions_created_at ON admin_actions(created_at);

-- ============================================================================
-- IMMUTABLE BANK LEDGER (Core)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_ledger (
  id BIGSERIAL PRIMARY KEY,
  entry_type VARCHAR(50) NOT NULL, -- CREDIT, FREEZE, UNFREEZE, FEE, ADJUSTMENT
  credit_id VARCHAR(64),
  wallet_id VARCHAR(64),
  wallet_public_key VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL, -- Can be negative for fees
  currency VARCHAR(16) DEFAULT 'USD',
  issuer_admin_id UUID REFERENCES admin_users(id),
  description TEXT,
  signed_by VARCHAR(255), -- Admin user ID or 'SYSTEM'
  wallet_signature VARCHAR(512), -- Optional: wallet signature if initiated by wallet
  bank_signature VARCHAR(512) NOT NULL, -- Always signed by bank
  hash_chain VARCHAR(512) NOT NULL, -- Current entry hash
  prev_hash VARCHAR(512) NOT NULL, -- Previous entry hash
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Immutability enforcement
  CONSTRAINT bank_ledger_immutable UNIQUE (id, hash_chain),
  CONSTRAINT bank_ledger_no_time_travel CHECK (created_at >= NOW() - INTERVAL '1 second')
);

CREATE INDEX idx_bank_ledger_wallet ON bank_ledger(wallet_public_key);
CREATE INDEX idx_bank_ledger_entry_type ON bank_ledger(entry_type);
CREATE INDEX idx_bank_ledger_created_at ON bank_ledger(created_at);
CREATE INDEX idx_bank_ledger_hash_chain ON bank_ledger(hash_chain);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_ledger_credit_id ON bank_ledger(credit_id);

-- View to get balance per wallet
CREATE OR REPLACE VIEW wallet_balances AS
SELECT 
  wallet_public_key,
  SUM(amount_cents) as balance_cents,
  COUNT(*) as transaction_count,
  MAX(created_at) as last_transaction
FROM bank_ledger
GROUP BY wallet_public_key;

-- ============================================================================
-- CREDITS & DISTRIBUTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, distributing, completed, failed
  total_amount_cents BIGINT NOT NULL,
  total_wallets INT NOT NULL,
  approval_id UUID REFERENCES approval_requests(id),
  created_by UUID NOT NULL REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_credit_batches_status ON credit_batches(status);

CREATE TABLE IF NOT EXISTS credit_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES credit_batches(id) ON DELETE CASCADE,
  credit_id VARCHAR(64) NOT NULL,
  wallet_public_key VARCHAR(255) NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency VARCHAR(16) DEFAULT 'USD',
  issuer_admin_id UUID REFERENCES admin_users(id),
  ledger_id BIGINT REFERENCES bank_ledger(id),
  status VARCHAR(50) DEFAULT 'pending', -- pending, delivered, failed
  delivery_signature VARCHAR(512), -- Signed when wallet retrieves during sync
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_credit_distributions_batch ON credit_distributions(batch_id);
CREATE INDEX idx_credit_distributions_wallet ON credit_distributions(wallet_public_key);
CREATE INDEX idx_credit_distributions_status ON credit_distributions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_distributions_credit_id ON credit_distributions(credit_id);

-- ============================================================================
-- WALLET SYNC & FREEZE
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_freeze_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_public_key VARCHAR(255) UNIQUE NOT NULL,
  freeze_reason VARCHAR(255),
  freeze_evidence JSONB,
  frozen_at TIMESTAMP DEFAULT NOW(),
  unfrozen_at TIMESTAMP,
  frozen_by UUID REFERENCES admin_users(id),
  unfrozen_by UUID REFERENCES admin_users(id)
);

CREATE INDEX idx_wallet_freeze_state_wallet ON wallet_freeze_state(wallet_public_key);

CREATE TABLE IF NOT EXISTS wallet_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_public_key VARCHAR(255) NOT NULL,
  sync_nonce VARCHAR(255) NOT NULL, -- Replay protection
  last_ledger_hash VARCHAR(512) NOT NULL, -- What wallet thinks is current
  new_credits_count INT DEFAULT 0,
  freeze_state BOOLEAN DEFAULT false,
  request_signature VARCHAR(512) NOT NULL, -- Signed by wallet
  response_signature VARCHAR(512) NOT NULL, -- Signed by bank
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_sync_log_wallet ON wallet_sync_log(wallet_public_key);
CREATE INDEX idx_wallet_sync_log_created_at ON wallet_sync_log(created_at);
CREATE INDEX idx_wallet_sync_log_nonce ON wallet_sync_log(sync_nonce);

-- Sync sessions for nonce registry and idempotency
CREATE TABLE IF NOT EXISTS sync_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  sync_nonce VARCHAR(255) NOT NULL,
  last_ledger_hash VARCHAR(512) NOT NULL,
  entry_count INT NOT NULL,
  status VARCHAR(50) DEFAULT 'active', -- active, completed, rejected
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_sync_sessions_wallet ON sync_sessions(wallet_id);
CREATE INDEX idx_sync_sessions_nonce ON sync_sessions(sync_nonce);
CREATE INDEX idx_sync_sessions_created_at ON sync_sessions(created_at);

-- ============================================================================
-- SECURITY & FRAUD DETECTION
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallet_trust_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_public_key VARCHAR(255) UNIQUE NOT NULL,
  trust_score DECIMAL(5, 2) DEFAULT 100.0, -- 0-100
  risk_level VARCHAR(50) DEFAULT 'LOW', -- LOW, MEDIUM, HIGH, CRITICAL
  aml_flags TEXT[] DEFAULT '{}',
  last_updated TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(255) DEFAULT 'SYSTEM'
);

CREATE INDEX idx_wallet_trust_scores_risk ON wallet_trust_scores(risk_level);

-- Risk profile (required by architecture)
CREATE TABLE IF NOT EXISTS risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id VARCHAR(64) UNIQUE NOT NULL,
  score DECIMAL(5, 2) DEFAULT 100.0,
  flags TEXT[] DEFAULT '{}',
  anomaly_counters JSONB DEFAULT '{}',
  last_evaluated TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_risk_profiles_score ON risk_profiles(score);

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_public_key VARCHAR(255),
  alert_type VARCHAR(50) NOT NULL, -- unusual_activity, multiple_devices, etc
  severity VARCHAR(50) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
  description TEXT,
  evidence JSONB,
  acknowledged_by UUID REFERENCES admin_users(id),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fraud_alerts_severity ON fraud_alerts(severity);
CREATE INDEX idx_fraud_alerts_created_at ON fraud_alerts(created_at);

-- ============================================================================
-- AUDIT LOGGING
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_type VARCHAR(50) NOT NULL, -- admin, wallet, system
  actor_id VARCHAR(255),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(50), -- success, failure
  error_message TEXT,
  prev_hash VARCHAR(512),
  hash_chain VARCHAR(512),
  bank_signature VARCHAR(512),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, actor_type);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);
CREATE INDEX idx_audit_log_hash_chain ON audit_log(hash_chain);

-- ============================================================================
-- RATE LIMITING & OTP
-- ============================================================================

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES user_devices(id),
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) NOT NULL, -- login, password_reset, device_verify
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_otp_codes_user_id ON otp_codes(user_id);
CREATE INDEX idx_otp_codes_created_at ON otp_codes(created_at);

-- Sessions (refresh tokens)
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(255) NOT NULL,
  device_fingerprint VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Link users to wallets for statements
CREATE TABLE IF NOT EXISTS wallet_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id VARCHAR(64) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, active, rejected
  activation_at TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by VARCHAR(255) DEFAULT 'SYSTEM',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, wallet_id),
  UNIQUE (wallet_id)
);

ALTER TABLE wallet_links ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE wallet_links ADD COLUMN IF NOT EXISTS activation_at TIMESTAMP;
ALTER TABLE wallet_links ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE wallet_links ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255) DEFAULT 'SYSTEM';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_links_wallet_id_unique ON wallet_links(wallet_id);
CREATE INDEX idx_wallet_links_user_id ON wallet_links(user_id);
CREATE INDEX idx_wallet_links_wallet_id ON wallet_links(wallet_id);
CREATE INDEX idx_wallet_links_status ON wallet_links(status);

-- Wallet link approvals (admin override)
CREATE TABLE IF NOT EXISTS wallet_link_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_link_id UUID NOT NULL UNIQUE REFERENCES wallet_links(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  requested_at TIMESTAMP DEFAULT NOW(),
  decided_at TIMESTAMP,
  decided_by_admin UUID REFERENCES admin_users(id),
  reason TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_wallet_link_approvals_status ON wallet_link_approvals(status);
CREATE INDEX idx_wallet_link_approvals_decided_at ON wallet_link_approvals(decided_at);
CREATE INDEX idx_wallet_link_approvals_wallet_link_id ON wallet_link_approvals(wallet_link_id);

-- Bank-wide containment mode
CREATE TABLE IF NOT EXISTS bank_settings (
  key VARCHAR(64) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- BANK KEY ROTATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_key_versions (
  id BIGSERIAL PRIMARY KEY,
  version INT NOT NULL UNIQUE,
  public_key VARCHAR(1024) NOT NULL,
  algorithm VARCHAR(50) DEFAULT 'ECDSA_P256',
  activated_at TIMESTAMP DEFAULT NOW(),
  rotated_at TIMESTAMP,
  rotated_by UUID REFERENCES admin_users(id),
  status VARCHAR(50) DEFAULT 'active' -- active, deprecated, retired
);

CREATE INDEX idx_bank_key_versions_status ON bank_key_versions(status);
`;
