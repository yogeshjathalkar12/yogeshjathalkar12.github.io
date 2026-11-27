import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { activeCurrencyCode } from '../../lib/currency';
import { CURRENCIES } from '../../lib/quotes';
import type { Rate } from '../../lib/fx';
import Modal, { fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from './Modal';

// The exchange rates deals in other currencies start from (owner or admin).

export default function CurrencyRatesModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const own = activeCurrencyCode();
  const [rates, setRates] = useState<(Rate & { updated_at?: string })[]>([]);
  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data, error: failed } = await supabase.from('currency_rates').select('code, rate, updated_at').order('code');
    if (failed) { setError(failed.message); return; }
    setRates((data || []) as Rate[]);
  }
  useEffect(() => { if (open) { setError(''); setMessage(''); setCode(''); setRate(''); load(); } }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(rate);
    if (!code) { setError('Choose the currency.'); return; }
    if (!(n > 0)) { setError(`Type what 1 ${code} is worth in ${own}.`); return; }
    setError(''); setMessage('');
    const { error: failed } = rates.some((r) => r.code === code)
      ? await supabase.from('currency_rates').update({ rate: n, updated_at: new Date().toISOString() }).eq('code', code)
      : await supabase.from('currency_rates').insert({ code, rate: n });
    if (failed) { setError(failed.message); return; }
    setMessage(`Saved. New ${code} deals start at this rate; deals you already have keep theirs unless you apply it.`);
    setCode(''); setRate('');
    load();
  }

  async function apply(r: Rate) {
    if (!confirm(`Use 1 ${r.code} = ${Number(r.rate)} ${own} on every open deal in ${r.code}? Their values change. Won and lost deals keep their rate.`)) return;
    setError('');
    const { data, error: failed } = await supabase.rpc('crm_apply_rate', { p_code: r.code });
    if (failed) { setError(failed.message); return; }
    setMessage(`${Number(data) || 0} open deal(s) updated.`);
    onChanged();
  }

  async function remove(r: Rate) {
    if (!confirm(`Forget the ${r.code} rate? Deals keep the rate they have.`)) return;
    const { error: failed } = await supabase.from('currency_rates').delete().eq('code', r.code);
    if (failed) { setError(failed.message); return; }
    load();
  }

  return (
    <Modal open={open} onClose={onClose} title="Currencies" width={520}>
      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
        Totals are in <b>{own}</b>, your organization’s currency (Settings → region). Type the rates yourself: Raptor does not fetch them.
      </div>
      {rates.map((r) => (
        <div key={r.code} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', padding: '0.55rem 0', fontSize: '0.72rem' }}>
          <span style={{ flex: 1 }}>1 {r.code} = {Number(r.rate)} {own}{r.updated_at && <span style={{ color: 'var(--dim)' }}> · {new Date(r.updated_at).toLocaleDateString()}</span>}</span>
          <button type="button" style={toolBtnStyle} onClick={() => { setCode(r.code); setRate(String(Number(r.rate))); }}>Change</button>
          <button type="button" style={toolBtnStyle} onClick={() => apply(r)}>Apply to open deals</button>
          <button type="button" style={toolBtnStyle} aria-label={`Forget ${r.code}`} onClick={() => remove(r)}>✕</button>
        </div>
      ))}
      <form onSubmit={save} noValidate style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 'auto' }} aria-label="Currency to add" value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Currency…</option>
          {CURRENCIES.filter((c) => c !== own).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input style={{ ...fieldInputStyle, marginBottom: 0, flex: '1 1 140px', width: 'auto' }} type="number" min="0" step="any" aria-label="Rate" placeholder={`1 unit in ${own}`} value={rate} onChange={(e) => setRate(e.target.value)} />
        <button type="submit" style={toolPrimaryStyle}>Save rate</button>
      </form>
      {message && <div role="status" style={{ fontSize: '0.65rem', color: 'var(--green)', marginTop: 10 }}>{message}</div>}
      {error && <div role="alert" style={{ fontSize: '0.65rem', color: 'var(--red)', marginTop: 10 }}>{error}</div>}
    </Modal>
  );
}
