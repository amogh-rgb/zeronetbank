import { supabase } from './supabase';

export const SYSTEM_VAULT_PHONE = 'BANK_VAULT';
export const SYSTEM_ADMIN_PHONE = 'BANK_ADMIN';

const SYSTEM_PUBLIC_KEY_VAULT =
  '04b34397b23a39751422c836851f4f5b28aea13fdb9721eee22769ddfcd0dd01abfd1b603cd16911d381b216062e56554eb1e7b9d1f69e49d42303d908f2ec1d95';
const SYSTEM_PUBLIC_KEY_ADMIN =
  '04531f25f9388d13f62488aa58e9b284526d8e59235c691ee82f71df670113195e375bae035c7e80cbad778707e2eb4c43f9df00219eba220796eeaf568b1e3fbc';

async function upsertWallet(payload: Record<string, unknown>) {
  const { error } = await supabase.from('wallets').upsert(payload, {
    onConflict: 'wallet_id',
  });
  if (error) {
    throw error;
  }
}

export async function ensureSupabaseSystemState() {
  // Check if system records exist before initializing (avoid resetting vault balance)
  const { data: vaultWallet } = await supabase
    .from('wallets')
    .select('wallet_id')
    .eq('wallet_id', SYSTEM_VAULT_PHONE)
    .maybeSingle();

  if (!vaultWallet) {
    await upsertWallet({
      wallet_id: SYSTEM_VAULT_PHONE,
      phone: SYSTEM_VAULT_PHONE,
      email: null,
      public_key: SYSTEM_PUBLIC_KEY_VAULT,
      display_name: 'Bank Vault',
      balance: 0,
      trust_score: 100,
    });
  }

  const { data: adminWallet } = await supabase
    .from('wallets')
    .select('wallet_id')
    .eq('wallet_id', SYSTEM_ADMIN_PHONE)
    .maybeSingle();

  if (!adminWallet) {
    await upsertWallet({
      wallet_id: SYSTEM_ADMIN_PHONE,
      phone: SYSTEM_ADMIN_PHONE,
      email: null,
      public_key: SYSTEM_PUBLIC_KEY_ADMIN,
      display_name: 'Bank Admin',
      balance: 0,
      trust_score: 100,
    });
  }

  const { data: bankState } = await supabase
    .from('bank_state')
    .select('id')
    .eq('id', 1)
    .maybeSingle();

  if (!bankState) {
    const { error } = await supabase.from('bank_state').upsert(
      {
        id: 1,
        vault_balance: 1000000,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (error) {
      throw error;
    }
  }
}

export async function getSupabaseBankState() {
  const { data, error } = await supabase
    .from('bank_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (!error && data) {
    return data;
  }

  await ensureSupabaseSystemState();

  const { data: state, error: retryError } = await supabase
    .from('bank_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (retryError || !state) {
    throw retryError ?? new Error('Bank state unavailable');
  }

  return state;
}
