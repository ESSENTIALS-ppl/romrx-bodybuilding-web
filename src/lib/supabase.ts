import { createClient } from '@supabase/supabase-js'

// Project: romrxbjj-v2 (cqzvqzwwevnflinxgnpp) — shared backend with romrxbjj.com
// The anon key is safe to expose in client bundles (it's the public, RLS-protected key).
// Prefer VITE_SUPABASE_ANON_KEY=sb_publishable_… in Netlify (H6). Fallback is the project
// default publishable key. Legacy anon JWT must stay enabled until after Oct 12 (H8).
const FALLBACK_URL  = 'https://cqzvqzwwevnflinxgnpp.supabase.co'
const FALLBACK_ANON = 'sb_publishable_LEhqcjJlqc4a_b14VqZwgw_DgQN8YnA'

export const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL  as string) || FALLBACK_URL
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || FALLBACK_ANON

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]
