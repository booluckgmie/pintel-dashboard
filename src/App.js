import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  RefreshCw, ExternalLink, Search,
  Activity, ChevronDown, ChevronUp, BarChart2, Clock,
  Newspaper, Layers, Target,
} from 'lucide-react';
import Papa from 'papaparse';

// ── Config ────────────────────────────────────────────────────────────────
const DATA_URL   = 'https://raw.githubusercontent.com/booluckgmie/sharecode/refs/heads/master/marketIntel/petronasGAlerts2025.csv';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_KEY   = process.env.REACT_APP_GROQ_API_KEY || '';

// ── Colour palette ────────────────────────────────────────────────────────
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

// ── Utilities ─────────────────────────────────────────────────────────────
const todayKey   = () => new Date().toISOString().split('T')[0];
const parseDate  = (s) => { if (!s) return null; const d = new Date(s.trim().replace(' ', 'T')); return isNaN(d) ? null : d; };
const fmtDate    = (d) => d ? d.toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' }) : '';
const fmtShort   = (d) => d ? d.toLocaleDateString('en-MY', { day:'numeric', month:'short' }) : '';
const scoreColor = (s) => s >= 70 ? '#34d399' : s >= 50 ? '#fbbf24' : '#f87171';

const categorize = (t = '') => {
  const v = t.toLowerCase();
  if (/gas|oil|upstream|pipeline|lng|petrol/.test(v))               return 'Energy & Gas';
  if (/chemical|butac|polymer|pchem/.test(v))                       return 'Chemicals';
  if (/renewable|solar|hydrogen|green|\bev\b|electric/.test(v))     return 'Renewables';
  if (/\bf1\b|formula|motorsport|sponsor|racing/.test(v))           return 'Sponsorship';
  if (/\bmarket\b|stock|epf|investment|financial|dividend/.test(v)) return 'Financial';
  if (/brazil|international|australia|georgia|global/.test(v))      return 'International';
  return 'Other';
};

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
  return Object.entries(TOPIC_KW)
    .filter(([, kws]) => kws.some(k => v.includes(k)))
    .map(([tp]) => tp);
};

