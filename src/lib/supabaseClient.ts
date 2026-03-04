import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://oqwofgamwudwgbpgxsf.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_lRYvoYHv9HTd-JgUgnJzEg_Yk6zpyAj";

// OBS: Lad være med at throw'e ved import – det kan drille build/runtime på Vercel.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : (null as any);