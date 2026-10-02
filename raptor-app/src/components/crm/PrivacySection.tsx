import { useState } from 'react';
import { useOrg } from '../../hooks/OrgContext';
import { downloadJson, eraseContactData, exportContactData } from '../../lib/privacy';
import { fieldInputStyle, fieldLabelStyle, ghostBtnStyle } from './Modal';

interface PrivacySectionProps {
  contactId: string;
  contactName: string;
  onErased: () => void;
}

// "Privacy" box in a contact's panel - owner and admins only. Download
// everything held about the person, or erase them for good (a privacy
// request). Erasing keeps the deals but unlinks them, removes notes, calls,
// tasks, files and the change history, and leaves a log entry that records
// THAT it happened without any of the person's details.
export default function PrivacySection({ contactId, contactName, onErased }: PrivacySectionProps) {
  const { isOwner, isAdmin } = useOrg();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  if (!isOwner && !isAdmin) return null;

  async function handleExport() {
    setBusy(true); setError(null); setNotice(null);
    try {
      downloadJson(contactName, await exportContactData(contactId));
      setNotice('Downloaded. The file lists everything held about this person; attached files are listed but not included.');
    } catch (e: any) {
      setError(e.message || 'Could not export.');
    } finally {
      setBusy(false);
    }
  }

  async function handleErase() {
    setBusy(true); setError(null);
    try {
      const res = await eraseContactData(contactId);
      if (res.leftoverFiles.length) {
        window.alert(`The person was erased, but ${res.leftoverFiles.length} stored file(s) could not be deleted. They are no longer linked to anything; delete them in Supabase → Storage → crm-attachments.`);
      }
      onErased();
    } catch (e: any) {
      setError(e.message || 'Could not erase.');
      setBusy(false);
    }
  }

  const matches = typed.trim().toLowerCase() === contactName.trim().toLowerCase();

  return (
    <div style={{ marginTop: '1.6rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
      <label style={fieldLabelStyle}>Privacy</label>
      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: '0.7rem' }}>
        For a privacy request: download everything held about this person, or erase them completely.
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} disabled={busy} onClick={handleExport}>
          Download their data
        </button>
        {!confirming && (
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }} disabled={busy} onClick={() => { setConfirming(true); setTyped(''); setError(null); setNotice(null); }}>
            Erase permanently…
          </button>
        )}
      </div>

      {confirming && (
        <div style={{ marginTop: '0.9rem', padding: '0.9rem', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4 }}>
          <div style={{ fontSize: '0.62rem', color: 'var(--white)', marginBottom: '0.5rem' }}>This cannot be undone.</div>
          <div style={{ fontSize: '0.58rem', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '0.8rem' }}>
            Removes {contactName} and their notes, calls, reminders, tasks, attached files and change history. Their deals are kept but no longer linked to them. WhatsApp and email-list entries are separate and not touched. Download their data first if you need a copy.
          </div>
          <label style={fieldLabelStyle}>Type their name to confirm</label>
          <input style={fieldInputStyle} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={contactName} autoComplete="off" />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }} disabled={busy || !matches} onClick={handleErase}>
              {busy ? 'Erasing…' : 'Erase everything'}
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginTop: '0.6rem' }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontSize: '0.6rem', marginTop: '0.6rem' }}>{notice}</div>}
    </div>
  );
}