// ── Fallback insight ──────────────────────────────────────────────────────
const FALLBACK = {
  generated_at: new Date().toISOString(),
  source: 'embedded-fallback',
  overall_sentiment: 'cautiously_optimistic',
  overall_score: 64,
  summary: 'PETRONAS sustains its dual mandate of upstream excellence and energy transition acceleration. Recent coverage shows positive momentum in renewables and international expansion, tempered by commodity price volatility and scheduled maintenance cycles.',
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

// ── Groq streaming call (single attempt) ─────────────────────────────────
async function callGroqStream(prompt, signal) {
  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    signal,
    headers: {
      'Authorization': `Bearer ${GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a strategic analyst. Return ONLY valid JSON — no markdown, no code fences.' },
        { role: 'user',   content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 750,
      stream: true,
    }),
  });

  if (!resp.ok) throw new Error(`Groq HTTP ${resp.status}: ${await resp.text()}`);

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split('\n')) {
      const t = line.trim();
      if (!t.startsWith('data: ')) continue;
      const payload = t.slice(6);
      if (payload === '[DONE]') continue;
      try { text += JSON.parse(payload).choices?.[0]?.delta?.content || ''; } catch {}
    }
  }

  const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

// ── generateInsight with 3-attempt retry + 28 s per-attempt timeout ───────
async function generateInsight(articles) {
  if (!GROQ_KEY) return { ...FALLBACK, source: 'no-api-key' };

  const catCounts  = articles.reduce((a, i) => { a[i.category] = (a[i.category] || 0) + 1; return a; }, {});
  const catSummary = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', ');
  const sorted     = [...articles].sort((a, b) => (b.published || 0) - (a.published || 0));
  const headlines  = sorted.slice(0, 20).map(a => `- ${a.title}`).join('\n');
  const range      = sorted.length
    ? `${fmtDate(sorted[sorted.length - 1].published)} to ${fmtDate(sorted[0].published)}`
    : '';

  const prompt =
`Analyse PETRONAS market intelligence and return ONLY valid JSON.

Data: ${articles.length} articles | ${range} | ${catSummary}

Headlines sample:
${headlines}

Return this exact schema:
{"generated_at":"${new Date().toISOString()}","source":"groq-llama","overall_sentiment":"<optimistic|cautiously_optimistic|neutral|cautious|pessimistic>","overall_score":<0-100>,"summary":"<2 sentences>","signals":[{"dimension":"Energy Transition","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Market Position","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"International","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Financial","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"},{"dimension":"Operational Risk","score":<0-100>,"direction":"<positive|neutral|negative>","analysis":"<1 sentence>"}],"recommendation":"<1 sentence>","model":"${GROQ_MODEL}"}`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28000);
    try {
      const result = await callGroqStream(prompt, controller.signal);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 3) throw err;
      await new Promise(r => setTimeout(r, attempt * 2000)); // 2 s, 4 s back-off
    }
  }
}

// ── Shared chart tooltip ──────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'rgba(5,12,26,0.97)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 12px', fontSize:12 }}>
      {label && <div style={{ color:'#9ca3af', marginBottom:4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#e2e8f0', fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

// ── ScoreBar ──────────────────────────────────────────────────────────────
const ScoreBar = ({ score, color, delay = 0 }) => (
  <div className="score-track">
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${score}%` }}
      transition={{ duration: 0.9, ease: 'easeOut', delay }}
      style={{ height: '100%', borderRadius: 999, background: color }}
    />
  </div>
);

// ── StatCard ──────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    className="glass-card p-4 flex items-start gap-3"
  >
    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
      style={{ background: `${color}20` }}>
      <Icon size={16} color={color} />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-bold leading-tight" style={{ color }}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5 leading-tight">{label}</div>
    </div>
  </motion.div>
);

// ── CatBadge ──────────────────────────────────────────────────────────────
const CatBadge = ({ cat }) => {
  const c = CAT[cat] || CAT['Other'];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ background: c.bg, color: c.text }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c.dot }} />
      {cat}
    </span>
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Overview',    Icon: Activity  },
  { id: 'analytics', label: 'Analytics',   Icon: BarChart2 },
  { id: 'topics',    label: 'Topics',      Icon: Layers    },
  { id: 'insights',  label: 'AI Insights', Icon: Brain     },
  { id: 'feed',      label: 'Feed',        Icon: Newspaper },
];

// ── Main component ────────────────────────────────────────────────────────
export default function PetronasIntelDashboard() {
  const [rawData,        setRawData]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [lastUpdated,    setLastUpdated]    = useState(null);
  const [activeTab,      setActiveTab]      = useState('overview');
  const [insight,        setInsight]        = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError,   setInsightError]   = useState(null);
  const [search,         setSearch]         = useState('');
  const [selectedCat,    setSelectedCat]    = useState('all');
  const [expandedSig,    setExpandedSig]    = useState(null);

  // ── Fetch CSV ─────────────────────────────────────────────────────────
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
            .map(r => ({
              id:        String(r.id        || '').trim(),
              title:     String(r.title     || '').trim(),
              published: parseDate(r.published),
              url:       String(r.url       || '').trim(),
            }))
            .filter(r => r.title && r.published);
          setRawData(parsed);
          setLastUpdated(new Date());
          setLoading(false);
        },
      });
    } catch (e) { setError(e.message); setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ──────────────────────────────────────────────────────
  const data = useMemo(() =>
    rawData.map(item => ({ ...item, category: categorize(item.title) })), [rawData]);

  const catDist = useMemo(() =>
    data.reduce((a, i) => { a[i.category] = (a[i.category] || 0) + 1; return a; }, {}), [data]);

  const pieData = useMemo(() =>
    Object.entries(catDist).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })), [catDist]);

  const timelineData = useMemo(() => {
    const bkt = {};
    data.forEach(i => {
      if (!i.published) return;
      const k = i.published.toISOString().split('T')[0];
      bkt[k] = (bkt[k] || 0) + 1;
    });
    return Object.entries(bkt)
      .map(([date, count]) => ({ date, label: fmtShort(new Date(date + 'T00:00:00')), count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [data]);

  const topicCounts = useMemo(() => {
    const cnt = {};
    data.forEach(item => getTopics(item.title).forEach(t => { cnt[t] = (cnt[t] || 0) + 1; }));
    return Object.entries(cnt).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const feedData = useMemo(() => {
    let d = [...data].sort((a, b) => (b.published || 0) - (a.published || 0));
    if (selectedCat !== 'all') d = d.filter(i => i.category === selectedCat);
    if (search.trim()) { const q = search.toLowerCase(); d = d.filter(i => i.title.toLowerCase().includes(q)); }
    return d;
  }, [data, selectedCat, search]);

  const dateRange = useMemo(() => {
    const dates = data.map(d => d.published).filter(Boolean).sort((a, b) => a - b);
    return dates.length >= 2 ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : '';
  }, [data]);

  // ── AI insight loader (daily cache + retry) ───────────────────────────
  const loadInsight = useCallback(async (force = false) => {
    if (!data.length) return;
    const cacheKey = `pintel-insight-${todayKey()}`;

    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) { setInsight(JSON.parse(cached)); return; }
      } catch {}
    }

    setInsightLoading(true); setInsightError(null);
    try {
      const result = await generateInsight(data);
      try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch {}
      setInsight(result);
    } catch (e) {
      setInsightError(e.message);
      setInsight({ ...FALLBACK, source: 'error-fallback' });
    } finally {
      setInsightLoading(false);
    }
  }, [data]);

  useEffect(() => {
    if (data.length > 0 && !insight && !insightLoading) loadInsight();
  }, [data.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(135deg,#050c1a 0%,#080f1e 100%)' }}>
      <div className="w-12 h-12 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(0,161,156,0.25)', borderTopColor: '#00a19c' }} />
      <p className="text-sm text-gray-500">Loading PETRONAS Intelligence Data…</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg,#050c1a 0%,#080f1e 100%)' }}>
      <div className="glass-card p-8 text-center max-w-sm w-full">
        <AlertCircle size={36} color="#f87171" className="mx-auto mb-3" />
        <p className="text-white font-semibold mb-1">Failed to load data</p>
        <p className="text-gray-400 text-sm mb-5">{error}</p>
        <button onClick={fetchData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(0,161,156,0.15)', color: '#2dd4bf', border: '1px solid rgba(0,161,156,0.3)' }}>
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans"
      style={{ background: 'linear-gradient(160deg,#050c1a 0%,#07111f 60%,#050c1a 100%)' }}>

      {/* Ambient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-48 -left-48 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#00a19c,transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-5"
          style={{ background: 'radial-gradient(circle,#0ea5e9,transparent 70%)' }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* ── Header ── */}
        <header className="mb-8">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: '#00a19c' }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#00a19c' }} />
                </span>
                <span className="text-xs font-medium tracking-wide" style={{ color: '#00a19c' }}>
                  LIVE · Daily 08:00 MYT
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
                Market Intelligence
                <span className="block text-transparent bg-clip-text"
                  style={{ backgroundImage: 'linear-gradient(90deg,#00a19c 0%,#0ea5e9 100%)' }}>
                  Dashboard
                </span>
              </h1>
              {dateRange && <p className="text-gray-500 text-sm mt-1.5">PETRONAS · {dateRange}</p>}
            </div>

            <div className="flex items-center gap-2 pt-1">
              {lastUpdated && (
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Clock size={11} />
                  {lastUpdated.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              <button onClick={fetchData}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.08)' }}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Articles"  value={data.length}                  icon={Newspaper} color="#00a19c" delay={0}    />
            <StatCard label="Categories"      value={Object.keys(catDist).length}  icon={Layers}    color="#0ea5e9" delay={0.05} />
            <StatCard label="Renewables News" value={catDist['Renewables'] || 0}   icon={Zap}       color="#34d399" delay={0.1}  />
            <StatCard label="Energy & Gas"    value={catDist['Energy & Gas'] || 0} icon={Activity}  color="#f59e0b" delay={0.15} />
          </div>
        </header>

        {/* ── Tab nav ── */}
        <div className="flex gap-1 sm:gap-1.5 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap border transition-all ${
                  active ? 'tab-active' : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5'
                }`}>
                <Icon size={14} />
                <span>{label}</span>
                {id === 'insights' && (
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: insightLoading ? '#fbbf24' : insight ? '#34d399' : '#374151' }} />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }}>

            {/* ════ OVERVIEW ════ */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="glass-card p-5 lg:col-span-3">
                  <div className="flex items-center gap-2 mb-5">
                    <Calendar size={14} color="#00a19c" />
                    <h2 className="text-sm font-semibold text-gray-200">Daily Article Volume</h2>
                    <span className="ml-auto text-xs text-gray-600">{timelineData.length} days</span>
                  </div>
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={timelineData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#00a19c" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#00a19c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} />
                      <YAxis stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                      <RTooltip content={<ChartTip />} />
                      <Area type="monotone" dataKey="count" name="Articles"
                        stroke="#00a19c" strokeWidth={2} fill="url(#tealGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass-card p-5 lg:col-span-2">
                  <div className="flex items-center gap-2 mb-5">
                    <Target size={14} color="#0ea5e9" />
                    <h2 className="text-sm font-semibold text-gray-200">Category Split</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%"
                        innerRadius={40} outerRadius={66} paddingAngle={3} dataKey="value">
                        {pieData.map((e, i) => (
                          <Cell key={i} fill={(CAT[e.name] || CAT['Other']).dot} stroke="transparent" />
                        ))}
                      </Pie>
                      <RTooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 mt-3">
                    {pieData.map(({ name, value }) => {
                      const c = CAT[name] || CAT['Other'];
                      const pct = data.length ? Math.round(value / data.length * 100) : 0;
                      return (
                        <div key={name} className="flex items-center gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.dot }} />
                          <span className="text-gray-400 flex-1 truncate">{name}</span>
                          <span className="font-semibold tabular-nums" style={{ color: c.text }}>{pct}%</span>
                          <span className="text-gray-600 tabular-nums w-6 text-right">{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ════ ANALYTICS ════ */}
            {activeTab === 'analytics' && (
              <div className="space-y-4">
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart2 size={14} color="#8b5cf6" />
                    <h2 className="text-sm font-semibold text-gray-200">Articles by Category</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={pieData} margin={{ top: 4, right: 8, left: -24, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="name" stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }}
                        angle={-35} textAnchor="end" interval={0} />
                      <YAxis stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                      <RTooltip content={<ChartTip />} />
                      <Bar dataKey="value" name="Articles" radius={[4, 4, 0, 0]}>
                        {pieData.map((e, i) => <Cell key={i} fill={(CAT[e.name] || CAT['Other']).dot} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-5">
                    <Globe size={14} color="#f59e0b" />
                    <h2 className="text-sm font-semibold text-gray-200">Topic Coverage Radar</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={topicCounts}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                      <PolarRadiusAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} />
                      <Radar name="Mentions" dataKey="value"
                        stroke="#00a19c" fill="#00a19c" fillOpacity={0.18} strokeWidth={1.5} />
                      <RTooltip content={<ChartTip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ════ TOPICS ════ */}
            {activeTab === 'topics' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {topicCounts.map(({ name, value }, i) => {
                    const color = CHART_PAL[i % CHART_PAL.length];
                    const maxV  = topicCounts[0]?.value || 1;
                    return (
                      <motion.div key={name}
                        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.06 }}
                        className="glass-card p-4">
                        <div className="text-3xl font-light mb-1" style={{ color }}>{value}</div>
                        <div className="text-xs text-gray-400 font-medium mb-1">{name}</div>
                        <div className="score-track">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.round(value / maxV * 100)}%` }}
                            transition={{ duration: 0.85, delay: i * 0.06 + 0.2 }}
                            style={{ height: '100%', borderRadius: 999, background: color }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 mb-5">
                    <BarChart2 size={14} color="#00a19c" />
                    <h2 className="text-sm font-semibold text-gray-200">Topic Frequency</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={topicCounts} layout="vertical"
                      margin={{ top: 0, right: 12, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" stroke="#374151" tick={{ fontSize: 10, fill: '#6b7280' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" stroke="#374151"
                        tick={{ fontSize: 11, fill: '#9ca3af' }} width={56} />
                      <RTooltip content={<ChartTip />} />
                      <Bar dataKey="value" name="Mentions" radius={[0, 4, 4, 0]}>
                        {topicCounts.map((_, i) => <Cell key={i} fill={CHART_PAL[i % CHART_PAL.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ════ AI INSIGHTS ════ */}
            {activeTab === 'insights' && (
              <div className="space-y-4 max-w-4xl mx-auto">
                <div className="text-center py-2">
                  <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#00a19c' }}>
                    AI-Powered Analysis
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-light text-white">Strategic Sentiment Analysis</h2>
                  <p className="text-xs text-gray-600 mt-2 max-w-lg mx-auto">
                    Daily analysis by{' '}
                    <span style={{ color: '#2dd4bf' }}>{GROQ_MODEL}</span>
                    {' '}from {data.length} market intelligence articles
                  </p>
                </div>

                {insightLoading ? (
                  <div className="glass-card p-10 flex flex-col items-center gap-4">
                    <div className="w-10 h-10 rounded-full border-2 animate-spin"
                      style={{ borderColor: 'rgba(0,161,156,0.25)', borderTopColor: '#00a19c' }} />
                    <p className="text-sm text-gray-500">
                      Streaming from <span style={{ color: '#2dd4bf' }}>{GROQ_MODEL}</span>…
                    </p>
                    <p className="text-xs text-gray-600">Auto-retries on timeout · up to 3 attempts</p>
                  </div>
                ) : insight ? (
                  <>
                    {/* Overall score card */}
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                      className="glass-card p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(0,161,156,0.12)' }}>
                            <Brain size={18} color="#00a19c" />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                              Overall Sentiment
                            </div>
                            <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                              {insight.overall_sentiment?.replace(/_/g, ' ') || '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end gap-1">
                          <span className="text-5xl font-light tabular-nums"
                            style={{ color: scoreColor(insight.overall_score) }}>
                            {insight.overall_score}
                          </span>
                          <span className="text-sm text-gray-600 pb-1">/100</span>
                        </div>
                      </div>

                      <ScoreBar score={insight.overall_score} color={scoreColor(insight.overall_score)} delay={0.2} />

                      <p className="text-sm text-gray-300 leading-relaxed mt-5 mb-5 pl-4"
                        style={{ borderLeft: '2px solid rgba(0,161,156,0.35)' }}>
                        {insight.summary}
                      </p>

                      <div className="flex items-center gap-2 flex-wrap text-xs">
                        <span className="px-2.5 py-1 rounded-full font-medium"
                          style={{ background: 'rgba(0,161,156,0.1)', color: '#2dd4bf' }}>
                          {insight.model}
                        </span>
                        {['embedded-fallback','no-api-key','error-fallback'].includes(insight.source) ? (
                          <span className="px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24' }}>
                            {insight.source === 'no-api-key'
                              ? 'Set REACT_APP_GROQ_API_KEY for live analysis'
                              : 'Fallback data — API unavailable'}
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full"
                            style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                            Generated {new Date(insight.generated_at).toLocaleDateString('en-MY')}
                          </span>
                        )}
                        <button onClick={() => loadInsight(true)}
                          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all hover:bg-white/10"
                          style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <RefreshCw size={10} /> Regenerate
                        </button>
                      </div>
                    </motion.div>

                    {/* Signal cards */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(insight.signals || []).map((s, i) => {
                        const dir  = SIG_STYLE[(s.direction || '').toLowerCase()] || SIG_STYLE.unknown;
                        const DirI = dir.Icon;
                        const open = expandedSig === i;
                        return (
                          <motion.div key={s.dimension}
                            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.07 }}
                            className="glass-card p-5 cursor-pointer select-none"
                            onClick={() => setExpandedSig(open ? null : i)}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-200 pr-2">{s.dimension}</span>
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ background: dir.bg }}>
                                <DirI size={13} color={dir.color} />
                              </div>
                            </div>
                            <div className="text-3xl font-light" style={{ color: dir.color }}>{s.score}</div>
                            <ScoreBar score={s.score} color={dir.color} delay={0.15 + i * 0.07} />
                            <motion.div
                              initial={false}
                              animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
                              transition={{ duration: 0.22 }}
                              style={{ overflow: 'hidden' }}>
                              <p className="text-xs text-gray-400 leading-relaxed mt-3">{s.analysis}</p>
                            </motion.div>
                            <div className="flex items-center gap-1 text-xs mt-2"
                              style={{ color: open ? '#6b7280' : '#374151' }}>
                              {open
                                ? <><ChevronUp size={11} /> collapse</>
                                : <><ChevronDown size={11} /> expand analysis</>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Recommendation */}
                    {insight.recommendation && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                        className="glass-card p-6"
                        style={{ borderColor: 'rgba(0,161,156,0.25)' }}>
                        <div className="text-xs font-semibold uppercase tracking-widest mb-3"
                          style={{ color: '#00a19c' }}>
                          Strategic Recommendation
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">{insight.recommendation}</p>
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="glass-card p-10 text-center text-gray-600 text-sm">
                    No insight loaded.{' '}
                    <button onClick={() => loadInsight(true)} className="underline"
                      style={{ color: '#2dd4bf' }}>
                      Generate now
                    </button>
                  </div>
                )}

                {insightError && (
                  <p className="text-xs text-center py-1" style={{ color: '#f87171' }}>
                    API error: {insightError}. Showing fallback.
                  </p>
                )}
              </div>
            )}

            {/* ════ FEED ════ */}
            {activeTab === 'feed' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={13} color="#6b7280"
                      className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search articles…"
                      className="w-full pl-8 pr-3 py-2 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                  </div>
                  <select value={selectedCat} onChange={e => setSelectedCat(e.target.value)}
                    className="px-3 py-2 rounded-xl text-sm text-gray-300 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <option value="all">All Categories</option>
                    {Object.keys(CAT).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <p className="text-xs text-gray-600 pl-1">{feedData.length} articles</p>

                <div className="space-y-2 max-h-[68vh] overflow-y-auto pr-0.5">
                  {feedData.map((item, i) => (
                    <motion.div key={item.id || i}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.025, 0.35) }}
                      className="glass-card glass-hover p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <CatBadge cat={item.category} />
                            <span className="text-xs text-gray-600 flex items-center gap-1">
                              <Calendar size={10} /> {fmtDate(item.published)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-200 leading-snug">{item.title}</p>
                        </div>
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 p-2 rounded-lg transition-all hover:bg-white/10"
                          onClick={e => e.stopPropagation()} title="Open article">
                          <ExternalLink size={13} color="#4b5563" />
                        </a>
                      </div>
                    </motion.div>
                  ))}
                  {feedData.length === 0 && (
                    <div className="text-center text-gray-600 text-sm py-16">No articles match your filters.</div>
                  )}
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        <footer className="mt-12 pt-5 text-center text-xs text-gray-700"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          PETRONAS Market Intelligence · Data updated daily 08:00 MYT · AI by{' '}
          <span style={{ color: '#2dd4bf' }}>{GROQ_MODEL}</span>
        </footer>
      </div>
    </div>
  );
}
