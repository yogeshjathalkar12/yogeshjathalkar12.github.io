import { useCallback, useEffect, useState } from 'react';
import type { ProviderInfo } from './core';
import { api, useCanManage } from './env';
import type { HubData } from './insights';
import type { PageProps } from './pagekit';
import { SmsPage } from './SmsPage';
import { Notice } from './ui';

// SMS as a section of its own in the sidebar, next to Email and WhatsApp. It is the same screen as the SMS tab under Channels
// (Inbox, Follow-ups, Auto-replies, Settings, Overview), loaded here with its own connections so it does not need the Channels page.
// Shared by the web app and the desktop app (the desktop copy is generated).

const EMPTY: HubData = { connections: [], signals: {} };

export default function SmsSection() {
  const canManage = useCanManage();
  const [data, setData] = useState<HubData>(EMPTY);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api.load());
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    reload();
    api.providers().then(setProviders).catch(() => { /* the setup form stays empty until the server answers */ });
  }, [reload]);

  const props: PageProps = { data, providers, reload, canManage, goTo: () => {} };
  return (
    <div style={{ padding: '2rem', maxWidth: 1200 }}>
      <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', fontFamily: 'var(--mono)' }}>
        Bring your own Twilio number
      </div>
      <h1 style={{ margin: '0.3rem 0 1rem', color: 'var(--purple)' }}>SMS</h1>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {ready ? <SmsPage {...props} /> : <div style={{ color: 'var(--dim)', fontSize: 13 }}>Loading…</div>}
    </div>
  );
}
