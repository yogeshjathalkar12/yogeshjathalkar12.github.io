import { CHANNELS } from './channels';
import type { Channel } from './channels';
import {
  activityFeed, analyticsInsights, change, fmtAgo, fmtMoney, fmtNum, fmtPct, latest, leadRows, named, overviewInsights, primaryCurrency, revenueWithin, reviewRows, tabForProvider, time,
} from './insights';
import type { HubData } from './insights';
import { grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Card, Empty, InsightList, StatusPill, Tile, TileRow, buttonStyle, note, toneColor } from './ui';

const DAY = 86400000;

/** The one number that best describes a channel, for its card on Home. */
export function headline(key: string, data: HubData, now = Date.now()): { value: string; sub?: string } | null {
  const sigs = data.signals[key] || [];
  const conns = data.connections.filter((c) => CHANNELS.find((ch) => ch.key === key)!.providers.includes(c.provider));
  if (!conns.length) return null;
  if (key === 'youtube') { const v = latest(sigs, 'subscribers'); return { value: v !== undefined ? fmtNum(v) : '–', sub: 'subscribers' }; }
  if (key === 'instagram') { const v = latest(sigs, 'ig_followers'); return { value: v !== undefined ? fmtNum(v) : '–', sub: 'followers' }; }
  if (key === 'facebook') { const v = latest(sigs, 'page_followers'); return { value: v !== undefined ? fmtNum(v) : '–', sub: 'followers' }; }
  if (key === 'leads') return { value: fmtNum(leadRows(sigs).filter((r) => new Date(r.at).getTime() > now - 7 * DAY).length), sub: 'leads, 7 days' };
  if (key === 'analytics') {
    const v = latest(sigs, 'ga_sessions_28d');
    const c = change(v, latest(sigs, 'ga_sessions_prev28d'));
    return { value: v !== undefined ? fmtNum(v) : '–', sub: `sessions, 28 days${c !== null ? ` (${fmtPct(c)})` : ''}` };
  }
  if (key === 'reviews') { const v = latest(sigs, 'rating'); return { value: v !== undefined ? `${v.toFixed(1)} ★` : '–', sub: `${fmtNum(reviewRows(sigs).filter((r) => r.stars <= 3).length)} low reviews read` }; }
  if (key === 'payments') { const cur = primaryCurrency(sigs); return { value: fmtMoney(revenueWithin(sigs, now - 7 * DAY, now + DAY, cur), cur), sub: 'last 7 days' }; }
  if (key === 'alerts' || key === 'telegram') {
    const n = named(sigs, 'alert_sent').filter((s) => time(s) > now - 7 * DAY).length;
    return { value: fmtNum(n), sub: 'alerts, 7 days' };
  }
  if (key === 'sms') return { value: fmtNum(named(sigs, 'sms_sent').filter((s) => time(s) > now - 7 * DAY).length), sub: 'texts sent, 7 days' };
  if (key === 'news') return { value: fmtNum(named(sigs, 'news').filter((s) => time(s) > now - 7 * DAY).length), sub: 'headlines, 7 days' };
  return null;
}

function ChannelCard({ channel, props }: { channel: Channel; props: PageProps }) {
  const conns = props.data.connections.filter((c) => channel.providers.includes(c.provider));
  const worst = conns.find((c) => c.status === 'error') || conns.find((c) => c.status === 'paused') || conns[0];
  const h = headline(channel.key, props.data);
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong style={{ color: 'var(--white)', fontSize: 14 }}>{channel.label}</strong>
        {worst ? <StatusPill status={worst.status} /> : <span style={{ ...note, fontSize: 11 }}>Not connected</span>}
      </div>
      {h ? (
        <div><span style={{ fontSize: 24, color: 'var(--white)' }}>{h.value}</span> <span style={note}>{h.sub}</span></div>
      ) : <div style={{ ...note, minHeight: 36 }}>{channel.blurb}</div>}
      {conns.length > 0 && <div style={{ ...note, fontSize: 12 }}>{conns.length === 1 ? conns[0].label : `${conns.length} connections`} · data {fmtAgo(conns.map((c) => c.last_sync_at).filter(Boolean).sort().reverse()[0] as string | undefined)}</div>}
      <div style={{ marginTop: 'auto', paddingTop: 6 }}>
        <button type="button" style={buttonStyle(conns.length ? 'ghost' : 'primary')} onClick={() => props.goTo(channel.key)}>{conns.length ? 'Open' : 'Set up'}</button>
      </div>
    </div>
  );
}

