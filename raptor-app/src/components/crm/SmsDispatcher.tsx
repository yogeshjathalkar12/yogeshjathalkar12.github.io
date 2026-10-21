import { useEffect } from 'react';
import { smsApi } from '../../pages/connections/hub/env';
import { startSmsDispatcher } from '../../pages/connections/hub/smsDispatch';
import { supabase } from '../../lib/supabaseClient';

// Headless, mounted once in the dashboard layout, like WhatsAppDispatcher. See pages/connections/hub/smsDispatch.ts.
export function SmsDispatcher() {
  useEffect(() => startSmsDispatcher({ supabase, api: smsApi }), []);
  return null;
}
