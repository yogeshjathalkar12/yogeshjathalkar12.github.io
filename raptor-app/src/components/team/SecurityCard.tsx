import { useCallback, useEffect, useState } from 'react';
import { useOrg } from '../../hooks/OrgContext';
import { type Enrollment, type VerifiedFactor, getAssurance, listVerifiedFactors, removeFactor, startEnrollment, verifyCode } from '../../lib/mfa';
import { setRequireMfa } from '../../lib/team';
import { fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from '../crm/Modal';

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.6rem', maxWidth: 480 };
const headStyle: React.CSSProperties = { fontSize: '0.7rem', color: 'var(--white)', fontWeight: 'bold', marginBottom: '0.4rem' };
const subStyle: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6 };

// "Two-step sign-in": an authenticator-app code on top of the password /
// Google / email link. Anyone can turn it on for themselves; the owner can
// additionally require it for the whole organization.
export default function SecurityCard() {
  const { isOwner, requireMfa, refresh } = useOrg();
  const [factors, setFactors] = useState<VerifiedFactor[] | null>(null);
  const [secured, setSecured] = useState(false); // this session has passed the code check
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFactors(await listVerifiedFactors());
    setSecured((await getAssurance()).current === 'aal2');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function begin() {
    setError(null); setNotice(null); setCode('');
    try { setEnrollment(await startEnrollment()); } catch (e: any) { setError(e.message); }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true); setError(null);
    try {
      await verifyCode(enrollment.factorId, code);
      setEnrollment(null); setCode('');
      setNotice('Two-step sign-in is on. You’ll be asked for a code each time you sign in.');
      await load(); await refresh();
    } catch (err: any) { setError(err.message); setCode(''); }
    finally { setBusy(false); }
  }

  async function turnOff(f: VerifiedFactor) {
    if (requireMfa) { setError('Your organization requires two-step sign-in, so it can’t be turned off.'); return; }
    if (!window.confirm('Turn off two-step sign-in for your account?')) return;
    setError(null); setNotice(null);
    try { await removeFactor(f.id); setNotice('Two-step sign-in is off.'); await load(); await refresh(); }
    catch (err: any) { setError(/aal2|assurance/i.test(err.message) ? 'Sign out and back in with your code, then try again.' : err.message); }
  }

  async function toggleOrg(on: boolean) {
    setError(null); setNotice(null); setBusy(true);
    try {
      await setRequireMfa(on);
      setNotice(on ? 'Everyone in your organization must now use two-step sign-in.' : 'Two-step sign-in is optional again.');
      await refresh();
    } catch (err: any) {
      setError(err.message || 'Could not change this.');
    } finally { setBusy(false); }
  }

  const enabled = (factors?.length || 0) > 0;

  return (
    <div style={cardStyle}>
      <div style={headStyle}>Two-step sign-in</div>
      <div style={subStyle}>
        Adds a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password) every time you sign in, so a stolen password alone isn&rsquo;t enough.
      </div>

      {factors === null ? <div style={subStyle}>Loading…</div> : enrollment ? (
        <form onSubmit={finish}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <img src={enrollment.qrCode} alt="Scan with your authenticator app" width={150} height={150} style={{ background: '#fff', padding: 6, borderRadius: 4 }} />
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.6, flex: 1, minWidth: 160 }}>
              1. Scan the picture with your authenticator app.<br />2. Enter the 6-digit code it shows.<br />
              <span style={{ wordBreak: 'break-all' }}>Can&rsquo;t scan? Key: <span style={{ color: 'var(--white)' }}>{enrollment.secret}</span></span>
            </div>
          </div>
          <input style={{ ...fieldInputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: '1rem' }} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" />
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setEnrollment(null)}>Cancel</button>
            <button type="submit" style={primaryBtnStyle} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on'}</button>
          </div>
        </form>
      ) : enabled ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--green)' }}>✓ On{secured ? '' : ' (not yet confirmed in this session)'}</span>
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.58rem' }} onClick={() => turnOff(factors![0])}>Turn off</button>
        </div>
      ) : (
        <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} onClick={begin}>Set up</button>
      )}

      {isOwner && (
        <div style={{ marginTop: '1.4rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--white)', marginBottom: '0.3rem' }}>Require it for everyone</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.8rem', lineHeight: 1.6 }}>
            Members and admins will have to set it up before they can see any data. {enabled ? '' : 'Turn it on for your own account first.'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', color: 'var(--white)', cursor: 'pointer' }}>
            <input type="checkbox" checked={requireMfa} disabled={busy || (!enabled && !requireMfa)} onChange={(e) => toggleOrg(e.target.checked)} />
            Everyone in my organization must use two-step sign-in
          </label>
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: '0.62rem', marginTop: '0.8rem' }}>{error}</div>}
      {notice && <div style={{ color: 'var(--green)', fontSize: '0.62rem', marginTop: '0.8rem' }}>{notice}</div>}
    </div>
  );
}
