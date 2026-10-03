import { lazy, type LazyExoticComponent, type ComponentType } from 'react';

export interface ToolMeta {
  slug: string; // used in route path and API base, e.g. 'chronos'
  route: string; // e.g. '/tools/chronos'
  icon: string; // matches the glyphs already used in dashboard.html's sidebar
  navLabel: string;
  eyebrow: string; // "Tool 05 / Send-Time Optimization"
  title: string; // can contain a literal "\n" for the two-line hero title
  description: string;
  costLabel: string; // "1 credit / resolve"
  engineLabel: string;
  extraMeta?: string[]; // additional hero-meta chips, e.g. video's "100% local"
  category?: 'intelligence' | 'automation'; // controls which sidebar section this renders under — default 'intelligence'
  component: LazyExoticComponent<ComponentType>;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: 'diagnostics',
    route: '/tools/diagnostics',
    icon: '◈',
    navLabel: 'Email Health Check',
    eyebrow: 'Will my emails arrive?',
    title: 'Email Health\nCheck',
    description:
      'Find out why your emails might land in spam. Check that your domain is set up the way inboxes expect, see whether your mail server is on any spam blocklists, or paste a bounced email to see where it got stuck.',
    costLabel: '1 credit per domain checked',
    engineLabel: 'DNS lookups',
    component: lazy(() => import('./diagnostics/DiagnosticsTool')),
  },
  {
    slug: 'threader',
    route: '/tools/threader',
    icon: '⇄',
    navLabel: 'Reply Finder',
    eyebrow: 'Who replied to me?',
    title: 'Reply Finder',
    description:
      'Scan your inbox to see who actually replied to your outreach emails. Out-of-office and other automatic replies are ignored, so you only see real answers from real people.',
    costLabel: '1 credit per inbox check',
    engineLabel: 'Reads email headers',
    component: lazy(() => import('./threader/ThreaderTool')),
  },
  {
    slug: 'spintax',
    route: '/tools/spintax',
    icon: '⌥',
    navLabel: 'Email Variations',
    eyebrow: 'Avoid the spam folder',
    title: 'Email\nVariations',
    description:
      'Write your email once, with choices in curly braces like {Hi|Hello|Hey}, and get many slightly different versions. When every recipient gets the exact same message, inboxes are more likely to flag it as spam. This creates and saves the versions — it doesn’t send them.',
    costLabel: 'Free to preview · 1 credit per version saved',
    engineLabel: 'Template engine',
    component: lazy(() => import('./spintax/SpintaxTool')),
  },
  {
    slug: 'resolver',
    route: '/tools/resolver',
    icon: '◉',
    navLabel: 'Visitor Lookup',
    eyebrow: 'Who is visiting?',
    title: 'Visitor\nLookup',
    description:
      'Found an unknown visitor’s IP address in your website logs? Tell Raptor which companies own which address ranges, then look any address up to see which company it belongs to. It only recognises the companies you add.',
    costLabel: '1 credit per lookup',
    engineLabel: 'Address range match',
    component: lazy(() => import('./resolver/ResolverTool')),
  },
  {
    slug: 'chronos',
    route: '/tools/chronos',
    icon: '◷',
    navLabel: 'Best Send Time',
    eyebrow: 'Right time, right place',
    title: 'Best Send\nTime',
    description:
      'Tell Raptor where your prospect is and what time you’d like your email to reach them (say 8:45 am). It works out the exact time to send, allowing for their time zone and daylight saving. It doesn’t send the email — use the answer in your email scheduler.',
    costLabel: '1 credit per answer',
    engineLabel: 'Time zone lookup',
    component: lazy(() => import('./chronos/ChronosTool')),
  },
  {
    slug: 'vad',
    route: '/tools/vad',
    icon: '♪',
    navLabel: 'Call Silence Report',
    eyebrow: 'How much of the call was talking?',
    title: 'Call Silence\nReport',
    description:
      'Choose a call recording and see how much of it was talking and how much was quiet. The recording is analysed on your own computer and never uploaded — only the totals are saved so you can compare calls over time.',
    costLabel: '1 credit per call',
    engineLabel: 'Runs in your browser',
    extraMeta: ['Private — your audio never leaves your computer'],
    component: lazy(() => import('./vad/VadTool')),
  },
  {
    slug: 'kmeans',
    route: '/tools/kmeans',
    icon: '⬡',
    navLabel: 'Customer Groups',
    eyebrow: 'Find your best customers',
    title: 'Customer\nGroups',
    description:
      'Paste a list of your customers with numbers like revenue and team size. Raptor sorts them into groups of similar customers, so you can see what your best customers have in common and who to look for next.',
    costLabel: '1 credit per grouping',
    engineLabel: 'Groups by similarity',
    component: lazy(() => import('./kmeans/KmeansTool')),
  },
  // Media Optimizer (slug 'video', ./video/VideoTool) is hidden on purpose: it did not
  // compress anything or remove any metadata, yet told people it had. Re-add its entry
  // only once real processing exists (see video_router.py /verify-scrub).
  {
    slug: 'validator',
    route: '/tools/validator',
    icon: '✉',
    navLabel: 'Email Checker',
    eyebrow: 'Avoid bounces',
    title: 'Email\nChecker',
    description:
      'Check whether an email address is real before you send to it — without sending anything. Bounced emails hurt your reputation with Gmail and Outlook, so check new lists first.',
    costLabel: '1 credit per address',
    engineLabel: 'Mail server check',
    component: lazy(() => import('./validator/ValidatorTool')),
  },
  {
    slug: 'tracker',
    route: '/tools/tracker',
    icon: '◎',
    navLabel: 'Open Tracker',
    eyebrow: 'Did they read it?',
    title: 'Open\nTracker',
    description:
      'See when someone opens your email. Raptor gives you a tiny invisible image to paste into the email; each time it’s loaded, the open shows up here. Some inboxes block images, so treat the numbers as a good guide, not an exact count.',
    costLabel: '1 credit per tracked email',
    engineLabel: 'Tracking image',
    component: lazy(() => import('./tracker/TrackerTool')),
  },
  {
    slug: 'content',
    route: '/tools/content',
    icon: '✎',
    navLabel: 'AI Content Suite',
    eyebrow: 'Write with AI',
    title: 'AI Content Suite —\nBring Your Own Key',
    description:
      'Write sales emails, social posts and campaign copy with your own OpenAI, Google or Anthropic account. You pay those companies directly — Raptor adds no markup — and you choose the AI model.',
    costLabel: 'Pro plan — uses your own AI account',
    engineLabel: 'Your own AI account',
    extraMeta: ['Your key, encrypted — never sent to us unencrypted or reused elsewhere'],
    category: 'automation',
    component: lazy(() => import('../pages/content/ContentTool')),
  },
  {
    slug: 'montecarlo',
    route: '/tools/montecarlo',
    icon: '≈',
    navLabel: 'Revenue Forecast',
    eyebrow: 'How much will I close?',
    title: 'Revenue\nForecast',
    description:
      'List your open deals, what each is worth and how likely you are to win it. Raptor plays out thousands of what-if scenarios and shows a realistic range for what you’ll close — a bad month, the most likely outcome, and a great month.',
    costLabel: '1 credit per forecast',
    engineLabel: 'What-if scenarios',
    component: lazy(() => import('./montecarlo/MontecarloTool')),
  },
];

export function findTool(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}


