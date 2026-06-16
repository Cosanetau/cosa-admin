import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://hfyjnejbmelaskfkhpuv.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmeWpuZWpibWVsYXNrZmtocHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMzI1NzIsImV4cCI6MjA5NTcwODU3Mn0.yh5XBAlAtpY9v_A5z7s0uYvbfjaeoIMgMooBKsm9IFY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
