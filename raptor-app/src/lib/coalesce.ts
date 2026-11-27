// Many changes at once (an import, a bulk edit) must not reload a screen once per record. The reload runs after a short quiet moment,
// never twice at the same time, and once more if something changed while it was running.

export interface Coalesced { (): void; cancel: () => void }

export function coalesce(run: () => unknown, quiet = 700, longest = 4000): Coalesced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waitingSince = 0;
  let running = false;
  let again = false;
  let stopped = false;
  const fire = async () => {
    timer = null;
    waitingSince = 0;
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try { await run(); } catch (error) { console.error('Reload failed:', error); }
    running = false;
    if (again) { again = false; trigger(); }
  };
  const trigger = (() => {
    if (stopped) return;
    const now = Date.now();
    if (!waitingSince) waitingSince = now;
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, Math.max(0, Math.min(quiet, waitingSince + longest - now)));     // a steady stream still shows up
  }) as Coalesced;
  trigger.cancel = () => { stopped = true; if (timer) clearTimeout(timer); timer = null; };
  return trigger;
}
