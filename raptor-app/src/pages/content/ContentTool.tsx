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

interface StepDraft {
  provider: Provider | '';
  template_id: string;
  variables: Record<string, string>;
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

const emptyStep = (): StepDraft => ({ provider: '', template_id: '', variables: {} });

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
  // key for it AND that key confirmed capability for the template's modality.
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
    if (steps.some((s) => !s.provider || !s.template_id)) {
      return showToast('Fill in every step before running', 'error');
    }
    setRunning(true);
    setResults(null);
    setVideoStatus(null);
    setVideoUrl(null);
    try {
      const json = await authedFetch<{ pipeline_id: string; status: string; step_results: StepResult[] }>(
        `${API}/pipeline`,
        { method: 'POST', body: JSON.stringify({ content_type: 'chain', steps }) },
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
          <div className="arsenal-field-row" style={{ alignItems: 'flex-end' }}>
            <div className="arsenal-field">
              <label className="arsenal-label">Provider</label>
              <select
                className="arsenal-input"
                value={newKeyProvider}
                onChange={(e) => setNewKeyProvider(e.target.value as Provider)}
              >
                {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                  <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                ))}
              </select>
            </div>
            <div className="arsenal-field" style={{ flex: 1 }}>
              <label className="arsenal-label">API Key</label>
              <input
                className="arsenal-input"
                type="password"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                placeholder="Stored encrypted — never shown again after saving"
              />
            </div>
            <button className="arsenal-btn" disabled={savingKey} onClick={saveKey}>
              {savingKey ? 'Validating…' : 'Save Key'}
            </button>
          </div>

          {keys.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
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
            const stepTemplate = step.template_id ? templates[step.template_id] : null;
            return (
              <div key={idx} className="arsenal-field" style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ color: 'var(--dim)', fontSize: '0.8rem' }}>Step {idx + 1}{idx > 0 ? ' — chained from step above' : ''}</span>
                  {steps.length > 1 && (
                    <button className="arsenal-copy-btn" onClick={() => removeStep(idx)}>Remove step</button>
                  )}
                </div>

                <div className="arsenal-field-row">
                  <div className="arsenal-field">
                    <label className="arsenal-label">What to generate</label>
                    <select
                      className="arsenal-input"
                      value={step.template_id}
                      onChange={(e) => updateStep(idx, { template_id: e.target.value, provider: '' })}
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
                        value={step.provider}
                        onChange={(e) => updateStep(idx, { provider: e.target.value as Provider })}
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
                <label className="arsenal-label">Step {i + 1} — {PROVIDER_LABEL[r.provider]} · {r.template_id}</label>
                {r.modality === 'text' && <div className="arsenal-code-block" style={{ whiteSpace: 'pre-wrap', color: 'var(--white)' }}>{r.output}</div>}
                {r.modality === 'image' && <img src={r.output} alt="Generated flyer" style={{ maxWidth: '100%', borderRadius: '8px' }} />}
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