export default function HomePage(props: PageProps) {
  const { data } = props;
  const insights = overviewInsights(data);
  const attention = insights.filter((i) => i.tone === 'warn');
  const connected = new Set(data.connections.filter((c) => c.status === 'connected').map((c) => tabForProvider(c.provider))).size;
  const feed = activityFeed(data);
  const pay = data.signals.payments || [];
  const cur = primaryCurrency(pay);
  const now = Date.now();
  const rev7 = revenueWithin(pay, now - 7 * DAY, now + DAY, cur);
  const c7 = change(rev7, revenueWithin(pay, now - 14 * DAY, now - 7 * DAY, cur));
  const ga = data.signals.analytics || [];
  const sessions = latest(ga, 'ga_sessions_28d');
  const hasPay = data.connections.some((c) => ['razorpay', 'stripe', 'webhook'].includes(c.provider));
  const hasGa = data.connections.some((c) => c.provider === 'ga4');
  const gaTop = analyticsInsights(ga)[0];

  return (
    <div>
      <h3 style={{ margin: '4px 0 2px', fontSize: 20, color: 'var(--white)' }}>Your channels at a glance</h3>
      <p style={{ ...note, marginTop: 0, marginBottom: 14 }}>
        Everything you connect feeds one picture: what is happening across your audience, website, reviews and money, and what needs you today. Pick a channel below to connect it or open its details.
      </p>

      <TileRow>
        <Tile label="Connected channels" value={fmtNum(connected)} sub={`of ${CHANNELS.length} available`} />
        <Tile label="Needs attention" value={fmtNum(attention.length)} tone={attention.length ? 'warn' : 'good'} sub={attention.length ? 'See below' : 'All clear'} />
        {hasPay && <Tile label="Revenue, 7 days" value={fmtMoney(rev7, cur)} sub={c7 !== null ? `${fmtPct(c7)} on the week before` : undefined} tone={c7 !== null && c7 < -5 ? 'warn' : 'good'} />}
        {hasGa && sessions !== undefined && <Tile label="Website sessions, 28 days" value={fmtNum(sessions)} sub={gaTop && /grew|fell/.test(gaTop.text) ? gaTop.text.split(':')[0] : undefined} />}
      </TileRow>

      <div style={grid(420)}>
        <Card title="Needs your attention and what stands out">
          <InsightList items={insights} onOpen={props.goTo} empty="Connect a channel below and its insights appear here." />
        </Card>
        <Card title="What just happened">
          {feed.length === 0 ? <Empty>Nothing yet. Payments, reviews, comments, headlines and messages appear here as they arrive.</Empty> : feed.map((a, i) => (
            <div key={a.at + a.text + i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: toneColor(a.tone), marginTop: 7, flex: 'none' }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--white)', minWidth: 0 }}>
                <span style={{ color: toneColor(a.tone) }}>{a.label}</span> · <span style={{ overflowWrap: 'anywhere' }}>{a.text}</span>
                <div style={{ ...note, fontSize: 11.5 }}>{fmtAgo(a.at)} · <a href="#open" onClick={(e) => { e.preventDefault(); props.goTo(a.tab); }} style={{ color: '#8b5cf6' }}>Open</a></div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
        {CHANNELS.map((c) => <ChannelCard key={c.key} channel={c} props={props} />)}
      </div>
    </div>
  );
}
