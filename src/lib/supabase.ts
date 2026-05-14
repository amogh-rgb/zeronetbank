import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger';

// Supabase client configuration
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

// Create Supabase client with service role (backend only)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: 'public',
  },
});

// Test connection
export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('wallets')
      .select('wallet_id', { count: 'exact', head: true });
    if (error) {
      logger.error('Supabase connection test failed:', error);
      return false;
    }
    logger.info('Supabase connection successful');
    return true;
  } catch (err) {
    logger.error('Supabase connection test error:', err);
    return false;
  }
}

// Helper function to execute RPC calls
export async function executeRpc(functionName: string, params: Record<string, any>) {
  const { data, error } = await supabase.rpc(functionName, params);
  if (error) {
    throw error;
  }
  return data;
}

// Realtime subscription helper
export function subscribeToWalletBalance(
  walletId: string,
  callback: (payload: any) => void
) {
  return supabase
    .channel(`wallet-${walletId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'wallets',
        filter: `wallet_id=eq.${walletId}`,
      },
      callback
    )
    .subscribe();
}

export default supabase;
