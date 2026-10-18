import { CHANNELS } from './channels';
import { analyticsInsights, change, dailySeries, fmtNum, fmtPct, latest, topItems } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, InsightList, Ranked, Tile, TileRow } from './ui';

const channel = CHANNELS.find((c) => c.key === 'analytics')!;

export default function AnalyticsPage(props: PageProps) {
  const sigs = props.data.signals.analytics || [];
  const n = (name: string) => latest(sigs, name);
  const delta = (name: string) => change(n(`${name}_28d`), n(`${name}_prev28d`));
  const tile = (label: string, name: string, format: (v: number) => string = fmtNum) => {
    const v = n(`${name}_28d`);
    const c = delta(name);
    return <Tile label={label} value={v !== undefined ? format(v) : '–'} sub={c !== null ? `${fmtPct(c)} on the 28 days before` : undefined} tone={c !== null && c < -5 ? 'warn' : 'good'} />;
  };
  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        {tile('Sessions, 28 days', 'ga_sessions')}
        {tile('Visitors, 28 days', 'ga_users')}
        {tile('New visitors', 'ga_new_users')}
        {tile('Engaged sessions', 'ga_engagement_rate', (v) => `${(v * 100).toFixed(0)}%`)}
        {tile('Key events', 'ga_key_events')}
      </TileRow>
      <div style={{ margin: '14px 0' }}>
        <Card title="Sessions per day, last 28 days"><Bars points={dailySeries(sigs, 'ga_sessions_day', 28, 'last')} color="#8b5cf6" format={fmtNum} /></Card>
      </div>
      <Card title="What this tells you"><InsightList items={analyticsInsights(sigs)} empty="Insights appear after the first full day of data." /></Card>
      <div style={grid(360)}>
        <Card title="Most-read pages, last 28 days"><Ranked items={topItems(sigs, 'ga_top_pages')} format={fmtNum} /></Card>
        <Card title="Where visitors come from"><Ranked items={topItems(sigs, 'ga_top_sources')} format={fmtNum} /></Card>
      </div>
    </Shell>
  );
}
