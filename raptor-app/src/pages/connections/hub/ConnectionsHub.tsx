import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { CHANNELS, HOME } from './channels';
import type { ProviderInfo } from './core';
import { api, clearReturn, readReturn, useCanManage } from './env';
import { tabForProvider } from './insights';
import type { HubData } from './insights';
import AnalyticsPage from './AnalyticsPage';
import HomePage from './HomePage';
import LeadsPage from './LeadsPage';
import { AlertsPage, NewsPage, SmsPage, TelegramPage } from './MessagingPages';
import PaymentsPage from './PaymentsPage';
import type { PageProps } from './pagekit';
import ReviewsPage from './ReviewsPage';
import { FacebookPage, InstagramPage } from './SocialPages';
import YouTubePage from './YouTubePage';
import { Notice, buttonStyle, note } from './ui';

// The Connections section: a tab for Home (the overall picture) and one for every channel, like the Email section. Each channel tab
// has its own setup, its own numbers and its own insights; Home reads across all of them.

const PAGES: Record<string, (props: PageProps) => ReactElement> = {
  youtube: YouTubePage, instagram: InstagramPage, facebook: FacebookPage, leads: LeadsPage, analytics: AnalyticsPage, reviews: ReviewsPage, payments: PaymentsPage,
  alerts: AlertsPage, telegram: TelegramPage, sms: SmsPage, news: NewsPage,
};

const EMPTY: HubData = { connections: [], signals: {} };

export default function ConnectionsHub() {
  const canManage = useCanManage();
  const [tab, setTab] = useState(HOME);
  const [data, setData] = useState<HubData>(EMPTY);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'warn' | 'info'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setData(await api.load());
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    api.providers().then(setProviders).catch(() => { /* the setup forms stay empty until the server answers */ });
  }, [reload]);

  // Coming back from Google (web), and coming back to the window after signing in elsewhere (desktop): pick up what changed.
  useEffect(() => {
    const back = readReturn();
    if (back.connected || back.error) {
      if (back.connected) {
        setTab(tabForProvider(back.connected));
        setNotice({ tone: 'good', text: back.connected.startsWith('meta_') ? 'Connected with Facebook. Your Pages, their Lead Ads and any linked Instagram accounts are set up.' : 'Connected with Google.' });
      }
      if (back.error) setNotice({ tone: 'warn', text: back.error });
      clearReturn();
    }
    const onFocus = () => { reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  async function refreshAll() {
    setRefreshing(true);
    setNotice(null);
    let done = 0;
    for (const c of data.connections) {
      const p = providers.find((x) => x.provider === c.provider);
      if (c.status !== 'connected' || !p || !p.syncable) continue;
      try { await api.refresh(c.id); done += 1; } catch { /* refreshed a moment ago, or it needs attention: shown on its own tab */ }
    }
    await reload();
    setRefreshing(false);
    setNotice({ tone: 'info', text: done ? `Refreshed ${done} ${done === 1 ? 'connection' : 'connections'}.` : 'Everything was refreshed a moment ago.' });
  }

  const props: PageProps = useMemo(() => ({ data, providers, reload, canManage, goTo: (t: string) => { setTab(t); window.scrollTo?.({ top: 0 }); } }), [data, providers, reload, canManage]);
  const Page = PAGES[tab];
  const attention = (key: string) => {
    const ch = CHANNELS.find((c) => c.key === key);
    return !!ch && data.connections.some((c) => ch.providers.includes(c.provider) && c.status === 'error');
  };
  const tabs = [{ key: HOME, label: 'Home' }, ...CHANNELS.map((c) => ({ key: c.key, label: c.short }))];

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ marginTop: 0 }}>Connections</h2>
        {data.connections.length > 0 && <button type="button" style={buttonStyle('ghost', refreshing)} disabled={refreshing} onClick={refreshAll}>{refreshing ? 'Refreshing…' : 'Refresh everything'}</button>}
      </div>
      <p style={{ ...note, marginTop: 0 }}>
        Connect the places where your customers, your audience and your money already are. Raptor reads only what each service officially allows, keeps the numbers
        for your organization, and turns them into plain-words insights. Keys and passwords are saved encrypted and never shown again. What you connect here shows on the web and on every PC.
      </p>

      <div role="tablist" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '14px 0 18px', borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px', fontSize: 11.5, letterSpacing: '0.07em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', width: 'auto', flex: 'none',
              border: 'none', borderBottom: tab === t.key ? '2px solid #8b5cf6' : '2px solid transparent', borderRadius: '6px 6px 0 0',
              background: tab === t.key ? 'rgba(139,92,246,0.12)' : 'transparent', color: tab === t.key ? 'var(--white)' : 'var(--dim)',
            }}>
            {t.label}{t.key !== HOME && attention(t.key) ? <span style={{ color: '#ef5350' }}> ●</span> : null}
          </button>
        ))}
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}

      {loading ? <div style={note}>Loading…</div> : error && data.connections.length === 0 && /not set up/.test(error) ? null : Page ? <Page {...props} /> : <HomePage {...props} />}
    </div>
  );
}
