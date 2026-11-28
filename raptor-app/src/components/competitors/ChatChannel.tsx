import { useCallback, useEffect, useState } from 'react';
import { chatStatus, saveChat, sendChatTest, CHAT_SQL, SERVICE_NAMES, type ChatHook } from '../../lib/chatAlerts';
import { useOrg } from '../../hooks/OrgContext';
import { fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from '../crm/Modal';
import { Needs, Problem, body, card, heading, small } from '../calls/bits';

/** Settings card: the team's Slack or Teams channel for competitor news. */
export function ChatChannel() {
  const { isOwner } = useOrg();
  const [state, setState] = useState<{ installed: boolean; hook: ChatHook | null } | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(() => chatStatus().then(setState).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (!state) return <Problem text={error} />;
  if (!state.installed) return <Needs file={CHAT_SQL} />;
  const hook = state.hook;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const answer = await work();
      setNotice(done.replace('{to}', String(answer || '')));
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={card}>
      <div style={heading}>Slack or Microsoft Teams</div>
      <div style={{ ...body, marginBottom: 6 }}>{hook ? `A ${SERVICE_NAMES[hook.kind]} channel is connected.` : 'No channel is connected.'}</div>
      <Problem text={error} />
      {notice && <div role="status" style={{ ...small, color: 'var(--green, #22c55e)', marginBottom: 6 }}>{notice}</div>}
      {hook && (
        <label style={{ ...body, display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={hook.send_updates} disabled={!isOwner || busy} onChange={(e) => run(() => saveChat(null, e.target.checked), 'Saved.')} /> Post new competitor updates to the channel
        </label>
      )}
      {isOwner && (
        <form onSubmit={(e) => { e.preventDefault(); if (url.trim()) run(() => saveChat(url.trim(), hook?.send_updates ?? true).then(() => setUrl('')), 'Channel saved. Send a test to check it.'); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <input aria-label="Channel webhook address" type="password" autoComplete="off" placeholder={hook ? 'Paste a new address to replace it' : 'Paste the incoming webhook address'} value={url} onChange={(e) => setUrl(e.target.value)} style={{ ...fieldInputStyle, flex: '1 1 240px', marginBottom: 0 }} />
          <button type="submit" style={toolPrimaryStyle} disabled={busy || !url.trim()}>Save</button>
          {hook && <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => run(sendChatTest, 'Test sent to {to}.')}>Send a test</button>}
          {hook && <button type="button" style={toolBtnStyle} disabled={busy} onClick={() => run(() => saveChat('', null), 'Channel removed.')}>Remove</button>}
        </form>
      )}
      <div style={small}>
        In Slack, create an "incoming webhook" for the channel; in Teams, add the "Workflows" or "Incoming Webhook" option to the channel. Paste the address here.
        It is stored so that only Raptor’s server can use it, and is never shown again. A card can be shared from a competitor’s page at any time;
        new updates are posted once the server’s schedule has been switched on.{isOwner ? '' : ' Only your organization’s owner can change this.'}
      </div>
    </div>
  );
}
