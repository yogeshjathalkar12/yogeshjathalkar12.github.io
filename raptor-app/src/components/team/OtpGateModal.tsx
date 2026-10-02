import { useEffect, useState } from 'react';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../crm/Modal';
import { sendExportOtp, verifyExportOtp, markExportVerified } from '../../lib/team';

interface OtpGateModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}

// Step-up check before bulk data leaves the app: a 6-digit code emailed to
// the owner. Protects against someone using an unattended or hijacked
// session; every export is also written to the audit log.
export default function OtpGateModal({ open, onClose, onVerified }: OtpGateModalProps) {
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await sendExportOtp();
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Could not send the code.');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (open) { setCode(''); setSent(false); setError(null); send(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setError(null);
    try {
      await verifyExportOtp(code.trim());
      markExportVerified();
      onVerified();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Could not verify that code.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Confirm it's you" width={400}>
      <form onSubmit={handleVerify}>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6 }}>
          {sent ? 'We emailed a 6-digit code to your account email. Enter it to export your data.' : sending ? 'Sending a code to your email…' : 'We need to confirm it’s you before exporting data.'}
        </div>
        <label style={fieldLabelStyle}>Verification code</label>
        <input
          style={{ ...fieldInputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: '1rem' }}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          disabled={!sent}
        />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '0.7rem' }}>
          <button type="button" style={ghostBtnStyle} onClick={send} disabled={sending}>Resend code</button>
          <button type="submit" style={primaryBtnStyle} disabled={verifying || code.length !== 6}>{verifying ? 'Checking…' : 'Verify & export'}</button>
        </div>
      </form>
    </Modal>
  );
}
