import { get, post } from './client';

export interface WalletSummary {
  wallet_id: string;
  public_key: string;
  status: string;
  created_at: string;
  last_sync_at: string | null;
  balance_cents: number;
}

export interface ApprovalRequest {
  id: string;
  request_type: string;
  wallet_public_key: string;
  amount_cents: number;
  description: string;
  status: string;
  approvals?: Array<{ approvedBy: string; approvedAt: string }>;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  entry_type: string;
  credit_id: string | null;
  wallet_public_key: string;
  amount_cents: number;
  currency: string;
  issuer_admin_id: string | null;
  description: string;
  signed_by: string;
  hash_chain: string;
  prev_hash: string;
  created_at: string;
}

export interface AdminProfile {
  adminId: string;
  role: string;
  permissions: string[];
}

export async function getWallets(): Promise<{ wallets: WalletSummary[] }> {
  return get('/api/v1/admin/wallets');
}

export async function getAdminProfile(): Promise<AdminProfile> {
  return get('/api/v1/admin/me');
}

export async function sendAdminOtp(payload: { deviceFingerprint: string }): Promise<any> {
  return post('/api/v1/admin/otp/send', payload);
}

export async function getLedger(): Promise<{ entries: LedgerEntry[] }> {
  return get('/api/v1/admin/ledger');
}

export async function getAuditLogs(): Promise<{ entries: any[] }> {
  return get('/api/v1/admin/audit-logs');
}

export async function getApprovalRequests(): Promise<{ requests: ApprovalRequest[] }> {
  return get('/api/v1/admin/approval-requests');
}

export async function createCredit(payload: {
  walletPublicKey: string;
  amountCents: number;
  description: string;
}): Promise<any> {
  return post('/api/v1/admin/credits/create', payload);
}

export async function approveRequest(id: string, otpCode: string, deviceFingerprint: string): Promise<any> {
  return post(`/api/v1/admin/approval/${id}/approve`, { otpCode, deviceFingerprint });
}

export async function rejectRequest(id: string, otpCode: string, deviceFingerprint: string): Promise<any> {
  return post(`/api/v1/admin/approval/${id}/reject`, { otpCode, deviceFingerprint });
}

export async function getContainmentStatus(): Promise<any> {
  return get('/api/v1/admin/containment/status');
}

export async function setContainmentMode(
  mode: string,
  reason: string,
  otpCode: string,
  deviceFingerprint: string
): Promise<any> {
  return post('/api/v1/admin/containment/set', { mode, reason, otpCode, deviceFingerprint });
}

export async function activateContainment(
  approvalId: string,
  mode: string,
  otpCode: string,
  deviceFingerprint: string
): Promise<any> {
  return post('/api/v1/admin/containment/activate', {
    approval_id: approvalId,
    mode,
    otpCode,
    deviceFingerprint,
  });
}
