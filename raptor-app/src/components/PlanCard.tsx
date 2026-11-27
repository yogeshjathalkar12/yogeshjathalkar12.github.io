import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { usageLines } from '../lib/plans';
import type { Entitlements } from '../lib/plans';

const PRICING_URL = 'https://shoonyaorigins.com/ventures/raptor/pricing/';

// The organization's plan, its end date and how much of each limit is used. Shows nothing until the database part
// (2026-11-27_plans.sql) is installed, or if it cannot be read.
export default function PlanCard() {
  const [ent, setEnt] = useState<Entitlements | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(supabase.rpc('my_entitlements'))
      .then(({ data, error }) => { if (!cancelled && !error && data) setEnt(data as Entitlements); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (!ent) return null;
  const lines = usageLines(ent);
  const ends = ent.expires_at ? new Date(ent.expires_at).toLocaleDateString() : null;
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1.2rem 1.4rem', background: 'var(--surface)', marginBottom: '1.4rem' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--purple)' }}>Your plan</div>
      <div style={{ fontSize: '1.1rem', color: 'var(--white)', margin: '0.4rem 0' }}>{ent.expired ? `${ent.plan} (ended)` : ent.plan}</div>
      {ends && <div style={{ fontSize: '0.65rem', color: ent.expired ? 'var(--red)' : 'var(--dim)' }}>{ent.expired ? `Ended on ${ends}. Paid features are switched off until it is renewed.` : `Runs until ${ends}`}</div>}
      {lines.map((l) => (
        <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.7rem', padding: '0.35rem 0', borderTop: '1px solid var(--border)', marginTop: 6 }}>
          <span style={{ color: 'var(--dim)' }}>{l.label}</span>
          <span style={{ color: l.full ? 'var(--red)' : 'var(--white)' }}>{l.used.toLocaleString('en-IN')} of {l.limit.toLocaleString('en-IN')}</span>
        </div>
      ))}
      <a href={PRICING_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: '0.8rem', fontSize: '0.65rem', color: 'var(--purple)' }}>See plans</a>
    </div>
  );
}
