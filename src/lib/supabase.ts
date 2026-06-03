import { createClient } from '@supabase/supabase-js'

// Project: romrxbjj-v2 (cqzvqzwwevnflinxgnpp) — shared backend with romrxbjj.com
// The anon key is safe to expose in client bundles (it's the public, RLS-protected key).
// Override via VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in Netlify if needed (e.g. for staging).
const FALLBACK_URL  = 'https://cqzvqzwwevnflinxgnpp.supabase.co'
const FALLBACK_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxenZxend3ZXZuZmxpbnhnbnBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDk2MjQsImV4cCI6MjA5Mjg4NTYyNH0.XsY-Y2VFoPc3RiPQ8HZNlygeKK52GSB7hiy4ZCTXsP4'

export const SUPABASE_URL  = (import.meta.env.VITE_SUPABASE_URL  as string) || FALLBACK_URL
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || FALLBACK_ANON

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]
