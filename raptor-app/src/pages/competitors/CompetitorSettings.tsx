import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { optional, saved } from '../../lib/callsData';
import { useOrg } from '../../hooks/OrgContext';
import { Needs, Page, Problem, body, card, heading, small } from '../../components/calls/bits';
import { ChatChannel } from '../../components/competitors/ChatChannel';

interface Watch { cloud_watch: boolean; weekly_digest: boolean; last_digest_at: string | null }

export default function CompetitorSettings() {
  const { isOwner } = useOrg();
  const [row, setRow] = useState<Watch | null>(null);
  const [exists, setExists] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => optional<Watch>(() => supabase.from('competitor_watch').select('cloud_watch, weekly_digest, last_digest_at').limit(1))
    .then((r) => { setInstalled(r.installed); setExists(r.rows.length > 0); setRow(r.rows[0] || { cloud_watch: false, weekly_digest: false, last_digest_at: null }); setLoaded(true); })
    .catch((e) => { setError(e.message); setLoaded(true); }), []);
  useEffect(() => { load(); }, [load]);
  if (!installed) return <Page><Needs file="2026-11-30_h_competitor_feed.sql" /><ChatChannel /></Page>;

  const set = async (patch: Partial<Watch>) => {
    setError('');
    try {
      const change = { ...patch, updated_at: new Date().toISOString() };
      await saved(exists ? supabase.from('competitor_watch').update(change).not('owner_id', 'is', null).select('owner_id') : supabase.from('competitor_watch').insert(change).select('owner_id'),
        'Only the owner may change these.');
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <Page>
      <Problem text={error} />
      {!loaded && <div style={small}>Loading…</div>}
      {row && (
        <>
          <div style={card}>
            <div style={heading}>Watching while every PC is off</div>
            <label style={body}><input type="checkbox" checked={row.cloud_watch} disabled={!isOwner} onChange={(e) => set({ cloud_watch: e.target.checked })} /> Let Raptor’s server check competitors’ public pages</label>
            <div style={small}>
              The server reads each competitor’s home and pricing pages about twice a day and reports what changed, with no AI and no data of yours
              beyond the list of addresses. It follows each site’s rules about automated visits. This starts once the server’s schedule has been switched on.
            </div>
          </div>
          <div style={card}>
            <div style={heading}>Weekly digest</div>
            <label style={body}><input type="checkbox" checked={row.weekly_digest} disabled={!isOwner} onChange={(e) => set({ weekly_digest: e.target.checked })} /> Email the team what changed, once a week</label>
            <div style={small}>Sent to the active members of your organization from Raptor’s address, only in a week with something to report.
              {row.last_digest_at ? ` Last sent ${new Date(row.last_digest_at).toLocaleDateString()}.` : ''}</div>
          </div>
          {!isOwner && <div style={{ ...small, marginBottom: '1rem' }}>Only your organization’s owner can change these.</div>}
        </>
      )}
      <ChatChannel />
    </Page>
  );
}
