import { useState } from 'react';
import { CHANNELS } from './channels';
import { api, openLink } from './env';
import { NETWORKS, conversations, countSeries, dailySeries, fmtAgo, fmtNum, latest, named, postTable, socialComments, socialInsights, time } from './insights';
import type { Network } from './insights';
import { Shell, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, Empty, InsightList, Notice, ReplyComposer, Spark, Tile, TileRow, buttonStyle, note } from './ui';

// Facebook and Instagram share one screen: a Page or an Instagram professional account has followers, posts, direct messages and comments,
// and Meta lets a business answer a message only within 24 hours of the person's last one. The server enforces that rule too; the screen
// shows how long each conversation has left so nothing is a surprise.

type Msg = { tone: 'good' | 'warn'; text: string } | null;

function SocialPage({ network, props }: { network: Network; props: PageProps }) {
  const names = NETWORKS[network];
  const channel = CHANNELS.find((c) => c.key === network)!;
  const sigs = props.data.signals[network] || [];
  const isFacebook = network === 'facebook';
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const followers = latest(sigs, names.followers);
  const series = dailySeries(sigs, names.followers, 30);
  const known = series.filter((p) => p.value !== null);
  const delta = known.length >= 2 ? (known[known.length - 1].value as number) - (known[0].value as number) : null;
  const convs = conversations(sigs, network);
  const comments = socialComments(sigs, network);
  const posts = postTable(sigs, network).slice(0, 8);
  const week = named(sigs, names.msg).filter((s) => time(s) > Date.now() - 7 * 86400000).length;
  const waiting = convs.filter((c) => !c.replied && c.windowOpen).length;
  const canReply = props.canManage;

  async function send(work: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await work();
      setOpen(null);
      setMsg({ tone: 'good', text: done });
      await props.reload();
    } catch (e: any) {
      setMsg({ tone: 'warn', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Followers" value={followers !== undefined ? fmtNum(followers) : '–'} sub={delta !== null ? `${delta >= 0 ? '+' : ''}${fmtNum(delta)} in 30 days` : undefined} tone={delta !== null && delta < 0 ? 'warn' : 'good'} />
        {isFacebook
          ? <Tile label="Page likes" value={latest(sigs, 'page_likes') !== undefined ? fmtNum(latest(sigs, 'page_likes') as number) : '–'} />
          : <Tile label="Posts" value={latest(sigs, 'ig_posts') !== undefined ? fmtNum(latest(sigs, 'ig_posts') as number) : '–'} />}
        <Tile label="Messages, last 7 days" value={fmtNum(week)} />
        <Tile label="Waiting for a reply" value={fmtNum(waiting)} tone={waiting ? 'warn' : 'good'} sub={waiting ? 'Inside the 24-hour window' : 'All answered'} />
      </TileRow>

      <div style={grid(360)}>
        <Card title="What this tells you"><InsightList items={socialInsights(sigs, network)} /></Card>
        <Card title="Followers, last 30 days"><Spark points={series} format={fmtNum} /></Card>
      </div>

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      <div style={grid(420)}>
        <Card title="Messages">
          {convs.length === 0 ? <Empty>No messages yet. When someone writes to your {isFacebook ? 'Page' : 'account'}, the conversation appears here the moment it arrives.</Empty> : convs.slice(0, 12).map((c) => (
            <div key={c.senderId} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ ...note, fontSize: 12 }}>
                {c.from} · {fmtAgo(c.at)}{c.count > 1 ? ` · ${c.count} messages` : ''}
                {c.buying ? <span style={{ color: '#f59e0b' }}> · buying interest</span> : null}
                {c.replied ? <span style={{ color: '#3ecf8e' }}> · answered</span> : null}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--white)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</div>
              {canReply && !c.replied && (c.windowOpen ? (open === `m:${c.senderId}` ? (
                <ReplyComposer limit={1000} busy={busy} placeholder={`Write your reply. It is sent as ${isFacebook ? 'your Page' : 'your account'} when you press Send.`} onCancel={() => setOpen(null)} onDraft={() => api.draftReply(c.connectionId, { text: c.text, author: c.from, kind: 'message' })}
                  onSend={(text) => send(() => api.action(c.connectionId, 'send_message', { recipient_id: c.senderId, text }), `Reply sent on ${names.label}.`)} />
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" style={{ ...buttonStyle('ghost'), padding: '4px 10px' }} onClick={() => setOpen(`m:${c.senderId}`)}>Reply</button>
                  <span style={note}>You can reply for {c.hoursLeft} more {c.hoursLeft === 1 ? 'hour' : 'hours'}.</span>
                </div>
              )) : <div style={{ ...note, marginTop: 4 }}>The 24-hour reply window has closed. {names.label} only allows a reply within 24 hours of their last message.</div>)}
            </div>
          ))}
        </Card>

        <Card title="Comments on your posts">
          {comments.length === 0 ? <Empty>No comments yet.</Empty> : comments.slice(0, 12).map((c) => (
            <div key={c.id || c.at} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ ...note, fontSize: 12 }}>
                {c.author} · {fmtAgo(c.at)}
                {c.buying ? <span style={{ color: '#f59e0b' }}> · buying interest</span> : null}
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--white)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</div>
              {canReply && c.id && (c.replied ? <div style={note}>You replied.</div> : open === `c:${c.id}` ? (
                <ReplyComposer limit={isFacebook ? 8000 : 2200} busy={busy} placeholder={`Write your reply. It is posted publicly on ${names.label} when you press Send.`} onCancel={() => setOpen(null)} onDraft={() => api.draftReply(c.connectionId, { text: c.text, author: c.author, kind: 'comment' })}
                  onSend={(text) => send(() => api.action(c.connectionId, 'reply_comment', { comment_id: c.id, text }), `Reply posted on ${names.label}.`)} />
              ) : <button type="button" style={{ ...buttonStyle('ghost'), marginTop: 6, padding: '4px 10px' }} onClick={() => setOpen(`c:${c.id}`)}>Reply</button>)}
            </div>
          ))}
        </Card>
      </div>

      <div style={grid(420)}>
        <Card title="Latest posts">
          {posts.length === 0 ? <Empty>No posts read yet.</Empty> : posts.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <a href={p.url || '#'} onClick={(e) => { e.preventDefault(); if (p.url) openLink(p.url); }} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--white)', textDecoration: 'none' }}>{p.title}</a>
              <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                {isFacebook
                  ? `${fmtNum(p.numbers.reactions || 0)} reactions · ${fmtNum(p.numbers.comments || 0)} comments · ${fmtNum(p.numbers.shares || 0)} shares`
                  : `${fmtNum(p.numbers.likes || 0)} likes · ${fmtNum(p.numbers.comments || 0)} comments`}
              </span>
            </div>
          ))}
        </Card>
        <Card title="Messages per day, last 14 days"><Bars points={countSeries(sigs, names.msg, 14)} color="#3ecf8e" /></Card>
      </div>
    </Shell>
  );
}

export const FacebookPage = (props: PageProps) => <SocialPage network="facebook" props={props} />;
export const InstagramPage = (props: PageProps) => <SocialPage network="instagram" props={props} />;
