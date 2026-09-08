export function supabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseAnonKey());
}

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = supabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error("Supabase environment variables are missing.");
  }
  return { url, anonKey };
}
