import { get, post } from './client';

export interface LinkedWallet {
  wallet_id: string;
  status: string | null;
  activation_at: string | null;
  approved_at: string | null;
  public_key: string;
  wallet_status: string;
  created_at: string;
  last_sync_at: string | null;
}

export interface LedgerEntry {
  id: number;
  entry_type: string;
  credit_id: string | null;
  wallet_id: string | null;
  wallet_public_key: string;
  amount_cents: number;
  currency: string;
  description: string;
  hash_chain: string;
  prev_hash: string;
  created_at: string;
  timeline: {
    txAt: string | null;
    ackAt: string | null;
    commitAt: string | null;
    coolingCompleteAt: string | null;
  };
}

export async function getLinkedWallets(): Promise<{ wallets: LinkedWallet[] }> {
  return get('/api/v1/user/wallets');
}

export async function getWalletLedger(walletId: string): Promise<any> {
  return get(`/api/v1/user/wallets/${walletId}/ledger`);
}

export async function linkWallet(payload: {
  walletId: string;
  publicKey: string;
  deviceFingerprint: string;
  timestamp: number;
  signature: string;
}): Promise<any> {
  return post('/api/v1/user/wallets/link', payload);
}

export async function verifyStatement(payload: {
  statement_hash: string;
  bank_signature: string;
}): Promise<any> {
  return post('/api/statements/verify', payload);
}
