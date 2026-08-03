import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useCredits } from './CreditsContext';
import { useToast } from './ToastContext';
import { ApiError, OutOfCreditsError, UnauthorizedError } from '../lib/apiErrors';

interface AuthedFetchOptions extends RequestInit {
  /** Skip automatic credits sync from `credits_left` in the response body. */
  skipCreditsSync?: boolean;
}

/**
 * Every tool page used to hand-write this exact sequence:
 *   1. pull the bearer token off the Supabase session
 *   2. attach it + Content-Type
 *   3. on 401: sign out, toast, redirect to login
 *   4. on 402: surface "out of credits" (each tool did this slightly
 *      differently — some toasted, some showed an upgrade wall)
 *   5. on non-ok: try to parse `{ detail }` for an error message
 *   6. on success: read `credits_left` off the body and push it into the
 *      topbar/wherever credits are shown
 *   7. on network failure: toast, and — critically — do NOT log a fake
 *      history entry, since nothing was actually verified
 *
 * This hook is that sequence, written once. Callers get back parsed JSON
 * or a typed error (UnauthorizedError / OutOfCreditsError / ApiError) and
 * decide what to render — they never touch fetch(), headers, or status
 * codes directly again.
 */
export function useAuthedFetch() {
  const { signOut } = useAuth();
  const { syncFromServer } = useCredits();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const authedFetch = useCallback(
    async <T = unknown>(url: string, options: AuthedFetchOptions = {}): Promise<T> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Session expired — please log in again', 'error');
        setTimeout(() => navigate('/login'), 1200);
        throw new UnauthorizedError();
      }

      let res: Response;
      try {
        res = await fetch(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
      } catch {
        // Network/CORS/server-down. Never fabricate a result here — the
        // caller must treat this the same way the old verify-email flow
        // did: report failure plainly, charge nothing, log nothing.
        showToast('Could not reach the server — check your connection', 'error');
        throw new ApiError('Network error', 0);
      }

      if (res.status === 401) {
        showToast('Session expired — please log in again', 'error');
        await signOut();
        setTimeout(() => navigate('/login'), 1200);
        throw new UnauthorizedError();
      }

      if (res.status === 402) {
        throw new OutOfCreditsError();
      }

      if (!res.ok) {
        let detail = `API error ${res.status}`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          /* body wasn't JSON — keep generic message */
        }
        throw new ApiError(detail, res.status);
      }

      const json = (await res.json()) as T & { credits_left?: number };
      if (!options.skipCreditsSync && typeof json.credits_left === 'number') {
        syncFromServer(json.credits_left);
      }
      return json;
    },
    [signOut, syncFromServer, showToast, navigate]
  );

  return { authedFetch };
}
