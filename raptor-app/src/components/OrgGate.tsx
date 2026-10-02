import type { ReactNode } from 'react';
import { useAuth } from '../hooks/AuthContext';
import { useOrg } from '../hooks/OrgContext';
import AcceptInvite from './AcceptInvite';
import { primaryBtnStyle } from './crm/Modal';

// Sits between sign-in and the app. Active members pass straight through;
// an invited member gets the set-password screen; a removed member gets a
// dead-end screen with only "Sign out".
export default function OrgGate({ children }: { children: ReactNode }) {
  const { loading, status } = useOrg();
  const { signOut } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span className="arsenal-spinner" />
      </div>
    );
  }

  if (status === 'invited') return <AcceptInvite />;

  if (status === 'removed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1.5rem' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '2rem', maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.5rem', letterSpacing: '0.03em', marginBottom: '0.6rem' }}>Access removed</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem' }}>
            Your access to this organization has been removed. If you think this is a mistake, contact the organization&rsquo;s owner.
          </div>
          <button type="button" style={{ ...primaryBtnStyle, width: '100%' }} onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
