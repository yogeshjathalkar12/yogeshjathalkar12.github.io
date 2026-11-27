import type { ReactNode } from 'react';
import { useCredits } from '../hooks/CreditsContext';
import { useOrg } from '../hooks/OrgContext';
import { SECTION_NAME } from '../pages/connections/hub/channels';
import { hasFeature, type Feature } from '../lib/plans';

interface ProGateProps {
  /** Short name of the feature, e.g. "Email automation". */
  feature: string;
  /** Finishes the sentence "A paid plan unlocks ...". */
  headline: string;
  /** What the person gets, in plain words. */
  points: string[];
  /** The part of a plan this needs; the web's paid features (Reach and up) unless said otherwise. */
  needs?: Feature;
  children: ReactNode;
}

/** True when the organization's plan includes the web app's paid features (Reach and up, and the earlier Pro plans). */
export function useIsPro() {
  const { plan, planLoaded } = useCredits();
  return { isPro: hasFeature(plan, 'automation'), planLoaded };
}

// Wraps a Pro-only area. Pro: shows the area. Free: shows what Pro unlocks
// here and an Upgrade button (or, for a team member, who to ask - only the
// owner can change the plan). The server refuses these actions on the Free
// plan too (raptor_auth.require_pro), so this is the friendly half of the lock.
export default function ProGate({ feature, headline, points, needs = 'automation', children }: ProGateProps) {
  const { plan, planLoaded } = useCredits();
  const isPro = hasFeature(plan, needs);
  const { isOwner } = useOrg();

  if (!planLoaded) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.75rem' }}>Loading…</div>;
  }
  if (isPro) return <>{children}</>;

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 8, padding: '1.8rem', background: 'var(--surface)' }}>
        <div style={{ fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--purple)', fontFamily: 'var(--mono)' }}>Paid feature</div>
        <h2 style={{ margin: '0.5rem 0 0.4rem', color: 'var(--white)' }}>A paid plan unlocks {headline}</h2>
        <p style={{ color: 'var(--dim)', fontSize: '0.78rem', lineHeight: 1.6, margin: '0 0 1rem' }}>
          {feature} is part of {needs === 'desktop_engine' ? 'the Core plan and up' : 'the paid plans'}. Here&rsquo;s what you get:
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
            See plans
          </button>
        ) : (
          <div style={{ color: 'var(--dim)', fontSize: '0.72rem', lineHeight: 1.6 }}>
            Your organization&rsquo;s plan does not include this. Ask your organization&rsquo;s owner to upgrade, and it will unlock for everyone on the team.
          </div>
        )}
      </div>
    </div>
  );
}

export const PRO_COPY = {
  calls: {
    needs: 'desktop_engine' as Feature,
    feature: 'Call analytics',
    headline: 'seeing and coaching your team’s calls',
    points: [
      'Every call from the PC app with who said what, and when',
      'Talk share, questions, concerns and next steps, counted for every call',
      'Your own watch words, scorecards, comments and a library of good calls',
      'Team figures by person and by week',
    ],
  },
  competitors: {
    needs: 'desktop_engine' as Feature,
    feature: 'Competitor tracking',
    headline: 'keeping an eye on your competitors as a team',
    points: [
      'One list of competitors and one feed of their price and page changes',
      'Battle cards you can correct, with the source of every statement',
      'Wins and losses against each competitor, and what your calls say about them',
    ],
  },
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
  sms: {
    feature: 'SMS',
    headline: 'text messages that follow up and answer for you',
    points: [
      'Text people one at a time from your own Twilio number, never a blast',
      'An inbox for replies, and follow-ups that stop the moment someone answers',
      'Keyword auto-replies, and STOP is always respected',
      'An SMS button on every pipeline card, or fully automatic for new deals',
    ],
  },
  connections: {
    feature: SECTION_NAME,
    headline: 'connecting your channels and data sources',
    points: [
      'One tab for each channel: YouTube, Google Analytics, Google reviews, payments, Slack and Teams, Telegram, SMS and news',
      'A Home tab that reads across all of them and tells you what needs attention',
      'Alerts the moment a payment arrives, a review comes in or someone shows buying interest',
      'Everything stays with your organization; keys are saved encrypted',
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
