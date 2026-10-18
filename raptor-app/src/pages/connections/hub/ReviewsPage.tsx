import { CHANNELS } from './channels';
import { openLink } from './env';
import { dailySeries, fmtAgo, fmtNum, latest, reviewInsights, reviewRows } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Card, Empty, InsightList, Spark, Stars, Tile, TileRow, buttonStyle, note } from './ui';

const channel = CHANNELS.find((c) => c.key === 'reviews')!;

export default function ReviewsPage(props: PageProps) {
  const sigs = props.data.signals.reviews || [];
  const rating = latest(sigs, 'rating');
  const count = latest(sigs, 'review_count');
  const rows = reviewRows(sigs);
  const low = rows.filter((r) => r.stars <= 3).length;
  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Google rating" value={rating !== undefined ? <>{rating.toFixed(1)} <span style={{ fontSize: 14 }}><Stars n={Math.round(rating)} /></span></> : '–'} tone={rating !== undefined && rating < 4 ? 'warn' : 'good'} sub={rating !== undefined && rating < 4 ? 'Below 4.0' : undefined} />
        <Tile label="Total reviews" value={count !== undefined ? fmtNum(count) : '–'} />
        <Tile label="Reviews Raptor has read" value={fmtNum(rows.length)} sub={low ? `${low} of 3 stars or less` : undefined} tone={low ? 'warn' : undefined} />
      </TileRow>
      <div style={grid(360)}>
        <Card title="Rating over time"><Spark points={dailySeries(sigs, 'rating', 60)} color="#f59e0b" format={(n) => n.toFixed(2)} /></Card>
        <Card title="Number of reviews over time"><Spark points={dailySeries(sigs, 'review_count', 60)} color="#3ecf8e" format={fmtNum} /></Card>
      </div>
      <Card title="What this tells you"><InsightList items={reviewInsights(sigs)} /></Card>
      <div style={{ margin: '14px 0' }}>
        <Card title="Latest reviews" right={<span style={note}>Google shows up to five recent reviews per check; Raptor keeps each one it sees.</span>}>
          {rows.length === 0 ? <Empty>No written reviews read yet.</Empty> : rows.slice(0, 20).map((r) => (
            <div key={r.at + r.author} style={{ padding: '9px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--white)', fontSize: 13.5 }}><Stars n={r.stars} /> <span style={{ marginLeft: 8 }}>{r.author}</span></span>
                <span style={note}>{fmtAgo(r.at)}</span>
              </div>
              {r.text ? <div style={{ fontSize: 13.5, color: 'var(--white)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.text}</div> : <div style={note}>No written comment.</div>}
              {r.stars <= 3 && r.url ? <button type="button" style={{ ...buttonStyle('ghost'), marginTop: 6, padding: '4px 10px' }} onClick={() => openLink(r.url as string)}>Reply on Google</button> : null}
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}
