// Signs found on a watched company's public pages (hiring, funding, expansion, a new leader). db/migrations/2026-12-01_c_company_signals.sql;
// the looking is done by the server's scheduled run. Where that database part is missing, nothing is shown.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { SIGNAL_NAMES, problemText, type CompanySignal, type Watch } from '../../lib/companySignals';
import { useOrg } from '../../hooks/OrgContext';

const small: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 };
const link: React.CSSProperties = { background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.62rem', padding: 0 };

export function SignalRows({ rows, onDismiss, withCompany }: { rows: CompanySignal[]; onDismiss?: (id: string) => void; withCompany?: boolean }) {
  return (
    <>
      {rows.map((s) => (
        <div key={s.id} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.68rem', color: 'var(--white)', lineHeight: 1.6 }}>
            <strong>{SIGNAL_NAMES[s.kind] || s.kind}</strong>{withCompany && s.companies?.name ? ` · ${s.companies.name}` : ''}: <span dir="auto">{s.title}</span>
          </div>
          <div style={small}>
            Found {new Date(s.found_at).toLocaleDateString()}
            {s.url && /^https?:\/\//i.test(s.url) && <> · <a href={s.url} target="_blank" rel="noopener noreferrer" style={link}>See the page</a></>}
            {withCompany && <> · <Link to="/crm/companies" style={link}>Companies</Link></>}
            {onDismiss && <> · <button type="button" style={link} onClick={() => onDismiss(s.id)}>Dismiss</button></>}
          </div>
        </div>
      ))}
    </>
  );
}

export default function CompanySignals({ companyId, website }: { companyId: string; website?: string | null }) {
  const { can } = useOrg();
  const [watch, setWatch] = useState<Watch | null | undefined>(undefined);
  const [rows, setRows] = useState<CompanySignal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const found = await supabase.from('company_watch').select('company_id, checked_at, last_problem').eq('company_id', companyId).limit(1);
    if (found.error) {
      if (!isNotInstalled(found.error)) setError(found.error.message);
      return;
    }
    setWatch((found.data?.[0] as Watch) || null);
    const signals = await supabase.from('company_signals').select('*').eq('company_id', companyId).neq('status', 'dismissed').order('found_at', { ascending: false }).limit(20);
    setRows((signals.data || []) as CompanySignal[]);
  }, [companyId]);
  useEffect(() => { setWatch(undefined); setRows([]); setError(''); load(); }, [load]);

  if (watch === undefined) return error ? <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div> : null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError('');
    const { error: failed } = on ? await supabase.from('company_watch').insert({ company_id: companyId }) : await supabase.from('company_watch').delete().eq('company_id', companyId);
    if (failed) setError(/row-level security|permission/i.test(failed.message) ? 'You may not change this.' : failed.message);
    setBusy(false);
    load();
  };
  const dismiss = async (id: string) => {
    const { error: failed } = await supabase.from('company_signals').update({ status: 'dismissed' }).eq('id', id);
    if (failed) setError(failed.message);
    load();
  };
  const problem = watch ? problemText(watch.last_problem) : '';

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ ...small, color: 'var(--white)', display: 'block', marginBottom: 4 }}>
        <input type="checkbox" checked={Boolean(watch)} disabled={busy || !can('edit') || (!watch && !website)} onChange={(e) => toggle(e.target.checked)} /> Watch this company for hiring, funding and other changes
      </label>
      <div style={small}>
        {!website && !watch ? 'Add a website to watch it.'
          : watch ? `${watch.checked_at ? `Last looked ${new Date(watch.checked_at).toLocaleDateString()}.` : 'Not looked at yet: the first visit only notes what the pages say now.'}${problem ? ` ${problem}` : ''}`
            : 'Its public pages are read every few days. This works once the server’s schedule has been switched on.'}
      </div>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div>}
      {rows.length > 0 && <div style={{ marginTop: 8 }}><SignalRows rows={rows} onDismiss={can('edit') ? dismiss : undefined} /></div>}
    </div>
  );
}
