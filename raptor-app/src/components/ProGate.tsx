import type { ReactNode } from 'react';
import { useCredits } from '../hooks/CreditsContext';
import { useOrg } from '../hooks/OrgContext';

interface ProGateProps {
  /** Short name of the feature, e.g. "Email automation". */
  feature: string;
  /** Finishes the sentence "Upgrade to Pro for ...". */
  headline: string;
  /** What the person gets, in plain words. */
  points: string[];
  children: ReactNode;
}

/** True when the organization is on the Pro plan. */
export function useIsPro() {
  const { plan, planLoaded } = useCredits();
  return { isPro: plan.toLowerCase() === 'pro', planLoaded };
}

// Wraps a Pro-only area. Pro: shows the area. Free: shows what Pro unlocks
// here and an Upgrade button (or, for a team member, who to ask - only the
// owner can change the plan). The server refuses these actions on the Free
// plan too (raptor_auth.require_pro), so this is the friendly half of the lock.
export default function ProGate({ feature, headline, points, children }: ProGateProps) {
  const { isPro, planLoaded } = useIsPro();
  const { isOwner } = useOrg();

  if (!planLoaded) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.75rem' }}>Loading…</div>;
  }
  if (isPro) return <>{children}</>;

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 8, padding: '1.8rem', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>Pro feature</div>
        <h2 style={{ margin: '0.5rem 0 0.4rem', color: 'var(--white)' }}>Upgrade to Pro for {headline}</h2>
        <p style={{ color: 'var(--dim)', fontSize: '0.78rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
          {feature} is part of the Pro plan. Here&rsquo;s what you get:
        </p>
        <ul style={{ margin: '0 0 1.4rem', paddingLeft: '1.1rem', color: 'var(--white)', fontSize: '0.78rem', lineHeight: 1.9 }}>
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
        {isOwner ? (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('raptor:open-payment'))}
            style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            Upgrade to Pro
          </button>
        ) : (
          <div style={{ color: 'var(--dim)', fontSize: '0.72rem', lineHeight: 1.6 }}>
            Your organization is on the Free plan. Ask your organization&rsquo;s owner to upgrade, and this will unlock for everyone on the team.
          </div>
        )}
      </div>
    </div>
  );
}

export const PRO_COPY = {
  email: {
    feature: 'Email automation',
    headline: 'email campaigns that run on their own',
    points: [
      'Send campaigns from your own mailbox, at a safe human pace',
      'Automatic follow-ups, multi-step sequences and triggers',
      'Test two versions of an email and see which gets more opens',
      'Segments, opt-outs and open/click analytics',
    ],
  },
  whatsapp: {
    feature: 'WhatsApp automation',
    headline: 'WhatsApp broadcasts and auto-replies on your own number',
    points: [
      'Send a message to many contacts at once',
      'Drip sequences that follow up automatically',
      'AI flows and keyword auto-replies, even when you’re away',
      'A shared inbox to reply to customers yourself',
    ],
  },
  content: {
    feature: 'The AI Content Suite',
    headline: 'AI-written sales emails and campaign copy',
    points: [
      'Draft sales emails, social posts and campaign copy in seconds',
      'Use your own OpenAI, Google or Anthropic account — no markup',
      'Multi-step pipelines that draft, then refine, then polish',
    ],
  },
  playground: {
    feature: 'The AI Playground',
    headline: 'practising sales conversations with an AI prospect',
    points: [
      'Role-play a real lead from your CRM, with their stage and deal value',
      'Get coached on your pitch and handling of objections',
      'Practise as often as you like before the real call',
    ],
  },
};
