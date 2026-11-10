import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus,
  Globe, Zap, AlertCircle, Brain, Calendar,
  RefreshCw, ExternalLink, Search, ChevronRight,
  Activity, ChevronDown, ChevronUp, BarChart2, Clock,
  Newspaper, Layers, Target,
} from 'lucide-react';
import Papa from 'papaparse';

// ── Config ─────────────────────────────────────────────────────────────────
const DATA_URL   = 'https://raw.githubusercontent.com/booluckgmie/sharecode/refs/heads/master/marketIntel/petronasGAlerts2025.csv';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_KEY   = process.env.REACT_APP_GROQ_API_KEY || '';
const CACHE_VER  = 1;

// ── Palettes ───────────────────────────────────────────────────────────────
const CAT = {
  'Energy & Gas':  { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  dot: '#f59e0b' },
  'Chemicals':     { text: '#a78bfa', bg: 'rgba(139,92,246,0.12)',  dot: '#8b5cf6' },
  'Renewables':    { text: '#34d399', bg: 'rgba(16,185,129,0.12)',  dot: '#10b981' },
  'Sponsorship':   { text: '#f87171', bg: 'rgba(239,68,68,0.12)',   dot: '#ef4444' },
  'Financial':     { text: '#38bdf8', bg: 'rgba(14,165,233,0.12)',  dot: '#0ea5e9' },
  'International': { text: '#2dd4bf', bg: 'rgba(0,161,156,0.12)',   dot: '#00a19c' },
  'Other':         { text: '#9ca3af', bg: 'rgba(107,114,128,0.12)', dot: '#6b7280' },
};
const CHART_PAL = ['#00a19c','#0ea5e9','#8b5cf6','#f59e0b','#ef4444','#10b981','#6b7280'];
const SIG_STYLE = {
  positive: { Icon: TrendingUp,   color: '#34d399', bg: 'rgba(16,185,129,0.1)'  },
  neutral:  { Icon: Minus,        color: '#fbbf24', bg: 'rgba(245,158,11,0.1)'  },
  negative: { Icon: TrendingDown, color: '#f87171', bg: 'rgba(239,68,68,0.1)'   },
  unknown:  { Icon: Minus,        color: '#9ca3af', bg: 'rgba(107,114,128,0.1)' },
};

// ── Category rules (data-driven, priority = array order) ───────────────────
const CATEGORY_RULES = [
  { pattern: /gas|oil|upstream|pipeline|lng|petrol/i,               category: 'Energy & Gas'  },
  { pattern: /chemical|butac|polymer|pchem/i,                       category: 'Chemicals'     },
  { pattern: /renewable|solar|hydrogen|green|\bev\b|electric/i,     category: 'Renewables'    },
  { pattern: /\bf1\b|formula|motorsport|sponsor|racing/i,           category: 'Sponsorship'   },
  { pattern: /\bmarket\b|stock|epf|investment|financial|dividend/i, category: 'Financial'     },
  { pattern: /brazil|international|australia|georgia|global/i,      category: 'International' },
];
const categorize = (t = '') => CATEGORY_RULES.find(r => r.pattern.test(t))?.category ?? 'Other';

// ── Utilities ──────────────────────────────────────────────────────────────
const todayKey  = () => new Date().toISOString().split('T')[0];
const parseDate = (s) => { if (!s) return null; const d = new Date(s.trim().replace(' ','T')); return isNaN(d) ? null : d; };
const fmtDate   = (d, showYear = true) => {
  if (!d) return '';
  return d.toLocaleDateString('en-MY', { day:'numeric', month:'short', ...(showYear ? { year:'numeric' } : {}) });
};
const scoreColor = (s) => s >= 70 ? '#34d399' : s >= 50 ? '#fbbf24' : '#f87171';

const TOPIC_KW = {
  'Gas/LNG':   ['gas','lng','pipeline','upstream'],
  'Renewable': ['solar','hydrogen','green','renewable','ev','electric'],
  'Chemicals': ['chemical','polymer','butac','pchem'],
  'Malaysia':  ['malaysia','malaysian','petronas'],
  'Finance':   ['market','stock','investment','epf','dividend'],
  'Global':    ['brazil','australia','georgia','international'],
};
const getTopics = (t = '') => {
  const v = t.toLowerCase();
  return Object.entries(TOPIC_KW).filter(([,kws]) => kws.some(k => v.includes(k))).map(([tp]) => tp);
};

