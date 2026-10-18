import { useState } from 'react';
import { CHANNELS } from './channels';
import type { Connection } from './core';
import { api, openLink } from './env';
import { EVENT_NAMES, alertInsights, countSeries, fmtAgo, fmtNum, named, newsInsights, newsRows, smsInsights, telegramInsights, time } from './insights';
import { Shell, connectionsOf, grid } from './pagekit';
import type { PageProps } from './pagekit';
import { Bars, Card, CopyBox, Empty, FieldInput, InsightList, Notice, Tile, TileRow, buttonStyle, initialValues, note } from './ui';

const channelOf = (key: string) => CHANNELS.find((c) => c.key === key)!;
export const SMS_DAILY_CAP = 200;   // keep in step with DAILY_CAP in the server's sms.py

function AlertLog({ sigs }: { sigs: PageProps['data']['signals'][string] }) {
  const rows = named(sigs, 'alert_sent').slice(0, 12);
  return (
    <Card title="Recent alerts sent">
      {rows.length === 0 ? <Empty>No alert has been sent yet. Press “Send a test alert” on a connection above to try one.</Empty> : rows.map((s) => (
        <div key={s.occurred_at + (s.text_value || '')} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
          <div style={{ color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{s.text_value}</div>
          <div style={note}>{EVENT_NAMES[(s.entity && s.entity.event) || ''] || 'alert'} · {fmtAgo(s.occurred_at)}</div>
        </div>
      ))}
    </Card>
  );
}

export function AlertsPage(props: PageProps) {
  const sigs = props.data.signals.alerts || [];
  const week = named(sigs, 'alert_sent').filter((s) => time(s) > Date.now() - 7 * 86400000).length;
  return (
    <Shell channel={channelOf('alerts')} props={props}>
      <TileRow>
        <Tile label="Alert channels" value={fmtNum(connectionsOf(props.data, channelOf('alerts')).length)} />
        <Tile label="Alerts, last 7 days" value={fmtNum(week)} />
      </TileRow>
      <div style={grid(360)}>
        <Card title="What this tells you"><InsightList items={alertInsights(sigs)} /></Card>
        <Card title="Alerts per day, last 14 days"><Bars points={countSeries(sigs, 'alert_sent', 14)} color="#8b5cf6" /></Card>
      </div>
      <AlertLog sigs={sigs} />
    </Shell>
  );
}

export function TelegramPage(props: PageProps) {
  const channel = channelOf('telegram');
  const sigs = props.data.signals.telegram || [];
  const conns = connectionsOf(props.data, channel);
  const messages = named(sigs, 'telegram_message').slice(0, 20);
  const bot = conns.find((c) => c.config && c.config.bot_username);
  const week = named(sigs, 'telegram_message').filter((s) => time(s) > Date.now() - 7 * 86400000).length;
  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Messages, last 7 days" value={fmtNum(week)} />
        <Tile label="Alert chat" value={conns.some((c) => c.config && c.config.chat_id) ? 'Linked' : 'Not linked'} tone={conns.some((c) => c.config && c.config.chat_id) ? 'good' : 'warn'} sub={conns.some((c) => c.config && c.config.chat_id) ? undefined : 'Send /start to your bot'} />
      </TileRow>
      {bot && <div style={{ margin: '14px 0', maxWidth: 520 }}><CopyBox label="Your bot’s link: share it where your customers are" text={`https://t.me/${bot.config.bot_username}`} /></div>}
      <div style={grid(360)}>
        <Card title="What this tells you"><InsightList items={telegramInsights(sigs, conns as Connection[])} /></Card>
        <Card title="Messages per day, last 14 days"><Bars points={countSeries(sigs, 'telegram_message', 14)} color="#3ecf8e" /></Card>
      </div>
      <Card title="Messages to your bot">
        {messages.length === 0 ? <Empty>No messages yet. When someone writes to your bot, it appears here.</Empty> : messages.map((s) => (
          <div key={s.occurred_at + (s.text_value || '')} style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ ...note, fontSize: 12 }}>{(s.entity && s.entity.from) || 'Someone'} · {fmtAgo(s.occurred_at)}</div>
            <div style={{ fontSize: 13.5, color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{s.text_value}</div>
          </div>
        ))}
      </Card>
      <div style={{ margin: '14px 0' }}><AlertLog sigs={sigs} /></div>
    </Shell>
  );
}

export function SmsPage(props: PageProps) {
  const channel = channelOf('sms');
  const sigs = props.data.signals.sms || [];
  const conns = connectionsOf(props.data, channel).filter((c) => c.status === 'connected');
  const provider = props.providers.find((p) => p.provider === 'sms_twilio');
  const action = provider && provider.actions.find((a) => a.name === 'send');
  const [target, setTarget] = useState('');
  const [values, setValues] = useState<Record<string, string>>(action ? initialValues(action.fields) : {});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  const chosen = conns.find((c) => c.id === target) || conns[0];
  const sent = named(sigs, 'sms_sent');
  const today = sent.filter((s) => time(s) >= new Date().setUTCHours(0, 0, 0, 0)).length;
  const week = sent.filter((s) => time(s) > Date.now() - 7 * 86400000).length;
  const length = (values.text || '').length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.action(chosen.id, 'send', values);
      setMsg({ tone: 'good', text: 'Message sent.' });
      setValues({ ...values, text: '' });
      await props.reload();
    } catch (err: any) {
      setMsg({ tone: 'warn', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Sent today" value={`${fmtNum(today)} / ${SMS_DAILY_CAP}`} tone={today >= SMS_DAILY_CAP * 0.8 ? 'warn' : undefined} />
        <Tile label="Sent, last 7 days" value={fmtNum(week)} />
      </TileRow>
      {action && chosen && props.canManage && (
        <div style={{ margin: '14px 0' }}>
          <Card title="Send a text message">
            {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
            <form onSubmit={send} style={{ maxWidth: 560 }}>
              {conns.length > 1 && (
                <div style={{ marginBottom: 12 }}>
                  <select value={chosen.id} onChange={(e) => setTarget(e.target.value)} style={{ width: '100%', padding: 9, background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 5 }}>
                    {conns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {action.fields.map((f) => <FieldInput key={f.name} field={f} value={values[f.name] || ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />)}
              <div style={{ ...note, marginBottom: 10 }}>{length} characters{length > 160 ? ` · about ${Math.ceil(length / 153)} text segments` : ''}. Only text people who agreed to hear from you.</div>
              <button type="submit" style={buttonStyle('primary', busy || !(values.to || '').trim() || !(values.text || '').trim())} disabled={busy || !(values.to || '').trim() || !(values.text || '').trim()}>{busy ? 'Sending…' : 'Send message'}</button>
            </form>
          </Card>
        </div>
      )}
      <Card title="What this tells you"><InsightList items={smsInsights(sigs, SMS_DAILY_CAP)} /></Card>
      <div style={{ margin: '14px 0' }}>
        <Card title="Messages sent">
          {sent.length === 0 ? <Empty>Nothing sent yet.</Empty> : sent.slice(0, 15).map((s) => (
            <div key={s.occurred_at + (s.entity && s.entity.sid)} style={{ padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
              <div style={{ ...note, fontSize: 12 }}>To {(s.entity && s.entity.to) || ''} · {fmtAgo(s.occurred_at)}</div>
              <div style={{ color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{s.text_value}</div>
            </div>
          ))}
        </Card>
      </div>
    </Shell>
  );
}

export function NewsPage(props: PageProps) {
  const channel = channelOf('news');
  const sigs = props.data.signals.news || [];
  const rows = newsRows(sigs);
  const now = Date.now();
  const week = rows.filter((r) => new Date(r.at).getTime() > now - 7 * 86400000).length;
  const today = rows.filter((r) => new Date(r.at).getTime() > now - 86400000).length;
  const [feed, setFeed] = useState('');
  const feeds = Array.from(new Set(rows.map((r) => r.feed))).filter(Boolean);
  const shown = rows.filter((r) => !feed || r.feed === feed).slice(0, 30);
  return (
    <Shell channel={channel} props={props}>
      <TileRow>
        <Tile label="Headlines, last 7 days" value={fmtNum(week)} />
        <Tile label="In the last 24 hours" value={fmtNum(today)} />
        <Tile label="Feeds followed" value={fmtNum(connectionsOf(props.data, channel).length)} />
      </TileRow>
      <div style={grid(360)}>
        <Card title="What this tells you"><InsightList items={newsInsights(sigs)} /></Card>
        <Card title="Headlines per day, last 14 days"><Bars points={countSeries(sigs, 'news', 14)} color="#8b5cf6" /></Card>
      </div>
      <Card title="Headlines" right={feeds.length > 1 ? (
        <select value={feed} onChange={(e) => setFeed(e.target.value)} aria-label="Feed" style={{ padding: 6, background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 5 }}>
          <option value="">All feeds</option>{feeds.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>) : undefined}>
        {shown.length === 0 ? <Empty>No headlines yet.</Empty> : shown.map((r) => (
          <div key={r.at + r.title} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <a href={r.url || '#'} onClick={(e) => { e.preventDefault(); if (r.url) openLink(r.url); }} style={{ color: 'var(--white)', fontSize: 14, textDecoration: 'none' }}>{r.title}</a>
            <div style={{ ...note, fontSize: 12 }}>{[r.source, r.feed && r.feed !== r.source ? r.feed : '', fmtAgo(r.at)].filter(Boolean).join(' · ')}</div>
          </div>
        ))}
      </Card>
    </Shell>
  );
}
