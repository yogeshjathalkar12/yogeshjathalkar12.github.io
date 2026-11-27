import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { relativeTime, TYPE_ICON } from '../../lib/crmHelpers';
import { useColumn } from '../../hooks/useColumn';
import { useOrg } from '../../hooks/OrgContext';
import { type ActivityLine, chunks, mergeActivity, newLine, whereFrom } from '../../lib/timeline';
import { fieldInputStyle, fieldLabelStyle, toolPrimaryStyle } from './Modal';

// Notes, calls, meetings and messages of one deal or one company, with a box to add a line. Shows nothing until
// 2026-11-28_d_record_activity.sql has been run.

const TYPES: [string, string][] = [['note', 'Note'], ['call', 'Call'], ['meeting', 'Meeting'], ['email', 'Email']];
const SHOW_AT_FIRST = 20;
/** The call a history line was written for (2026-11-30_d_call_history.sql), or ''. */
const callOf = (line: any): string => (typeof line.source_ref === 'string' && line.source_ref.startsWith('call:') ? line.source_ref.slice(5) : '');

type Props = { dealId?: string; contactId?: string | null; companyId?: string };

export default function ActivityTimeline({ dealId, contactId, companyId }: Props) {
  const installed = useColumn('interactions', 'deal_id');
  const { can } = useOrg();
  const [lines, setLines] = useState<ActivityLine[] | null>(null);
  const [names, setNames] = useState<{ contacts: Record<string, string>; deals: Record<string, string> }>({ contacts: {}, deals: {} });
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    if (!installed) return;
    const read = (column: string, values: string[]) =>
      Promise.all(chunks(values).map((part) => selectAll<ActivityLine>(() => supabase.from('interactions').select('*').in(column, part))));
    try {
      const contacts: Record<string, string> = {};
      const deals: Record<string, string> = {};
      let wanted: [string, string[]][] = [];
      if (dealId) {
        wanted = [['deal_id', [dealId]], ...(contactId ? [['contact_id', [contactId]] as [string, string[]]] : [])];
        if (contactId) {
          const { data } = await supabase.from('contacts').select('id, name').eq('id', contactId);
          for (const c of data || []) contacts[c.id] = c.name;
        }
      } else if (companyId) {
        const [people, theirDeals] = await Promise.all([
          selectAll<any>(() => supabase.from('contacts').select('id, name').eq('company_id', companyId)),
          selectAll<any>(() => supabase.from('deals').select('id, title').eq('company_id', companyId)),
        ]);
        for (const c of people.data || []) contacts[c.id] = c.name;
        for (const d of theirDeals.data || []) deals[d.id] = d.title;
        wanted = [['company_id', [companyId]], ['contact_id', Object.keys(contacts)], ['deal_id', Object.keys(deals)]];
      }
      const results = (await Promise.all(wanted.map(([column, values]) => read(column, values)))).flat();
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      setNames({ contacts, deals });
      setLines(mergeActivity(...results.map((r) => r.data || [])));
      setError('');
    } catch (e: any) {
      setError(e.message || 'Could not load the activity.');
    }
  }, [installed, dealId, contactId, companyId]);

  useEffect(() => { setLines(null); setAll(false); load(); }, [load]);

  if (!installed) return null;

  async function add() {
    if (!content.trim()) return;
    setSaving(true);
    setError('');
    const { error: insertError } = await supabase.from('interactions').insert(newLine(type, content, { dealId, companyId, contactId }));
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    if (dealId && contactId) await supabase.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contactId);
    setContent('');
    setSaving(false);
    load();
  }

  const shown = all ? lines || [] : (lines || []).slice(0, SHOW_AT_FIRST);
  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
      <div style={{ ...fieldLabelStyle, marginBottom: 8 }}>Activity</div>
      {can('create') && (
        // not a <form>: this sits inside dialogs that have forms of their own
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
          <select aria-label="Kind of activity" style={{ ...fieldInputStyle, width: 'auto', marginBottom: 0 }} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <textarea aria-label="What happened" placeholder="What happened?" style={{ ...fieldInputStyle, flex: '1 1 220px', minHeight: 38, marginBottom: 0 }} value={content} onChange={(e) => setContent(e.target.value)} />
          <button type="button" style={toolPrimaryStyle} disabled={saving || !content.trim()} onClick={add}>{saving ? 'Adding…' : 'Add'}</button>
        </div>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: '0.62rem', marginBottom: 8 }}>{error}</div>}
      {lines === null && !error && <div style={{ fontSize: '0.62rem', color: 'var(--dim)' }}>Loading…</div>}
      {lines?.length === 0 && <div style={{ fontSize: '0.62rem', color: 'var(--dim2)' }}>Nothing recorded yet.</div>}
      {shown.map((line) => {
        const from = whereFrom(line, { dealId, companyId }, names);
        return (
          <div key={line.id} style={{ display: 'flex', gap: 10, padding: '0.5rem 0', borderTop: '1px solid var(--border)', fontSize: '0.66rem' }}>
            <span aria-hidden="true">{TYPE_ICON[line.type] || '•'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} dir="auto">{line.content}</div>
              {callOf(line) && <a href={`#/calls/${callOf(line)}`} style={{ color: 'var(--purple)', fontSize: '0.58rem' }}>Open the call</a>}
              <div style={{ color: 'var(--dim2)', fontSize: '0.56rem' }}>{line.type}{from ? ` · ${from}` : ''} · {relativeTime(line.created_at)}</div>
            </div>
          </div>
        );
      })}
      {!all && (lines?.length || 0) > SHOW_AT_FIRST && <button type="button" style={{ background: 'none', border: 'none', color: 'var(--purple)', cursor: 'pointer', fontSize: '0.62rem', padding: 0, marginTop: 6 }} onClick={() => setAll(true)}>Show all {lines?.length}</button>}
    </div>
  );
}