// ── Fallback insight factory (timestamp at serve-time, not module-load) ────
const FALLBACK_BASE = {
  source: 'embedded-fallback',
  overall_sentiment: 'cautiously_optimistic',
  overall_score: 64,
  summary: 'PETRONAS sustains its dual mandate of upstream excellence and energy transition acceleration. Recent coverage shows positive momentum in renewables and international expansion, tempered by commodity price volatility and maintenance cycles.',
  signals: [
    { dimension: 'Energy Transition', score: 72, direction: 'positive',
      analysis: 'Hydrogen, solar, and EV coverage signals accelerating clean energy pivot with PETRONAS green portfolio on track.' },
    { dimension: 'Market Position',   score: 60, direction: 'neutral',
      analysis: 'Core gas/LNG business remains resilient while the chemical segment faces scheduled maintenance headwinds.' },
    { dimension: 'International',     score: 68, direction: 'positive',
      analysis: 'Brazil and Australia operations generating positive media sentiment, reducing single-market exposure.' },
    { dimension: 'Financial',         score: 55, direction: 'neutral',
      analysis: 'Stable dividend expectations amid transition capex pressure and mixed investment-desk coverage.' },
    { dimension: 'Operational Risk',  score: 47, direction: 'negative',
      analysis: 'Chemical plant maintenance cycles and pipeline aging remain a recurring media focus.' },
  ],
  recommendation: 'Accelerate private-sector green partnerships and modernise chemical assets while strengthening investor communications around transition ROI.',
  model: GROQ_MODEL,
};
const makeFallback = (overrides = {}) => ({
  ...FALLBACK_BASE,
  generated_at: new Date().toISOString(),
  ...overrides,
});

// ── Generic retry + abort-timeout utility ──────────────────────────────────
async function withRetry(fn, { attempts = 3, timeoutMs = 28000, backoffMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const result = await fn(ctrl.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === attempts) throw err;
      await new Promise(r => setTimeout(r, attempt * backoffMs));
    }
  }
}

// ── Groq SSE streaming call (with line-split buffer to handle chunk splits) ─
async function callGroqStream(prompt, signal) {
  const resp = await fetch(GROQ_URL, {
    method: 'POST', signal,
    headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'Return ONLY valid JSON — no markdown, no code fences.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.5, max_tokens: 750, stream: true,
    }),
  });

  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}: ${await resp.text()}`);

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text   = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();                       // carry-over incomplete final fragment
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      const payload = t.slice(6);
      if (payload === '[DONE]') continue;
      try { text += JSON.parse(payload).choices?.[0]?.delta?.content || ''; } catch {}
    }
  }

  return JSON.parse(text.replace(/```(?:json)?\n?|\n?```/g, '').trim());
}

// ── AI insight generator ───────────────────────────────────────────────────
async function generateInsight(articles) {
  if (!GROQ_KEY) return makeFallback({ source: 'no-api-key' });

  const catCounts  = articles.reduce((a, i) => { a[i.category] = (a[i.category]||0)+1; return a; }, {});
  const catSummary = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(', ');
  const dates      = articles.map(a => a.published).filter(Boolean);
  const range      = dates.length
    ? `${fmtDate(new Date(Math.min(...dates)))} to ${fmtDate(new Date(Math.max(...dates)))}`
    : '';
  const headlines  = [...articles]
    .sort((a,b) => (b.published||0) - (a.published||0))
    .slice(0, 20)
    .map(a => `- ${a.title}`)
    .join('\n');

  const prompt =
`Analyse PETRONAS market intelligence and return ONLY valid JSON.

Data: ${articles.length} articles | ${range} | ${catSummary}

Headlines sample:
${headlines}

Return this exact schema:
{"generated_at":"${new Date().toISOString()}","source":"groq-llama","overall_sentiment":"<optimistic|cautiously_optimistic|neutral|cautious|pessimistic>","overall_score":<0-100>,"summary":"<2 sentences>","signals":[{"dimension":"Energy Transition","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Market Position","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"International","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Financial","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Operational Risk","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"}],"recommendation":"<1 sentence>","model":"${GROQ_MODEL}"}`;

  return withRetry(signal => callGroqStream(prompt, signal));
}

// ── Shared chart tooltip ───────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'rgba(5,12,26,0.97)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 12px', fontSize:12 }}>
      {label && <div style={{ color:'#9ca3af', marginBottom:4 }}>{label}</div>}
      {payload.map((p,i) => (
        <div key={i} style={{ color:p.color||'#e2e8f0', fontWeight:600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

// ── Primitives ─────────────────────────────────────────────────────────────
const ScoreBar = ({ score, color, delay = 0 }) => (
  <div className="score-track">
    <motion.div initial={{ width:0 }} animate={{ width:`${score}%` }}
      transition={{ duration:0.9, ease:'easeOut', delay }}
      style={{ height:'100%', borderRadius:999, background:color }} />
  </div>
);

const StatCard = ({ label, value, icon:Icon, color, delay=0 }) => (
  <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay }}
    className="glass-card p-4 flex items-start gap-3">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background:`${color}20` }}>
      <Icon size={16} color={color} />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
    </div>
  </motion.div>
);

const CatBadge = ({ cat }) => {
  const c = CAT[cat] || CAT['Other'];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background:c.bg, color:c.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:c.dot }} />
      {cat}
    </span>
  );
};

