import { useState } from 'react';
import { generateAiEmailResponse, summarizeMeetingNotes } from '../../lib/aiService';
import Modal, { fieldInputStyle, primaryBtnStyle } from './Modal';

interface AiAssistantModalProps {
  open: boolean;
  contactName?: string;
  onClose: () => void;
  onInsertText?: (text: string) => void;
}

export default function AiAssistantModal({ open, contactName = 'Valued Client', onClose, onInsertText }: AiAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<'email' | 'summary'>('email');
  
  // Email state
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<'professional' | 'casual' | 'persuasive'>('professional');
  const [generatedEmail, setGeneratedEmail] = useState('');

  // Summary state
  const [rawNotes, setRawNotes] = useState('');
  const [summaryOutput, setSummaryOutput] = useState<{ summary: string; actionItems: string[] } | null>(null);

  const [loading, setLoading] = useState(false);

  async function handleGenerateEmail() {
    if (!topic.trim()) return;
    setLoading(true);
    const email = await generateAiEmailResponse(contactName, topic, tone);
    setGeneratedEmail(email);
    setLoading(false);
  }

  async function handleSummarizeNotes() {
    if (!rawNotes.trim()) return;
    setLoading(true);
    const result = await summarizeMeetingNotes(rawNotes);
    setSummaryOutput(result);
    setLoading(false);
  }

  return (
    <Modal open={open} onClose={onClose} title="✨ CRM AI Assistant" width={520}>
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.2rem' }}>
        <button
          onClick={() => setActiveTab('email')}
          style={{
            flex: 1,
            background: activeTab === 'email' ? 'var(--grad)' : 'var(--surface2)',
            color: activeTab === 'email' ? '#fff' : 'var(--dim)',
            border: '1px solid var(--border)',
            padding: '0.5rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.65rem',
            fontFamily: 'var(--mono)',
          }}
        >
          Draft Email
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          style={{
            flex: 1,
            background: activeTab === 'summary' ? 'var(--grad)' : 'var(--surface2)',
            color: activeTab === 'summary' ? '#fff' : 'var(--dim)',
            border: '1px solid var(--border)',
            padding: '0.5rem',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.65rem',
            fontFamily: 'var(--mono)',
          }}
        >
          Summarize Meeting
        </button>
      </div>

      {activeTab === 'email' ? (
        <div>
          <label style={{ fontSize: '0.55rem', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
            Email Topic / Subject
          </label>
          <input
            style={fieldInputStyle}
            placeholder="e.g. Following up on proposal demo"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          <label style={{ fontSize: '0.55rem', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
            Tone
          </label>
          <select style={fieldInputStyle} value={tone} onChange={(e) => setTone(e.target.value as any)}>
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="persuasive">Persuasive</option>
          </select>

          <button onClick={handleGenerateEmail} style={{ ...primaryBtnStyle, width: '100%', marginBottom: '1rem' }} disabled={loading}>
            {loading ? 'Generating…' : '✨ Generate Draft'}
          </button>

          {generatedEmail && (
            <div>
              <textarea
                style={{ ...fieldInputStyle, height: 120, resize: 'vertical' }}
                value={generatedEmail}
                onChange={(e) => setGeneratedEmail(e.target.value)}
              />
              {onInsertText && (
                <button
                  onClick={() => {
                    onInsertText(generatedEmail);
                    onClose();
                  }}
                  style={{ ...primaryBtnStyle, marginTop: '0.5rem' }}
                >
                  Use Draft
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <label style={{ fontSize: '0.55rem', color: 'var(--dim)', display: 'block', marginBottom: '0.3rem' }}>
            Paste Raw Meeting Transcript or Notes
          </label>
          <textarea
            style={{ ...fieldInputStyle, height: 100, resize: 'vertical' }}
            placeholder="Paste notes here..."
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
          />

          <button onClick={handleSummarizeNotes} style={{ ...primaryBtnStyle, width: '100%', marginBottom: '1rem' }} disabled={loading}>
            {loading ? 'Processing…' : '✨ Generate Summary & Action Items'}
          </button>

          {summaryOutput && (
            <div style={{ background: 'var(--surface2)', padding: '1rem', borderRadius: '4px', fontSize: '0.7rem' }}>
              <strong>Summary:</strong>
              <p style={{ color: 'var(--dim)', margin: '0.3rem 0 0.8rem' }}>{summaryOutput.summary}</p>
              <strong>Action Items:</strong>
              <ul style={{ paddingLeft: '1.2rem', color: 'var(--dim)', margin: '0.3rem 0' }}>
                {summaryOutput.actionItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}