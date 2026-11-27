import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadTrackers, saved } from '../../lib/callsData';
import { checkTracker, STARTERS, WHO_LABELS, type Tracker, type Who } from '../../lib/calls/trackers';
import { useOrg } from '../../hooks/OrgContext';
import { fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import { Needs, Page, Problem, body, card, heading, small } from '../../components/calls/bits';

const REFUSED = 'Only the owner or a member who manages the pipeline may change watch words.';
const BLANK = { id: '', name: '', phrases: '', who: 'any' as Who };

export default function CallsWatchWords() {
  const { isOwner, can } = useOrg();
  const manage = isOwner || can('manage_pipeline');
  const [rows, setRows] = useState<Tracker[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => loadTrackers().then((r) => { setRows(r.rows); setInstalled(r.installed); }).catch((e) => { setRows([]); setError(e.message); }), []);
  useEffect(() => { load(); }, [load]);

  const run = async (change: PromiseLike<{ data: any; error: any }>) => {
    setError('');
    try { await saved(change, REFUSED); await load(); return true; } catch (e: any) { setError(e.message); return false; }
  };
  const save = async () => {
    if (!form) return;
    const checked = checkTracker(form, rows || [], form.id);
    if ('error' in checked) { setError(checked.error); return; }
    const row = { ...checked, who: form.who };
    if (await run(form.id ? supabase.from('call_trackers').update(row).eq('id', form.id).select('id') : supabase.from('call_trackers').insert(row).select('id'))) setForm(null);
  };

  if (!installed) return <Page><Needs file="2026-11-30_c_watch_words.sql" /></Page>;
  const unused = STARTERS.filter((s) => !(rows || []).some((t) => t.name.toLowerCase() === s.name.toLowerCase()));

  return (
    <Page>
      <div style={{ ...small, marginBottom: 12 }}>Words and phrases counted in every call, in any language: competitors, discounts, product names, objections. Old calls are counted too.</div>
      <Problem text={error} />
      {rows === null && <div style={small}>Loading…</div>}
      {rows?.map((t) => (
        <div key={t.id} style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <input type="checkbox" aria-label={`Count ${t.name}`} checked={t.is_active} disabled={!manage} onChange={() => run(supabase.from('call_trackers').update({ is_active: !t.is_active }).eq('id', t.id).select('id'))} />
          <strong style={body}>{t.name}</strong>
          <span style={{ ...small, flex: 1, minWidth: 160 }} dir="auto">{WHO_LABELS[t.who]}: {t.phrases.join(', ')}</span>
          {manage && <button type="button" style={toolBtnStyle} onClick={() => { setError(''); setForm({ id: t.id, name: t.name, phrases: t.phrases.join('\n'), who: t.who }); }}>Edit</button>}
          {manage && <button type="button" style={toolBtnStyle} onClick={() => { if (window.confirm(`Delete the watch word "${t.name}"?`)) run(supabase.from('call_trackers').delete().eq('id', t.id).select('id')); }}>Delete</button>}
        </div>
      ))}
      {rows?.length === 0 && <div style={{ ...small, marginBottom: 10 }}>No watch words yet.</div>}
      {manage && !form && rows !== null && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" style={toolPrimaryStyle} onClick={() => { setError(''); setForm(BLANK); }}>New watch word</button>
          {unused.map((s) => <button key={s.name} type="button" style={toolBtnStyle} onClick={() => run(supabase.from('call_trackers').insert(s).select('id'))}>+ {s.name}</button>)}
        </div>
      )}
      {form && (
        <div style={{ ...card, maxWidth: 560 }}>
          <div style={heading}>{form.id ? 'Change watch word' : 'New watch word'}</div>
          <input aria-label="Name" placeholder="Name, e.g. Competitors" style={fieldInputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea aria-label="Phrases" dir="auto" rows={5} placeholder="One word or phrase per line, or separated by commas" style={fieldInputStyle} value={form.phrases} onChange={(e) => setForm({ ...form, phrases: e.target.value })} />
          <label style={small}>Said by{' '}
            <select aria-label="Said by" style={{ ...fieldInputStyle, width: 'auto' }} value={form.who} onChange={(e) => setForm({ ...form, who: e.target.value as Who })}>
              {Object.entries(WHO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={toolPrimaryStyle} onClick={save}>Save watch word</button>
            <button type="button" style={toolBtnStyle} onClick={() => { setForm(null); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </Page>
  );
}
