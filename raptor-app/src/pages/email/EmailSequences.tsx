import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';
import EmailBodyEditor from '../../components/email/EmailBodyEditor';

const EMAIL_API = toolApiBase('email');

const BRANCH_CONDITIONS = [
  { value: 'opened', label: 'Opened this step' },
  { value: 'not_opened', label: "Didn't open this step" },
  { value: 'clicked', label: 'Clicked a link in this step' },
  { value: 'not_clicked', label: "Didn't click a link in this step" },
];

export default function EmailSequences() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [sequences, setSequences] = useState<any[]>([]);
  const [sequenceId, setSequenceId] = useState('');
  const [steps, setSteps] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSequenceName, setNewSequenceName] = useState('');
  const [creatingSequence, setCreatingSequence] = useState(false);

  const [stepSubject, setStepSubject] = useState('');
  const [stepBodyHtml, setStepBodyHtml] = useState('');
  const [stepDelayHours, setStepDelayHours] = useState('24');
  const [stepIsTransactional, setStepIsTransactional] = useState(false);
  const [addingStep, setAddingStep] = useState(false);

  // Branch editor — open for at most one step at a time
  const [branchEditorStepId, setBranchEditorStepId] = useState<string | null>(null);
  const [branchWaitHours, setBranchWaitHours] = useState('24');
  const [branchRules, setBranchRules] = useState<{ condition: string; next_step_id: string }[]>([]);
  const [savingBranch, setSavingBranch] = useState(false);

  const [enrollEmails, setEnrollEmails] = useState('');
  const [enrollTag, setEnrollTag] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) fetchSequences();
  }, [accountId]);

  useEffect(() => {
    if (sequenceId) {
      fetchSteps();
      setEnrollResult(null);
      const channel = supabase
        .channel(`email-sequence-${sequenceId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_sequence_steps', filter: `sequence_id=eq.${sequenceId}` }, fetchSteps)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } else {
      setSteps([]);
    }
  }, [sequenceId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('email_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchSequences() {
    const { data } = await supabase
      .from('email_sequences')
      .select('*, email_sequence_enrollments(status)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setSequences(data || []);
    setSequenceId(data && data.length > 0 ? data[0].id : '');
  }

  async function fetchSteps() {
    const { data } = await supabase
      .from('email_sequence_steps')
      .select('*')
      .eq('sequence_id', sequenceId)
      .order('step_order', { ascending: true });
    setSteps(data || []);
    fetchBranches(data || []);
  }

  async function fetchBranches(currentSteps: any[]) {
    if (currentSteps.length === 0) {
      setBranches([]);
      return;
    }
    const { data } = await supabase
      .from('email_sequence_step_branches')
      .select('*')
      .in('step_id', currentSteps.map((s) => s.id));
    setBranches(data || []);
  }

  function enrollmentCounts(seq: any) {
    const enrollments = seq.email_sequence_enrollments || [];
    return {
      active: enrollments.filter((e: any) => e.status === 'active').length,
      completed: enrollments.filter((e: any) => e.status === 'completed').length,
      stopped: enrollments.filter((e: any) => e.status === 'stopped').length,
    };
  }

  async function handleCreateSequence(e: React.FormEvent) {
    e.preventDefault();
    if (!newSequenceName.trim()) return;
    setCreatingSequence(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('email_sequences').insert({
        account_id: accountId,
        name: newSequenceName.trim(),
      });
      if (insertErr) throw insertErr;
      setNewSequenceName('');
      fetchSequences();
    } catch (err: any) {
      setError(err.message || 'Could not create sequence.');
    } finally {
      setCreatingSequence(false);
    }
  }

  async function handleToggleSequenceStatus(seq: any) {
    await supabase.from('email_sequences').update({ status: seq.status === 'active' ? 'paused' : 'active' }).eq('id', seq.id);
    fetchSequences();
  }

  async function handleDeleteSequence(id: string) {
    if (!confirm('Delete this sequence and all its steps? Enrollment history stays in your event log.')) return;
    await supabase.from('email_sequence_steps').delete().eq('sequence_id', id);
    await supabase.from('email_sequences').delete().eq('id', id);
    if (sequenceId === id) setSequenceId('');
    fetchSequences();
  }

  async function handleAddStep(e: React.FormEvent) {
    e.preventDefault();
    if (!stepSubject.trim() || !stepBodyHtml.trim()) {
      setError('Fill in the subject and body.');
      return;
    }
    if (!stepIsTransactional && !stepBodyHtml.includes('{{unsubscribe_url}}')) {
      setError('Non-transactional steps must include {{unsubscribe_url}}.');
      return;
    }
    const delay = parseInt(stepDelayHours, 10);
    if (Number.isNaN(delay) || delay < 0) {
      setError('Delay must be a number of hours, 0 or more.');
      return;
    }
    setAddingStep(true);
    setError(null);
    try {
      const nextOrder = steps.length > 0 ? Math.max(...steps.map((s) => s.step_order)) + 1 : 1;
      const { error: insertErr } = await supabase.from('email_sequence_steps').insert({
        sequence_id: sequenceId,
        step_order: nextOrder,
        delay_hours: delay,
        subject: stepSubject.trim(),
        body_html: stepBodyHtml,
        is_transactional: stepIsTransactional,
      });
      if (insertErr) throw insertErr;
      setStepSubject('');
      setStepDelayHours('24');
      setStepIsTransactional(false);
      setFormResetKey((k) => k + 1);
      fetchSteps();
    } catch (err: any) {
      setError(err.message || 'Could not add step.');
    } finally {
      setAddingStep(false);
    }
  }

  async function handleDeleteStep(id: string) {
    if (!confirm("Delete this step? Anyone currently waiting on it will have their sequence end early instead of skipping ahead — pausing the sequence first is safer if it's actively enrolling people.")) return;
    await supabase.from('email_sequence_steps').delete().eq('id', id);
    fetchSteps();
  }

  function openBranchEditor(step: any) {
    setBranchEditorStepId(step.id);
    setBranchWaitHours(step.branch_wait_hours != null ? String(step.branch_wait_hours) : '24');
    const existing = branches.filter((b) => b.step_id === step.id);
    setBranchRules(
      existing.length > 0
        ? existing.map((b) => ({ condition: b.condition, next_step_id: b.next_step_id || '' }))
        : [{ condition: 'opened', next_step_id: '' }, { condition: 'not_opened', next_step_id: '' }]
    );
  }

  function closeBranchEditor() {
    setBranchEditorStepId(null);
    setBranchRules([]);
  }

  function updateBranchRule(index: number, patch: Partial<{ condition: string; next_step_id: string }>) {
    setBranchRules((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addBranchRule() {
    setBranchRules((prev) => [...prev, { condition: 'opened', next_step_id: '' }]);
  }

  function removeBranchRule(index: number) {
    setBranchRules((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSaveBranch() {
    if (!branchEditorStepId) return;
    const wait = parseInt(branchWaitHours, 10);
    if (Number.isNaN(wait) || wait < 1) {
      setError('Branch wait time must be at least 1 hour.');
      return;
    }
    const completeRules = branchRules.filter((r) => r.condition);
    if (completeRules.length === 0) {
      setError('Add at least one branch rule, or use "Remove branch" instead.');
      return;
    }
    setSavingBranch(true);
    setError(null);
    try {
      const { error: stepErr } = await supabase
        .from('email_sequence_steps')
        .update({ branch_wait_hours: wait })
        .eq('id', branchEditorStepId);
      if (stepErr) throw stepErr;

      await supabase.from('email_sequence_step_branches').delete().eq('step_id', branchEditorStepId);
      const { error: insertErr } = await supabase.from('email_sequence_step_branches').insert(
        completeRules.map((r) => ({
          step_id: branchEditorStepId,
          condition: r.condition,
          next_step_id: r.next_step_id || null,  // null = ends the sequence
        }))
      );
      if (insertErr) throw insertErr;

      closeBranchEditor();
      fetchSteps();
    } catch (err: any) {
      setError(err.message || 'Could not save the branch.');
    } finally {
      setSavingBranch(false);
    }
  }

  async function handleRemoveBranch(stepId: string) {
    if (!confirm('Remove branching from this step? It will go back to advancing to the next step in order.')) return;
    await supabase.from('email_sequence_steps').update({ branch_wait_hours: null }).eq('id', stepId);
    await supabase.from('email_sequence_step_branches').delete().eq('step_id', stepId);
    if (branchEditorStepId === stepId) closeBranchEditor();
    fetchSteps();
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    const contact_emails = enrollEmails
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const audience_tag = enrollTag.trim();
    if (contact_emails.length === 0 && !audience_tag) {
      setError('Enter at least one email or an audience tag.');
      return;
    }
    if (steps.length === 0) {
      setError('Add at least one step before enrolling anyone.');
      return;
    }
    setEnrolling(true);
    setError(null);
    setEnrollResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/sequences/${sequenceId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ contact_emails, audience_tag: audience_tag || undefined }),
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.detail || `Could not enroll (${resp.status}).`);
      setEnrollResult(`Enrolled ${body.enrolled}, skipped ${body.skipped} (already active or duplicate).`);
      setEnrollEmails('');
      setEnrollTag('');
      fetchSequences();
    } catch (err: any) {
      setError(err.message || 'Could not enroll contacts.');
    } finally {
      setEnrolling(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;

  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a sending account first.</div>;
  }

  const currentSequence = sequences.find((s) => s.id === sequenceId);

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
        {sequences.length > 0 && (
          <select style={{ ...fieldInputStyle, marginBottom: 0, width: 280 }} value={sequenceId} onChange={(e) => setSequenceId(e.target.value)}>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        A sequence walks each enrolled contact through an ordered list of emails automatically —
        step 1 goes out after its own delay from enrollment, each step after that waits its own
        delay from when the previous one sent. Unlike triggers and follow-ups, every step needs an
        unsubscribe link unless marked transactional. Any step can also branch: wait, then route to
        a different step (or end the sequence) based on whether it was opened or clicked.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Sequence</div>
        <form onSubmit={handleCreateSequence} style={{ display: 'flex', gap: '0.8rem' }}>
          <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Sequence name (e.g. New subscriber nurture)" value={newSequenceName} onChange={(e) => setNewSequenceName(e.target.value)} />
          <button type="submit" style={{ ...primaryBtnStyle, width: 'auto', padding: '0.6rem 1.2rem' }} disabled={creatingSequence}>
            {creatingSequence ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>

      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}

      {sequences.length === 0 ? (
        <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No sequences yet — create one above.</div>
      ) : currentSequence ? (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', marginBottom: '1.6rem', maxWidth: 620, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{currentSequence.name}</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                {currentSequence.status} · {steps.length} step{steps.length !== 1 ? 's' : ''}
                {(() => {
                  const c = enrollmentCounts(currentSequence);
                  return c.active + c.completed + c.stopped > 0
                    ? ` · ${c.active} active, ${c.completed} completed${c.stopped ? `, ${c.stopped} stopped` : ''}`
                    : '';
                })()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => handleToggleSequenceStatus(currentSequence)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
              >
                {currentSequence.status === 'active' ? 'Pause' : 'Activate'}
              </button>
              <button
                onClick={() => handleDeleteSequence(currentSequence.id)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
              >
                Delete
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Steps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: 620, marginBottom: '1.4rem' }}>
            {steps.length === 0 ? (
              <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No steps yet — add one below.</div>
            ) : (
              steps.map((s) => {
                const stepBranches = branches.filter((b) => b.step_id === s.id);
                const hasBranch = s.branch_wait_hours != null && stepBranches.length > 0;
                return (
                  <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.8rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--white)' }}>
                          Step {s.step_order}: {s.subject}
                          {s.is_transactional && <span style={{ color: 'var(--purple)', fontSize: '0.55rem', marginLeft: '0.5rem' }}>TRANSACTIONAL</span>}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                          {s.delay_hours}h after {s.step_order === 1 ? 'enrollment' : 'the previous step'}
                        </div>
                        {hasBranch && (
                          <div style={{ fontSize: '0.6rem', color: 'var(--purple)', marginTop: '0.3rem' }}>
                            Branches {s.branch_wait_hours}h later: {stepBranches.map((b) => {
                              const label = BRANCH_CONDITIONS.find((c) => c.value === b.condition)?.label || b.condition;
                              const target = b.next_step_id ? steps.find((st) => st.id === b.next_step_id) : null;
                              return `${label} → ${target ? `Step ${target.step_order}` : 'End sequence'}`;
                            }).join(' · ')}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button
                          onClick={() => (branchEditorStepId === s.id ? closeBranchEditor() : openBranchEditor(s))}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: hasBranch ? 'var(--purple)' : 'var(--dim)', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem' }}
                        >
                          {hasBranch ? 'Edit branch' : 'Branch'}
                        </button>
                        {hasBranch && (
                          <button
                            onClick={() => handleRemoveBranch(s.id)}
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem' }}
                          >
                            Remove branch
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteStep(s.id)}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {branchEditorStepId === s.id && (
                      <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <label style={{ fontSize: '0.6rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          Wait
                          <input
                            type="number"
                            min={1}
                            style={{ ...fieldInputStyle, marginBottom: 0, width: 70 }}
                            value={branchWaitHours}
                            onChange={(e) => setBranchWaitHours(e.target.value)}
                          />
                          hours after this step sends, then decide what's next based on how it was received.
                        </label>

                        {branchRules.map((rule, i) => (
                          <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select
                              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                              value={rule.condition}
                              onChange={(e) => updateBranchRule(i, { condition: e.target.value })}
                            >
                              {BRANCH_CONDITIONS.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                            <span style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>→</span>
                            <select
                              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                              value={rule.next_step_id}
                              onChange={(e) => updateBranchRule(i, { next_step_id: e.target.value })}
                            >
                              <option value="">End sequence</option>
                              {steps.filter((st) => st.id !== s.id).map((st) => (
                                <option key={st.id} value={st.id}>Step {st.step_order}: {st.subject}</option>
                              ))}
                            </select>
                            {branchRules.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeBranchRule(i)}
                                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.55rem', flexShrink: 0 }}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addBranchRule}
                          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem', alignSelf: 'flex-start' }}
                        >
                          + Add rule
                        </button>
                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                          <button
                            type="button"
                            onClick={handleSaveBranch}
                            disabled={savingBranch}
                            style={{ ...primaryBtnStyle, flex: 'none', width: 'auto', padding: '0.5rem 1rem' }}
                          >
                            {savingBranch ? 'Saving…' : 'Save branch'}
                          </button>
                          <button
                            type="button"
                            onClick={closeBranchEditor}
                            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', marginBottom: '1rem' }}>Add Step {steps.length + 1}</div>
            <form onSubmit={handleAddStep} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input style={fieldInputStyle} placeholder="Subject — supports {{first_name}} and {a|b} spintax" value={stepSubject} onChange={(e) => setStepSubject(e.target.value)} />
              <EmailBodyEditor
                key={formResetKey}
                initialHtml={stepBodyHtml}
                onChange={setStepBodyHtml}
                requireUnsubscribe={!stepIsTransactional}
              />
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Delay
                  <input
                    type="number"
                    min={0}
                    style={{ ...fieldInputStyle, marginBottom: 0, width: 90 }}
                    value={stepDelayHours}
                    onChange={(e) => setStepDelayHours(e.target.value)}
                  />
                  hours after {steps.length === 0 ? 'enrollment' : 'the previous step'}
                </label>
                <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input type="checkbox" checked={stepIsTransactional} onChange={(e) => setStepIsTransactional(e.target.checked)} />
                  Transactional
                </label>
              </div>
              <button type="submit" style={primaryBtnStyle} disabled={addingStep}>
                {addingStep ? 'Adding…' : 'Add Step'}
              </button>
            </form>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', maxWidth: 620 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.1rem', marginBottom: '1rem' }}>Enroll Contacts</div>
            <form onSubmit={handleEnroll} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <textarea
                style={{ ...fieldInputStyle, minHeight: 80, fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical' }}
                placeholder="Emails, one per line or comma-separated (optional)"
                value={enrollEmails}
                onChange={(e) => setEnrollEmails(e.target.value)}
              />
              <input style={fieldInputStyle} placeholder="Audience tag (optional — enrolls everyone with this tag)" value={enrollTag} onChange={(e) => setEnrollTag(e.target.value)} />
              {enrollResult && <div style={{ color: 'var(--dim)', fontSize: '0.65rem' }}>{enrollResult}</div>}
              <button type="submit" style={{ ...primaryBtnStyle, width: 'auto', padding: '0.6rem 1.2rem' }} disabled={enrolling}>
                {enrolling ? 'Enrolling…' : 'Enroll'}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}