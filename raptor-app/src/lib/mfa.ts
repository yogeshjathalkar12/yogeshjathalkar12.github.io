import { supabase } from './supabaseClient';

// Two-factor sign-in with an authenticator app (Google Authenticator, Authy,
// 1Password...). Supabase issues the secret and checks the 6-digit codes; a
// session that has passed the check carries `aal2`, and when the owner turns
// on "require two-factor" the database itself refuses to show organization
// data to anything less (jwt_aal2() in 2026-10-05_*.sql).

export interface Assurance {
  /** aal2 once this session has entered a code. */
  current: 'aal1' | 'aal2' | null;
  /** aal2 means the account has an authenticator, so a code is needed. */
  next: 'aal1' | 'aal2' | null;
}

export async function getAssurance(): Promise<Assurance> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { current: null, next: null };
  return { current: data.currentLevel as Assurance['current'], next: data.nextLevel as Assurance['next'] };
}

export interface VerifiedFactor { id: string; friendlyName: string }

export async function listVerifiedFactors(): Promise<VerifiedFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return (data.totp || []).map((f) => ({ id: f.id, friendlyName: f.friendly_name || 'Authenticator app' }));
}

export interface Enrollment { factorId: string; qrCode: string; secret: string }

/** Starts setting up an authenticator. Leftover half-finished setups are
 *  cleared first so a person who abandoned the screen can simply retry. */
export async function startEnrollment(): Promise<Enrollment> {
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of (existing?.all || []) as any[]) {
    if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)} ${Math.random().toString(36).slice(2, 6)}` });
  if (error || !data) throw new Error(error?.message || 'Could not start two-factor setup.');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms a code - used both to finish setup and to sign in. */
export async function verifyCode(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? 'That code didn’t work. Check the code in your app and try again.' : error.message);
}

export async function removeFactor(factorId: string) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error(error.message);
}
