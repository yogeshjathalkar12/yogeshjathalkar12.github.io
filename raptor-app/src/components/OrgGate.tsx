import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../hooks/AuthContext';
import { useOrg } from '../hooks/OrgContext';
import AcceptInvite from './AcceptInvite';
import { primaryBtnStyle } from './crm/Modal';

// Captured when this file first loads - before Supabase has had a chance to
// clear the sign-in tokens out of the address bar. True only when the person
// got here by clicking the link in their invitation email, which is proof
// they own that mailbox, so that arrival accepts the invitation by itself.
const ARRIVED_VIA_EMAIL_LINK =
  typeof window !== 'undefined' &&
  /(?:^|[#&?])type=(invite|magiclink|signup)(?:&|$)/.test(window.location.hash + window.location.search);

// Sits between sign-in and the app. Active members pass straight through;
// an invited member who came from the email link is accepted automatically
// (anyone else gets a one-click confirmation); a removed member gets a
// dead-end screen with only "Sign out".
export default function OrgGate({ children }: { children: ReactNode }) {
  const { loading, status, refresh } = useOrg();
  const { signOut } = useAuth();
  const autoAccepting = useRef(false);
  const [autoTried, setAutoTried] = useState(false);

  useEffect(() => {
    if (loading || status !== 'invited' || !ARRIVED_VIA_EMAIL_LINK || autoAccepting.current) return;
    autoAccepting.current = true;
    supabase.rpc('accept_invite').then(({ error }) => {
      if (error) console.error('Auto-accept failed:', error);
      setAutoTried(true); // if it failed, fall through to the one-click screen
      refresh();
    });
  }, [loading, status, refresh]);

  if (loading || (status === 'invited' && ARRIVED_VIA_EMAIL_LINK && !autoTried)) {
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
