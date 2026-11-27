import { useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';

// Asks the database to write the "a task is due" notifications this person is owed (db/migrations/2026-11-28_c_task_reminders.sql):
// when the app opens, every few minutes, and when the window is looked at again. The notification bell shows what arrives. Draws nothing.

export const REMINDER_EVERY_MS = 5 * 60 * 1000;

export default function TaskReminders() {
  useEffect(() => {
    let stopped = false;
    let last = 0;
    const ask = async () => {
      if (stopped || Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const { error } = await supabase.rpc('task_reminders_run');
        if (isNotInstalled(error)) stopped = true;        // the database part is not there: do not keep asking
      } catch { /* offline: try again later */ }
    };
    ask();
    const timer = setInterval(ask, REMINDER_EVERY_MS);
    window.addEventListener('focus', ask);
    return () => { stopped = true; clearInterval(timer); window.removeEventListener('focus', ask); };
  }, []);
  return null;
}
