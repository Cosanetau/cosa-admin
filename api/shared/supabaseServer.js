import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

export function createServerSupabaseClient(url, key, options = {}) {
  const { realtime, ...rest } = options;

  return createClient(url, key, {
    ...rest,
    realtime: {
      transport: ws,
      ...realtime,
    },
  });
}
