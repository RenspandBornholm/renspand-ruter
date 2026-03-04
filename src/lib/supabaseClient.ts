import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://oqwofgamwudwbgbpgxsf.supabase.com";
const supabaseAnonKey = "sb_publishable_lRYvoYHv9HTd-JgUgnJzEg_Yk6zpyAj";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);