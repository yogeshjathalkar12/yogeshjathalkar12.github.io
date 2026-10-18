import { useState } from 'react';
import { CHANNELS } from './channels';
import { api } from './env';
import { commentRows, countSeries, dailySeries, fmtAgo, fmtNum, latest, videoTable, youtubeInsights } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, Empty, InsightList, Notice, ReplyComposer, Spark, Tile, TileRow, buttonStyle, note } from './ui';

const channel = CHANNELS.find((c) => c.key === 'youtube')!;

export default function YouTubePage(props: PageProps) {
  const sigs = props.data.signals.youtube || [];
  const signedIn = props.data.connections.some((c) => c.provider === 'youtube_account' && c.status === 'connected');
  const subs = dailySeries(sigs, 'subscribers', 30);
  const views = dailySeries(sigs, 'views', 30);
  const known = subs.filter((p) => p.value !== null);
  const subDelta = known.length >= 2 ? (known[known.length - 1].value as number) - (known[0].value as number) : null;
  const videos = videoTable(sigs).slice(0, 8);
  const comments = commentRows(sigs).slice(0, 15);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);

  async function send(connectionId: string, commentId: string, text: string) {
    setBusy(true);
    setMsg(null);
    try {
      await api.reply(connectionId, commentId, text);
      setOpen(null);
      setMsg({ tone: 'good', text: 'Reply sent on YouTube.' });
      await props.reload();
    } catch (e: any) {
      setMsg({ tone: 'warn', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const n = (name: string) => latest(sigs, name);
  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Subscribers" value={n('subscribers') !== undefined ? fmtNum(n('subscribers') as number) : '–'} sub={subDelta !== null ? `${subDelta >= 0 ? '+' : ''}${fmtNum(subDelta)} in 30 days` : undefined} tone={subDelta !== null && subDelta < 0 ? 'warn' : 'good'} />
        <Tile label="Total views" value={n('views') !== undefined ? fmtNum(n('views') as number) : '–'} />
        <Tile label="Videos" value={n('videos') !== undefined ? fmtNum(n('videos') as number) : '–'} />
        {signedIn && <Tile label="Views, 28 days" value={n('views_28d') !== undefined ? fmtNum(n('views_28d') as number) : '–'} />}
        {signedIn && <Tile label="Hours watched, 28 days" value={n('watch_minutes_28d') !== undefined ? fmtNum((n('watch_minutes_28d') as number) / 60) : '–'} />}
        {signedIn && <Tile label="New subscribers, 28 days" value={n('subs_gained_28d') !== undefined ? `+${fmtNum(n('subs_gained_28d') as number)}` : '–'} tone="good" />}
      </TileRow>
      {!signedIn && <Notice tone="info">Only public numbers are shown. Connect “YouTube (sign in)” above to also see watch time and new subscribers, and to reply to comments from Raptor.</Notice>}

      <div style={grid(360)}>
        <Card title="Subscribers, last 30 days"><Spark points={subs} format={fmtNum} /></Card>
        <Card title="Total views, last 30 days"><Spark points={views} color="#3ecf8e" format={fmtNum} /></Card>
      </div>

      <Card title="What this tells you"><InsightList items={youtubeInsights(sigs, signedIn)} /></Card>

      <div style={grid(420)}>
        <Card title="Latest videos">
          {videos.length === 0 ? <Empty>No videos read yet.</Empty> : videos.map((v) => (
            <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--white)' }}>{v.title}</span>
              <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>{fmtNum(v.views || 0)} views · {fmtNum(v.likes || 0)} likes · {fmtNum(v.comments || 0)} comments</span>
            </div>
          ))}
        </Card>

        <Card title="Latest comments">
          {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
          {comments.length === 0 ? <Empty>No comments read yet.</Empty> : comments.map((c) => (
            <div key={c.id || c.at} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ ...note, fontSize: 12 }}>
                {c.author}{c.video ? ` on “${c.video}”` : ''} · {fmtAgo(c.at)}
                {c.buying ? <span style={{ color: '#f59e0b' }}> · buying interest</span> : null}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--white)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</div>
              {signedIn && props.canManage && c.id && (c.replied ? <div style={note}>You replied.</div> : open === c.id ? (
                <ReplyComposer limit={10000} busy={busy} placeholder="Write your reply. It is posted on YouTube as your channel when you press Send." onCancel={() => setOpen(null)}
                  onDraft={() => api.draftReply(c.connectionId, { text: c.text, author: c.author, context: c.video, kind: 'comment' })} onSend={(text) => send(c.connectionId, c.id, text)} />
              ) : <button type="button" style={{ ...buttonStyle('ghost'), marginTop: 6, padding: '4px 10px' }} onClick={() => setOpen(c.id)}>Reply</button>)}
            </div>
          ))}
        </Card>
      </div>

      <Card title="Comments per day, last 30 days"><Bars points={countSeries(sigs, 'comment', 30)} /></Card>
    </Shell>
  );
}
