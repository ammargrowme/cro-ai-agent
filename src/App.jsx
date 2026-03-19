
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
// html2canvas and jsPDF are lazy-loaded in export handlers to reduce initial bundle (~560KB savings)
import {
  Globe,
  Search,
  Activity,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Zap,
  TrendingUp,
  MonitorSmartphone,
  Eye,
  Type,
  MousePointerClick,
  ShieldCheck,
  LayoutTemplate,
  ChevronRight,
  RefreshCw,
  Code,
  Loader2,
  Sparkles,
  MessageSquare,
  Send,
  User,
  Bot,
  BarChart3,
  Printer,
  Download,
  Lightbulb,
  LayoutGrid,
  List,
  BarChart,
  Plus,
  Minus,
  Swords,
  Target,
  BrainCircuit,
  Settings2,
  Crosshair,
  Award,
  Filter,
  Play,
  XCircle,
  Terminal,
  Key,
  BookOpen,
  Brain,
  ClipboardCheck
} from "lucide-react";

// Backend routes now handle AI logic.
// VITE_GEMINI_API_KEY is now only used on the server (Vercel).

// --- BRANDING CONSTANTS ---
const BRAND = {
  primary: "#F25430",
  primaryHover: "#D94A2A",
  primaryGlow: "rgba(242, 84, 48, 0.15)",
  bgBase: "#08090D",
  bgSurface: "#12151B",
  bgSurfaceHighlight: "#1E222A",
  bgCard: "#161920",
  textMain: "#FFFFFF",
  textMuted: "#8B95A5",
  textDim: "#5A6270",
  accentSuccess: "#34D399",
  accentWarning: "#FBBF24",
  accentDanger: "#F87171",
  borderSubtle: "#1E222A",
  borderHover: "#2A2F3A"
};

// --- SCHEMA NOTE ---
// Report schema is defined server-side in api/analyze.js (OVERVIEW_SCHEMA, RECOMMENDATIONS_SCHEMA, CHECKLIST_SCHEMA).
// See CLAUDE.md "Report Schema" section for the full structure.

const DEFAULT_FUN_FACTS = [
  "A 1-second delay in page load time can yield a 7% reduction in conversions.",
  "User judgments on website credibility are 75% based on overall aesthetics.",
  "Personalized calls-to-action convert 202% better than default versions.",
  "Frictionless checkout processes can increase conversion rates by up to 35%."
];

// --- SAFE JSON PARSING HELPER ---
const safeParseJSON = (text) => {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Failed to parse JSON from AI response.");
  }
};

// --- SAFE LOCAL STORAGE HELPER ---
const getSafeLocalStorage = (key) => {
  try { return localStorage.getItem(key) || ""; } catch (e) { return ""; }
};
const setSafeLocalStorage = (key, value) => {
  try { localStorage.setItem(key, value); } catch (e) { }
};

// --- LEARNING SYSTEM (Server-Side + Local Fallback) ---
// Server-side: All users contribute to a shared knowledge base via /api/learnings (Upstash Redis)
// Local: localStorage is kept as a cache and fallback if the server is unavailable
const LOCAL_LEARNINGS_KEY = "growagent_learnings";
const LOCAL_INSIGHTS_KEY = "growagent_insights";

// Local helpers (kept as fallback)
const getLocalLearnings = () => {
  try {
    const raw = localStorage.getItem(LOCAL_LEARNINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
};

const buildLearningEntry = (auditResult) => ({
  url: auditResult.audit_metadata?.url || "unknown",
  score: auditResult.overall_score,
  timestamp: auditResult.audit_metadata?.timestamp || new Date().toISOString(),
  topIssues: (auditResult.recommendations || []).slice(0, 3).map(r => r.issue),
  topCategories: (auditResult.recommendations || []).slice(0, 3).map(r => r.category),
  checklistWeaknesses: Object.entries(auditResult.checklist_scores || {})
    .filter(([, v]) => v < 50)
    .map(([k]) => k.replace(/_/g, ' ')),
  checklistStrengths: Object.entries(auditResult.checklist_scores || {})
    .filter(([, v]) => v >= 80)
    .map(([k]) => k.replace(/_/g, ' ')),
  allChecklistScores: auditResult.checklist_scores || {},
  criticalFlags: (auditResult.checklist_flags || []).slice(0, 3),
  feedbackInsights: [],
  chatModifications: 0
});

const saveLocalLearning = (auditResult) => {
  try {
    const learnings = getLocalLearnings();
    const entry = buildLearningEntry(auditResult);
    learnings.push(entry);
    localStorage.setItem(LOCAL_LEARNINGS_KEY, JSON.stringify(learnings.slice(-20)));
    return entry;
  } catch (e) { return null; }
};

const addLocalInsight = (insight) => {
  try {
    const insights = JSON.parse(localStorage.getItem(LOCAL_INSIGHTS_KEY) || "[]");
    insights.push({ text: insight, timestamp: new Date().toISOString() });
    localStorage.setItem(LOCAL_INSIGHTS_KEY, JSON.stringify(insights.slice(-50)));
  } catch (e) {}
};

// Server-side learning helpers (fire-and-forget saves, non-blocking)
const saveServerLearning = (auditResult) => {
  const entry = buildLearningEntry(auditResult);
  fetch('/api/learnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'audit', data: entry })
  }).catch(() => {}); // Silent fail — localStorage is the backup
};

const saveServerInsight = (insightText, sourceUrl) => {
  fetch('/api/learnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'insight', data: { text: insightText, sourceUrl: sourceUrl || "" } })
  }).catch(() => {}); // Silent fail
};

const fetchServerLearnings = async () => {
  try {
    const res = await fetch('/api/learnings');
    if (!res.ok) throw new Error("Server learnings unavailable");
    return await res.json();
  } catch (e) {
    return { learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 };
  }
};

// Merge local + server learnings, deduplicate by url+timestamp
const mergeLearnings = (localLearnings, serverData) => {
  const serverLearnings = serverData.learnings || [];
  const seen = new Set();
  const merged = [];
  // Server learnings first (shared knowledge), then local
  for (const entry of [...serverLearnings, ...localLearnings]) {
    const key = `${entry.url}|${entry.timestamp}`;
    if (!seen.has(key)) { seen.add(key); merged.push(entry); }
  }

  // Merge insights
  const localInsights = JSON.parse(localStorage.getItem(LOCAL_INSIGHTS_KEY) || "[]");
  const serverInsights = (serverData.insights || []).map(i => typeof i === 'string' ? JSON.parse(i) : i);
  const allInsightTexts = [...new Set([...serverInsights, ...localInsights].map(i => i.text))].slice(-20);

  // Attach insights to the last learning entry for prompt inclusion
  if (allInsightTexts.length > 0 && merged.length > 0) {
    merged[merged.length - 1].feedbackInsights = allInsightTexts;
  }

  return merged;
};

// Track when chat modifies the report
const trackChatModification = () => {
  try {
    const learnings = getLocalLearnings();
    if (learnings.length > 0) {
      learnings[learnings.length - 1].chatModifications = (learnings[learnings.length - 1].chatModifications || 0) + 1;
      localStorage.setItem(LOCAL_LEARNINGS_KEY, JSON.stringify(learnings));
    }
  } catch (e) {}
};

// --- CHECKLIST CATEGORY LABELS ---
const CHECKLIST_LABELS = {
  seo_alignment: "SEO & Keywords",
  above_the_fold: "Above the Fold",
  cta_focus: "CTA & Conversion",
  content_structure: "Content Structure",
  visual_hierarchy: "Visual Hierarchy",
  mobile_optimization: "Mobile",
  trust_proof: "Trust & Proof",
  forms_interaction: "Forms",
  performance_qa: "Performance & QA",
  content_standards: "Content Standards"
};

// --- ICONS AND UI CATEGORIZATION ---
const getIconForCategory = (category, size = 18) => {
  if (!category) return <Type size={size} />;
  const cat = category.toLowerCase();
  if (cat.includes('cta') || cat.includes('click')) return <MousePointerClick size={size} />;
  if (cat.includes('trust') || cat.includes('security') || cat.includes('proof')) return <ShieldCheck size={size} />;
  if (cat.includes('ux') || cat.includes('layout') || cat.includes('fold')) return <LayoutTemplate size={size} />;
  if (cat.includes('speed') || cat.includes('performance')) return <Zap size={size} />;
  if (cat.includes('mobile')) return <MonitorSmartphone size={size} />;
  if (cat.includes('seo') || cat.includes('keyword')) return <Search size={size} />;
  if (cat.includes('form')) return <ClipboardCheck size={size} />;
  if (cat.includes('design') || cat.includes('visual')) return <Eye size={size} />;
  if (cat.includes('copy') || cat.includes('content')) return <Type size={size} />;
  return <Type size={size} />;
};

const STEP_HEADERS = [
  "Extracting Source Architecture",
  "Processing Visual Hierarchy",
  "Evaluating Core Web Vitals",
  "Synthesizing Revenue Strategy",
  "Finalizing Growth Report"
];

const LOADING_PHRASES = [
  "Parsing HTML structure & headings...", "Checking CTA placement above the fold...", "Evaluating mobile tap targets (44px min)...",
  "Scanning for trust signals & reviews...", "Analyzing content readability & flow...", "Checking form labels & validation...",
  "Measuring hero section height ratio...", "Detecting FAQ & social proof sections...", "Scoring against 50+ checklist criteria...",
  "Comparing against past audit patterns...", "Extracting SEO meta & keyword data...", "Evaluating visual hierarchy & whitespace..."
];

// --- CLIPBOARD HELPER (replaces deprecated execCommand) ---
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers / non-HTTPS
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { }
    document.body.removeChild(ta);
    return true;
  }
};

