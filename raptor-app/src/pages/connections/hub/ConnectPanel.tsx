import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Channel } from './channels';
import { signInService } from './core';
import type { Connection, ProviderInfo } from './core';
import { api, hooksBase, openUrl } from './env';
import { fmtAgo } from './insights';
import { Card, CopyBox, FieldInput, Notice, StatusPill, Steps, buttonStyle, initialValues, note } from './ui';

// Set up, look after and remove the connections of ONE channel. Every channel tab shows this at the top, so connecting never means
// leaving the page: the steps, the form and the result are all here. Which fields a connection needs, and its setup steps, come
// from the server, so a new kind of connection needs no change on this screen.

interface Props {
  channel: Channel;
  providers: ProviderInfo[];
  connections: Connection[];
  reload: () => Promise<void>;
  canManage: boolean;
  intro?: ReactNode;
}

type Message = { tone: 'good' | 'warn' | 'info'; text: string } | null;

export default function ConnectPanel({ channel, providers, connections, reload, canManage, intro }: Props) {
  const mine = connections.filter((c) => channel.providers.includes(c.provider));
  const options = providers.filter((p) => channel.providers.includes(p.provider));
  const [adding, setAdding] = useState<string | null>(mine.length === 0 && options.length ? options[0].provider : null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [eventsDraft, setEventsDraft] = useState<Record<string, string[]>>({});

  const info = (provider: string) => providers.find((p) => p.provider === provider);

  async function run(key: string, work: () => Promise<string | void>) {
    setBusy(key);
    setMessage(null);
    try {
      const done = await work();
      if (done) setMessage({ tone: 'good', text: done });
      await reload();
    } catch (e: any) {
      setMessage({ tone: 'warn', text: e.message || 'Something went wrong. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const choose = (provider: string) => {
    const p = info(provider);
    setAdding(adding === provider ? null : provider);
    setValues(p ? initialValues(p.fields) : {});
    setMessage(null);
  };

  async function submitAdd(p: ProviderInfo) {
    await run(`add-${p.provider}`, async () => {
      const created = await api.connect(p.provider, values);
      setAdding(null);
      setValues({});
      if (created.status === 'error') throw new Error(created.last_error || 'The connection was saved but is not working yet.');
      return p.inbound && p.provider !== 'telegram' ? 'Connected. Now copy the address below into the other service so it can send data to Raptor.' : `${p.title} connected.`;
    });
  }

  async function signIn(p: ProviderInfo) {
    setBusy(`signin-${p.provider}`);
    setMessage(null);
    try {
      openUrl(await api.signIn(p.provider));
      setMessage({ tone: 'info', text: `Finish signing in with ${signInService(p.provider)} in your browser, then come back here.` });
    } catch (e: any) {
      setMessage({ tone: 'warn', text: e.message || 'Could not start the sign-in. Try again.' });
    } finally {
      setBusy(null);
    }
  }

  const eventsOf = (c: Connection, p: ProviderInfo): string[] => eventsDraft[c.id] || (c.config && c.config.events) || (p.extra && p.extra.default_events) || [];

  return (
    <div style={{ marginBottom: 18 }}>
      {intro}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      {mine.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: 12, marginBottom: 12 }}>
          {mine.map((c) => {
            const p = info(c.provider);
            const events = p && p.extra && p.extra.events;
            const showAddress = !!p && p.inbound && c.provider !== 'telegram' && !!c.external_id;
            return (
              <Card key={c.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--white)', fontSize: 15 }}>{c.label || (p && p.title) || c.provider}</strong>
                  <StatusPill status={c.status} />
                </div>
                <div style={{ ...note, marginTop: 2 }}>{(p && p.title) || c.provider} · {p && !p.syncable && !p.inbound ? 'ready to use' : `last data ${fmtAgo(c.last_sync_at)}`}</div>
                {c.last_error ? <Notice tone="warn">{c.last_error}</Notice> : null}

                {showAddress && (
                  <div style={{ margin: '12px 0' }}>
                    <CopyBox label="Your webhook address (keep it private)" text={`${hooksBase}/${c.external_id}`} />
                    {!c.last_sync_at ? <div style={{ ...note, marginTop: 6 }}>Waiting for the first message. Paste this address into the other service, then send a test.</div> : null}
                  </div>
                )}

                {events && events.length > 0 && canManage && p && (
                  <div style={{ margin: '12px 0' }}>
                    <div style={{ ...note, marginBottom: 6 }}>Send an alert when:</div>
                    {events.map((ev) => {
                      const on = eventsOf(c, p).includes(ev.value);
                      return (
                        <label key={ev.value} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--white)', margin: '4px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={on} style={{ width: 'auto' }}
                            onChange={() => { const now = eventsOf(c, p); setEventsDraft({ ...eventsDraft, [c.id]: on ? now.filter((x) => x !== ev.value) : [...now, ev.value] }); }} />
                          {ev.label}
                        </label>
                      );
                    })}
                    {eventsDraft[c.id] && (
                      <button type="button" style={{ ...buttonStyle('ghost', busy !== null), marginTop: 8 }} disabled={busy !== null}
                        onClick={() => run(`events-${c.id}`, async () => { await api.saveSettings(c.id, { events: eventsDraft[c.id] }); setEventsDraft((d) => { const n = { ...d }; delete n[c.id]; return n; }); return 'Alert choices saved.'; })}>
                        Save these choices
                      </button>
                    )}
                  </div>
                )}

                {canManage && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {p && p.auth === 'oauth' && c.status === 'error' && <button type="button" style={buttonStyle('primary', busy !== null)} disabled={busy !== null} onClick={() => signIn(p)}>Sign in again</button>}
                    {p && p.actions.filter((a) => a.fields.length === 0).map((a) => (
                      <button key={a.name} type="button" style={buttonStyle('ghost', busy !== null)} disabled={busy !== null || c.status === 'paused'}
                        onClick={() => run(`action-${c.id}-${a.name}`, async () => { await api.action(c.id, a.name); return 'Done. Check the other side to see it arrive.'; })}>
                        {busy === `action-${c.id}-${a.name}` ? 'Sending…' : a.label}
                      </button>
                    ))}
                    {p && p.syncable && (
                      <button type="button" style={buttonStyle('ghost', busy !== null || c.status === 'paused')} disabled={busy !== null || c.status === 'paused'}
                        onClick={() => run(`sync-${c.id}`, async () => { await api.refresh(c.id); return 'Refreshed.'; })}>
                        {busy === `sync-${c.id}` ? 'Refreshing…' : 'Refresh now'}
                      </button>
                    )}
                    <button type="button" style={buttonStyle('ghost', busy !== null)} disabled={busy !== null}
                      onClick={() => run(`pause-${c.id}`, async () => { await api.pause(c.id, c.status !== 'paused'); return c.status === 'paused' ? 'Resumed.' : 'Paused.'; })}>
                      {c.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                    <button type="button" style={buttonStyle('danger', busy !== null)} disabled={busy !== null}
                      onClick={() => { if (window.confirm(`Disconnect "${c.label}"? Its saved numbers are removed too${p && p.auth === 'oauth' ? `, and Raptor’s saved access to your ${signInService(p.provider)} account is removed` : ''}.`)) run(`del-${c.id}`, async () => { await api.remove(c.id); return 'Disconnected.'; }); }}>
                      Disconnect
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {canManage ? (
        <Card title={mine.length ? 'Add another' : 'Set up this channel'}>
          {options.length === 0 && <div style={note}>Nothing can be connected here yet.</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: adding ? 14 : 0 }}>
            {options.map((p) => (
              <button key={p.provider} type="button" disabled={busy !== null}
                style={{ ...buttonStyle(adding === p.provider ? 'primary' : 'ghost', busy !== null) }} onClick={() => choose(p.provider)}>
                {p.title}
              </button>
            ))}
          </div>
          {options.map((p) => adding === p.provider && (
            <div key={p.provider}>
              <div style={{ ...note, marginBottom: 6 }}>{p.description}</div>
              {!p.available ? (
                <Notice tone="info">
                  {p.unavailable_note ? p.unavailable_note : `${p.auth === 'oauth' ? `Signing in with ${signInService(p.provider)}` : p.title} is not switched on for this Raptor server yet. It needs a one-time setup by whoever runs Raptor; nothing is wrong on your side.`}
                </Notice>
              ) : null}
              {p.help.length > 0 && <Steps items={p.help} />}
              {p.auth === 'oauth' ? (
                <button type="button" style={buttonStyle('primary', !p.available || busy !== null)} disabled={!p.available || busy !== null} onClick={() => signIn(p)}>
                  {busy === `signin-${p.provider}` ? `Opening ${signInService(p.provider)}…` : p.provider.startsWith('meta_') ? 'Connect with Facebook' : 'Sign in with Google'}
                </button>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); submitAdd(p); }} style={{ maxWidth: 560 }}>
                  {p.fields.map((f) => <FieldInput key={f.name} field={f} value={values[f.name] || ''} onChange={(v) => setValues({ ...values, [f.name]: v })} />)}
                  <button type="submit" style={buttonStyle('primary', !p.available || busy !== null)} disabled={!p.available || busy !== null}>
                    {busy === `add-${p.provider}` ? 'Connecting…' : 'Connect'}
                  </button>
                </form>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <div style={note}>You can see your organization’s connections. Changing them needs the “manage automations” permission from your owner.</div>
      )}
    </div>
  );
}
