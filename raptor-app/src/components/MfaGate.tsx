import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/AuthContext';
import { useOrg } from '../hooks/OrgContext';
import { type Enrollment, getAssurance, listVerifiedFactors, startEnrollment, verifyCode } from '../lib/mfa';
import { fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './crm/Modal';

const shell: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.5rem' };
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2rem', maxWidth: 400, width: '100%' };
const title: React.CSSProperties = { fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.03em', marginBottom: '0.6rem', textAlign: 'center' };
const text: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem', lineHeight: 1.6, textAlign: 'center' };
const codeInput: React.CSSProperties = { ...fieldInputStyle, letterSpacing: '0.4em', textAlign: 'center', fontSize: '1rem' };

type Step = { kind: 'loading' } | { kind: 'ok' } | { kind: 'challenge'; factorId: string } | { kind: 'enroll' };

// Sits between sign-in and the organization gate. Two jobs:
//  1. Someone who has set up an authenticator must enter a code on every new
//     sign-in (this session is only "aal1" until they do).
//  2. When the owner has switched on "require two-factor", someone with no
//     authenticator yet is walked through setting one up before they can
//     see anything.
export default function MfaGate({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { loading, requireMfa, status, refresh } = useOrg();
  const [step, setStep] = useState<Step>({ kind: 'loading' });

  const evaluate = useCallback(async () => {
    const a = await getAssurance();
    if (a.current === 'aal1' && a.next === 'aal2') {
      const factors = await listVerifiedFactors();
      if (factors[0]) { setStep({ kind: 'challenge', factorId: factors[0].id }); return; }
    }
    if (requireMfa && status !== 'removed' && a.next !== 'aal2' && a.current !== 'aal2') { setStep({ kind: 'enroll' }); return; }
    setStep({ kind: 'ok' });
  }, [requireMfa, status]);

  useEffect(() => {
    if (loading) return;
    evaluate();
  }, [loading, evaluate]);

  async function passed() {
    await refresh();
    await evaluate();
  }

  if (loading || step.kind === 'loading') {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><span className="arsenal-spinner" /></div>;
  }
  if (step.kind === 'challenge') return <Challenge factorId={step.factorId} onPassed={passed} onSignOut={signOut} />;
  if (step.kind === 'enroll') return <ForcedEnroll onPassed={passed} onSignOut={signOut} />;
  return <>{children}</>;
}

function Challenge({ factorId, onPassed, onSignOut }: { factorId: string; onPassed: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(factorId, code);
      onPassed();
    } catch (err: any) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={shell}>
      <form style={card} onSubmit={submit}>
        <div style={title}>Two-step sign-in</div>
        <div style={text}>Open your authenticator app and enter the 6-digit code for Raptor.</div>
        <input style={codeInput} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        <button type="submit" style={{ ...primaryBtnStyle, width: '100%', marginBottom: '0.7rem' }} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
        <button type="button" style={{ ...ghostBtnStyle, width: '100%' }} onClick={onSignOut}>Sign out</button>
        <div style={{ ...text, marginTop: '1rem', marginBottom: 0 }}>Lost your phone? Ask your organization&rsquo;s owner or admin to reset your two-step sign-in.</div>
      </form>
    </div>
  );
}

function ForcedEnroll({ onPassed, onSignOut }: { onPassed: () => void; onSignOut: () => void }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startEnrollment().then(setEnrollment).catch((e) => setError(e.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    try {
      await verifyCode(enrollment.factorId, code);
      onPassed();
    } catch (err: any) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={shell}>
      <form style={card} onSubmit={submit}>
        <div style={title}>Set up two-step sign-in</div>
        <div style={text}>Your organization requires it. Scan this with an authenticator app (Google Authenticator, Authy, 1Password), then enter the code it shows.</div>
        {enrollment ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.8rem' }}>
              <img src={enrollment.qrCode} alt="Scan with your authenticator app" width={170} height={170} style={{ background: '#fff', padding: 8, borderRadius: 4 }} />
            </div>
            <div style={{ ...text, marginBottom: '1rem' }}>Can&rsquo;t scan? Enter this key instead:<br /><span style={{ color: 'var(--white)', wordBreak: 'break-all' }}>{enrollment.secret}</span></div>
          </>
        ) : !error && <div style={text}>Preparing…</div>}
        <input style={codeInput} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" disabled={!enrollment} />
        {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem', textAlign: 'center' }}>{error}</div>}
        <button type="submit" style={{ ...primaryBtnStyle, width: '100%', marginBottom: '0.7rem' }} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on and continue'}</button>
        <button type="button" style={{ ...ghostBtnStyle, width: '100%' }} onClick={onSignOut}>Sign out</button>
      </form>
    </div>
  );
}
