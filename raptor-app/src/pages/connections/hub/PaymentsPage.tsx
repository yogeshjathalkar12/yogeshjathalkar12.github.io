import { useState } from 'react';
import { CHANNELS } from './channels';
import { byCurrency, change, countWithin, fmtAgo, fmtMoney, fmtNum, fmtPct, named, paymentInsights, primaryCurrency, revenueSeries, revenueWithin, time } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, Empty, InsightList, Tile, TileRow, inputStyle, note } from './ui';

const channel = CHANNELS.find((c) => c.key === 'payments')!;
const DAY = 86400000;

export default function PaymentsPage(props: PageProps) {
  const sigs = props.data.signals.payments || [];
  const currencies = byCurrency(named(sigs, 'payment_received')).map((m) => m.currency);
  const [chosen, setChosen] = useState('');
  const cur = chosen && currencies.includes(chosen) ? chosen : primaryCurrency(sigs);
  const now = Date.now();
  const startOfToday = new Date(now).setUTCHours(0, 0, 0, 0);
  const today = revenueWithin(sigs, startOfToday, now + DAY, cur);
  const d7 = revenueWithin(sigs, now - 7 * DAY, now + DAY, cur);
  const p7 = revenueWithin(sigs, now - 14 * DAY, now - 7 * DAY, cur);
  const d30 = revenueWithin(sigs, now - 30 * DAY, now + DAY, cur);
  const n30 = named(sigs, 'payment_received').filter((s) => time(s) > now - 30 * DAY && ((s.entity && s.entity.currency) || 'INR').toUpperCase() === cur).length;
  const failed = countWithin(sigs, 'payment_failed', now - 30 * DAY, now + DAY);
  const refunds = revenueWithin(sigs, now - 30 * DAY, now + DAY, cur, 'refund');
  const c7 = change(d7, p7);
  const money = (n: number) => fmtMoney(n, cur);
  const rows = sigs.filter((s) => ['payment_received', 'payment_failed', 'refund'].includes(s.name)).sort((a, b) => time(b) - time(a)).slice(0, 15);
  const events = sigs.filter((s) => s.name === 'webhook_event' || s.name === 'lead_created').sort((a, b) => time(b) - time(a)).slice(0, 8);
  const label: Record<string, string> = { payment_received: 'Paid', payment_failed: 'Failed', refund: 'Refunded' };
  const color: Record<string, string> = { payment_received: '#3ecf8e', payment_failed: '#ef5350', refund: '#f59e0b' };

  return (
    <Shell channel={channel} props={props}>
      {currencies.length > 1 && (
        <div style={{ maxWidth: 220, marginBottom: 10 }}>
          <select style={inputStyle} value={cur} onChange={(e) => setChosen(e.target.value)} aria-label="Currency">{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
      )}
      <TileRow>
        <Tile label="Today" value={money(today)} tone="good" />
        <Tile label="Last 7 days" value={money(d7)} sub={c7 !== null ? `${fmtPct(c7)} on the 7 days before` : undefined} tone={c7 !== null && c7 < -5 ? 'warn' : 'good'} />
        <Tile label="Last 30 days" value={money(d30)} sub={`${fmtNum(n30)} payments`} />
        <Tile label="Average payment" value={n30 ? money(d30 / n30) : '–'} />
        <Tile label="Failed, 30 days" value={fmtNum(failed)} tone={failed ? 'warn' : undefined} sub={failed ? 'See the reasons below' : undefined} />
        <Tile label="Refunded, 30 days" value={money(refunds)} tone={refunds ? 'warn' : undefined} />
      </TileRow>
      <div style={{ margin: '14px 0' }}>
        <Card title={`Revenue per day, last 30 days (${cur})`}><Bars points={revenueSeries(sigs, 30, cur)} format={money} /></Card>
      </div>
      <Card title="What this tells you"><InsightList items={paymentInsights(sigs)} /></Card>
      <div style={grid(420)}>
        <Card title="Recent payments">
          {rows.length === 0 ? <Empty>Nothing yet.</Empty> : rows.map((s) => (
            <div key={s.occurred_at + s.name + s.value + ((s.entity && s.entity.id) || '')} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--white)' }}><span style={{ color: color[s.name] }}>{label[s.name]}</span> · {fmtMoney(s.value || 0, (s.entity && s.entity.currency) || 'INR')}{s.entity && s.entity.email ? ` · ${s.entity.email}` : ''}{s.entity && s.entity.reason ? ` · ${s.entity.reason}` : ''}</span>
              <span style={note}>{fmtAgo(s.occurred_at)}</span>
            </div>
          ))}
        </Card>
        <Card title="Other events sent by webhook">
          {events.length === 0 ? <Empty>Nothing yet. Anything you send that is not a payment shows up here.</Empty> : events.map((s) => (
            <div key={s.occurred_at + (s.text_value || '')} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--white)' }}>{(s.entity && s.entity.event) || 'event'}{s.text_value ? ` · ${s.text_value}` : ''}</span>
              <span style={note}>{fmtAgo(s.occurred_at)}</span>
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}
