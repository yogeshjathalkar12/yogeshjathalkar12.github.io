import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../crm/Modal';
import type { MailboxApproval as Approval } from '../../lib/mailboxGate';

// Asking for several mailboxes and typing the one-time code. Only the organization's owner or an admin can do either (the database
// refuses others and says so).
export default function MailboxApproval({ approval, onChange }: { approval: Approval; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function ask() {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.rpc('request_feature', { p_feature: 'multi_mailbox', p_reason: reason.trim() });
    setBusy(false);
    if (error) setMessage(error.message);
    else { setMessage('Request sent.'); onChange(); }
  }

  async function unlock() {
    setBusy(true);
    setMessage('');
    const { data, error } = await supabase.rpc('unlock_feature', { p_feature: 'multi_mailbox', p_code: code.trim() });
    setBusy(false);
    if (error) setMessage(error.message);
    else if (!data?.ok) setMessage(data?.error || 'That did not work.');
    else { setCode(''); onChange(); }
  }

  const note = { fontSize: '0.78rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
  if (approval.status === 'active') return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.2rem', marginBottom: '1.4rem', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem' }}>Several mailboxes</div>
      {approval.status === 'pending' && <div style={note}>Your request is waiting for approval.</div>}
      {approval.status === 'approved' && (
        <>
          <div style={note}>Approved. Type the code we gave you.</div>
          <input style={fieldInputStyle} aria-label="Approval code" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} />
          <div><button type="button" style={primaryBtnStyle} disabled={busy || !code.trim()} onClick={unlock}>Switch on</button></div>
        </>
      )}
      {(approval.status === 'none' || approval.status === 'revoked' || approval.status === 'expired') && (
        <>
          <div style={note}>
            {approval.status === 'none' ? 'Sending from more than one mailbox is switched on by Shoonya for each business.' : 'Several mailboxes are switched off for your account.'} Tell us why you need it and we will reply.
          </div>
          <input style={fieldInputStyle} aria-label="Why you need several mailboxes" placeholder="For example: sales and partnerships write from different addresses" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div><button type="button" style={primaryBtnStyle} disabled={busy} onClick={ask}>Ask for it</button></div>
        </>
      )}
      {message && <div role="status" style={note}>{message}</div>}
    </div>
  );
}
