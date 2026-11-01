import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env";

// Used only to verify access tokens. It never stores a session and holds
// no service-role key, so it cannot act as any user.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
