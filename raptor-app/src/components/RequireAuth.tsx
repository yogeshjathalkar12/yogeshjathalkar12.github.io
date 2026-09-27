import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useAuth } from '../hooks/AuthContext';

// The app has no login screen of its own — signing in happens once, on the
// landing page (ventures/raptor/index.html, via script.js's auth modal),
// which lands you back here already signed in (same origin, same Supabase
// project, so the session carries over with nothing extra to build). A
// visit with no session bounces OUT to that real login, instead of to a
// second, bolted-on login page inside this app — that second page used to
// exist and is what caused the "logs in twice" loop.
const LOGIN_URL = 'https://shoonyaorigins.com/ventures/raptor/?auth=login';

function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <span className="arsenal-spinner" />
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) window.location.href = LOGIN_URL;
  }, [loading, user]);

  if (loading || !user) return <Spinner />;

  return <>{children}</>;
}
