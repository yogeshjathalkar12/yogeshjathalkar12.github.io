import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Background, Controls, MiniMap, addEdge, applyNodeChanges, applyEdgeChanges, ReactFlowProvider,
} from 'reactflow';
import type { Node, Edge, Connection, NodeChange, EdgeChange, NodeMouseHandler } from 'reactflow';
import 'reactflow/dist/style.css';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import FlowNode, { KIND_COLORS, KIND_LABELS } from '../../components/whatsapp/FlowNode';

const NODE_TYPES = { flowNode: FlowNode };
const PALETTE: string[] = ['message', 'question', 'buttons', 'list', 'condition', 'ai_reply', 'handoff', 'end'];

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || `x_${Date.now()}`;
}

function labelFor(kind: string, data: any): string {
  switch (kind) {
    case 'message': return data.text || '';
    case 'question': return data.text || '';
    case 'buttons': return data.body || '';
    case 'list': return data.body || '';
    case 'condition': return data.variable_name ? `if ${data.variable_name}...` : '';
    case 'ai_reply': return data.system_prompt ? 'AI-generated reply' : '';
    case 'handoff': return data.note || 'Hand off to agent';
    case 'end': return 'End conversation';
    default: return '';
  }
}

export default function WaFlowBuilder() {
  const { flowId } = useParams();
  const navigate = useNavigate();

  const [flow, setFlow] = useState<any | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({ name: '', entry_keyword: '', match_type: 'contains' as 'contains' | 'exact' });

  useEffect(() => { fetchFlow(); }, [flowId]);

  async function fetchFlow() {
    const { data } = await supabase.from('whatsapp_flows').select('*').eq('id', flowId).single();
    if (data) {
      setFlow(data);
      setMeta({ name: data.name, entry_keyword: data.entry_keyword, match_type: data.match_type });
      setNodes(data.definition?.nodes || []);
      setEdges(data.definition?.edges || []);
    }
    setLoading(false);
  }

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((connection: Connection) => setEdges((eds) => addEdge(connection, eds)), []);
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => setSelectedNodeId(node.id), []);

  function addNode(kind: string) {
    const id = `${kind}_${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'flowNode',
      position: { x: 200 + Math.random() * 200, y: 150 + Math.random() * 300 },
      data: { kind, label: '', branches: [] },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }

  function updateSelectedNodeData(patch: any) {
    setNodes((nds) => nds.map((n) => {
      if (n.id !== selectedNodeId) return n;
      const newData = { ...n.data, ...patch };
      newData.label = labelFor(newData.kind, newData);
      return { ...n, data: newData };
    }));
  }

  function removeNode(id: string) {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedNodeId === id) setSelectedNodeId(null);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  async function handleSave() {
    setSaving(true);
    try {
      await supabase.from('whatsapp_flows').update({
        name: meta.name.trim(),
        entry_keyword: meta.entry_keyword.trim(),
        match_type: meta.match_type,
        definition: { nodes, edges },
      }).eq('id', flowId);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;
  if (!flow) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Flow not found.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <button onClick={() => navigate('/whatsapp/flows')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>← Back</button>
          <input style={{ ...fieldInputStyle, marginBottom: 0, width: 200 }} value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} placeholder="Flow name" />
          <input style={{ ...fieldInputStyle, marginBottom: 0, width: 160 }} value={meta.entry_keyword} onChange={(e) => setMeta((m) => ({ ...m, entry_keyword: e.target.value }))} placeholder="Entry keyword" />
          <select style={{ ...fieldInputStyle, marginBottom: 0, width: 130 }} value={meta.match_type} onChange={(e) => setMeta((m) => ({ ...m, match_type: e.target.value as 'contains' | 'exact' }))}>
            <option value="contains">Contains</option>
            <option value="exact">Exact</option>
          </select>
        </div>
        <button onClick={handleSave} style={primaryBtnStyle} disabled={saving}>{saving ? 'Saving…' : 'Save Flow'}</button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Palette */}
        <div style={{ width: 130, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.2rem' }}>Add Node</div>
          {PALETTE.map((kind) => (
            <button
              key={kind}
              onClick={() => addNode(kind)}
              style={{
                background: 'var(--surface)', border: `1px solid ${KIND_COLORS[kind]}`, color: KIND_COLORS[kind],
                borderRadius: '4px', padding: '0.5rem', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.62rem',
                textAlign: 'left',
              }}
            >
              + {KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedNodeId(null)}
              nodeTypes={NODE_TYPES}
              fitView
              style={{ background: 'var(--surface2)' }}
            >
              <Background color="var(--border)" gap={16} />
              <Controls />
              <MiniMap style={{ background: 'var(--surface)' }} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* Properties panel */}
        <div style={{ width: 280, flexShrink: 0, overflowY: 'auto' }}>
          {!selectedNode ? (
            <div style={{ color: 'var(--dim2)', fontSize: '0.65rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center' }}>
              Select a node to edit it, or add one from the palette.
            </div>
          ) : (
            <NodeEditor node={selectedNode} onChange={updateSelectedNodeData} onDelete={() => removeNode(selectedNode.id)} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node property editor — shape depends on node.data.kind
// ---------------------------------------------------------------------------

function NodeEditor({ node, onChange, onDelete }: { node: Node; onChange: (patch: any) => void; onDelete: () => void }) {
  const data = node.data;
  const kind = data.kind;

  if (kind === 'start') {
    return (
      <Panel title="Start" onDelete={undefined}>
        <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>Every flow begins here. Connect it to your first real step.</div>
      </Panel>
    );
  }

  if (kind === 'message') {
    return (
      <Panel title="Message" onDelete={onDelete}>
        <Field label="Text to send">
          <textarea style={{ ...fieldInputStyle, minHeight: 90 }} value={data.text || ''} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
      </Panel>
    );
  }

  if (kind === 'question') {
    return (
      <Panel title="Question" onDelete={onDelete}>
        <Field label="Question text">
          <textarea style={{ ...fieldInputStyle, minHeight: 70 }} value={data.text || ''} onChange={(e) => onChange({ text: e.target.value })} />
        </Field>
        <Field label="Store reply as variable">
          <input style={fieldInputStyle} placeholder="e.g. customer_name" value={data.variable_name || ''} onChange={(e) => onChange({ variable_name: e.target.value })} />
        </Field>
        <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>The contact's free-text reply is saved here and can be used later by a Condition node.</div>
      </Panel>
    );
  }

  if (kind === 'buttons') {
    const buttons: any[] = data.buttons || [];
    function setButtons(next: any[]) {
      onChange({ buttons: next, branches: next.map((b) => b.id).filter(Boolean) });
    }
    return (
      <Panel title="Buttons" onDelete={onDelete}>
        <Field label="Body text">
          <textarea style={{ ...fieldInputStyle, minHeight: 60 }} value={data.body || ''} onChange={(e) => onChange({ body: e.target.value })} />
        </Field>
        {buttons.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <input
              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
              placeholder={`Button ${i + 1} label`}
              maxLength={20}
              value={b.title}
              onChange={(e) => {
                const title = e.target.value;
                const next = buttons.map((x, j) => (j === i ? { id: slugify(title), title } : x));
                setButtons(next);
              }}
            />
            <button onClick={() => setButtons(buttons.filter((_, j) => j !== i))} style={smallDangerBtn}>✕</button>
          </div>
        ))}
        {buttons.length < 3 && (
          <button onClick={() => setButtons([...buttons, { id: '', title: '' }])} style={smallAddBtn}>+ Add button</button>
        )}
        <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginTop: '0.5rem' }}>Drag a connection from each button's dot on the canvas to what happens next.</div>
      </Panel>
    );
  }

  if (kind === 'list') {
    const rows: any[] = data.rows || [];
    function setRows(next: any[]) {
      onChange({ rows: next, branches: next.map((r) => r.id).filter(Boolean) });
    }
    return (
      <Panel title="List" onDelete={onDelete}>
        <Field label="Body text">
          <textarea style={{ ...fieldInputStyle, minHeight: 60 }} value={data.body || ''} onChange={(e) => onChange({ body: e.target.value })} />
        </Field>
        <Field label="List button label">
          <input style={fieldInputStyle} maxLength={20} value={data.button_label || ''} onChange={(e) => onChange({ button_label: e.target.value })} />
        </Field>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                placeholder="Option title"
                maxLength={24}
                value={r.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setRows(rows.map((x, j) => (j === i ? { ...x, id: slugify(title), title } : x)));
                }}
              />
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={smallDangerBtn}>✕</button>
            </div>
            <input
              style={{ ...fieldInputStyle, marginBottom: 0 }}
              placeholder="Description (optional)"
              maxLength={72}
              value={r.description || ''}
              onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
            />
          </div>
        ))}
        {rows.length < 10 && (
          <button onClick={() => setRows([...rows, { id: '', title: '', description: '' }])} style={smallAddBtn}>+ Add option</button>
        )}
      </Panel>
    );
  }

  if (kind === 'condition') {
    const cases: any[] = data.cases || [];
    function setCases(next: any[]) {
      onChange({ cases: next, branches: [...next.map((c) => c.value).filter(Boolean), 'default'] });
    }
    return (
      <Panel title="Condition" onDelete={onDelete}>
        <Field label="Check this variable">
          <input style={fieldInputStyle} placeholder="e.g. customer_name" value={data.variable_name || ''} onChange={(e) => onChange({ variable_name: e.target.value })} />
        </Field>
        <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginBottom: '0.5rem' }}>Branches if the variable's value contains the text below (case-insensitive).</div>
        {cases.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <input
              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
              placeholder="Value to match"
              value={c.value}
              onChange={(e) => setCases(cases.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            <button onClick={() => setCases(cases.filter((_, j) => j !== i))} style={smallDangerBtn}>✕</button>
          </div>
        ))}
        <button onClick={() => setCases([...cases, { value: '' }])} style={smallAddBtn}>+ Add case</button>
        <div style={{ fontSize: '0.55rem', color: 'var(--dim2)', marginTop: '0.5rem' }}>A "default" branch always exists too, for anything that doesn't match.</div>
      </Panel>
    );
  }

  if (kind === 'ai_reply') {
    return (
      <Panel title="AI Reply" onDelete={onDelete}>
        <Field label="Extra instructions for this step (optional)">
          <textarea style={{ ...fieldInputStyle, minHeight: 80 }} placeholder="Overrides the account-level system prompt just for this node, if set." value={data.system_prompt || ''} onChange={(e) => onChange({ system_prompt: e.target.value })} />
        </Field>
        <Field label="Fallback text (if AI call fails)">
          <textarea style={{ ...fieldInputStyle, minHeight: 60 }} placeholder="Let me get someone to help you with that." value={data.fallback_text || ''} onChange={(e) => onChange({ fallback_text: e.target.value })} />
        </Field>
      </Panel>
    );
  }

  if (kind === 'handoff') {
    return (
      <Panel title="Hand Off to Agent" onDelete={onDelete}>
        <Field label="Note shown to the agent (optional)">
          <textarea style={{ ...fieldInputStyle, minHeight: 70 }} value={data.note || ''} onChange={(e) => onChange({ note: e.target.value })} />
        </Field>
        <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>Marks this conversation "Waiting" in the shared Inbox and ends the flow. Terminal — no outgoing connection.</div>
      </Panel>
    );
  }

  if (kind === 'end') {
    return (
      <Panel title="End" onDelete={onDelete}>
        <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>Ends the flow cleanly. Terminal — no outgoing connection.</div>
      </Panel>
    );
  }

  return null;
}

function Panel({ title, children, onDelete }: { title: string; children: React.ReactNode; onDelete?: () => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1rem' }}>{title}</div>
        {onDelete && (
          <button onClick={onDelete} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.55rem', padding: '0.3rem 0.5rem', cursor: 'pointer' }}>
            Delete node
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.7rem' }}>
      <label style={{ fontSize: '0.55rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>{label}</label>
      {children}
    </div>
  );
}

const smallAddBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)',
  borderRadius: '4px', fontSize: '0.58rem', padding: '0.35rem 0.6rem', cursor: 'pointer',
};
const smallDangerBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)',
  borderRadius: '4px', fontSize: '0.6rem', padding: '0.3rem 0.5rem', cursor: 'pointer', flexShrink: 0,
};