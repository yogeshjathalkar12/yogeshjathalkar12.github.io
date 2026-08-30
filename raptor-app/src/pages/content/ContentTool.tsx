import { useEffect, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../../tools/registry';

const TOOL = findTool('content')!;
const API = toolApiBase('content');

type Modality = 'text' | 'image' | 'video';
type Provider = 'openai' | 'google' | 'anthropic';
type StepMode = 'template' | 'custom';

interface TemplateDef {
  modality: Modality;
  template: string;
  variables: string[];
}

interface KeyEntry {
  provider: Provider;
  capabilities: Record<Modality, boolean>;
  created_at: string;
}

interface FileAttachment {
  filename: string;
  media_type: string;
  data_base64: string;
}

interface StepDraft {
  mode: StepMode;
  providers: Provider[]; // execution providers — 1 = single, 2+ = parallel agents on the same prompt
  // template mode
  template_id: string;
  variables: Record<string, string>;
  // custom mode ("write your own prompt")
  modality: Modality;
  subject: string;
  files: FileAttachment[];
  draftProvider: Provider | '';
  draftPrompt: string;
  drafting: boolean;
}

interface StepResult {
  provider: Provider;
  template_id: string;
  modality: Modality;
  output: string;
}

interface PipelineRun {
  id: string;
  content_type: string;
  status: string;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
};

const MAX_FILES_PER_STEP = 3;

const emptyStep = (): StepDraft => ({
  mode: 'custom',
  providers: [],
  template_id: '',
  variables: {},
  modality: 'text',
  subject: '',
  files: [],
  draftProvider: '',
  draftPrompt: '',
  drafting: false,
});

const fileToAttachment = (file: File): Promise<FileAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = (reader.result as string) || '';
      const base64 = result.split(',')[1] || '';
      resolve({ filename: file.name, media_type: file.type || 'application/octet-stream', data_base64: base64 });
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

export default function ContentTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<Record<string, TemplateDef>>({});
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [newKeyProvider, setNewKeyProvider] = useState<Provider>('openai');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<StepResult[] | null>(null);
  const [videoStatus, setVideoStatus] = useState<'running' | 'done' | 'failed' | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [history, setHistory] = useState<PipelineRun[] | null>(null);

  const loadTemplates = async () => {
    const json = await authedFetch<{ templates: Record<string, TemplateDef> }>(`${API}/templates`);
    setTemplates(json.templates);
  };

  const loadKeys = async () => {
    const json = await authedFetch<{ keys: KeyEntry[] }>(`${API}/keys`);
    setKeys(json.keys);
  };

  const loadHistory = async () => {
    try {
      const json = await authedFetch<{ runs: PipelineRun[] }>(`${API}/history`, { skipCreditsSync: true });
      setHistory(json.runs);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadTemplates();
    loadKeys();
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = async () => {
    if (!newKeyValue.trim()) return showToast('Enter an API key', 'error');
    setSavingKey(true);
    try {
      await authedFetch(`${API}/keys`, {
        method: 'POST',
        body: JSON.stringify({ provider: newKeyProvider, api_key: newKeyValue.trim() }),
      });
      showToast(`${PROVIDER_LABEL[newKeyProvider]} key saved`, 'success');
      setNewKeyValue('');
      loadKeys();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not validate key', 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const removeKey = async (provider: Provider) => {
    await authedFetch(`${API}/keys/${provider}`, { method: 'DELETE' });
    loadKeys();
  };

  // A provider only shows up as a choice for a step if the user has saved a
  // key for it AND that key confirmed capability for the relevant modality.
  const providersFor = (modality: Modality): Provider[] =>
    keys.filter((k) => k.capabilities?.[modality]).map((k) => k.provider);

  const templatesFor = (modality: Modality) =>
    Object.entries(templates).filter(([, t]) => t.modality === modality);

  const updateStep = (idx: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addStep = () => {
    if (steps.length >= 5) return;
    setSteps((prev) => [...prev, emptyStep()]);
  };

  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));

  const setStepMode = (idx: number, mode: StepMode) => updateStep(idx, { mode, providers: [] });

  const setStepModality = (idx: number, modality: Modality) =>
    updateStep(idx, { modality, providers: [], draftPrompt: '', draftProvider: '' });

  const toggleStepProvider = (idx: number, provider: Provider) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const has = s.providers.includes(provider);
        return { ...s, providers: has ? s.providers.filter((p) => p !== provider) : [...s.providers, provider] };
      }),
    );
  };

  const handleFilesSelected = async (idx: number, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    try {
      const attachments = await Promise.all(Array.from(fileList).map(fileToAttachment));
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, files: [...s.files, ...attachments].slice(0, MAX_FILES_PER_STEP) } : s)),
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not read that file', 'error');
    }
  };

  const removeFile = (idx: number, filename: string) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, files: s.files.filter((f) => f.filename !== filename) } : s)),
    );
  };

  const draftForStep = async (idx: number) => {
    const step = steps[idx];
    if (!step.subject.trim()) return showToast('Describe what you want first', 'error');
    if (!step.draftProvider) return showToast('Pick a provider to draft with', 'error');
    updateStep(idx, { drafting: true });
    try {
      const json = await authedFetch<{ draft_prompt: string }>(`${API}/draft`, {
        method: 'POST',
        body: JSON.stringify({
          subject: step.subject,
          modality: step.modality,
          provider: step.draftProvider,
          files: step.files,
        }),
      });
      updateStep(idx, { draftPrompt: json.draft_prompt, drafting: false });
    } catch (e) {
      updateStep(idx, { drafting: false });
      showToast(e instanceof Error ? e.message : 'Could not draft a prompt', 'error');
    }
  };

  const pollPipeline = async (pipelineId: string) => {
    const poll = async () => {
      const json = await authedFetch<{ status: string; result: string | null; step_results: StepResult[] }>(
        `${API}/pipeline/${pipelineId}`,
        { skipCreditsSync: true },
      );
      if (json.status === 'running') {
        setTimeout(poll, 6000);
        return;
      }
      setVideoStatus(json.status as 'done' | 'failed');
      if (json.status === 'done') setVideoUrl(json.result);
      if (json.status === 'failed') showToast('Video generation failed', 'error');
      loadHistory();
    };
    poll();
  };

  const runPipeline = async () => {
    const invalid = steps.some((s) =>
      s.mode === 'template'
        ? !s.template_id || s.providers.length === 0
        : !s.draftPrompt.trim() || s.providers.length === 0,
    );
    if (invalid) {
      return showToast('Finish every step: pick a template or draft+edit a prompt, and pick at least one provider', 'error');
    }
    setRunning(true);
    setResults(null);
    setVideoStatus(null);
    setVideoUrl(null);
    try {
      const payloadSteps = steps.map((s) =>
        s.mode === 'template'
          ? { provider: s.providers[0], template_id: s.template_id, variables: s.variables }
          : { providers: s.providers, prompt: s.draftPrompt, modality: s.modality },
      );
      const json = await authedFetch<{ pipeline_id: string; status: string; step_results: StepResult[] }>(
        `${API}/pipeline`,
        { method: 'POST', body: JSON.stringify({ content_type: 'chain', steps: payloadSteps }) },
      );
      setResults(json.step_results);
      if (json.status === 'running') {
        setVideoStatus('running');
        pollPipeline(json.pipeline_id);
      } else {
        loadHistory();
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Pipeline failed', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-card" style={{ marginBottom: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Your API Keys</span></div>
        <div className="arsenal-card-body">
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: '180px' }}>
              <label className="arsenal-label" style={{ display: 'block', marginBottom: '0.4rem' }}>Provider</label>
              <select
                className="arsenal-input"
                value={newKeyProvider}
                onChange={(e) => setNewKeyProvider(e.target.value as Provider)}
                style={{ width: '100%' }}
              >
                {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1', minWidth: '250px' }}>
              <label className="arsenal-label" style={{ display: 'block', marginBottom: '0.4rem' }}>API Key</label>
              <input
                className="arsenal-input"
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Stored encrypted — never shown again after saving"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <button
                className="arsenal-btn"
                disabled={savingKey}
                onClick={saveKey}
                style={{ height: '38px', padding: '0 1.5rem', whiteSpace: 'nowrap' }}
              >
                {savingKey ? 'Validating…' : 'Save Key'}
              </button>
            </div>
          </div>

          {keys.length > 0 && (
            <div style={{ marginTop: '1.2rem', borderTop: '1px solid var(--border)', paddingTop: '0.8rem' }}>
              {keys.map((k) => (
                <div key={k.provider} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--white)' }}>{PROVIDER_LABEL[k.provider]}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--dim)' }}>
                    {(['text', 'image', 'video'] as Modality[]).filter((m) => k.capabilities?.[m]).join(' · ') || 'no confirmed capabilities'}
                  </span>
                  <button className="arsenal-copy-btn" onClick={() => removeKey(k.provider)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="arsenal-card" style={{ marginBottom: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Build Your Content</span></div>
        <div className="arsenal-card-body">
          {steps.map((step, idx) => {
            const stepTemplate = step.mode === 'template' && step.template_id ? templates[step.template_id] : null;
            const draftProviders = providersFor('text');
            const execProviders = providersFor(step.mode === 'template' ? (stepTemplate?.modality ?? 'text') : step.modality);

            return (
              <div key={idx} className="arsenal-field" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <span style={{ color: 'var(--dim)', fontSize: '0.8rem' }}>Step {idx + 1}{idx > 0 ? ' — chained from step above' : ''}</span>
                  {steps.length > 1 && (
                    <button className="arsenal-copy-btn" onClick={() => removeStep(idx)}>Remove step</button>
                  )}
                </div>

                {/* Mode toggle: write your own prompt (default) vs. pick a fixed template */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <button
                    className="arsenal-btn"
                    style={step.mode === 'custom' ? {} : { background: 'transparent', border: '1px solid var(--border)' }}
                    onClick={() => setStepMode(idx, 'custom')}
                  >
                    Write your own prompt
                  </button>
                  <button
                    className="arsenal-btn"
                    style={step.mode === 'template' ? {} : { background: 'transparent', border: '1px solid var(--border)' }}
                    onClick={() => setStepMode(idx, 'template')}
                  >
                    Use a template
                  </button>
                </div>

                {step.mode === 'custom' ? (
                  <>
                    <div className="arsenal-field-row">
                      <div className="arsenal-field">
                        <label className="arsenal-label">What kind of content</label>
                        <select
                          className="arsenal-input"
                          value={step.modality}
                          onChange={(e) => setStepModality(idx, e.target.value as Modality)}
                        >
                          <option value="text">Text</option>
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                        </select>
                      </div>
                    </div>

                    <div className="arsenal-field" style={{ marginTop: '0.6rem' }}>
                      <label className="arsenal-label">What do you want? (subject, goal, anything relevant)</label>
                      <textarea
                        className="arsenal-input"
                        style={{ width: '100%', minHeight: '70px', resize: 'vertical' }}
                        value={step.subject}
                        onChange={(e) => updateStep(idx, { subject: e.target.value })}
                        placeholder="e.g. a launch post for our new espresso machine, aimed at cafe owners"
                      />
                    </div>

                    <div className="arsenal-field" style={{ marginTop: '0.6rem' }}>
                      <label className="arsenal-label">Attach files (optional — images or text files, up to {MAX_FILES_PER_STEP})</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*,text/*"
                        onChange={(e) => {
                          handleFilesSelected(idx, e.target.files);
                          e.target.value = '';
                        }}
                        disabled={step.files.length >= MAX_FILES_PER_STEP}
                      />
                      {step.files.length > 0 && (
                        <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {step.files.map((f) => (
                            <span
                              key={f.filename}
                              style={{ fontSize: '0.75rem', color: 'var(--dim)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                              {f.filename}
                              <button
                                className="arsenal-copy-btn"
                                style={{ padding: 0, lineHeight: 1 }}
                                onClick={() => removeFile(idx, f.filename)}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="arsenal-field-row" style={{ marginTop: '0.6rem', alignItems: 'flex-end' }}>
                      <div className="arsenal-field">
                        <label className="arsenal-label">Draft using</label>
                        <select
                          className="arsenal-input"
                          value={step.draftProvider}
                          onChange={(e) => updateStep(idx, { draftProvider: e.target.value as Provider })}
                        >
                          <option value="">Select…</option>
                          {draftProviders.map((p) => (
                            <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                          ))}
                        </select>
                        {draftProviders.length === 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--dim)', marginTop: '0.3rem' }}>
                            No saved key can draft yet — add one above.
                          </div>
                        )}
                      </div>
                      <button className="arsenal-btn" disabled={step.drafting} onClick={() => draftForStep(idx)}>
                        {step.drafting ? (<><span className="arsenal-spinner" /> Drafting…</>) : 'Draft a prompt'}
                      </button>
                    </div>

                    <div className="arsenal-field" style={{ marginTop: '0.6rem' }}>
                      <label className="arsenal-label">
                        Prompt {step.draftPrompt.trim() ? '— review and edit, then run' : '— draft one above, or write it yourself'}
                      </label>
                      <textarea
                        className="arsenal-input"
                        style={{ width: '100%', minHeight: '110px', resize: 'vertical' }}
                        value={step.draftPrompt}
                        onChange={(e) => updateStep(idx, { draftPrompt: e.target.value })}
                        placeholder="The detailed prompt that actually gets sent to the model. Draft one, or type your own."
                      />
                    </div>

                    <div className="arsenal-field" style={{ marginTop: '0.6rem' }}>
                      <label className="arsenal-label">
                        Run with {execProviders.length > 1 ? '(pick more than one to have them work on it at the same time)' : ''}
                      </label>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {execProviders.map((p) => (
                          <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--white)', fontSize: '0.9rem' }}>
                            <input
                              type="checkbox"
                              checked={step.providers.includes(p)}
                              onChange={() => toggleStepProvider(idx, p)}
                            />
                            {PROVIDER_LABEL[p]}
                          </label>
                        ))}
                      </div>
                      {execProviders.length === 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--dim)', marginTop: '0.3rem' }}>
                          No saved key supports {step.modality} yet — add one above.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="arsenal-field-row">
                      <div className="arsenal-field">
                        <label className="arsenal-label">What to generate</label>
                        <select
                          className="arsenal-input"
                          value={step.template_id}
                          onChange={(e) => updateStep(idx, { template_id: e.target.value, providers: [] })}
                        >
                          <option value="">Select…</option>
                          <optgroup label="Text">
                            {templatesFor('text').map(([id]) => <option key={id} value={id}>{id}</option>)}
                          </optgroup>
                          <optgroup label="Image (flyer)">
                            {templatesFor('image').map(([id]) => <option key={id} value={id}>{id}</option>)}
                          </optgroup>
                          <optgroup label="Video">
                            {templatesFor('video').map(([id]) => <option key={id} value={id}>{id}</option>)}
                          </optgroup>
                        </select>
                      </div>

                      {stepTemplate && (
                        <div className="arsenal-field">
                          <label className="arsenal-label">Provider (only keys that support this)</label>
                          <select
                            className="arsenal-input"
                            value={step.providers[0] || ''}
                            onChange={(e) => updateStep(idx, { providers: e.target.value ? [e.target.value as Provider] : [] })}
                          >
                            <option value="">Select…</option>
                            {providersFor(stepTemplate.modality).map((p) => (
                              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                            ))}
                          </select>
                          {providersFor(stepTemplate.modality).length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--dim)', marginTop: '0.3rem' }}>
                              No saved key supports this yet — add one above.
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {stepTemplate && stepTemplate.variables.length > 0 && (
                      <div className="arsenal-field-row" style={{ marginTop: '0.6rem' }}>
                        {stepTemplate.variables.map((v) => (
                          <div className="arsenal-field" key={v}>
                            <label className="arsenal-label">{v}</label>
                            <input
                              className="arsenal-input"
                              value={step.variables[v] || ''}
                              onChange={(e) => updateStep(idx, { variables: { ...step.variables, [v]: e.target.value } })}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="arsenal-btn" style={{ background: 'transparent', border: '1px solid var(--border)' }} disabled={steps.length >= 5} onClick={addStep}>
              + Chain another AI onto the output
            </button>
            <button className="arsenal-btn" disabled={running} onClick={runPipeline}>
              {running ? (<><span className="arsenal-spinner" /> Running…</>) : 'Generate →'}
            </button>
          </div>
        </div>
      </div>

      {(results || videoStatus) && (
        <div className="arsenal-card" style={{ marginBottom: '1.5rem' }}>
          <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
          <div className="arsenal-card-body">
            {results?.map((r, i) => (
              <div key={i} className="arsenal-field">
                <label className="arsenal-label">
                  {PROVIDER_LABEL[r.provider]} · {r.template_id === 'custom' ? 'Custom prompt' : r.template_id}
                </label>
                {r.modality === 'text' && <div className="arsenal-code-block" style={{ whiteSpace: 'pre-wrap', color: 'var(--white)' }}>{r.output}</div>}
                {r.modality === 'image' && <img src={r.output} alt="Generated" style={{ maxWidth: '100%', borderRadius: '8px' }} />}
              </div>
            ))}
            {videoStatus === 'running' && (
              <div className="arsenal-empty">
                <span className="arsenal-spinner" />
                <div className="arsenal-empty-text">Generating video — this can take a couple of minutes…</div>
              </div>
            )}
            {videoStatus === 'done' && videoUrl && (
              <video src={videoUrl} controls style={{ maxWidth: '100%', borderRadius: '8px' }} />
            )}
            {videoStatus === 'failed' && (
              <div className="arsenal-empty-text">Video generation failed — check the History tab or try again.</div>
            )}
          </div>
        </div>
      )}

      <div className="arsenal-card">
        <div className="arsenal-card-header"><span className="arsenal-card-title">History</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<PipelineRun>
            rows={history}
            keyField={(r) => r.id}
            emptyText="No content generated yet."
            columns={[
              { header: 'Type', render: (r) => r.content_type },
              { header: 'Status', render: (r) => r.status },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}