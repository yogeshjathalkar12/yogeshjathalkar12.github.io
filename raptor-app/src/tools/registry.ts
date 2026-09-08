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
    navLabel: 'Deliverability & Health',
    eyebrow: 'System Health',
    title: 'Unified Infrastructure\nDiagnostic Suite',
    description:
      "Instantly checks deliverability and inbox placement across thousands of domains. Scans live domain blacklists (DNSBL), analyzes DNS records, and traces server-by-server email routing to pinpoint the exact hop where an email fails or gets dropped.",
    costLabel: '1 credit / domain',
    engineLabel: 'asyncio + dnspython',
    component: lazy(() => import('./diagnostics/DiagnosticsTool')),
  },
  {
    slug: 'threader',
    route: '/tools/threader',
    icon: '⇄',
    navLabel: 'Inbox Sync',
    eyebrow: 'Mail Intelligence',
    title: 'Inbox Sync',
    description:
      'Tracks complete cold outreach conversation threads using exact technical email headers—never relying on easily broken "Re:" subject lines. Automatically detects and filters out out-of-office replies and autoresponders before they pollute your CRM.',
    costLabel: '1 credit / scan',
    engineLabel: 'imaplib + RFC 5322',
    component: lazy(() => import('./threader/ThreaderTool')),
  },
  {
    slug: 'spintax',
    route: '/tools/spintax',
    icon: '⌥',
    navLabel: 'Email Variant Generator',
    eyebrow: 'Outreach Optimizer',
    title: 'Email Variant Generator &\nCampaign Queue',
    description:
      'Generates unique variations of your emails to ensure every recipient gets a distinct message. Protects your sender reputation, keeps emails out of spam folders, and queues variants automatically for sending.',
    costLabel: '1 credit / unique variant queued',
    engineLabel: 'AST parser + itertools.product',
    component: lazy(() => import('./spintax/SpintaxTool')),
  },
  {
    slug: 'resolver',
    route: '/tools/resolver',
    icon: '◉',
    navLabel: 'Website Visitor ID',
    eyebrow: 'Lead Intelligence',
    title: 'Website Visitor ID &\nDeanonymizer',
    description:
      'Identifies anonymous website visitors by matching incoming network IP addresses to exact corporate networks, allowing your sales team to pinpoint accounts visiting your site in real time.',
    costLabel: '1 credit / resolve',
    engineLabel: 'ipaddress + sorted CIDR match',
    component: lazy(() => import('./resolver/ResolverTool')),
  },
  {
    slug: 'chronos',
    route: '/tools/chronos',
    icon: '◷',
    navLabel: 'Campaign Scheduler',
    eyebrow: 'Send-Time Optimization',
    title: 'Smart Timezone\nScheduler',
    description:
      'Automatically converts target locations (like "Pune, India" or "Austin, Texas") into the exact local send time. Handles geocoding, precise timezone matching, and Daylight Saving Time adjustments so your outreach hits inboxes at the perfect moment—every time.',
    costLabel: '1 credit / resolve',
    engineLabel: 'Nominatim + timezonefinder + zoneinfo',
    component: lazy(() => import('./chronos/ChronosTool')),
  },
  {
    slug: 'vad',
    route: '/tools/vad',
    icon: '♪',
    navLabel: 'Call Voice Analytics',
    eyebrow: 'Call Intelligence',
    title: 'Browser Call Audio\nCleaner & VAD',
    description:
      'Strips silence and background noise from raw sales call recordings directly inside your browser. Processes call audio locally so sensitive conversation data never leaves your machine.',
    costLabel: '1 credit / call logged',
    engineLabel: 'WebRTC VAD (WASM) client-side',
    extraMeta: ['100% local — nothing uploaded'],
    component: lazy(() => import('./vad/VadTool')),
  },
  {
    slug: 'kmeans',
    route: '/tools/kmeans',
    icon: '⬡',
    navLabel: 'Smart Customer Profiler',
    eyebrow: 'Ideal Customer Profiling',
    title: 'Smart Ideal Customer\nProfiler',
    description:
      'Automatically segments your customer database using numeric traits like revenue, headcount, and engagement levels to identify high-value customer clusters and refine your ICP.',
    costLabel: '1 credit / clustering run',
    engineLabel: 'k-means++ seeding + itertools',
    component: lazy(() => import('./kmeans/KmeansTool')),
  },
  {
    slug: 'video',
    route: '/tools/video',
    icon: '▶',
    navLabel: 'Media Optimizer',
    eyebrow: 'Video Asset Optimization',
    title: 'Sales Video Payload\nCompressor',
    description:
      'Compresses sales video attachments and strips hidden metadata so your video messages bypass corporate spam filters, load faster, and deliver safely without leaking device or location details.',
    costLabel: '1 credit / verify + compress',
    engineLabel: 'ffmpeg + ffprobe on server',
    component: lazy(() => import('./video/VideoTool')),
  },
  {
    slug: 'validator',
    route: '/tools/validator',
    icon: '✉',
    navLabel: 'Email Verifier',
    eyebrow: 'Deliverability Verification',
    title: 'Real-Time Email\nVerifier',
    description:
      'Verifies DNS records and performs direct server handshakes to confirm valid email addresses without sending actual test emails—protecting your sender score from hard bounces.',
    costLabel: '1 credit / check',
    engineLabel: 'DNS/MX lookup + SMTP handshake',
    component: lazy(() => import('./validator/ValidatorTool')),
  },
  {
    slug: 'tracker',
    route: '/tools/tracker',
    icon: '◎',
    navLabel: 'Engagement Tracking',
    eyebrow: 'Open Tracking',
    title: 'Invisible Email Open\n& Engagement Tracker',
    description:
      'Embeds lightweight invisible tracking pixels into your email outreach. Know exactly when and how many times a prospect opens your email with real-time tracking updates.',
    costLabel: '1 credit / campaign',
    engineLabel: 'Tracking pixel + server-side open resolution',
    component: lazy(() => import('./tracker/TrackerTool')),
  },
  {
    slug: 'content',
    route: '/tools/content',
    icon: '✎',
    navLabel: 'AI Content Suite',
    eyebrow: 'Generative Content',
    title: 'AI Content Suite —\nBring Your Own Key',
    description:
      "Generate sales emails, social content, and campaign copy using your own OpenAI, Google, or Anthropic API keys with zero platform markups and complete model choice flexibility.",
    costLabel: 'Free — uses your own API key',
    engineLabel: 'BYOK · chained multi-provider pipeline',
    extraMeta: ['Your key, encrypted — never sent to us unencrypted or reused elsewhere'],
    category: 'automation',
    component: lazy(() => import('../pages/content/ContentTool')),
  },
  {
    slug: 'montecarlo',
    route: '/tools/montecarlo',
    icon: '≈',
    navLabel: 'Revenue Forecasting',
    eyebrow: 'Pipeline Forecasting',
    title: 'Revenue & Pipeline\nSimulator',
    description:
      'Runs thousands of statistical simulations on your active sales pipeline using real deal probabilities to deliver realistic revenue projections and confidence intervals.',
    costLabel: '1 credit / simulation',
    engineLabel: 'random.random() + percentile (real stochastic)',
    component: lazy(() => import('./montecarlo/MontecarloTool')),
  },
];

export function findTool(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}