// ── Navigation config ──────────────────────────────────────────────────────
const TABS = [
  { id:'dashboard', label:'Dashboard',   Icon:Activity  },
  { id:'analytics', label:'Analytics',   Icon:BarChart2 },
  { id:'topics',    label:'Topics',      Icon:Layers    },
  { id:'insights',  label:'AI Insights', Icon:Brain     },
  { id:'feed',      label:'Feed',        Icon:Newspaper },
];

// ── Sidebar (desktop) ──────────────────────────────────────────────────────
const Sidebar = ({ activeTab, setActiveTab, data, insight }) => (
  <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40"
    style={{ width:220, background:'rgba(4,7,16,0.98)', borderRight:'1px solid rgba(255,255,255,0.06)', backdropFilter:'blur(24px)' }}>
    {/* Logo */}
    <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background:'rgba(0,161,156,0.18)', border:'1px solid rgba(0,161,156,0.3)' }}>
        <Activity size={14} color="#00a19c" />
      </div>
      <div>
        <div className="text-xs font-bold text-white leading-none tracking-wide">Market Intel</div>
        <div className="text-xs mt-0.5" style={{ color:'#4b5563' }}>Intel Dashboard</div>
      </div>
    </div>

    {/* Nav */}
    <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
              active ? 'tab-active font-medium' : 'font-normal hover:bg-white/5'
            }`}
            style={{ color: active ? '#2dd4bf' : '#6b7280' }}>
            <Icon size={15} />
            <span className="flex-1 truncate">{label}</span>
            {id === 'insights' && insight && !['embedded-fallback','no-api-key','error-fallback'].includes(insight.source) && (
              <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                style={{ background:`${scoreColor(insight.overall_score)}18`, color:scoreColor(insight.overall_score) }}>
                {insight.overall_score}
              </span>
            )}
          </button>
        );
      })}
    </nav>

    {/* Footer status */}
    <div className="px-4 py-3" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 text-xs mb-1" style={{ color:'#374151' }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background:'#34d399' }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background:'#34d399' }} />
        </span>
        Live · 08:00 MYT
      </div>
      {data.length > 0 && (
        <div className="text-xs" style={{ color:'#1f2937' }}>{data.length} articles</div>
      )}
    </div>
  </aside>
);

// ── Mobile bottom nav ──────────────────────────────────────────────────────
const BottomNav = ({ activeTab, setActiveTab }) => (
  <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around z-40"
    style={{
      background:'rgba(4,7,16,0.97)',
      borderTop:'1px solid rgba(255,255,255,0.08)',
      backdropFilter:'blur(24px)',
      paddingTop:'0.375rem',
      paddingBottom:'max(0.5rem, env(safe-area-inset-bottom))',
    }}>
    {TABS.map(({ id, label, Icon }) => {
      const active = activeTab === id;
      return (
        <button key={id} onClick={() => setActiveTab(id)}
          className="flex flex-col items-center gap-0.5 px-3 transition-all"
          style={{ color: active ? '#2dd4bf' : '#4b5563' }}>
          <Icon size={19} />
          <span className="text-xs" style={{ fontSize:10 }}>
            {label === 'AI Insights' ? 'AI' : label}
          </span>
        </button>
      );
    })}
  </nav>
);

// ── Main dashboard ─────────────────────────────────────────────────────────
export default function PetronasIntelDashboard() {
  const [data,           setData]           = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [activeTab,      setActiveTab]      = useState('dashboard');
  const [insight,        setInsight]        = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [search,         setSearch]         = useState('');
  const [selectedCat,    setSelectedCat]    = useState('all');
  const [expandedSig,    setExpandedSig]    = useState(null);

  const insightFetchedRef = useRef(false);   // prevents double-fetch on strict mode

  // scroll to top on tab switch (mobile UX)
  useEffect(() => { window.scrollTo({ top:0, behavior:'smooth' }); }, [activeTab]);

  // ── Fetch CSV — categorize + topics computed once at parse time ──────────
  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const resp = await fetch(DATA_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const csv = await resp.text();
      Papa.parse(csv, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data: rows }) => {
          const parsed = rows
            .map(r => {
              const title = String(r.title || '').trim();
              return {
                id:        String(r.id  || '').trim(),
                title,
                published: parseDate(r.published),
                url:       String(r.url || '').trim(),
                category:  categorize(title),
                topics:    getTopics(title),          // pre-computed once
              };
            })
            .filter(r => r.title && r.published);
          setData(parsed);
          setLastUpdated(new Date());
          setLoading(false);
        },
      });
    } catch (e) { setError(e.message); setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────
  const catDist = useMemo(() =>
    data.reduce((a,i) => { a[i.category]=(a[i.category]||0)+1; return a; }, {}), [data]);

  const pieData = useMemo(() =>
    Object.entries(catDist).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value})), [catDist]);

  const timelineData = useMemo(() => {
    const bkt = {};
    data.forEach(i => {
      if (!i.published) return;
      const k = i.published.toISOString().split('T')[0];
      bkt[k] = (bkt[k]||0)+1;
    });
    return Object.entries(bkt)
      .map(([date,count]) => ({ date, label: fmtDate(new Date(date+'T00:00:00'), false), count }))
      .sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0); // string sort avoids Date alloc per compare
  }, [data]);

  const topicCounts = useMemo(() => {
    const cnt = {};
    data.forEach(item => item.topics.forEach(t => { cnt[t]=(cnt[t]||0)+1; })); // topics pre-computed
    return Object.entries(cnt).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  }, [data]);

  // sortedData hoisted — sorted once by date, not on every filter change
  const sortedData = useMemo(
    () => [...data].sort((a,b)=>(b.published||0)-(a.published||0)),
    [data]
  );

  const feedData = useMemo(() => {
    let d = sortedData;
    if (selectedCat !== 'all') d = d.filter(i => i.category === selectedCat);
    if (search.trim()) { const q = search.toLowerCase(); d = d.filter(i => i.title.toLowerCase().includes(q)); }
    return d;
  }, [sortedData, selectedCat, search]);

  const dateRange = useMemo(() => {                             // O(n) instead of O(n log n)
    const dates = data.map(d => d.published).filter(Boolean);
    if (dates.length < 2) return '';
    return `${fmtDate(new Date(Math.min(...dates)))} – ${fmtDate(new Date(Math.max(...dates)))}`;
  }, [data]);

  // ── AI insight (daily cache, useRef guard, error folded into insight) ───
  const loadInsight = useCallback(async (force = false) => {
    if (!data.length) return;
    if (force) insightFetchedRef.current = false;

    const cacheKey = `pintel-insight-${todayKey()}-v${CACHE_VER}`;
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) { setInsight(JSON.parse(cached)); insightFetchedRef.current = true; return; }
      } catch {}
    }

    setInsightLoading(true);
    try {
      const result = await generateInsight(data);
      try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
      setInsight(result);
    } catch (e) {
      setInsight(makeFallback({ source:'error-fallback', error: e.message }));
    } finally {
      setInsightLoading(false);
      insightFetchedRef.current = true;
    }
  }, [data]);

  useEffect(() => {
    if (data.length > 0 && !insightFetchedRef.current) loadInsight();
  }, [data, loadInsight]);

  // ── Loading / error screens ────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background:'linear-gradient(135deg,#040710 0%,#06101e 100%)' }}>
      <div className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor:'rgba(0,161,156,0.2)', borderTopColor:'#00a19c' }} />
      <p className="text-sm" style={{ color:'#4b5563' }}>Loading Market Intelligence Data…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background:'linear-gradient(135deg,#040710 0%,#06101e 100%)' }}>
      <div className="glass-card p-8 text-center max-w-sm w-full">
        <AlertCircle size={36} color="#f87171" className="mx-auto mb-3" />
        <p className="text-white font-semibold mb-1">Failed to load data</p>
        <p className="text-gray-400 text-sm mb-5">{error}</p>
        <button onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mx-auto"
          style={{ background:'rgba(0,161,156,0.15)', color:'#2dd4bf', border:'1px solid rgba(0,161,156,0.3)' }}>
          <RefreshCw size={14}/> Retry
        </button>
      </div>
    </div>
  );

  const isFallback = insight && ['embedded-fallback','no-api-key','error-fallback'].includes(insight?.source);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans"
      style={{ background:'linear-gradient(160deg,#040710 0%,#060e1c 60%,#040710 100%)' }}>

      {/* Ambient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full opacity-[0.07]"
          style={{ background:'radial-gradient(circle,#00a19c,transparent 70%)' }} />
        <div className="absolute bottom-10 right-0 w-72 h-72 rounded-full opacity-[0.04]"
          style={{ background:'radial-gradient(circle,#0ea5e9,transparent 70%)' }} />
      </div>

      {/* Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} data={data} insight={insight} />

      {/* Main content — offset by sidebar on desktop */}
      <div className="lg:pl-[220px] flex flex-col min-h-screen">

        {/* ── Sticky header ── */}
        <header className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3"
          style={{ background:'rgba(4,7,16,0.92)', borderBottom:'1px solid rgba(255,255,255,0.05)', backdropFilter:'blur(20px)' }}>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mr-1">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background:'rgba(0,161,156,0.18)' }}>
              <Activity size={12} color="#00a19c" />
            </div>
            <span className="text-xs font-bold text-white">Market Intel</span>
          </div>

          {/* Page title */}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">
              {TABS.find(t => t.id === activeTab)?.label}
            </h1>
            {dateRange && <p className="text-xs hidden sm:block" style={{ color:'#374151' }}>{dateRange}</p>}
          </div>

          {/* Live badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium" style={{ color:'#00a19c' }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background:'#00a19c' }} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background:'#00a19c' }} />
            </span>
            08:00 MYT
          </div>

          {/* Last fetched */}
          {lastUpdated && (
            <span className="text-xs hidden sm:flex items-center gap-1" style={{ color:'#374151' }}>
              <Clock size={11}/>{lastUpdated.toLocaleTimeString('en-MY',{hour:'2-digit',minute:'2-digit'})}
            </span>
          )}

          <button onClick={fetchData}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all hover:bg-white/10"
            style={{ background:'rgba(255,255,255,0.04)', color:'#6b7280', border:'1px solid rgba(255,255,255,0.07)' }}>
            <RefreshCw size={11}/> Refresh
          </button>
        </header>

        {/* ── KPI strip (always visible) ── */}
        <div className="px-4 sm:px-6 pt-4 pb-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <StatCard label="Total Articles"  value={data.length}                  icon={Newspaper} color="#00a19c" delay={0}    />
            <StatCard label="Categories"      value={Object.keys(catDist).length}  icon={Layers}    color="#0ea5e9" delay={0.05} />
            <StatCard label="Renewables"      value={catDist['Renewables'] || 0}   icon={Zap}       color="#34d399" delay={0.1}  />
            <StatCard label="Energy & Gas"    value={catDist['Energy & Gas'] || 0} icon={Activity}  color="#f59e0b" delay={0.15} />
          </div>
        </div>

        {/* ── Page content ── */}
        <main className="flex-1 px-4 sm:px-6 py-4 pb-24 lg:pb-8">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
              exit={{ opacity:0, y:-4 }} transition={{ duration:0.15 }}>

              {/* ════ DASHBOARD ════ */}
              {activeTab === 'dashboard' && (
                <div className="space-y-3">
                  {/* Row 1: Volume chart + AI preview */}
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

                    {/* Volume area chart */}
                    <div className="glass-card p-5 lg:col-span-3">
                      <div className="flex items-center gap-2 mb-4">
                        <Calendar size={13} color="#00a19c" />
                        <h2 className="text-sm font-semibold text-gray-200">Daily Article Volume</h2>
                        <span className="ml-auto text-xs" style={{ color:'#374151' }}>{timelineData.length} days</span>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={timelineData} margin={{ top:4, right:4, left:-28, bottom:0 }}>
                          <defs>
                            <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#00a19c" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#00a19c" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>
                          <XAxis dataKey="label" stroke="#1f2937" tick={{ fontSize:10, fill:'#4b5563' }}/>
                          <YAxis stroke="#1f2937" tick={{ fontSize:10, fill:'#4b5563' }} allowDecimals={false}/>
                          <RTooltip content={<ChartTip/>}/>
                          <Area type="monotone" dataKey="count" name="Articles"
                            stroke="#00a19c" strokeWidth={2} fill="url(#tealGrad)"/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* AI insight preview */}
                    {insightLoading ? (
                      <div className="glass-card p-5 lg:col-span-2 flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 animate-spin"
                          style={{ borderColor:'rgba(0,161,156,0.2)', borderTopColor:'#00a19c' }}/>
                        <p className="text-xs" style={{ color:'#4b5563' }}>Generating AI insights…</p>
                      </div>
                    ) : insight ? (
                      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
                        transition={{ delay:0.15 }}
                        className="glass-card p-5 lg:col-span-2 flex flex-col cursor-pointer hover:border-petronas-500/30 transition-all"
                        onClick={() => setActiveTab('insights')}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Brain size={13} color="#00a19c"/>
                            <span className="text-sm font-semibold text-gray-200">AI Sentiment</span>
                          </div>
                          <span className="text-xs" style={{ color:'#374151' }}>Daily</span>
                        </div>

                        <div className="flex items-end gap-3 mb-2">
                          <span className="text-5xl font-light tabular-nums leading-none"
                            style={{ color:scoreColor(insight.overall_score) }}>
                            {insight.overall_score}
                          </span>
                          <div className="pb-1">
                            <div className="text-xs" style={{ color:'#374151' }}>/100</div>
                            <div className="text-xs font-medium text-white capitalize mt-0.5">
                              {insight.overall_sentiment?.replace(/_/g,' ')}
                            </div>
                          </div>
                        </div>

                        <ScoreBar score={insight.overall_score} color={scoreColor(insight.overall_score)} delay={0.25}/>

                        <p className="text-xs leading-relaxed mt-3 flex-1"
                          style={{ color:'#6b7280', display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                          {insight.summary}
                        </p>

                        {isFallback && (
                          <span className="text-xs mt-2 px-2 py-0.5 rounded-full self-start"
                            style={{ background:'rgba(245,158,11,0.1)', color:'#fbbf24' }}>
                            fallback data
                          </span>
                        )}

                        <div className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color:'#00a19c' }}>
                          View full analysis <ChevronRight size={12}/>
                        </div>
                      </motion.div>
                    ) : null}
                  </div>

                  {/* Row 2: Category + Topics + Latest articles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

                    {/* Category donut */}
                    <div className="glass-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Target size={13} color="#0ea5e9"/>
                        <h2 className="text-sm font-semibold text-gray-200">Category Split</h2>
                      </div>
                      <ResponsiveContainer width="100%" height={130}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%"
                            innerRadius={36} outerRadius={58} paddingAngle={3} dataKey="value">
                            {pieData.map((e,i)=>(
                              <Cell key={i} fill={(CAT[e.name]||CAT['Other']).dot} stroke="transparent"/>
                            ))}
                          </Pie>
                          <RTooltip content={<ChartTip/>}/>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2">
                        {pieData.slice(0,5).map(({name,value})=>{
                          const c = CAT[name]||CAT['Other'];
                          const pct = data.length ? Math.round(value/data.length*100) : 0;
                          return (
                            <div key={name} className="flex items-center gap-2 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:c.dot }}/>
                              <span className="flex-1 truncate" style={{ color:'#6b7280' }}>{name}</span>
                              <span className="font-semibold tabular-nums" style={{ color:c.text }}>{pct}%</span>
                              <span className="tabular-nums w-5 text-right" style={{ color:'#374151' }}>{value}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top topics */}
                    <div className="glass-card p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Layers size={13} color="#8b5cf6"/>
                        <h2 className="text-sm font-semibold text-gray-200">Top Topics</h2>
                      </div>
                      <div className="space-y-3">
                        {topicCounts.slice(0,5).map(({name,value},i)=>{
                          const color = CHART_PAL[i%CHART_PAL.length];
                          const maxV  = topicCounts[0]?.value||1;
                          return (
                            <div key={name}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span style={{ color:'#9ca3af' }}>{name}</span>
                                <span className="font-semibold tabular-nums" style={{ color }}>{value}</span>
                              </div>
                              <ScoreBar score={Math.round(value/maxV*100)} color={color} delay={i*0.06+0.1}/>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Latest articles */}
                    <div className="glass-card p-5 sm:col-span-2 lg:col-span-1">
                      <div className="flex items-center gap-2 mb-4">
                        <Newspaper size={13} color="#f59e0b"/>
                        <h2 className="text-sm font-semibold text-gray-200">Latest</h2>
                        <span className="ml-auto text-xs" style={{ color:'#374151' }}>{data.length} total</span>
                      </div>
                      <div className="space-y-3">
                        {sortedData.slice(0,5).map((item,i)=>(
                          <div key={i} className="flex items-start gap-2.5 group">
                            <div className="flex-1 min-w-0">
                              <CatBadge cat={item.category}/>
                              <p className="text-xs text-gray-300 leading-snug mt-1 group-hover:text-white transition-colors line-clamp-2">
                                {item.title}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color:'#374151' }}>
                                {fmtDate(item.published, false)}
                              </p>
                            </div>
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="flex-shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10"
                              onClick={e=>e.stopPropagation()}>
                              <ExternalLink size={11} color="#4b5563"/>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ════ ANALYTICS ════ */}
              {activeTab === 'analytics' && (
                <div className="space-y-3">
                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 mb-5">
                      <BarChart2 size={13} color="#8b5cf6"/>
                      <h2 className="text-sm font-semibold text-gray-200">Articles by Category</h2>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={pieData} margin={{ top:4, right:8, left:-24, bottom:48 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>
                        <XAxis dataKey="name" stroke="#1f2937" tick={{ fontSize:10, fill:'#4b5563' }}
                          angle={-35} textAnchor="end" interval={0}/>
                        <YAxis stroke="#1f2937" tick={{ fontSize:10, fill:'#4b5563' }} allowDecimals={false}/>
                        <RTooltip content={<ChartTip/>}/>
                        <Bar dataKey="value" name="Articles" radius={[4,4,0,0]}>
                          {pieData.map((e,i)=><Cell key={i} fill={(CAT[e.name]||CAT['Other']).dot}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 mb-5">
                      <Globe size={13} color="#f59e0b"/>
                      <h2 className="text-sm font-semibold text-gray-200">Topic Coverage Radar</h2>
                    </div>
                    <ResponsiveContainer width="100%" height={270}>
                      <RadarChart data={topicCounts}>
                        <PolarGrid stroke="rgba(255,255,255,0.05)"/>
                        <PolarAngleAxis dataKey="name" tick={{ fontSize:11, fill:'#9ca3af' }}/>
                        <PolarRadiusAxis tick={{ fontSize:9, fill:'#4b5563' }} axisLine={false}/>
                        <Radar name="Mentions" dataKey="value"
                          stroke="#00a19c" fill="#00a19c" fillOpacity={0.15} strokeWidth={1.5}/>
                        <RTooltip content={<ChartTip/>}/>
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ════ TOPICS ════ */}
              {activeTab === 'topics' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {topicCounts.map(({name,value},i)=>{
                      const color = CHART_PAL[i%CHART_PAL.length];
                      const maxV  = topicCounts[0]?.value||1;
                      return (
                        <motion.div key={name}
                          initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }}
                          transition={{ delay:i*0.06 }}
                          className="glass-card p-4">
                          <div className="text-3xl font-light mb-1" style={{ color }}>{value}</div>
                          <div className="text-xs font-medium mb-1" style={{ color:'#6b7280' }}>{name}</div>
                          <ScoreBar score={Math.round(value/maxV*100)} color={color} delay={i*0.06+0.2}/>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="glass-card p-5">
                    <div className="flex items-center gap-2 mb-5">
                      <BarChart2 size={13} color="#00a19c"/>
                      <h2 className="text-sm font-semibold text-gray-200">Topic Frequency</h2>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topicCounts} layout="vertical"
                        margin={{ top:0, right:12, left:60, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" horizontal={false}/>
                        <XAxis type="number" stroke="#1f2937" tick={{ fontSize:10, fill:'#4b5563' }} allowDecimals={false}/>
                        <YAxis type="category" dataKey="name" stroke="#1f2937"
                          tick={{ fontSize:11, fill:'#9ca3af' }} width={56}/>
                        <RTooltip content={<ChartTip/>}/>
                        <Bar dataKey="value" name="Mentions" radius={[0,4,4,0]}>
                          {topicCounts.map((_,i)=><Cell key={i} fill={CHART_PAL[i%CHART_PAL.length]}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ════ AI INSIGHTS ════ */}
              {activeTab === 'insights' && (
                <div className="space-y-3 max-w-3xl mx-auto">
                  <div className="text-center pt-2 pb-4">
                    <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color:'#00a19c' }}>
                      AI-Powered Analysis
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-light text-white">Strategic Sentiment</h2>
                    <p className="text-xs mt-2 max-w-sm mx-auto" style={{ color:'#374151' }}>
                      Daily by <span style={{ color:'#2dd4bf' }}>{GROQ_MODEL}</span> · {data.length} articles
                    </p>
                  </div>

                  {insightLoading ? (
                    <div className="glass-card p-12 flex flex-col items-center gap-4">
                      <div className="w-10 h-10 rounded-full border-2 animate-spin"
                        style={{ borderColor:'rgba(0,161,156,0.2)', borderTopColor:'#00a19c' }}/>
                      <p className="text-sm" style={{ color:'#4b5563' }}>
                        Streaming from <span style={{ color:'#2dd4bf' }}>{GROQ_MODEL}</span>…
                      </p>
                      <p className="text-xs" style={{ color:'#1f2937' }}>Auto-retries up to 3× on timeout</p>
                    </div>
                  ) : insight ? (
                    <>
                      {/* Overall score */}
                      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
                        className="glass-card p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background:'rgba(0,161,156,0.12)' }}>
                              <Brain size={17} color="#00a19c"/>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-wide font-medium" style={{ color:'#4b5563' }}>
                                Overall Sentiment
                              </div>
                              <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                                {insight.overall_sentiment?.replace(/_/g,' ')||'—'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-end gap-1">
                            <span className="text-5xl font-light tabular-nums"
                              style={{ color:scoreColor(insight.overall_score) }}>
                              {insight.overall_score}
                            </span>
                            <span className="text-sm pb-1" style={{ color:'#374151' }}>/100</span>
                          </div>
                        </div>

                        <ScoreBar score={insight.overall_score} color={scoreColor(insight.overall_score)} delay={0.2}/>

                        <p className="text-sm text-gray-300 leading-relaxed mt-5 mb-5 pl-4"
                          style={{ borderLeft:'2px solid rgba(0,161,156,0.3)' }}>
                          {insight.summary}
                        </p>

                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="px-2.5 py-1 rounded-full font-medium"
                            style={{ background:'rgba(0,161,156,0.1)', color:'#2dd4bf' }}>
                            {insight.model}
                          </span>
                          {isFallback ? (
                            <span className="px-2.5 py-1 rounded-full"
                              style={{ background:'rgba(245,158,11,0.1)', color:'#fbbf24' }}>
                              {insight.source === 'no-api-key'
                                ? 'Set REACT_APP_GROQ_API_KEY for live analysis'
                                : insight.error
                                  ? `API error — ${insight.error}`
                                  : 'Fallback data'}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full"
                              style={{ background:'rgba(16,185,129,0.1)', color:'#34d399' }}>
                              Generated {new Date(insight.generated_at).toLocaleDateString('en-MY')}
                            </span>
                          )}
                          <button onClick={() => loadInsight(true)}
                            className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all hover:bg-white/10"
                            style={{ background:'rgba(255,255,255,0.04)', color:'#4b5563', border:'1px solid rgba(255,255,255,0.06)' }}>
                            <RefreshCw size={10}/> Regenerate
                          </button>
                        </div>
                      </motion.div>

                      {/* Signal cards */}
                      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(insight.signals||[]).map((s,i)=>{
                          const dir  = SIG_STYLE[(s.direction||'').toLowerCase()]||SIG_STYLE.unknown;
                          const DirI = dir.Icon;
                          const open = expandedSig === i;
                          return (
                            <motion.div key={s.dimension}
                              initial={{ opacity:0, y:14 }} animate={{ opacity:1, y:0 }}
                              transition={{ delay:0.1+i*0.07 }}
                              className="glass-card p-5 cursor-pointer select-none"
                              onClick={()=>setExpandedSig(open?null:i)}>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-200 pr-2">{s.dimension}</span>
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background:dir.bg }}>
                                  <DirI size={13} color={dir.color}/>
                                </div>
                              </div>
                              <div className="text-3xl font-light" style={{ color:dir.color }}>{s.score}</div>
                              <ScoreBar score={s.score} color={dir.color} delay={0.15+i*0.07}/>
                              <motion.div initial={false}
                                animate={{ height:open?'auto':0, opacity:open?1:0 }}
                                transition={{ duration:0.22 }} style={{ overflow:'hidden' }}>
                                <p className="text-xs leading-relaxed mt-3" style={{ color:'#6b7280' }}>{s.analysis}</p>
                              </motion.div>
                              <div className="flex items-center gap-1 text-xs mt-2"
                                style={{ color:open?'#6b7280':'#1f2937' }}>
                                {open?<><ChevronUp size={11}/> collapse</>:<><ChevronDown size={11}/> expand</>}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>

                      {/* Recommendation */}
                      {insight.recommendation && (
                        <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
                          transition={{ delay:0.55 }}
                          className="glass-card p-6"
                          style={{ borderColor:'rgba(0,161,156,0.2)' }}>
                          <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                            style={{ color:'#00a19c' }}>
                            Strategic Recommendation
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">{insight.recommendation}</p>
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <div className="glass-card p-12 text-center text-sm" style={{ color:'#4b5563' }}>
                      No insight loaded.{' '}
                      <button onClick={()=>loadInsight(true)} className="underline" style={{ color:'#2dd4bf' }}>
                        Generate now
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ════ FEED ════ */}
              {activeTab === 'feed' && (
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search size={13} color="#4b5563"
                        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                      <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
                        placeholder="Search articles…"
                        className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm focus:outline-none transition-all"
                        style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#e2e8f0' }}/>
                    </div>
                    <select value={selectedCat} onChange={e=>setSelectedCat(e.target.value)}
                      className="px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                      style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#9ca3af' }}>
                      <option value="all">All Categories</option>
                      {Object.keys(CAT).map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <p className="text-xs pl-1" style={{ color:'#374151' }}>{feedData.length} articles</p>

                  <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5">
                    {feedData.map((item,i)=>(
                      <motion.div key={item.id||i}
                        initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }}
                        transition={{ delay:Math.min(i*0.02,0.3) }}
                        className="glass-card glass-hover p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <CatBadge cat={item.category}/>
                              <span className="text-xs flex items-center gap-1" style={{ color:'#374151' }}>
                                <Calendar size={10}/>{fmtDate(item.published)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-200 leading-snug">{item.title}</p>
                          </div>
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 p-2 rounded-lg transition-all hover:bg-white/10"
                            onClick={e=>e.stopPropagation()} title="Open article">
                            <ExternalLink size={13} color="#374151"/>
                          </a>
                        </div>
                      </motion.div>
                    ))}
                    {feedData.length === 0 && (
                      <div className="text-center py-16 text-sm" style={{ color:'#374151' }}>
                        No articles match your filters.
                      </div>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab}/>
    </div>
  );
}
