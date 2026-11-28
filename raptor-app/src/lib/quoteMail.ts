// Emails a sent quote's link to the quote's own contact, from Raptor's address, with replies going to the person who pressed the button
// (server: raptor/crm/quote_mail_router.py).
import { supabase } from './supabaseClient';

const API_BASE = import.meta.env.VITE_RAPTOR_API_URL || 'https://websites-api-5wmu.onrender.com';

export async function emailQuote(quoteId: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to do this.');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api/raptor/quote-mail/${encodeURIComponent(quoteId)}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error('Could not reach the server. It may be starting up: try again in a minute.');
  }
  const answer = await response.json().catch(() => ({}));
  if (response.status === 404 && answer.detail === 'Not Found') throw new Error('The server does not have this feature yet.');
  if (!response.ok) throw new Error(typeof answer.detail === 'string' ? answer.detail : 'The quote could not be emailed.');
  return String(answer.to || 'the customer');
}
