import { useEffect, useMemo, useState } from 'react';
import { CHANNELS } from './channels';
import { api } from './env';
import { countSeries, fmtAgo, fmtNum, leadInsights, leadKey, leadRows } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, Empty, InsightList, Notice, Tile, TileRow, buttonStyle, note } from './ui';

const channel = CHANNELS.find((c) => c.key === 'leads')!;
const DAY = 86400000;

// Every person who fills in a Facebook or Instagram lead form. Raptor shows them the moment Meta tells it, and one press puts a lead into
// the CRM as a contact (a person already there, by email or phone, is never added twice).

export default function LeadsPage(props: PageProps) {
  const stored = props.data.signals.leads;
  const sigs = useMemo(() => stored || [], [stored]);
  const rows = useMemo(() => leadRows(sigs), [sigs]);
  const [inCrm, setInCrm] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const now = Date.now();

  useEffect(() => {
    let alive = true;
    if (!rows.length) { setInCrm(new Set()); return undefined; }
    api.leadsInCrm(rows.slice(0, 100)).then((found) => { if (alive) setInCrm(found); }).catch(() => { if (alive) setInCrm(null); });
    return () => { alive = false; };
  }, [rows]);

  const today = rows.filter((r) => new Date(r.at).getTime() > now - DAY).length;
  const week = rows.filter((r) => new Date(r.at).getTime() > now - 7 * DAY).length;
  const before = rows.filter((r) => { const t = new Date(r.at).getTime(); return t <= now - 7 * DAY && t > now - 14 * DAY; }).length;
  const withPhone = rows.length ? Math.round((rows.filter((r) => r.phone).length / rows.length) * 100) : 0;
  const waiting = inCrm ? rows.filter((r) => !inCrm.has(leadKey(r))) : [];

  async function add(list: typeof rows) {
    setBusy(list.length === 1 ? list[0].id : 'all');
    setMsg(null);
    let added = 0;
    let existed = 0;
    try {
      for (const r of list) {
        const out = await api.addLeadToCrm({ name: r.name, email: r.email, phone: r.phone, company: r.company, campaign: r.campaign, ad: r.ad, leadId: r.id });
        if (out.created) added += 1; else existed += 1;
      }
      setMsg({ tone: 'good', text: `${added ? `${added} ${added === 1 ? 'lead was' : 'leads were'} added to your CRM.` : 'Already in your CRM.'}${existed && added ? ` ${existed} ${existed === 1 ? 'was' : 'were'} already there.` : ''}` });
    } catch (e: any) {
      setMsg({ tone: 'warn', text: e.message });
    } finally {
      setBusy(null);
      api.leadsInCrm(rows.slice(0, 100)).then(setInCrm).catch(() => { /* the buttons stay as they were */ });
    }
  }

  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Leads, last 7 days" value={fmtNum(week)} sub={before ? `${week >= before ? '+' : ''}${fmtNum(week - before)} on the week before` : undefined} tone={week < before ? 'warn' : 'good'} />
        <Tile label="Last 24 hours" value={fmtNum(today)} />
        <Tile label="Not in your CRM yet" value={inCrm ? fmtNum(waiting.length) : '–'} tone={waiting.length ? 'warn' : 'good'} sub={inCrm && !waiting.length ? 'All saved' : undefined} />
        <Tile label="Left a phone number" value={rows.length ? `${withPhone}%` : '–'} />
      </TileRow>

      <div style={grid(360)}>
        <Card title="What this tells you"><InsightList items={leadInsights(sigs, inCrm)} /></Card>
        <Card title="Leads per day, last 14 days"><Bars points={countSeries(sigs, 'lead', 14)} color="#3ecf8e" /></Card>
      </div>

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <Card title="Your leads" right={waiting.length > 1 ? <button type="button" style={buttonStyle('primary', busy !== null)} disabled={busy !== null} onClick={() => add(waiting)}>{busy === 'all' ? 'Adding…' : `Add ${waiting.length} to CRM`}</button> : undefined}>
        {rows.length === 0 ? <Empty>No leads yet. When someone fills in one of your Facebook or Instagram lead forms, they appear here within seconds.</Empty> : rows.slice(0, 40).map((r) => {
          const saved = !!inCrm && inCrm.has(leadKey(r));
          return (
            <div key={r.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 260px' }}>
                <div style={{ color: 'var(--white)', fontSize: 14.5 }}>{r.name || r.email || r.phone || 'Lead'}{r.company ? <span style={note}> · {r.company}</span> : null}</div>
                <div style={{ ...note, fontSize: 12.5, overflowWrap: 'anywhere' }}>{[r.email, r.phone].filter((x) => x && x !== (r.name || r.email || r.phone)).join(' · ') || (r.name || r.email || r.phone ? '' : 'No contact details left')}</div>
                <div style={{ ...note, fontSize: 12 }}>
                  {[r.campaign, r.ad && r.ad !== r.campaign ? r.ad : '', r.platform === 'ig' ? 'Instagram' : r.platform === 'fb' ? 'Facebook' : '', fmtAgo(r.at)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ alignSelf: 'center' }}>
                {saved ? <span style={{ ...note, color: '#3ecf8e' }}>In your CRM</span> : (
                  <button type="button" style={buttonStyle('ghost', busy !== null || (!r.email && !r.phone && !r.name))} disabled={busy !== null || (!r.email && !r.phone && !r.name)} onClick={() => add([r])}>
                    {busy === r.id ? 'Adding…' : 'Add to CRM'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>
    </Shell>
  );
}
