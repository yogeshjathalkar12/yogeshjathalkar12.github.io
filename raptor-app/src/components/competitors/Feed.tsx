// Entries of the competitor feed, with marking as important or hidden.
import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { saved } from '../../lib/callsData';
import { KIND_NAMES, type Update } from '../../lib/competitors/insight';
import { useOrg } from '../../hooks/OrgContext';
import { relativeTime } from '../../lib/crmHelpers';
import { Problem, body, card, link, small } from '../calls/bits';

export default function Feed({ updates, names, onChange }: { updates: Update[]; names?: Record<string, string>; onChange: (u: Update) => void }) {
  const { can } = useOrg();
  const [error, setError] = useState('');
  const mark = async (u: Update, status: Update['status']) => {
    setError('');
    try {
      await saved(supabase.from('competitor_updates').update({ status }).eq('id', u.id).select('id'), 'You may not change the feed.');
      onChange({ ...u, status });
    } catch (e: any) { setError(e.message); }
  };
  return (
    <>
      <Problem text={error} />
      {updates.map((u) => (
        <div key={u.id} style={{ ...card, borderLeft: `3px solid ${u.status === 'important' ? 'var(--purple)' : u.significance === 'high' ? 'var(--amber, #f59e0b)' : 'var(--border)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={small}>{names?.[u.competitor_id] ? `${names[u.competitor_id]} · ` : ''}{KIND_NAMES[u.kind] || u.kind} · {relativeTime(u.happened_at)}{u.status === 'important' ? ' · marked important' : ''}</div>
              <div style={body} dir="auto">{u.title}</div>
              {u.summary && <div style={small} dir="auto">{u.summary}</div>}
              {u.details?.implication && <div style={small} dir="auto">What it may mean: {u.details.implication}</div>}
              {(u.details?.added?.length > 0 || u.details?.removed?.length > 0) && (
                <details style={small}>
                  <summary style={{ cursor: 'pointer' }}>What changed on the page</summary>
                  {(u.details.added || []).map((l: string, i: number) => <div key={`a${i}`} style={{ color: 'var(--green, #22c55e)' }} dir="auto">+ {l}</div>)}
                  {(u.details.removed || []).map((l: string, i: number) => <div key={`r${i}`} style={{ color: 'var(--red)' }} dir="auto">− {l}</div>)}
                </details>
              )}
              {u.url && /^https?:\/\//i.test(u.url) && <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ ...link, textDecoration: 'none' }}>Open the source</a>}
            </div>
            {can('edit') && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <button type="button" style={link} onClick={() => mark(u, u.status === 'important' ? 'new' : 'important')}>{u.status === 'important' ? 'Unmark' : 'Important'}</button>
                <button type="button" style={link} onClick={() => mark(u, u.status === 'hidden' ? 'new' : 'hidden')}>{u.status === 'hidden' ? 'Show again' : 'Hide'}</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
