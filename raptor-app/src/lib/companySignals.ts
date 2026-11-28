export interface Watch { company_id: string; checked_at: string | null; last_problem: string | null }
export interface CompanySignal {
  id: string; company_id: string; kind: 'hiring' | 'funding' | 'expansion' | 'leadership'; title: string; url: string | null;
  status: 'new' | 'seen' | 'dismissed'; found_at: string; companies?: { name: string } | null;
}
export const SIGNAL_NAMES: Record<CompanySignal['kind'], string> = { hiring: 'Hiring', funding: 'Funding', expansion: 'Expanding', leadership: 'New leader' };
/** The server keeps "how many times in a row: what went wrong"; people see the words. */
export const problemText = (saved: string | null | undefined) => String(saved || '').replace(/^\d+:/, '');