// --- ERROR BOUNDARY ---
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("GROWAGENT Error Boundary:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', {
        style: { background: '#08090D', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif", color: '#fff', padding: '2rem' }
      },
        React.createElement('div', { style: { fontSize: '64px', marginBottom: '1rem' } }, '\u26A0\uFE0F'),
        React.createElement('h1', { style: { fontFamily: "'Montserrat', sans-serif", fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' } }, 'Something went wrong'),
        React.createElement('p', { style: { color: '#9CA3AF', marginBottom: '2rem', textAlign: 'center', maxWidth: '500px' } },
          'GROWAGENT encountered an unexpected error. Your data is safe — click below to reload.'
        ),
        React.createElement('button', {
          onClick: () => window.location.reload(),
          style: { background: '#F25430', color: '#fff', border: 'none', padding: '12px 32px', borderRadius: '12px', fontWeight: 800, fontSize: '16px', cursor: 'pointer' }
        }, 'Reload App')
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [url, setUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Form States
  const [additionalContext, setAdditionalContext] = useState("");
  const [competitorsInput, setCompetitorsInput] = useState("");
  const [customPageSpeedKey, setCustomPageSpeedKey] = useState(() => getSafeLocalStorage("growagent_pagespeed_key"));

  const [appError, setAppError] = useState(null);

  // App Workflow States
  const [status, setStatus] = useState("idle");
  const [currentStep, setCurrentStep] = useState(0);
  const [loadingPhrase, setLoadingPhrase] = useState(LOADING_PHRASES[0]);
  const [analysisSteps, setAnalysisSteps] = useState([]);

  // No longer using UI logs

  // Wrapped Story States
  const [countdown, setCountdown] = useState(3);
  const [storyStep, setStoryStep] = useState(0);

  // UI States
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'
  const [funFacts, setFunFacts] = useState(DEFAULT_FUN_FACTS);
  const [activeFactIndex, setActiveFactIndex] = useState(0);

  const [report, setReport] = useState(null);
  const [serverLearnings, setServerLearnings] = useState({ learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 });
  const [learningCount, setLearningCount] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [codePatches, setCodePatches] = useState({});
  const [abTests, setAbTests] = useState({});
  const [reportUpdatedFlash, setReportUpdatedFlash] = useState(false);

  // Chat State
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setSafeLocalStorage("growagent_pagespeed_key", customPageSpeedKey);
  }, [customPageSpeedKey]);

  // Fetch shared server learnings on mount — this is the single source of truth
  useEffect(() => {
    fetchServerLearnings().then(data => {
      setServerLearnings(data);
      setLearningCount(data.totalLearnings);
    });
  }, []);

  // No addLog needed

  const chatContainerRef = useRef(null);
  useEffect(() => { if (chatHistory.length > 0 && chatContainerRef.current) { chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight; } }, [chatHistory]);

  useEffect(() => {
    let phraseInterval, factsInterval, elapsedInterval;
    if (status === "analyzing") {
      setElapsedSeconds(0);
      let i = 0;
      phraseInterval = setInterval(() => { i = (i + 1) % LOADING_PHRASES.length; setLoadingPhrase(LOADING_PHRASES[i]); }, 800);
      factsInterval = setInterval(() => { setActiveFactIndex(prev => (prev + 1) % funFacts.length); }, 4000);
      elapsedInterval = setInterval(() => { setElapsedSeconds(prev => prev + 1); }, 1000);
    }
    return () => { clearInterval(phraseInterval); clearInterval(factsInterval); clearInterval(elapsedInterval); };
  }, [status, funFacts.length]);

  useEffect(() => {
    let timer;
    if (status === "wrapped_countdown") {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        setStatus("wrapped_story");
        setStoryStep(0);
      }
    }
    return () => clearTimeout(timer);
  }, [status, countdown]);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!url) return;

    let formattedUrl = url.startsWith('http') ? url : `https://${url}`;
    setUrl(formattedUrl);
    setAppError(null);
    
    const hasCompetitors = competitorsInput.trim().length > 0;
    const competitorCount = competitorsInput.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0).length;
    const hostname = (() => { try { return new URL(formattedUrl).hostname; } catch { return formattedUrl; } })();
    const dynamicSteps = [
      { id: 'scrape', label: `Scraping ${hostname}${hasCompetitors ? ` + ${competitorCount} competitor${competitorCount > 1 ? 's' : ''}` : ''}...`, icon: <Code size={18} />, detail: 'Fetching HTML, removing scripts & styles' },
      { id: 'metrics', label: 'Running PageSpeed & capturing screenshot...', icon: <Activity size={18} />, detail: 'Google Lighthouse performance audit' },
      { id: 'ai_analysis', label: `AI scoring against ${10} checklist categories...`, icon: <BrainCircuit size={18} />, detail: '3 parallel AI calls: overview + recommendations + checklist' },
      { id: 'compile', label: 'Compiling final report...', icon: <Target size={18} />, detail: `${serverLearnings.totalLearnings > 0 ? `Enhanced with ${serverLearnings.totalLearnings} past audit${serverLearnings.totalLearnings !== 1 ? 's' : ''} learned` : 'Generating actionable recommendations'}` },
    ];
    setAnalysisSteps(dynamicSteps);

    setStatus("analyzing"); setCurrentStep(0); setReport(null); setCodePatches({}); setAbTests({}); setFunFacts(DEFAULT_FUN_FACTS);
    setChatHistory([{ role: "model", parts: [{ text: "Hi! I'm your CRO AI Assistant. I've just completed the audit above. What specific areas would you like to discuss or dive deeper into?" }] }]);

    try {
      setCurrentStep(0);
      const competitors = competitorsInput.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 2);
      
      const payload = {
        url: formattedUrl,
        context: additionalContext,
        competitors: competitors.map(c => c.startsWith('http') ? c : `https://${c}`),
        customPageSpeedKey: customPageSpeedKey.trim(),
        pastLearnings: mergeLearnings(getLocalLearnings(), serverLearnings)
      };

      // Interval to update current step based on typical timing
      const stepInterval = setInterval(() => {
        setCurrentStep(prev => (prev < 3 ? prev + 1 : prev));
      }, 5000);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      clearInterval(stepInterval);
      setCurrentStep(4);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Internal Server Error");
      }

      const realReport = await response.json();

      if (realReport) {
        setReport(realReport);
        // Save to BOTH server (shared) and local (fallback)
        saveLocalLearning(realReport);
        saveServerLearning(realReport);
        // Refresh server learnings count (server is the source of truth)
        fetchServerLearnings().then(data => {
          setServerLearnings(data);
          setLearningCount(data.totalLearnings);
        });
        setCountdown(3);
        setStatus("wrapped_countdown");
      } else {
        throw new Error("Empty report received.");
      }
    } catch (err) {
      setAppError(`Analysis Error: ${err.message}. Please check Vercel Logs for the corresponding [Log ID].`);
      setStatus("idle");
    }
  };

  const advanceStory = () => {
    if (storyStep < 4) {
      setStoryStep(s => s + 1);
    } else {
      setStatus("complete");
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;
    const userMessage = { role: "user", parts: [{ text: chatInput }] };
    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory); setChatInput(""); setIsChatLoading(true);

    // Build rich context for the chat AI (merged local + server learnings)
    const pastData = mergeLearnings(getLocalLearnings(), serverLearnings);
    const recentPast = pastData.slice(-3);
    const localInsightsRaw = JSON.parse(localStorage.getItem(LOCAL_INSIGHTS_KEY) || "[]");
    const serverInsightTexts = (serverLearnings.insights || []).map(i => typeof i === 'string' ? JSON.parse(i).text : i.text);
    const uniqueInsights = [...new Set([...serverInsightTexts, ...localInsightsRaw.map(i => i.text)])].slice(-10);

    const payload = {
      history: newHistory,
      systemInstruction: `You are an expert CRO Strategy Assistant for the GROWAGENT platform. You have deep knowledge of conversion rate optimization, A/B testing, and the GrowMe Basic Website Standards checklist.

CURRENT REPORT STATE:
${JSON.stringify(report)}

PAST AUDIT HISTORY (${pastData.length} total audits learned from):
${recentPast.map((l, i) => `${i + 1}. "${l.url}" — Score: ${l.score}/100 | Weak: ${l.checklistWeaknesses?.join(', ') || 'N/A'} | Strong: ${l.checklistStrengths?.join(', ') || 'N/A'}`).join('\n')}

${uniqueInsights.length > 0 ? `ACCUMULATED CRO INSIGHTS (proven learnings from past conversations):
${uniqueInsights.map(i => `- ${i}`).join('\n')}` : ''}

Your job:
- Answer questions about the audit results with specificity — cite exact scores and checklist items
- Help the user understand WHY certain issues matter for conversions with data-backed reasoning
- If the user wants to modify the report, return an updated_report with ALL fields preserved
- ACTIVELY extract reusable CRO insights from the conversation into learning_insight — look for business context, industry patterns, what works/doesn't work for this user
- Reference checklist categories and their specific scores when relevant (e.g., "Your CTA score is 45/100 because...")
- When replacing a recommendation, ensure the replacement addresses a DIFFERENT checklist weakness
- Proactively suggest improvements: "Based on your CTA score of 45, would you like me to..."
- If the user shares their industry/audience, adapt all advice accordingly
- When discussing competitors, reference ALL competitors in the competitor_analysis.comparisons array — compare EACH one, not just the first. Format as: "Against [competitor], your advantage is [advantage]. They do better at [difference]."
- If the user asks to "compare" or "analyze competitors", provide a detailed comparison for EVERY entry in the comparisons array — never skip any`
    };

    try {
      const response = await fetch('/api/chat', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Chat failed");
      let responseData = await response.json();

      // Safety: if responseData is a string (double-encoded), parse it
      if (typeof responseData === 'string') {
        try { responseData = JSON.parse(responseData); } catch (e) { responseData = { message: responseData }; }
      }

      // Safety: if message contains raw JSON, extract just the message text
      let chatMessage = responseData.message || "";
      if (chatMessage.trim().startsWith('{') && chatMessage.includes('"message"')) {
        try {
          const inner = JSON.parse(chatMessage);
          if (inner.message) {
            chatMessage = inner.message;
            // Also capture inner fields if present
            if (inner.learning_insight && !responseData.learning_insight) responseData.learning_insight = inner.learning_insight;
            if (inner.updated_report && !responseData.updated_report) responseData.updated_report = inner.updated_report;
          }
        } catch (e) { /* not parseable, use as-is */ }
      }

      // Fallback if message is still empty
      if (!chatMessage || chatMessage.trim().length === 0) {
        chatMessage = "I've processed your request. Is there anything specific you'd like to discuss about the audit?";
      }

      setChatHistory([...newHistory, { role: "model", parts: [{ text: chatMessage }] }]);

      // Capture learning insights from chat — save to BOTH server and local
      if (responseData.learning_insight) {
        addLocalInsight(responseData.learning_insight);
        saveServerInsight(responseData.learning_insight, report?.audit_metadata?.url);
      }

      if (responseData.updated_report && JSON.stringify(responseData.updated_report) !== JSON.stringify(report)) {
        // Merge with existing report to handle partial AI responses
        const merged = { ...report, ...responseData.updated_report };
        // Preserve arrays/objects that shouldn't be empty
        if (!merged.recommendations?.length) merged.recommendations = report.recommendations;
        if (!merged.strengths?.length) merged.strengths = report.strengths;
        if (!merged.quick_wins?.length) merged.quick_wins = report.quick_wins;
        if (!merged.checklist_scores || Object.keys(merged.checklist_scores).length === 0) merged.checklist_scores = report.checklist_scores;
        if (!merged.checklist_flags?.length) merged.checklist_flags = report.checklist_flags;
        if (!merged.audit_metadata) merged.audit_metadata = report.audit_metadata;
        setReport(merged); setReportUpdatedFlash(true);
        trackChatModification();
        setTimeout(() => setReportUpdatedFlash(false), 1500);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (error) {
      console.error("Chat Error:", error);
      setChatHistory([...newHistory, { role: "model", parts: [{ text: "⚠️ I had trouble processing that request. Click the retry button or try rephrasing your question." }], _error: true }]);
    }
    finally { setIsChatLoading(false); }
  };

  const handleChatRetry = () => {
    // Remove the error message and replay the last user message
    const lastUserIdx = chatHistory.map(m => m.role).lastIndexOf('user');
    if (lastUserIdx >= 0) {
      const lastUserMsg = chatHistory[lastUserIdx].parts[0].text;
      const historyBeforeError = chatHistory.slice(0, lastUserIdx);
      setChatHistory(historyBeforeError);
      setChatInput(lastUserMsg);
    }
  };

  const handleGenerateCodePatch = async (rec) => {
    setCodePatches(prev => ({ ...prev, [rec.id]: { loading: true, code: null } }));
    const prompt = `Act as an expert frontend developer. Fix this CRO issue for ${url}.\nIssue: ${rec.issue}\nRecommendation: ${rec.recommendation}\nWrite specific HTML and Tailwind CSS code. Output ONLY raw code.`;
    
    try {
      const response = await fetch('/api/generateCode', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await response.json();
      let codeText = data.text;
      const codeBlockRegex = new RegExp('\`{3}[a-zA-Z]*\\n?', 'gi');
      codeText = codeText?.replace(codeBlockRegex, '').replace(/\`{3}/g, '').trim();
      setCodePatches(prev => ({ ...prev, [rec.id]: { loading: false, code: codeText || "Code generation failed." } }));
    } catch (error) {
      setCodePatches(prev => ({ ...prev, [rec.id]: { loading: false, code: "Failed to generate code patch." } }));
    }
  };

  const handleGenerateABTests = async (rec) => {
    setAbTests(prev => ({ ...prev, [rec.id]: { loading: true, variations: null } }));
    const prompt = `You are an elite CRO copywriter. Based on this issue: "${rec.issue}" and recommendation: "${rec.recommendation}", generate 3 A/B test copy variations. Return ONLY a JSON array of 3 strings.`;
    
    try {
      const response = await fetch('/api/generateABTests', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const variations = await response.json();
      setAbTests(prev => ({ ...prev, [rec.id]: { loading: false, variations: variations } }));
    } catch (error) {
      setAbTests(prev => ({ ...prev, [rec.id]: { loading: false, variations: ["Failed to generate A/B tests."] } }));
    }
  };

  const handleDownload = () => {
    if (!report) return;
    let content = `# Intelligence Report for ${url}\nScore: ${report.overall_score}/100\n\n## Summary\n${report.summary}\n\n## What's Working\n${(report.strengths || []).map(s => `- ${s}`).join('\n')}\n\n## Quick Wins\n${(report.quick_wins || []).map(q => `- ${q}`).join('\n')}\n\n`;
    if (report.competitor_analysis?.comparisons?.length > 0) {
      content += `## Competitive Intelligence\n${report.competitor_analysis.overview}\n\n`;
      report.competitor_analysis.comparisons.forEach(c => { content += `### vs ${c.competitor}\n- **Difference**: ${c.difference}\n- **Our Advantage**: ${c.advantage}\n\n`; });
    }
    if (report.checklist_scores && Object.keys(report.checklist_scores).length > 0) {
      content += `## CRO Checklist Scores\n`;
      Object.entries(report.checklist_scores).forEach(([key, score]) => {
        const label = CHECKLIST_LABELS[key] || key.replace(/_/g, ' ');
        content += `- **${label}**: ${score}/100\n`;
      });
      content += '\n';
    }
    if (report.checklist_flags?.length > 0) {
      content += `## Critical Checklist Failures\n${report.checklist_flags.map(f => `- ${f}`).join('\n')}\n\n`;
    }
    content += `## Prioritized Strategy\n${(report.recommendations || []).map(r => `### [${(r.priority || 'Medium').toUpperCase()}] ${r.category || 'General'}\n- **Issue**: ${r.issue || 'N/A'}\n- **Recommendation**: ${r.recommendation || 'N/A'}\n- **Impact**: ${r.expected_impact || 'N/A'}\n- **Implementation**: ${r.implementation || 'N/A'}\n${r.checklist_ref ? `- **Checklist**: ${r.checklist_ref}\n` : ''}`).join('\n')}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `GrowAgent_${new URL(url).hostname}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const reportDashboardRef = useRef(null);

  const handleExportPDF = async () => {
    if (!reportDashboardRef.current || !report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ]);
      const element = reportDashboardRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#08090D',
        logging: false,
        windowWidth: 1200
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      let yOffset = 0;
      while (yOffset < scaledHeight) {
        if (yOffset > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yOffset, pdfWidth, scaledHeight);
        yOffset += pdfHeight;
      }

      pdf.save(`GrowAgent_${new URL(url).hostname}_CRO_Report.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      setAppError("PDF export failed. Please try the Print option instead.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPNG = async () => {
    if (!reportDashboardRef.current || !report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(reportDashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#08090D',
        logging: false,
        windowWidth: 1200
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `GrowAgent_${new URL(url).hostname}_CRO_Report.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      console.error("PNG export error:", err);
      setAppError("PNG export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = () => {
    if (!report) return;
    setShowExportMenu(false);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GrowAgent_${new URL(url).hostname}_CRO_Report.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleExportCSV = () => {
    if (!report) return;
    setShowExportMenu(false);
    const rows = [['ID', 'Priority', 'Category', 'Issue', 'Recommendation', 'Expected Impact', 'Implementation', 'Checklist Ref']];
    (report.recommendations || []).forEach(r => {
      rows.push([r.id, r.priority, r.category, `"${(r.issue || '').replace(/"/g, '""')}"`, `"${(r.recommendation || '').replace(/"/g, '""')}"`, `"${(r.expected_impact || '').replace(/"/g, '""')}"`, `"${(r.implementation || '').replace(/"/g, '""')}"`, `"${(r.checklist_ref || '').replace(/"/g, '""')}"`]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GrowAgent_${new URL(url).hostname}_Recommendations.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleReset = () => { setStatus("idle"); setAppError(null); setUrl(""); setAdditionalContext(""); setCompetitorsInput(""); setShowAdvanced(false); setReport(null); setCodePatches({}); setAbTests({}); setChatHistory([]); setShowExportMenu(false); };
  const filteredRecommendations = useMemo(() => report?.recommendations?.filter(r => activeTab === 'all' || r.category?.toLowerCase() === activeTab || r.priority?.toLowerCase() === activeTab) || [], [report?.recommendations, activeTab]);
  const [flippedCards, setFlippedCards] = useState({});
  const toggleFlip = (id) => setFlippedCards(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.flip-card')) {
        setFlippedCards({});
      }
      // Close export menu when clicking outside
      if (!e.target.closest('[data-export-menu]')) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);


  return (
    <div style={{ background: BRAND.bgBase, minHeight: "100vh", color: BRAND.textMain, fontFamily: "'Inter', sans-serif" }} className="relative overflow-hidden">
      {/* Google Fonts loaded via index.html with preconnect for performance */}

      {/* Dynamic Backgrounds & Custom CSS */}
      <style>{`
        @media print {
          /* ── GLOBAL PRINT RESET ── */
          .no-print { display: none !important; }
          body, html { 
            background: white !important; 
            color: #111 !important; 
            font-size: 11pt !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * { 
            box-shadow: none !important; 
            text-shadow: none !important;
            animation: none !important;
            transition: none !important;
          }
          .print-break { page-break-inside: avoid; break-inside: avoid; }
          
          /* ── LAYOUT OVERRIDES ── */
          main { padding: 0 !important; max-width: 100% !important; }
          .print-invert-bg { background: #f9f9f9 !important; border: 1px solid #ddd !important; }
          .print-invert-text { color: #111 !important; }

          /* ── HEADER: Show clean brand ── */
          .sticky { 
            position: relative !important; 
            background: white !important; 
            border-bottom: 3px solid #F25430 !important;
            padding: 12px 20px !important;
          }

          /* ── TOP WIDGETS: Fix score circle ── */
          svg circle { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }

          /* ── CHECKLIST SCORES PANEL: Print with colors ── */
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 12px !important;
          }
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] > div {
            background: #f9f9f9 !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] svg circle {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] span {
            color: #111 !important;
          }
          /* Checklist flags: preserve red styling */
          [class*="bg-[#F87171]/10"] {
            background: #fef2f2 !important;
            border: 1px solid #fca5a5 !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
          [class*="bg-[#F87171]/10"] * {
            color: #dc2626 !important;
          }
          
          /* ── FLIP CARDS: Flatten entirely for print ── */
          .flip-card {
            perspective: none !important;
            height: auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 16px !important;
          }
          .flip-card-inner {
            position: relative !important;
            transform: none !important;
            transform-style: flat !important;
          }
          .flip-card-front {
            position: relative !important;
            background: #f9f9f9 !important;
            border: 1px solid #ddd !important;
            border-radius: 12px !important;
            color: #111 !important;
            height: auto !important;
          }
          .flip-card-front * { color: #333 !important; }
          .flip-card-front [style*="color: rgb(255, 255, 255)"],
          .flip-card-front [style*="color: #fff"],
          .flip-card-front .text-white { color: #111 !important; }
          .flip-card-back {
            position: relative !important;
            transform: none !important;
            backface-visibility: visible !important;
            background: white !important;
            border: 1px solid #F25430 !important;
            border-radius: 12px !important;
            margin-top: 8px !important;
            height: auto !important;
            page-break-inside: avoid !important;
          }
          .flip-card-back * { color: #333 !important; }
          .flip-card-back .text-white { color: #111 !important; }
          .flip-card-back [style*="color: rgb(242"] { color: #F25430 !important; }

          /* ── GRID: Force 2-column for print ── */
          .grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 16px !important;
          }

          /* ── LIST VIEW: Clean spacing ── */
          .space-y-6 > * {
            background: #f9f9f9 !important;
            border: 1px solid #ddd !important;
            page-break-inside: avoid !important;
          }

          /* ── COLORS: Make priority badges readable ── */
          [class*="rounded-full"][class*="tracking-widest"] {
            border: 1px solid currentColor !important;
            background: transparent !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* ── IMPACT BARS: Force color print ── */
          [class*="rounded-sm"][class*="shadow"] {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* ── AMBIENT ELEMENTS: Hide ── */
          .animate-blob, .animate-ping, .animate-pulse,
          .bg-grid-pattern, .ai-engine-graphic,
          [class*="blur-"], [class*="opacity-5"],
          [class*="opacity-10"], [class*="pointer-events-none"][class*="absolute"] {
            display: none !important;
          }

          /* ── PAGE MARGINS ── */
          @page {
            size: A4;
            margin: 1.5cm 1.5cm 2cm 1.5cm;
          }
        }
        @keyframes shimmer { 0% { transform: translateX(-100%) skewX(-15deg); } 100% { transform: translateX(200%) skewX(-15deg); } }
        .animate-shimmer { animation: shimmer 2.5s infinite linear; }

        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 15s infinite alternate ease-in-out; }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }

        @keyframes glow-pulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }

        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient { animation: gradient-shift 8s ease infinite; background-size: 200% 200%; }

        @keyframes border-glow {
          0%, 100% { border-color: rgba(242, 84, 48, 0.2); }
          50% { border-color: rgba(242, 84, 48, 0.5); }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-blob, .animate-float, .animate-glow-pulse, .animate-gradient,
          .animate-shimmer, .animate-ping, .animate-pulse, .animate-spin,
          .story-progress-fill { animation: none !important; }
          * { transition-duration: 0.01ms !important; }
        }

        .bg-grid-pattern {
          background-image: linear-gradient(to right, rgba(242, 84, 48, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(242, 84, 48, 0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 10%, transparent 70%);
        }

        .bg-noise {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          z-index: 100;
          opacity: 0.015;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-repeat: repeat;
          background-size: 256px 256px;
        }

        html { scroll-behavior: smooth; }

        /* Fixed 3D Flip Card CSS */
        .flip-card { 
          perspective: 1500px; 
          height: 520px; 
          position: relative;
        }
        .flip-card-inner { 
          position: absolute;
          width: 100%;
          height: 100%;
          transition: transform 0.8s cubic-bezier(0.4, 0.2, 0.2, 1); 
          transform-style: preserve-3d; 
        }
        .flip-card.flipped .flip-card-inner { transform: rotateY(180deg); }
        .flip-card-front, .flip-card-back { 
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          backface-visibility: hidden; 
        }
        .flip-card.flipped .flip-card-front { pointer-events: none; }
        .flip-card.flipped .flip-card-back { pointer-events: auto; }
        .flip-card-back { 
          transform: rotateY(180deg); 
          display: flex;
          flex-direction: column;
          overflow-y: auto; 
        }

        .ai-engine-graphic {
          background: radial-gradient(circle at 50% 50%, rgba(242,84,48,0.3) 0%, rgba(26,29,36,0) 70%);
        }

        .glass-card {
          background: rgba(18, 21, 27, 0.7);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.04);
        }
        .glass-card:hover {
          border-color: rgba(242, 84, 48, 0.15);
          background: rgba(18, 21, 27, 0.85);
        }
        
        .story-progress-fill {
          animation: storyProgress 5s linear forwards;
        }
        @keyframes storyProgress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>

      {/* Subtle noise texture overlay */}
      <div className="bg-noise"></div>

      {/* Global Ambient Background Orbs — softer, more diffused */}
      <div className="absolute top-[-15%] left-[5%] w-[50rem] h-[50rem] bg-[#F25430] opacity-[0.06] blur-[200px] rounded-full animate-blob pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[5%] w-[45rem] h-[45rem] bg-[#D94A2A] opacity-[0.04] blur-[200px] rounded-full animate-blob pointer-events-none" style={{ animationDelay: '-5s' }}></div>
      <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[30rem] h-[30rem] bg-[#F25430] opacity-[0.03] blur-[180px] rounded-full pointer-events-none"></div>

      {/* HEADER */}
      <div className="px-6 sm:px-8 py-4 flex justify-between items-center sticky top-0 z-50 no-print" style={{ background: "rgba(8, 9, 13, 0.75)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3 cursor-pointer transition-all active:scale-95 group" onClick={handleReset}>
          <div className="relative" style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #FF6B42)`, color: "#fff", borderRadius: "12px", padding: "9px" }}>
            <div className="absolute inset-0 rounded-xl bg-white/0 group-hover:bg-white/10 transition-all duration-300"></div>
            <BrainCircuit size={22} strokeWidth={2.5} className="relative z-10" />
          </div>
          <span style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "22px", fontWeight: "900", letterSpacing: "-0.5px" }}>
            GROW<span className="bg-clip-text text-transparent bg-gradient-to-r from-[#F25430] to-[#FF8C42]">AGENT</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {learningCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#34D399]/8 border border-[#34D399]/15 text-[#34D399] text-xs font-semibold tracking-wide">
              <Brain size={13} /> <span className="hidden sm:inline">{learningCount} audit{learningCount !== 1 ? 's' : ''} learned</span><span className="sm:hidden">{learningCount}</span>
            </div>
          )}
          {status === "complete" && (
            <button onClick={handleReset} className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 active:scale-95 text-[#8B95A5] hover:text-white border border-transparent hover:border-[#F25430]/30 hover:bg-[#F25430]/5">
              <RefreshCw size={15} /> <span className="hidden sm:inline">New Scan</span>
            </button>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">

        {/* =========================================
            IDLE STATE: THE AI INPUT PORTAL
        ========================================= */}
        {status === "idle" && (
          <div className="flex flex-col items-center justify-center py-16 min-h-[75vh] animate-in fade-in zoom-in-95 duration-1000">
            <div className="absolute inset-0 bg-grid-pattern opacity-50 pointer-events-none z-[-1]"></div>

            {/* Hero graphic — refined floating orb */}
            <div className="mb-10 relative flex items-center justify-center w-36 h-36 animate-float">
              <div className="absolute inset-0 ai-engine-graphic rounded-full"></div>
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#F25430]/20 to-transparent border border-[#F25430]/20 flex items-center justify-center relative">
                <Settings2 size={28} color="rgba(255,255,255,0.8)" className="animate-[spin_12s_linear_infinite]" />
                <div className="absolute inset-0 rounded-full border border-[#F25430]/10 animate-ping"></div>
              </div>
              <div className="absolute w-28 h-28 rounded-full border border-[#F25430]/8"></div>
            </div>

            <div className="mb-5 flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: BRAND.primary, background: "rgba(242, 84, 48, 0.06)", border: "1px solid rgba(242, 84, 48, 0.12)", fontFamily: "'Montserrat', sans-serif" }}>
              <Sparkles size={14} /> Data-Driven Revenue Architecture
            </div>

            <h1 style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "clamp(44px, 7vw, 78px)", fontWeight: "900", lineHeight: "1.08", letterSpacing: "-2.5px" }} className="mb-6 text-center">
              Turn Traffic Into <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F25430] via-[#FF6B42] to-[#FF8C42] animate-gradient">Measurable Revenue.</span>
            </h1>

            <p className="mb-12 text-center max-w-[600px] mx-auto" style={{ color: BRAND.textMuted, fontSize: "17px", lineHeight: "1.7", fontWeight: "400" }}>
              Deploy our AI agent to scrape live code, cross-reference competitors, and generate a high-impact conversion strategy in seconds.
            </p>

            {appError && (
              <div role="alert" className="mb-8 w-full max-w-3xl bg-[#F87171]/10 border border-[#F87171]/30 p-4 rounded-xl flex items-center gap-3 text-[#F87171] font-medium animate-in fade-in slide-in-from-top-4 shadow-lg">
                <AlertCircle size={20} className="shrink-0" />
                {appError}
              </div>
            )}


            <form onSubmit={handleAnalyze} className="w-full max-w-3xl relative space-y-4">
              <div className="flex gap-3 items-center">
                <div className="relative flex-1 group rounded-2xl p-[1px] bg-gradient-to-r from-[#1E222A] via-[#F25430]/40 to-[#1E222A] bg-[length:200%_auto] hover:bg-[center_right_1rem] transition-all duration-700 shadow-[0_0_30px_rgba(242,84,48,0.08)] hover:shadow-[0_0_50px_rgba(242,84,48,0.18)]">
                  <div className="relative bg-[#08090D] rounded-[15px] flex items-center overflow-hidden h-14">
                    <div className="pl-5 pr-3 flex items-center pointer-events-none">
                      <Globe style={{ color: BRAND.primary }} size={22} className="opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <input
                      type="text"
                      required
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Enter primary domain (e.g., example.com)"
                      aria-label="Website URL to analyze"
                      style={{ background: "transparent", color: "#fff" }}
                      className="w-full h-full focus:outline-none text-lg font-medium placeholder:text-[#3A4050]"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="h-14 w-14 flex items-center justify-center rounded-xl bg-[#12151B] border border-[#1E222A] hover:border-[#F25430]/30 hover:bg-[#1A1E26] text-white transition-all active:scale-95 group shrink-0"
                  title="Advanced Intelligence Options"
                >
                  {showAdvanced ? <Minus size={20} className="text-[#8B95A5]" /> : <Plus size={20} className="text-[#F25430] group-hover:scale-110 transition-transform" />}
                </button>

                <button
                  type="submit"
                  className="h-14 px-7 rounded-xl font-extrabold transition-all flex items-center gap-2 active:scale-[0.97] text-[17px] shrink-0 text-white relative overflow-hidden group"
                  style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #D94A2A)`, boxShadow: "0 8px 24px rgba(242, 84, 48, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)" }}
                >
                  <span className="relative z-10 flex items-center gap-2">Analyze <ArrowRight size={20} strokeWidth={2.5} /></span>
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all duration-300"></div>
                </button>
              </div>

              {showAdvanced && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500 glass-card rounded-2xl p-7 shadow-2xl mt-4 relative overflow-hidden text-left">
                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                    <BrainCircuit size={150} />
                  </div>

                  <h3 className="text-white font-bold font-['Montserrat'] text-lg mb-6 flex items-center gap-2">
                    <Settings2 size={18} color={BRAND.primary} /> Advanced Intelligence Setup
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2.5">
                      <label className="text-[#8B95A5] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                        <Target size={14} /> Campaign Context
                      </label>
                      <textarea
                        value={additionalContext}
                        onChange={(e) => setAdditionalContext(e.target.value)}
                        placeholder="E.g., We want to increase B2B lead form submissions. Target audience is enterprise software buyers."
                        className="w-full bg-[#08090D] border border-[#1E222A] rounded-xl p-4 text-white text-[15px] focus:outline-none focus:border-[#F25430]/40 focus:ring-1 focus:ring-[#F25430]/20 transition-all resize-none h-32 placeholder:text-[#3A4050]"
                      />
                    </div>

                    <div className="space-y-2.5">
                      <label className="text-[#8B95A5] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                        <Swords size={14} /> Competitor Domains (Max 2)
                      </label>
                      <textarea
                        value={competitorsInput}
                        onChange={(e) => setCompetitorsInput(e.target.value)}
                        placeholder="E.g., competitor1.com&#10;competitor2.com"
                        className="w-full bg-[#08090D] border border-[#1E222A] rounded-xl p-4 text-white text-[15px] focus:outline-none focus:border-[#F25430]/40 focus:ring-1 focus:ring-[#F25430]/20 transition-all resize-none h-32 placeholder:text-[#3A4050]"
                      />
                    </div>

                    <div className="md:col-span-2 pt-5 border-t border-[#1E222A]">
                      <label className="text-[#8B95A5] text-xs font-semibold uppercase tracking-wider flex items-center gap-2 mb-3">
                        <Key size={14} /> Custom PageSpeed API Key <span className="text-[11px] font-normal text-[#5A6270] lowercase tracking-normal ml-2">(Bypass rate limits - stored locally)</span>
                      </label>
                      <input
                        type="password"
                        value={customPageSpeedKey}
                        onChange={(e) => setCustomPageSpeedKey(e.target.value)}
                        placeholder="PageSpeed API Key (Optional)"
                        className="w-full bg-[#08090D] border border-[#1E222A] rounded-xl px-4 py-3 text-white text-[15px] focus:outline-none focus:border-[#F25430]/40 focus:ring-1 focus:ring-[#F25430]/20 transition-all placeholder:text-[#3A4050]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        )}

        {/* =========================================
            ANALYZING STATE: THE LOADING DASHBOARD
        ========================================= */}
        {status === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-700">
            <div className="w-full max-w-2xl relative glass-card p-10 rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.6)] transition-all overflow-hidden">

              <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#F25430] to-transparent opacity-60"></div>

              <div className="flex justify-center mb-8 relative">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <Loader2 size={48} style={{ color: BRAND.primary }} className="animate-spin relative z-10" strokeWidth={1.5} />
                  <div className="absolute inset-[-12px] rounded-full border border-[#F25430]/10 animate-glow-pulse"></div>
                  <div className="absolute inset-[-24px] rounded-full border border-[#F25430]/5"></div>
                </div>
              </div>

              <h2 style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff" }} className="text-2xl font-black text-center mb-2">
                {STEP_HEADERS[Math.min(currentStep, STEP_HEADERS.length - 1)] || "Finalizing Architecture"}
              </h2>
              <div className="text-center h-5 mb-3 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#F25430]/80">
                {loadingPhrase}
              </div>
              <div className="text-center mb-10 text-xs text-[#5A6270] font-medium">
                {elapsedSeconds}s elapsed
                {elapsedSeconds > 30 && elapsedSeconds <= 60 && <span className="ml-2 text-[#8B95A5]">— Complex pages take longer...</span>}
                {elapsedSeconds > 60 && <span className="ml-2 text-[#FBBF24]">— Almost there...</span>}
              </div>

              <div className="w-full bg-[#08090D] rounded-full h-2 mb-10 overflow-hidden border border-[#1E222A] relative">
                <div className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden" style={{ width: `${Math.max(5, ((currentStep + 1) / (analysisSteps.length + 1)) * 100)}%`, background: `linear-gradient(90deg, #D94A2A, #F25430, #FF6B42)` }}>
                  <div className="absolute top-0 bottom-0 left-0 w-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                </div>
              </div>

              <div className="space-y-5 mb-10 max-w-lg mx-auto">
                {analysisSteps.map((step, idx) => {
                  const isActive = idx === currentStep;
                  const isPast = idx < currentStep;
                  return (
                    <div key={step.id} className={`flex items-center gap-4 transition-all duration-500 ${isActive ? 'opacity-100 translate-x-2' : isPast ? 'opacity-50' : 'opacity-15'}`}>
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 relative"
                        style={{
                          background: isActive ? 'rgba(242,84,48,0.1)' : isPast ? 'rgba(52,211,153,0.1)' : 'transparent',
                          color: isActive ? BRAND.primary : isPast ? BRAND.accentSuccess : '#5A6270',
                          border: `1px solid ${isActive ? 'rgba(242,84,48,0.3)' : 'transparent'}`,
                        }}
                      >
                        {isPast ? <CheckCircle2 size={20} className="animate-in zoom-in duration-300 text-[#34D399]" /> : step.icon}
                      </div>
                      <div>
                        <div style={{ color: isActive ? "#fff" : isPast ? '#8B95A5' : "#3A4050", fontSize: "15px", fontWeight: isActive ? "700" : "500" }}>
                          {step.label}
                        </div>
                        {isActive && step.detail && (
                          <div className="text-[11px] text-[#5A6270] mt-0.5 animate-in fade-in duration-300">{step.detail}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="p-5 bg-[#08090D] border border-[#1E222A] rounded-xl text-center relative overflow-hidden max-w-xl mx-auto">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#F25430]/60 to-[#F25430]/10 rounded-full"></div>
                <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-[#F25430]/60 uppercase tracking-[0.2em] mb-2">
                  <BrainCircuit size={13} /> Agency Intelligence
                </div>
                <div key={activeFactIndex} className="text-[14px] font-medium text-[#8B95A5] italic animate-in fade-in slide-in-from-right-4 duration-500 min-h-[48px] flex items-center justify-center px-3 leading-relaxed">
                  "{funFacts[activeFactIndex]}"
                </div>
              </div>

            </div>
          </div>
        )}

        {/* =========================================
            WRAPPED MODE: COUNTDOWN
        ========================================= */}
        {status === "wrapped_countdown" && (
          <div className="flex flex-col items-center justify-center min-h-[75vh] animate-in zoom-in duration-500">
            <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none z-[-1]"></div>
            <div className="flex items-center gap-3 mb-10 text-[#F25430] bg-[#F25430]/10 px-6 py-2 rounded-full border border-[#F25430]/30 animate-pulse">
              <BrainCircuit size={20} />
              <span className="font-bold tracking-widest uppercase text-sm">Intelligence Compiled</span>
            </div>
            <div className="text-[200px] font-black text-white font-['Montserrat'] leading-none drop-shadow-[0_0_60px_rgba(242,84,48,0.5)]">
              {countdown}
            </div>
          </div>
        )}

        {/* =========================================
            WRAPPED MODE: STORY PRESENTATION
        ========================================= */}
        {status === "wrapped_story" && report && (
          <div className="relative flex flex-col items-center justify-center min-h-[85vh] w-full max-w-5xl mx-auto bg-[#12151B]/40 backdrop-blur-md border border-[#1E222A] rounded-[3rem] shadow-2xl overflow-hidden cursor-pointer" onClick={advanceStory}>

            {/* Progress Bars */}
            <div className="absolute top-6 left-8 right-8 flex gap-3 z-50">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="h-1.5 flex-1 bg-[#08090D] rounded-full overflow-hidden shadow-inner border border-[#1E222A]">
                  <div className={`h-full bg-gradient-to-r from-[#D94A2A] to-[#F25430] ${storyStep > i ? 'w-full' : storyStep === i ? 'story-progress-fill' : 'w-0'}`} onAnimationEnd={() => { if (storyStep === i) advanceStory(); }}></div>
                </div>
              ))}
            </div>

            <button onClick={(e) => { e.stopPropagation(); setStatus("complete"); }} className="absolute top-12 right-8 text-[#8B95A5] hover:text-white z-50 font-black tracking-widest text-sm uppercase bg-[#08090D] px-4 py-2 rounded-lg border border-[#1E222A]">Skip to Dashboard <ChevronRight size={16} className="inline mb-0.5" /></button>

            {/* Slide Content */}
            <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in slide-in-from-right-12 duration-700" key={storyStep}>

              {storyStep === 0 && (
                <div className="flex flex-col items-center">
                  <h3 className="text-[#F25430] text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-3"><Activity size={24} /> The Verdict is In</h3>
                  <h2 className="text-white text-5xl md:text-7xl font-black font-['Montserrat'] mb-12">Your Growth Score</h2>
                  <div className="w-64 h-64 rounded-full border-[12px] border-[#F25430] flex items-center justify-center shadow-[0_0_80px_rgba(242,84,48,0.5)] bg-[#08090D]">
                    <span className="text-[100px] font-black text-white font-['Montserrat'] leading-none">{report.overall_score}</span>
                  </div>
                </div>
              )}

              {storyStep === 1 && (
                <div className="flex flex-col items-center max-w-3xl">
                  <h3 className="text-[#34D399] text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-3"><CheckCircle2 size={24} /> Solid Foundation</h3>
                  <h2 className="text-white text-4xl md:text-6xl font-black font-['Montserrat'] mb-12">What You're Doing Right</h2>
                  <div className="space-y-6 text-left w-full">
                    {(report.strengths || []).slice(0, 2).map((s, i) => (
                      <div key={i} className="bg-[#08090D] border border-[#1E222A] p-6 rounded-2xl flex gap-4 text-xl font-medium text-[#E5E7EB] shadow-xl">
                        <CheckCircle size={28} className="text-[#34D399] shrink-0" /> {s}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {storyStep === 2 && (
                <div className="flex flex-col items-center max-w-3xl">
                  <h3 className="text-[#FBBF24] text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-3"><Zap size={24} /> Low Hanging Fruit</h3>
                  <h2 className="text-white text-4xl md:text-6xl font-black font-['Montserrat'] mb-12 leading-tight">Instant Revenue Opportunities</h2>
                  <div className="bg-[#08090D] border-2 border-[#FBBF24]/30 p-8 rounded-3xl text-2xl font-medium text-[#E5E7EB] shadow-[0_0_40px_rgba(251,191,36,0.15)]">
                    "{(report.quick_wins || [])[0] || 'No quick wins identified.'}"
                  </div>
                </div>
              )}

              {storyStep === 3 && (
                <div className="flex flex-col items-center max-w-4xl">
                  <h3 className="text-[#F25430] text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-3"><AlertCircle size={24} /> Top Priority</h3>
                  <h2 className="text-white text-4xl md:text-6xl font-black font-['Montserrat'] mb-12">Your Biggest Bottleneck</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full text-left">
                    <div className="bg-[#08090D] p-8 rounded-3xl border border-[#1E222A]">
                      <div className="text-[#8B95A5] text-sm font-bold uppercase tracking-widest mb-4">The Issue</div>
                      <div className="text-xl text-white font-medium leading-relaxed">{(report.recommendations || [])[0]?.issue || 'N/A'}</div>
                    </div>
                    <div className="bg-[#F25430]/10 p-8 rounded-3xl border border-[#F25430]/30 shadow-[0_0_30px_rgba(242,84,48,0.2)]">
                      <div className="text-[#F25430] text-sm font-bold uppercase tracking-widest mb-4">The Fix</div>
                      <div className="text-xl text-white font-medium leading-relaxed">{(report.recommendations || [])[0]?.recommendation || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              )}

              {storyStep === 4 && (
                <div className="flex flex-col items-center">
                  <div className="w-32 h-32 rounded-full bg-[#F25430] flex items-center justify-center shadow-[0_0_80px_rgba(242,84,48,0.6)] mb-10">
                    <Target size={64} color="#fff" />
                  </div>
                  <h2 className="text-white text-5xl md:text-7xl font-black font-['Montserrat'] mb-8">Ready to Build?</h2>
                  <p className="text-2xl text-[#8B95A5] font-medium mb-12">Tap to access your full strategic dashboard.</p>
                  <div className="px-8 py-4 bg-white text-[#08090D] rounded-full font-black text-xl flex items-center gap-3 hover:scale-105 transition-transform">
                    Enter Dashboard <ArrowRight size={24} />
                  </div>
                </div>
              )}
            </div>

            {/* Progress indicator hint */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[#5A6270] font-bold text-sm tracking-widest uppercase flex items-center gap-2">
              Tap anywhere to continue <Play size={14} fill="currentColor" />
            </div>
          </div>
        )}

        {/* =========================================
            COMPLETE STATE: RESULTS DASHBOARD
        ========================================= */}
        {status === "complete" && report && (
          <div ref={reportDashboardRef} className={`transition-all duration-700 ${reportUpdatedFlash ? 'scale-[1.01] drop-shadow-[0_0_50px_rgba(242,84,48,0.25)]' : 'scale-100'}`}>

            {/* Action Bar & View Toggle */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 no-print glass-card p-4 rounded-2xl">
              <div className="text-[14px] font-medium text-[#8B95A5] flex items-center gap-3">
                <CheckCircle size={18} color={BRAND.accentSuccess} />
                Audit complete for <span className="text-white font-semibold">{new URL(url).hostname}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">

                <div className="flex bg-[#08090D] border border-[#1E222A] rounded-lg p-0.5">
                  <button onClick={() => setViewMode('grid')} className={`p-2 px-3.5 rounded-md transition-all flex items-center gap-1.5 text-[13px] font-semibold ${viewMode === 'grid' ? 'bg-[#1E222A] text-white' : 'text-[#5A6270] hover:text-[#8B95A5]'}`}>
                    <LayoutGrid size={14} /> Grid
                  </button>
                  <button onClick={() => setViewMode('list')} className={`p-2 px-3.5 rounded-md transition-all flex items-center gap-1.5 text-[13px] font-semibold ${viewMode === 'list' ? 'bg-[#1E222A] text-white' : 'text-[#5A6270] hover:text-[#8B95A5]'}`}>
                    <List size={14} /> List
                  </button>
                </div>

                <div className="h-7 w-px bg-[#1E222A] mx-1"></div>

                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 bg-transparent hover:bg-[#1A1E26] border border-[#1E222A] rounded-lg text-[13px] font-semibold transition-all active:scale-95 text-[#8B95A5] hover:text-white">
                  <Printer size={14} /> Print
                </button>
                <div className="relative" data-export-menu>
                  <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1.5 px-4 py-2 text-white rounded-lg text-[13px] font-semibold transition-all active:scale-95" style={{ background: `linear-gradient(135deg, ${BRAND.primary}, #D94A2A)`, boxShadow: '0 4px 12px rgba(242,84,48,0.3)' }}>
                    <Download size={14} /> Export ▾
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 glass-card">
                      <button onClick={handleExportPDF} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors">
                        <Download size={14} className="text-[#F25430]" /> PDF Report
                      </button>
                      <button onClick={handleExportPNG} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <Download size={14} className="text-[#34D399]" /> PNG Screenshot
                      </button>
                      <button onClick={handleDownload} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <Download size={14} className="text-[#FBBF24]" /> Markdown
                      </button>
                      <button onClick={handleExportCSV} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <Download size={14} className="text-[#8B95A5]" /> CSV (Recommendations)
                      </button>
                      <button onClick={handleExportJSON} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <Download size={14} className="text-[#5A6270]" /> JSON (Raw Data)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* TOP DATA WIDGETS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10 print-break">

              <div style={{ background: BRAND.bgSurface, border: `1px solid ${BRAND.bgSurfaceHighlight}` }} className="print-invert-bg p-8 rounded-[2rem] flex flex-col items-center justify-center text-center shadow-xl transition-all duration-500 hover:border-[#2A2F3A] group relative overflow-hidden">
                <div className="absolute -top-10 -right-10 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                  <BarChart size={150} />
                </div>
                <div style={{ color: BRAND.textMuted, fontSize: "14px", textTransform: "uppercase", letterSpacing: "2px", fontWeight: "800", fontFamily: "'Montserrat', sans-serif" }} className="mb-6 z-10">
                  Growth Score
                </div>
                <div className="relative flex items-center justify-center mb-6 z-10">
                  <svg width="160" height="160" viewBox="0 0 120 120" className="rotate-[-90deg]">
                    <defs>
                      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={report.overall_score > 80 ? BRAND.accentSuccess : report.overall_score > 50 ? BRAND.accentWarning : BRAND.primary} />
                        <stop offset="100%" stopColor={report.overall_score > 80 ? '#6EE7B7' : report.overall_score > 50 ? '#FDE68A' : '#FB923C'} />
                      </linearGradient>
                    </defs>
                    <circle cx="60" cy="60" r="54" fill="none" stroke={BRAND.bgSurfaceHighlight} strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="54" fill="none"
                      stroke="url(#scoreGradient)"
                      strokeWidth="10" strokeLinecap="round" strokeDasharray="339.29"
                      strokeDashoffset={339.29 - (339.29 * (report.overall_score || 0)) / 100}
                      className="transition-all duration-1500 ease-out group-hover:drop-shadow-[0_0_20px_rgba(242,84,48,0.6)]"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="print-invert-text" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "48px", fontWeight: "900", lineHeight: "1", letterSpacing: "-2px" }}>
                      {report.overall_score || 0}
                    </span>
                  </div>
                </div>
                <div style={{ color: report.overall_score > 80 ? BRAND.accentSuccess : report.overall_score > 50 ? BRAND.accentWarning : BRAND.primary, fontSize: "16px", fontWeight: "900", marginTop: "8px", textTransform: "uppercase", letterSpacing: "1px" }} className="z-10 bg-[#08090D] px-5 py-2 rounded-full border border-[#1E222A] shadow-inner">
                  {report.overall_score > 80 ? 'Highly Optimized' : report.overall_score > 50 ? 'Refinement Needed' : 'Critical Action Needed'}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6 flex flex-col">
                <div style={{ background: `linear-gradient(135deg, ${BRAND.bgSurface}, #101217)`, border: `1px solid ${BRAND.bgSurfaceHighlight}` }} className="print-invert-bg p-8 rounded-[2rem] shadow-xl transition-all duration-500 hover:border-[#2A2F3A] flex-1 flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-[#F25430] opacity-[0.03] blur-3xl rounded-full pointer-events-none group-hover:opacity-[0.06] transition-opacity duration-700"></div>
                  <h3 className="print-invert-text mb-4 flex items-center gap-3" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "24px", fontWeight: "800" }}>
                    <Activity size={28} color={BRAND.primary} /> Strategic Overview
                  </h3>
                  <p className="print-invert-text text-[17px] leading-relaxed font-medium" style={{ color: "#D1D5DB" }}>
                    {report.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div style={{ background: BRAND.bgSurface, border: `1px solid ${BRAND.bgSurfaceHighlight}`, borderTop: `4px solid ${BRAND.accentSuccess}` }} className="print-invert-bg p-6 rounded-3xl shadow-xl transition-all hover:border-[#2A2F3A]">
                    <div className="flex items-center gap-2 mb-5" style={{ color: BRAND.accentSuccess, fontSize: "15px", fontWeight: "900", textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif", letterSpacing: "1px" }}>
                      <CheckCircle2 size={20} /> What's Working
                    </div>
                    <ul className="space-y-4">
                      {(report.strengths || []).slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-3 print-invert-text" style={{ color: "#8B95A5", fontSize: "14px", lineHeight: "1.5", fontWeight: "600" }}>
                          <div className="mt-0.5 bg-[#34D399] text-[#08090D] rounded-full p-0.5 shrink-0"><CheckCircle size={12} strokeWidth={3} /></div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ background: BRAND.bgSurface, border: `1px solid ${BRAND.bgSurfaceHighlight}`, borderTop: `4px solid ${BRAND.primary}` }} className="print-invert-bg p-6 rounded-3xl shadow-xl transition-all hover:border-[#2A2F3A]">
                    <div className="flex items-center gap-2 mb-5" style={{ color: BRAND.primary, fontSize: "15px", fontWeight: "900", textTransform: "uppercase", fontFamily: "'Montserrat', sans-serif", letterSpacing: "1px" }}>
                      <Zap size={20} /> Quick Wins
                    </div>
                    <ul className="space-y-4">
                      {(report.quick_wins || []).slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-3 print-invert-text" style={{ color: "#8B95A5", fontSize: "14px", lineHeight: "1.5", fontWeight: "600" }}>
                          <div className="mt-0.5 bg-[#F25430] text-[#08090D] rounded-full p-0.5 shrink-0"><ArrowRight size={12} strokeWidth={4} /></div>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* COMPETITOR WIDGET (Conditional) */}
            {report.competitor_analysis && report.competitor_analysis.comparisons?.length > 0 && (
              <div className="mb-16 print-break animate-in slide-in-from-bottom-8 duration-700">
                <div className="print-invert-bg glass-card p-8 md:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute -right-20 -top-20 opacity-5 pointer-events-none">
                    <Swords size={300} />
                  </div>

                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <div className="p-3 bg-[#F25430] rounded-2xl shadow-[0_0_20px_rgba(242,84,48,0.5)]">
                      <Swords size={28} color="#fff" />
                    </div>
                    <h3 className="print-invert-text" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "28px", fontWeight: "900", letterSpacing: "-1px" }}>
                      Competitive Intelligence
                    </h3>
                  </div>

                  <p className="text-[#D1D5DB] text-[17px] leading-relaxed font-medium mb-8 max-w-4xl relative z-10">
                    {report.competitor_analysis.overview}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                    {report.competitor_analysis.comparisons.map((comp, i) => (
                      <div key={i} className="bg-[#12151B]/80 backdrop-blur-md border border-[#1E222A] p-6 rounded-2xl hover:border-[#F25430] transition-colors">
                        <div className="text-[#F25430] font-black text-lg font-['Montserrat'] mb-4 flex items-center gap-2 uppercase tracking-widest">
                          <Target size={18} /> vs. {comp.competitor}
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="text-[11px] text-[#8B95A5] font-bold uppercase tracking-widest mb-1">Market Gap</div>
                            <div className="text-white text-[15px] font-medium leading-relaxed bg-[#08090D] p-4 rounded-xl border border-[#1E222A]">{comp.difference}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#34D399] font-bold uppercase tracking-widest mb-1">Our Strategic Advantage</div>
                            <div className="text-[#34D399] text-[15px] font-medium leading-relaxed bg-[#34D399]/10 p-4 rounded-xl border border-[#34D399]/20 flex gap-3">
                              <Award size={20} className="shrink-0 mt-0.5" />
                              {comp.advantage}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CRO CHECKLIST SCORES */}
            {report.checklist_scores && Object.keys(report.checklist_scores).length > 0 && (
              <div className="mb-10 print-break animate-in slide-in-from-bottom-8 duration-700">
                <div className="print-invert-bg glass-card p-8 md:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute -right-16 -top-16 opacity-5 pointer-events-none">
                    <ClipboardCheck size={250} />
                  </div>

                  <div className="flex items-center gap-4 mb-3 relative z-10">
                    <div className="p-3 bg-[#F25430] rounded-2xl shadow-[0_0_20px_rgba(242,84,48,0.5)]">
                      <ClipboardCheck size={28} color="#fff" />
                    </div>
                    <h3 className="print-invert-text" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "28px", fontWeight: "900", letterSpacing: "-1px" }}>
                      CRO Checklist Audit
                    </h3>
                  </div>

                  <p className="text-[#8B95A5] text-sm font-medium mb-8 relative z-10">
                    Scored against the GrowMe Basic Website Standards checklist ({Object.keys(report.checklist_scores).length} categories)
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 relative z-10 mb-8">
                    {Object.entries(report.checklist_scores).map(([key, score]) => {
                      const label = CHECKLIST_LABELS[key] || key.replace(/_/g, ' ');
                      const color = score >= 80 ? '#34D399' : score >= 50 ? '#FBBF24' : '#F87171';
                      return (
                        <div key={key} className="bg-[#08090D] border border-[#1E222A] rounded-xl p-3 text-center hover:border-[#F25430]/50 transition-colors">
                          <div className="relative mx-auto w-14 h-14 mb-2">
                            <svg width="56" height="56" viewBox="0 0 56 56" className="rotate-[-90deg]">
                              <circle cx="28" cy="28" r="24" fill="none" stroke="#1E222A" strokeWidth="4" />
                              <circle cx="28" cy="28" r="24" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
                                strokeDasharray="150.80" strokeDashoffset={150.80 - (150.80 * score) / 100}
                                className="transition-all duration-1000"
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-white font-black text-xs font-['Montserrat']">{score}</span>
                            </div>
                          </div>
                          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>{label}</div>
                        </div>
                      );
                    })}
                  </div>

                  {report.checklist_flags?.length > 0 && (
                    <div className="relative z-10">
                      <div className="text-[11px] text-[#F87171] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                        <AlertCircle size={14} /> Critical Checklist Failures
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {report.checklist_flags.map((flag, i) => (
                          <div key={i} className="bg-[#F87171]/10 border border-[#F87171]/20 rounded-xl px-4 py-3 text-[#F87171] text-[13px] font-medium flex items-start gap-2">
                            <XCircle size={14} className="shrink-0 mt-0.5" /> {flag}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RECOMMENDATIONS SECTION */}
            <div className="mt-16">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
                <h3 className="print-invert-text flex items-center gap-3" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "32px", fontWeight: "900", letterSpacing: "-1px" }}>
                  <Crosshair size={32} color={BRAND.primary} /> Actionable Growth Strategy
                </h3>

                {/* Filter Tabs */}
                <div style={{ background: BRAND.bgSurface, borderRadius: "12px", border: `1px solid ${BRAND.bgSurfaceHighlight}`, padding: "6px" }} className="flex gap-2 overflow-x-auto w-full sm:w-auto no-print shadow-inner">
                  {['all', 'high', 'medium', 'low'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{ background: activeTab === tab ? BRAND.bgSurfaceHighlight : "transparent", color: activeTab === tab ? "#fff" : BRAND.textMuted }}
                      className="px-6 py-2.5 rounded-lg text-sm font-bold capitalize transition-all active:scale-95 shadow-sm hover:text-white"
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* =======================================================
                  GRID VIEW (MASONRY FLIP CARDS)
              ======================================================= */}
              {viewMode === 'grid' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredRecommendations?.map((rec, idx) => (
                    <div key={rec.id} className={`flip-card animate-in fade-in zoom-in-95 fill-mode-both ${flippedCards[rec.id] ? 'flipped' : ''}`} style={{ animationDelay: `${idx * 100}ms` }}>
                      <div className="flip-card-inner">

                        {/* FRONT OF CARD */}
                        <div onClick={() => toggleFlip(rec.id)} className="flip-card-front glass-card rounded-3xl p-8 flex flex-col justify-between shadow-2xl cursor-pointer hover:border-[#F25430] transition-colors relative overflow-hidden group">

                          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#F25430]/10 to-transparent rounded-bl-full pointer-events-none group-hover:from-[#F25430]/20 transition-all duration-500"></div>

                          <div className="flex justify-between items-start mb-6 z-10">
                            <div style={{ background: rec.priority?.toLowerCase() === 'high' ? `${BRAND.primary}15` : rec.priority?.toLowerCase() === 'medium' ? `${BRAND.accentWarning}15` : `${BRAND.accentSuccess}15`, color: rec.priority?.toLowerCase() === 'high' ? BRAND.primary : rec.priority?.toLowerCase() === 'medium' ? BRAND.accentWarning : BRAND.accentSuccess }} className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                              {getIconForCategory(rec.category, 24)}
                            </div>
                            <span style={{ color: rec.priority?.toLowerCase() === 'high' ? BRAND.primary : rec.priority?.toLowerCase() === 'medium' ? BRAND.accentWarning : BRAND.accentSuccess, border: `1px solid ${rec.priority?.toLowerCase() === 'high' ? BRAND.primary : rec.priority?.toLowerCase() === 'medium' ? BRAND.accentWarning : BRAND.accentSuccess}40` }} className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-[#08090D]">
                              {rec.priority} Priority
                            </span>
                          </div>

                          <div className="z-10 flex-1">
                            <div className="text-white font-black text-2xl mb-4 font-['Montserrat'] capitalize tracking-tight leading-tight">{rec.category.replace('-', ' ')} Optimization</div>
                            <p className="text-[#8B95A5] text-[15px] font-medium leading-relaxed line-clamp-4">{rec.issue}</p>
                          </div>

                          <div className="mt-6 pt-6 border-t border-[#1E222A] z-10 flex items-center justify-between">
                            <div>
                              <div className="text-[11px] text-[#5A6270] font-bold uppercase tracking-widest mb-2">Projected Impact</div>
                              <div className="flex gap-1.5">
                                <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'low' || rec.priority?.toLowerCase() === 'medium' || rec.priority?.toLowerCase() === 'high' ? 'bg-[#34D399] shadow-[0_0_10px_rgba(74,222,128,0.4)]' : 'bg-[#1E222A]'}`}></div>
                                <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'medium' || rec.priority?.toLowerCase() === 'high' ? 'bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.4)]' : 'bg-[#1E222A]'}`}></div>
                                <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'high' ? 'bg-[#F25430] shadow-[0_0_10px_rgba(242,84,48,0.4)]' : 'bg-[#1E222A]'}`}></div>
                              </div>
                            </div>
                            <div className="w-10 h-10 rounded-full bg-[#1E222A] flex items-center justify-center text-white group-hover:bg-[#F25430] transition-colors"><ChevronRight size={18} /></div>
                          </div>

                          <div className="absolute -bottom-6 -right-4 text-[140px] font-black text-[#ffffff03] pointer-events-none font-['Montserrat'] leading-none">
                            0{idx + 1}
                          </div>
                        </div>

                        {/* BACK OF CARD */}
                        <div onClick={(e) => e.stopPropagation()} className="flip-card-back bg-[#101217] border-2 border-[#F25430] rounded-3xl p-8 shadow-[0_0_40px_rgba(242,84,48,0.3)] custom-scrollbar">
                          <div className="text-[#F25430] font-black text-lg mb-4 font-['Montserrat'] uppercase tracking-widest flex items-center gap-2 flex-shrink-0"><Sparkles size={20} /> Solution</div>
                          <p className="text-white text-[15px] font-medium leading-relaxed mb-6 flex-shrink-0">{rec.recommendation}</p>

                          <div className="text-[#8B95A5] text-[11px] font-bold uppercase tracking-widest mb-2 flex-shrink-0">Execution</div>
                          <p className="text-[#D1D5DB] text-[13px] leading-relaxed bg-[#12151B] p-4 rounded-xl border border-[#1E222A] mb-4 shrink-0">{rec.implementation}</p>

                          {rec.checklist_ref && (
                            <div className="flex items-start gap-2 mb-6 shrink-0">
                              <ClipboardCheck size={14} className="text-[#FBBF24] shrink-0 mt-0.5" />
                              <span className="text-[#FBBF24] text-[11px] font-bold uppercase tracking-wider">{rec.checklist_ref}</span>
                            </div>
                          )}

                          <div className="mt-auto shrink-0 pb-2 space-y-3">
                            <div className="flex gap-3">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleGenerateCodePatch(rec); }}
                                disabled={codePatches[rec.id]?.loading}
                                className="flex-1 py-3 rounded-xl font-bold bg-[#F25430] hover:bg-[#D94A2A] text-white transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 active:scale-95 shadow-lg"
                              >
                                {codePatches[rec.id]?.loading ? <Loader2 size={16} className="animate-spin" /> : <Code size={16} strokeWidth={3} />}
                                {codePatches[rec.id]?.loading ? 'Building...' : <span className="whitespace-nowrap">Code ✨</span>}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleGenerateABTests(rec); }}
                                disabled={abTests[rec.id]?.loading}
                                className="flex-1 py-3 rounded-xl font-bold bg-[#1E222A] hover:bg-[#3A4050] text-white transition-all flex items-center justify-center gap-2 text-[13px] disabled:opacity-50 active:scale-95 shadow-lg border border-[#3A4050]"
                              >
                                {abTests[rec.id]?.loading ? <Loader2 size={16} className="animate-spin" /> : <Type size={16} strokeWidth={3} />}
                                {abTests[rec.id]?.loading ? 'Drafting...' : <span className="whitespace-nowrap">A/B Copy ✨</span>}
                              </button>
                            </div>

                            {codePatches[rec.id]?.code && (
                              <div className="p-4 rounded-xl border border-[#1E222A] bg-[#08090D] relative max-h-[160px] overflow-y-auto custom-scrollbar">
                                <button
                                  onClick={() => copyToClipboard(codePatches[rec.id].code)}
                                  className="absolute top-2 right-2 p-1.5 bg-[#1E222A] rounded hover:bg-[#F25430] text-white transition-colors"
                                  title="Copy Code"
                                  aria-label="Copy code to clipboard"
                                ><Code size={14} /></button>
                                <pre className="text-[#34D399] text-[11px] font-mono whitespace-pre-wrap">{codePatches[rec.id].code}</pre>
                              </div>
                            )}

                            {abTests[rec.id]?.variations && (
                              <div className="p-4 rounded-xl border border-[#1E222A] bg-[#08090D] relative max-h-[160px] overflow-y-auto custom-scrollbar space-y-2">
                                <div className="text-[10px] text-[#8B95A5] font-bold uppercase tracking-widest mb-2">Generated Variations</div>
                                {abTests[rec.id].variations.map((v, i) => (
                                  <div key={i} className="text-[#E5E7EB] text-[12px] bg-[#12151B] p-3 rounded-lg border border-[#1E222A] flex justify-between items-start gap-3">
                                    <span className="leading-relaxed">{v}</span>
                                    <button onClick={() => copyToClipboard(v)} className="p-1 hover:text-[#F25430] transition-colors shrink-0 mt-0.5" title="Copy Text" aria-label="Copy variation text"><Type size={14} /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* =======================================================
                  LIST VIEW (DETAILED CLASSIC)
              ======================================================= */}
              {viewMode === 'list' && (
                <div className="space-y-6">
                  {filteredRecommendations?.map((rec, idx) => (
                    <div
                      key={rec.id}
                      style={{ background: BRAND.bgSurface, border: `1px solid ${BRAND.bgSurfaceHighlight}`, animationDelay: `${idx * 100}ms` }}
                      className="print-invert-bg p-8 md:p-10 rounded-[2rem] transition-all hover:border-[#3A4050] shadow-lg hover:shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both print-break"
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-10">
                        {/* Meta */}
                        <div className="flex gap-6 md:w-1/4 shrink-0">
                          <div
                            style={{ background: rec.priority?.toLowerCase() === 'high' ? `${BRAND.primary}15` : rec.priority?.toLowerCase() === 'medium' ? `${BRAND.accentWarning}15` : `${BRAND.accentSuccess}15`, color: rec.priority?.toLowerCase() === 'high' ? BRAND.primary : rec.priority?.toLowerCase() === 'medium' ? BRAND.accentWarning : BRAND.accentSuccess }}
                            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                          >
                            {getIconForCategory(rec.category, 28)}
                          </div>
                          <div>
                            <div className="print-invert-text" style={{ color: "#fff", fontFamily: "'Montserrat', sans-serif", fontSize: "20px", fontWeight: "900", textTransform: "capitalize", letterSpacing: "-0.5px" }}>
                              {rec.category?.replace('-', ' ') || 'Optimization'}
                            </div>
                            <div className="flex items-center mt-3">
                              <span style={{ color: rec.priority?.toLowerCase() === 'high' ? BRAND.primary : rec.priority?.toLowerCase() === 'medium' ? BRAND.accentWarning : BRAND.accentSuccess, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)" }} className="px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest">
                                {rec.priority || 'Medium'} Priority
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Issue & Rec */}
                        <div className="md:w-1/2 space-y-6">
                          <div>
                            <div style={{ color: BRAND.textMuted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontWeight: "800" }}>Observed Issue</div>
                            <p className="print-invert-text" style={{ color: "#E5E7EB", fontSize: "16px", lineHeight: "1.7", fontWeight: "500" }}>{rec.issue}</p>
                          </div>
                          <div style={{ background: "#101217", borderRadius: "20px", borderLeft: `4px solid ${BRAND.primary}` }} className="print-invert-bg p-6 shadow-inner">
                            <div style={{ color: BRAND.primary, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontWeight: "900" }}>Recommendation</div>
                            <p className="print-invert-text" style={{ color: "#fff", fontSize: "16px", lineHeight: "1.7", fontWeight: "600" }}>{rec.recommendation}</p>
                          </div>
                        </div>

                        {/* Impact & Exec */}
                        <div className="md:w-1/4 space-y-6 pt-6 md:pt-0 border-t border-[#1E222A] md:border-none flex flex-col justify-between">
                          <div>
                            <div style={{ color: BRAND.textMuted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontWeight: "800" }}>Expected Impact</div>
                            <div className="flex items-center gap-2 mb-3" style={{ color: BRAND.accentSuccess, fontSize: "16px", fontWeight: "800", fontFamily: "'Montserrat', sans-serif" }}>
                              <TrendingUp size={20} strokeWidth={3} /> {rec.expected_impact}
                            </div>
                            <div className="flex gap-1.5">
                              <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'low' || rec.priority?.toLowerCase() === 'medium' || rec.priority?.toLowerCase() === 'high' ? 'bg-[#34D399] shadow-[0_0_10px_rgba(74,222,128,0.4)]' : 'bg-[#1E222A]'}`}></div>
                              <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'medium' || rec.priority?.toLowerCase() === 'high' ? 'bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.4)]' : 'bg-[#1E222A]'}`}></div>
                              <div className={`h-2.5 w-6 rounded-sm ${rec.priority?.toLowerCase() === 'high' ? 'bg-[#F25430] shadow-[0_0_10px_rgba(242,84,48,0.4)]' : 'bg-[#1E222A]'}`}></div>
                            </div>
                          </div>
                          <div>
                            <div style={{ color: BRAND.textMuted, fontSize: "13px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", fontWeight: "800" }}>Implementation</div>
                            <p className="print-invert-text" style={{ color: "#8B95A5", fontSize: "14px", lineHeight: "1.6", fontWeight: "500" }}>{rec.implementation}</p>
                          </div>

                          {rec.checklist_ref && (
                            <div className="flex items-start gap-2 mt-2">
                              <ClipboardCheck size={14} className="text-[#FBBF24] shrink-0 mt-0.5" />
                              <span className="text-[#FBBF24] text-[11px] font-bold uppercase tracking-wider">{rec.checklist_ref}</span>
                            </div>
                          )}

                          <div className="flex gap-3 mt-4 no-print">
                            <button
                              onClick={() => handleGenerateCodePatch(rec)}
                              disabled={codePatches[rec.id]?.loading}
                              style={{ background: `${BRAND.primary}15`, color: BRAND.primary, border: `1px solid ${BRAND.primary}30` }}
                              className="w-full px-4 py-3 rounded-xl font-bold hover:bg-[#F25430] hover:text-white transition-all flex items-center justify-center gap-2 text-[14px] disabled:opacity-50 active:scale-95 shadow-md"
                            >
                              {codePatches[rec.id]?.loading ? <Loader2 size={18} className="animate-spin" /> : <Code size={18} strokeWidth={3} />}
                              {codePatches[rec.id]?.loading ? 'Building...' : <span className="whitespace-nowrap">Code ✨</span>}
                            </button>
                            <button
                              onClick={() => handleGenerateABTests(rec)}
                              disabled={abTests[rec.id]?.loading}
                              className="w-full px-4 py-3 rounded-xl font-bold bg-[#1E222A] hover:bg-[#3A4050] text-white border border-[#3A4050] transition-all flex items-center justify-center gap-2 text-[14px] disabled:opacity-50 active:scale-95 shadow-md"
                            >
                              {abTests[rec.id]?.loading ? <Loader2 size={18} className="animate-spin" /> : <Type size={18} strokeWidth={3} />}
                              {abTests[rec.id]?.loading ? 'Drafting...' : <span className="whitespace-nowrap">A/B Copy ✨</span>}
                            </button>
                          </div>

                        </div>
                      </div>

                      {/* Code Patch Render (List View) */}
                      {codePatches[rec.id] && codePatches[rec.id].code && (
                        <div className="mt-8 p-6 rounded-2xl border border-[#1E222A] bg-[#08090D] animate-in slide-in-from-top-4 duration-500 no-print shadow-inner">
                          <div className="flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2 text-[#8B95A5] text-sm font-black uppercase tracking-widest">
                              <Code size={18} /> Developer Handoff Package
                            </div>
                            <button
                              onClick={() => copyToClipboard(codePatches[rec.id].code)}
                              className="text-xs px-4 py-2 bg-[#12151B] text-[#8B95A5] hover:text-white rounded-lg font-bold transition-colors border border-[#1E222A] hover:border-[#F25430]"
                              aria-label="Copy code to clipboard"
                            >
                              Copy Code
                            </button>
                          </div>
                          <pre className="text-[#34D399] text-[13px] overflow-x-auto p-6 rounded-xl bg-[#14161C] border border-[#1E222A] whitespace-pre-wrap font-mono leading-relaxed shadow-inner">
                            {codePatches[rec.id].code}
                          </pre>
                        </div>
                      )}

                      {/* A/B Test Render (List View) */}
                      {abTests[rec.id]?.variations && (
                        <div className="mt-4 p-6 rounded-2xl border border-[#1E222A] bg-[#08090D] animate-in slide-in-from-top-4 duration-500 no-print shadow-inner">
                          <div className="flex items-center gap-2 text-[#8B95A5] text-sm font-black uppercase tracking-widest mb-5">
                            <Type size={18} /> Generated A/B Variations
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {abTests[rec.id].variations.map((v, i) => (
                              <div key={i} className="text-[#E5E7EB] text-[14px] bg-[#12151B] p-5 rounded-xl border border-[#1E222A] flex flex-col justify-between gap-4">
                                <span className="leading-relaxed font-medium">"{v}"</span>
                                <button onClick={() => copyToClipboard(v)} className="text-[11px] self-start font-bold uppercase tracking-wider text-[#8B95A5] hover:text-[#F25430] transition-colors flex items-center gap-1" aria-label="Copy variation text">
                                  <Type size={12} /> Copy Text
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}

              {filteredRecommendations?.length === 0 && (
                <div className="text-center py-20 glass-card rounded-3xl shadow-inner" style={{ color: BRAND.textMuted, fontSize: "18px", fontWeight: "600" }}>
                  <Filter size={48} className="mx-auto mb-4 opacity-20" />
                  No strategies found matching this filter criteria.
                </div>
              )}
            </div>

            {/* =========================================
                AI STRATEGY CHAT TERMINAL
            ========================================= */}
            <div className="mt-24 animate-in fade-in slide-in-from-bottom-8 duration-1000 no-print relative">
              <div className="absolute -left-10 top-0 w-64 h-64 bg-[#F25430] opacity-5 blur-[100px] rounded-full pointer-events-none"></div>

              <div className="flex items-center gap-5 mb-8 relative z-10">
                <div style={{ background: BRAND.primary, color: "#fff", padding: "16px", borderRadius: "20px" }} className="shadow-[0_0_30px_rgba(242,84,48,0.5)]">
                  <Bot size={32} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "32px", fontWeight: "900", letterSpacing: "-1px" }}>
                    AI Strategy Terminal
                  </h3>
                  <p style={{ color: BRAND.textMuted, fontSize: "16px", fontWeight: "500" }}>
                    Directly prompt the agent to pivot strategy, refine copy, or update the live dashboard above.
                  </p>
                </div>
              </div>

              <div style={{ borderRadius: "32px", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.5)" }} className="glass-card flex flex-col h-[600px] relative z-10">
                <div ref={chatContainerRef} role="log" aria-live="polite" aria-label="Chat conversation" className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth bg-[#08090D]/60 custom-scrollbar">
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`flex gap-5 ${msg.role === 'user' ? 'flex-row-reverse' : 'animate-in fade-in slide-in-from-left-4 duration-500'}`}>
                      <div style={{ background: msg.role === 'user' ? BRAND.bgSurfaceHighlight : BRAND.primary, color: "#fff" }} className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-lg">
                        {msg.role === 'user' ? <User size={24} /> : <Bot size={24} />}
                      </div>
                      <div style={{ background: msg.role === 'user' ? "rgba(30,34,42,0.7)" : "rgba(18,21,27,0.6)", border: msg.role === 'user' ? "1px solid rgba(42,47,58,0.5)" : `1px solid ${BRAND.bgSurfaceHighlight}`, color: "#E5E7EB", maxWidth: "80%", backdropFilter: "blur(12px)" }} className={`p-6 text-[16px] leading-relaxed font-medium whitespace-pre-wrap ${msg.role === 'user' ? 'rounded-3xl rounded-tr-md shadow-md' : 'rounded-3xl rounded-tl-md shadow-xl'}`}>
                        {msg.parts[0].text}
                        {msg._error && (
                          <button onClick={handleChatRetry} className="mt-3 flex items-center gap-2 px-4 py-2 bg-[#F25430] hover:bg-[#D94A2A] text-white text-sm font-bold rounded-lg transition-all active:scale-95">
                            <RefreshCw size={14} /> Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex gap-5 animate-in fade-in">
                      <div style={{ background: BRAND.primary, color: "#fff" }} className="w-14 h-14 rounded-[1.25rem] flex items-center justify-center shrink-0 shadow-lg relative overflow-hidden">
                        <Loader2 size={24} className="animate-spin relative z-10" />
                        <div className="absolute inset-0 blur-md bg-white opacity-20 animate-pulse"></div>
                      </div>
                      <div style={{ color: BRAND.textMuted }} className="flex items-center p-5 font-black tracking-widest text-sm uppercase bg-[#12151B] rounded-3xl rounded-tl-md border border-[#1E222A]">
                        Consulting intelligence network...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleChatSubmit} style={{ borderTop: `1px solid rgba(30,34,42,0.6)`, background: "rgba(18,21,27,0.8)", backdropFilter: "blur(16px)" }} className="p-6 flex gap-4 items-end">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(e); } }}
                    placeholder="Provide feedback (e.g. 'Actually, we don't sell to B2C, remove those suggestions')..."
                    aria-label="Chat message input"
                    style={{ background: "#08090D", border: `1px solid ${BRAND.bgSurfaceHighlight}`, color: "#fff", minHeight: "60px", maxHeight: "200px" }}
                    className="w-full px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#F25430] transition-all placeholder:text-[#3A4050] resize-none overflow-y-auto text-base font-medium shadow-inner custom-scrollbar"
                    rows="1"
                  />
                  <button
                    type="submit"
                    disabled={isChatLoading || !chatInput.trim()}
                    style={{ background: isChatLoading || !chatInput.trim() ? BRAND.bgSurfaceHighlight : BRAND.primary, color: isChatLoading || !chatInput.trim() ? "#5A6270" : "#fff" }}
                    className="p-5 rounded-2xl font-bold hover:bg-[#D94A2A] transition-all shrink-0 disabled:cursor-not-allowed shadow-lg active:scale-95 mb-0.5"
                    aria-label="Send chat message"
                  >
                    <Send size={24} />
                  </button>
                </form>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Custom Scrollbar Styles for the app */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(30,34,42,0.6); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(58,64,80,0.8); }
      `}</style>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
