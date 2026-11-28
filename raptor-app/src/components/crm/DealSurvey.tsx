import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { SURVEY_REASONS, surveyDraft, surveyLink, surveyState, type Survey } from '../../lib/buyerSurveys';
import { useOrg } from '../../hooks/OrgContext';
import { fieldInputStyle, fieldLabelStyle, toolBtnStyle } from './Modal';

const small: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: 6 };

/** On a won or lost deal: ask the buyer why, and show what they answered. */
export default function DealSurvey({ dealId, contactId }: { dealId: string; contactId: string | null }) {
  const { can } = useOrg();
  const [rows, setRows] = useState<Survey[] | null>(null);
  const [person, setPerson] = useState<{ name: string; email: string }>({ name: '', email: '' });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: failed } = await supabase.from('deal_surveys').select('*').eq('deal_id', dealId).order('created_at', { ascending: false });
    if (failed) {
      if (!isNotInstalled(failed)) setError(failed.message);
      return;
    }
    setRows((data || []) as Survey[]);
  }, [dealId]);
  useEffect(() => { setRows(null); setError(''); setCopied(false); load(); }, [load]);
  useEffect(() => {
    if (!contactId) return;
    Promise.resolve(supabase.from('contacts').select('name, email').eq('id', contactId).limit(1))
      .then(({ data }) => setPerson({ name: data?.[0]?.name || '', email: data?.[0]?.email || '' })).catch(() => {});
  }, [contactId]);

  // where the database part is missing nothing is shown
  if (rows === null) return error ? <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div> : null;
  const open = rows.find((r) => surveyState(r) === 'waiting' || surveyState(r) === 'opened');
  const answered = rows.filter((r) => r.answered_at);
  const stale = rows.find((r) => surveyState(r) === 'expired');

  const make = async () => {
    setBusy(true);
    setError('');
    // an old unanswered link is replaced: only one can be open at a time
    if (stale) await supabase.from('deal_surveys').delete().eq('id', stale.id);
    const { error: failed } = await supabase.from('deal_surveys').insert({ deal_id: dealId });
    if (failed) setError(/row-level security|permission/i.test(failed.message) ? 'You may not make a survey for this deal.' : failed.message);
    setBusy(false);
    load();
  };
  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(surveyLink(token));
      setCopied(true);
    } catch {
      setError('Could not copy. Select the link and copy it yourself.');
    }
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={fieldLabelStyle}>Ask the buyer why</label>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div>}
      {answered.map((r) => (
        <div key={r.id} style={{ fontSize: '0.68rem', color: 'var(--white)', lineHeight: 1.7, border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.7rem', marginBottom: 6 }}>
          <div>Answered {new Date(r.answered_at as string).toLocaleDateString()}: <strong>{SURVEY_REASONS[r.reason || ''] || r.reason}</strong>{r.chose ? `, chose ${r.chose}` : ''}{r.rating ? `, rated us ${r.rating} of 5` : ''}</div>
          {r.better && <div dir="auto" style={{ color: 'var(--dim)' }}>“{r.better}”</div>}
        </div>
      ))}
      {open ? (
        <>
          <div style={small}>{surveyState(open) === 'opened' ? 'The buyer opened the link but has not answered.' : 'Not opened yet.'} It closes on {new Date(open.expires_at).toLocaleDateString()}.</div>
          <input aria-label="Survey link" readOnly value={surveyLink(open.token)} onFocus={(e) => e.target.select()} style={{ ...fieldInputStyle, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={toolBtnStyle} onClick={() => copy(open.token)}>{copied ? 'Copied' : 'Copy link'}</button>
            {person.email && <a href={surveyDraft(open.token, person.email, person.name)} style={{ ...toolBtnStyle, textDecoration: 'none', display: 'inline-block' }}>Open an email draft</a>}
          </div>
        </>
      ) : (
        <>
          {answered.length === 0 && <div style={small}>A one-minute page for the buyer: the main reason, who they chose, and what could have been better. You send the link yourself.</div>}
          {can('edit') && <button type="button" style={toolBtnStyle} disabled={busy} onClick={make}>{stale ? 'Make a new survey link' : answered.length ? 'Make another survey link' : 'Make a survey link'}</button>}
        </>
      )}
    </div>
  );
}
