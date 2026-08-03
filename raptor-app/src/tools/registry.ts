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
  component: LazyExoticComponent<ComponentType>;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: 'diagnostics',
    route: '/tools/diagnostics',
    icon: '◈',
    navLabel: 'Diagnostic Suite',
    eyebrow: 'Tool 01 / Infrastructure',
    title: 'Unified Infrastructure\nDiagnostic Suite',
    description:
      "Bulk deliverability & routing analyzer — async DNS across thousands of domains, live DNSBL blacklist checks, and Received-header hop tracing that tells you exactly which server dropped the packet.",
    costLabel: '1 credit / domain',
    engineLabel: 'asyncio + dnspython',
    component: lazy(() => import('./diagnostics/DiagnosticsTool')),
  },
  {
    slug: 'threader',
    route: '/tools/threader',
    icon: '⇄',
    navLabel: 'IMAP Threader',
    eyebrow: 'Tool 02 / Mail Intelligence',
    title: 'IMAP Pitch\nThreader',
    description:
      'Maps the true conversation tree of cold outreach via Message-ID / In-Reply-To / References headers — not fragile "Re:" subject matching — and filters out autoresponders before they hit your CRM.',
    costLabel: '1 credit / scan',
    engineLabel: 'imaplib + RFC 5322',
    component: lazy(() => import('./threader/ThreaderTool')),
  },
  {
    slug: 'spintax',
    route: '/tools/spintax',
    icon: '⌥',
    navLabel: 'Spintax Compiler',
    eyebrow: 'Tool 03 / Outreach Compiler',
    title: 'Spintax Compiler &\nInjection Queue',
    description:
      'Compiles nested Spintax into every mathematically unique permutation with a real recursive-descent parser, hashes each with SHA-256, and queues them for outbound send.',
    costLabel: '1 credit / unique variant queued',
    engineLabel: 'AST parser + itertools.product',
    component: lazy(() => import('./spintax/SpintaxTool')),
  },
  {
    slug: 'resolver',
    route: '/tools/resolver',
    icon: '◉',
    navLabel: 'Reverse-IP Resolver',
    eyebrow: 'Tool 04 / The Deanonymizer',
    title: 'B2B Reverse-IP\nResolver',
    description:
      "Resolves an anonymous website visitor's IP to a specific corporate network by matching it against your own CIDR range table, using prefix-length-ordered matching for sub-millisecond, most-specific-first lookups.",
    costLabel: '1 credit / resolve',
    engineLabel: 'ipaddress + sorted CIDR match',
    component: lazy(() => import('./resolver/ResolverTool')),
  },
  {
    slug: 'chronos',
    route: '/tools/chronos',
    icon: '◷',
    navLabel: 'Chronos Engine',
    eyebrow: 'Tool 05 / Send-Time Optimization',
    title: 'Chronos Timezone\nOptimization Engine',
    description:
      'Turns "Pune, India" or "Austin, Texas" into the exact UTC moment to schedule a send — geocoded, point-in-polygon timezone matched, and DST-corrected for that specific date.',
    costLabel: '1 credit / resolve',
    engineLabel: 'Nominatim + timezonefinder + zoneinfo',
    component: lazy(() => import('./chronos/ChronosTool')),
  },
  {
    slug: 'vad',
    route: '/tools/vad',
    icon: '♪',
    navLabel: 'Call Audio VAD',
    eyebrow: 'Tool 06 / Audio DSP',
    title: 'WASM-Powered Call\nAudio VAD',
    description:
      'Strips silence and background noise from raw sales call audio entirely in your browser tab, using the WebRTC Voice Activity Detection engine compiled to WebAssembly — the audio never leaves your machine to get cleaned.',
    costLabel: '1 credit / call logged',
    engineLabel: 'WebRTC VAD (WASM) client-side',
    extraMeta: ['100% local — nothing uploaded'],
    component: lazy(() => import('./vad/VadTool')),
  },
  {
    slug: 'kmeans',
    route: '/tools/kmeans',
    icon: '⬡',
    navLabel: 'K-Means ICP',
    eyebrow: 'Tool 07 / Ideal Customer Profiling',
    title: 'K-Means ICP\nClustering Engine',
    description:
      'Segments your customer list by numeric traits (ARR, headcount, engagement) using real k-means++ initialization — Z-score normalized, Euclidean distance, converged to stable centroids or iteration cap.',
    costLabel: '1 credit / clustering run',
    engineLabel: 'k-means++ seeding + itertools',
    component: lazy(() => import('./kmeans/KmeansTool')),
  },
  {
    slug: 'video',
    route: '/tools/video',
    icon: '▶',
    navLabel: 'Video Compressor',
    eyebrow: 'Tool 08 / Video Asset Optimization',
    title: 'Video Payload\nCompressor & Scrubber',
    description:
      'Compresses video and strips EXIF/GPS/metadata server-side via ffprobe verification, so sales videos bypass spam filters and cloud anti-phishing rules without losing quality or leaking location/device info.',
    costLabel: '1 credit / verify + compress',
    engineLabel: 'ffmpeg + ffprobe on server',
    component: lazy(() => import('./video/VideoTool')),
  },
  {
    slug: 'montecarlo',
    route: '/tools/montecarlo',
    icon: '≈',
    navLabel: 'Monte Carlo Sim',
    eyebrow: 'Tool 09 / Pipeline Forecasting',
    title: 'Monte Carlo\nPipeline Simulator',
    description:
      'Runs stochastic simulations (default 10,000 iterations) across your sales pipeline — each deal won/lost via its stated close probability — producing an empirical P10/P50/P90 distribution.',
    costLabel: '1 credit / simulation',
    engineLabel: 'random.random() + percentile (real stochastic)',
    component: lazy(() => import('./montecarlo/MontecarloTool')),
  },
];

export function findTool(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
