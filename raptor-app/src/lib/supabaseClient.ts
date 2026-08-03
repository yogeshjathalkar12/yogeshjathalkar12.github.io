import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Previously created 10 separate times (once per HTML file, each with its
// own `const supabaseClient = ...`). One instance now — auth state,
// realtime subscriptions, and the session cache are all shared correctly
// across the whole app instead of being reset every time you navigate
// between "pages."
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
