export const isSupabaseMode = Boolean(
  process.env.SUPABASE_URL?.trim() &&
  process.env.SUPABASE_SERVICE_KEY?.trim(),
);

