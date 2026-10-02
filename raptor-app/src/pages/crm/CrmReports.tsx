import { useEffect, useMemo, useState } from 'react';
import { formatCurrency } from '../../lib/crmHelpers';
import { type TeamReportRow, loadTeamReport, shortName } from '../../lib/team';

type RangeKey = 'week' | 'month' | 'lastmonth' | 'last30' | 'custom';

function rangeFor(key: RangeKey, customFrom: string, customTo: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86400000);
  if (key === 'week') {
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * 86400000);
    return { from: monday, to: tomorrow, label: 'This week' };
  }
  if (key === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow, label: 'This month' };
  if (key === 'lastmonth') return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1), label: 'Last month' };
  if (key === 'last30') return { from: new Date(today.getTime() - 29 * 86400000), to: tomorrow, label: 'Last 30 days' };
  const from = customFrom ? startOfDay(new Date(customFrom)) : today;
  const to = customTo ? new Date(startOfDay(new Date(customTo)).getTime() + 86400000) : tomorrow;
  return { from, to, label: 'Custom range' };
}

const pill = (active: boolean): React.CSSProperties => ({
  padding: '0.45rem 0.9rem', fontFamily: 'var(--mono)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderRadius: 4, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent', color: active ? 'var(--white)' : 'var(--dim)', border: `1px solid ${active ? 'var(--purple)' : 'var(--border)'}`,
});

const th: React.CSSProperties = { padding: '0.8rem 0.9rem', whiteSpace: 'nowrap', textAlign: 'right' };
const td: React.CSSProperties = { padding: '0.85rem 0.9rem', textAlign: 'right', whiteSpace: 'nowrap' };

// A manager's view of how the team is doing: what each person added, won,
// logged and left overdue in a chosen period. The numbers are counted through
// the viewer's own access, so a manager sees their team, an owner or admin
// sees everyone, and a rep sees only themselves.
export default function CrmReports() {
  const [range, setRange] = useState<RangeKey>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rows, setRows] = useState<TeamReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const r = useMemo(() => rangeFor(range, customFrom, customTo), [range, customFrom, customTo]);

  useEffect(() => {
    if (range === 'custom' && !customFrom) return;
    let cancelled = false;
    setRows(null);
    loadTeamReport(r.from, r.to)
      .then((d) => { if (!cancelled) { setRows(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the report.'); });
    return () => { cancelled = true; };
  }, [r, range, customFrom]);

  const total = (rows || []).reduce((a, x) => ({
    contacts_added: a.contacts_added + x.contacts_added, deals_created: a.deals_created + x.deals_created, deals_won: a.deals_won + x.deals_won,
    won_value: a.won_value + x.won_value, deals_lost: a.deals_lost + x.deals_lost, open_deals: a.open_deals + x.open_deals, open_value: a.open_value + x.open_value,
    tasks_done: a.tasks_done + x.tasks_done, tasks_overdue: a.tasks_overdue + x.tasks_overdue, calls_made: a.calls_made + x.calls_made,
    call_minutes: a.call_minutes + x.call_minutes, notes_logged: a.notes_logged + x.notes_logged,
  }), { contacts_added: 0, deals_created: 0, deals_won: 0, won_value: 0, deals_lost: 0, open_deals: 0, open_value: 0, tasks_done: 0, tasks_overdue: 0, calls_made: 0, call_minutes: 0, notes_logged: 0 });

  const winRate = (w: number, l: number) => (w + l === 0 ? '—' : `${Math.round((w / (w + l)) * 100)}%`);

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.6rem' }}>
        {([['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['last30', 'Last 30 days'], ['custom', 'Custom']] as [RangeKey, string][]).map(([k, label]) => (
          <button key={k} style={pill(range === k)} onClick={() => setRange(k)}>{label}</button>
        ))}
        {range === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '0.4rem 0.6rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: 4 }} />
            <span style={{ color: 'var(--dim)', fontSize: '0.65rem' }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '0.4rem 0.6rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: 4 }} />
          </>
        )}
      </div>
      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6 }}>
        Contacts, deals and notes are credited to whoever created them; deals won or lost and open pipeline to whoever they&rsquo;re assigned to. Open pipeline and open tasks are as of today.
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
      {!rows && !error && <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>}
      {rows && rows.length === 0 && <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>No data for this period yet.</div>}

      {rows && rows.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', color: 'var(--dim)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...th, textAlign: 'left' }}>Person</th>
                <th style={th}>Deals won</th>
                <th style={th}>Revenue won</th>
                <th style={th}>Deals lost</th>
                <th style={th}>Win rate</th>
                <th style={th}>Open pipeline</th>
                <th style={th}>Contacts added</th>
                <th style={th}>Deals created</th>
                <th style={th}>Calls</th>
                <th style={th}>Call time</th>
                <th style={th}>Notes</th>
                <th style={th}>Tasks done</th>
                <th style={th}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.user_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...td, textAlign: 'left', color: 'var(--white)' }}>{shortName(x.email)}</td>
                  <td style={td}>{x.deals_won}</td>
                  <td style={{ ...td, color: 'var(--green)' }}>{formatCurrency(x.won_value)}</td>
                  <td style={td}>{x.deals_lost}</td>
                  <td style={td}>{winRate(x.deals_won, x.deals_lost)}</td>
                  <td style={td}>{x.open_deals} · {formatCurrency(x.open_value)}</td>
                  <td style={td}>{x.contacts_added}</td>
                  <td style={td}>{x.deals_created}</td>
                  <td style={td}>{x.calls_made}</td>
                  <td style={td}>{x.call_minutes} min</td>
                  <td style={td}>{x.notes_logged}</td>
                  <td style={td}>{x.tasks_done}</td>
                  <td style={{ ...td, color: x.tasks_overdue ? 'var(--red)' : 'var(--dim)' }}>{x.tasks_overdue}</td>
                </tr>
              ))}
              {rows.length > 1 && (
                <tr style={{ background: 'var(--surface2)', fontWeight: 'bold' }}>
                  <td style={{ ...td, textAlign: 'left' }}>Total</td>
                  <td style={td}>{total.deals_won}</td>
                  <td style={{ ...td, color: 'var(--green)' }}>{formatCurrency(total.won_value)}</td>
                  <td style={td}>{total.deals_lost}</td>
                  <td style={td}>{winRate(total.deals_won, total.deals_lost)}</td>
                  <td style={td}>{total.open_deals} · {formatCurrency(total.open_value)}</td>
                  <td style={td}>{total.contacts_added}</td>
                  <td style={td}>{total.deals_created}</td>
                  <td style={td}>{total.calls_made}</td>
                  <td style={td}>{total.call_minutes} min</td>
                  <td style={td}>{total.notes_logged}</td>
                  <td style={td}>{total.tasks_done}</td>
                  <td style={td}>{total.tasks_overdue}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
