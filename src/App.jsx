
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
// html2canvas, jsPDF, xlsx, docx are lazy-loaded in export handlers to reduce initial bundle
import {
  Globe, Search, Activity, CheckCircle2, CheckCircle, AlertCircle, ArrowRight,
  Zap, TrendingUp, MonitorSmartphone, Eye, Type, MousePointerClick, ShieldCheck,
  LayoutTemplate, ChevronRight, RefreshCw, Code, Loader2, Sparkles, MessageSquare,
  Send, User, Bot, BarChart3, Printer, Download, Lightbulb, LayoutGrid, List,
  BarChart, Plus, Minus, Swords, Target, BrainCircuit, Settings2, Crosshair,
  Award, Filter, Play, XCircle, Terminal, Key, BookOpen, Brain, ClipboardCheck,
  FileText, FileSpreadsheet, FileType2
} from "lucide-react";

// ─── Modular imports (extracted from monolith for maintainability) ───
import { BRAND } from "./constants/brand";
import { CHECKLIST_LABELS } from "./constants/checklistLabels";
import { DEFAULT_FUN_FACTS, STEP_HEADERS, LOADING_PHRASES } from "./constants/loadingData";
import { safeParseJSON } from "./utils/json";
import { getSafeLocalStorage, setSafeLocalStorage } from "./utils/localStorage";
import { copyToClipboard } from "./utils/clipboard";
import {
  getLocalLearnings, saveLocalLearning, addLocalInsight,
  saveServerLearning, saveServerInsight, fetchServerLearnings,
  mergeLearnings, trackChatModification
} from "./utils/learning";
import { exportTXT } from "./utils/export/txt";
import { exportJPEG } from "./utils/export/jpeg";
import { exportXLSX } from "./utils/export/xlsx";
import { exportDOCX } from "./utils/export/docx";

// Report schema is defined server-side in api/analyze.js.
// See CLAUDE.md "Report Schema" section for the full structure.

// Learning system, constants, and utilities are imported from src/constants/ and src/utils/

// Icon helper for recommendation categories
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
  const [targetKeywords, setTargetKeywords] = useState("");
  const [additionalPagesInput, setAdditionalPagesInput] = useState("");
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
    const additionalPagesArr = additionalPagesInput.split(/[,\n]+/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 4).map(p => p.startsWith('http') ? p : `https://${p}`);
    const hasPages = additionalPagesArr.length > 0;
    const dynamicSteps = [
      { id: 'scrape', label: `Scraping ${hostname}${hasPages ? ` + ${additionalPagesArr.length} page${additionalPagesArr.length > 1 ? 's' : ''}` : ''}${hasCompetitors ? ` + ${competitorCount} competitor${competitorCount > 1 ? 's' : ''}` : ''}...`, icon: <Code size={18} />, detail: 'Fetching HTML, removing scripts & styles' },
      { id: 'metrics', label: 'Running PageSpeed & capturing screenshot...', icon: <Activity size={18} />, detail: 'Google Lighthouse performance audit' },
      { id: 'ai_analysis', label: `AI scoring against 10 checklist categories${targetKeywords.trim() ? ' + keyword alignment' : ''}...`, icon: <BrainCircuit size={18} />, detail: `${3 + (hasCompetitors ? 1 : 0) + (hasPages ? 1 : 0)} parallel AI calls${hasPages ? ' (including per-page scoring)' : ''}` },
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
        pastLearnings: mergeLearnings(getLocalLearnings(), serverLearnings),
        targetKeywords: targetKeywords.trim() || undefined,
        additionalPages: additionalPagesArr.length > 0 ? additionalPagesArr : undefined
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
      if (!response.ok) throw new Error(`Code generation failed (${response.status})`);
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
      if (!response.ok) throw new Error(`A/B test generation failed (${response.status})`);
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
      report.competitor_analysis.comparisons.forEach(c => { content += `### vs ${c.competitor}\n- **Difference**: ${c.difference}\n- **Our Advantage**: ${c.advantage}\n${c.steal_worthy?.length > 0 ? `- **Steal-Worthy Ideas**:\n${c.steal_worthy.map(s => `  - ${s}`).join('\n')}\n` : ''}\n`; });
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
    if (report.page_scores?.length > 0) {
      content += `## Site-Wide Page Scores\n`;
      report.page_scores.forEach(p => {
        content += `- **${p.page_type || 'Page'}** (${p.url}): ${p.overall_score}/100${p.top_issues?.length > 0 ? `\n  - Issues: ${p.top_issues.join('; ')}` : ''}\n`;
      });
      content += '\n';
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
    if (!report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const W = 210, H = 297;
      const M = { t: 22, b: 22, l: 18, r: 18 };
      const CW = W - M.l - M.r;
      let y = M.t;

      // Color palette (light professional theme)
      const C = {
        primary: [242, 84, 48], dark: [20, 22, 28], text: [35, 37, 42],
        muted: [110, 115, 128], success: [22, 163, 74], warning: [180, 120, 4],
        danger: [220, 38, 38], bgLight: [246, 247, 249], bgAccent: [255, 243, 239],
        white: [255, 255, 255], border: [215, 220, 228],
      };
      const setC = (c) => pdf.setTextColor(...c);
      const setF = (c) => pdf.setFillColor(...c);
      const setD = (c) => pdf.setDrawColor(...c);

      const ensureSpace = (need) => {
        if (y + need > H - M.b) { pdf.addPage(); y = M.t; return true; }
        return false;
      };

      const wrappedText = (text, x, fontSize, color, style, maxW, lineH) => {
        pdf.setFont('helvetica', style || 'normal');
        pdf.setFontSize(fontSize);
        setC(color || C.text);
        const lh = lineH || fontSize * 0.45;
        const lines = pdf.splitTextToSize(String(text || ''), maxW || CW);
        lines.forEach(line => { ensureSpace(lh); pdf.text(line, x, y); y += lh; });
        return lines.length;
      };

      const sectionTitle = (title) => {
        ensureSpace(18);
        y += 4;
        setF(C.primary);
        pdf.rect(M.l, y - 5, 3.5, 11, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        setC(C.dark);
        pdf.text(title, M.l + 8, y + 2);
        y += 14;
      };

      const scoreColor = (s) => s >= 80 ? C.success : s >= 50 ? C.warning : C.danger;

      const drawScoreBar = (score, x, barY, barW) => {
        const bh = 3.5;
        setF(C.bgLight); pdf.rect(x, barY, barW, bh, 'F');
        setF(scoreColor(score)); pdf.rect(x, barY, (score / 100) * barW, bh, 'F');
      };

      const drawBullet = (items, bulletColor, bulletChar) => {
        (items || []).forEach(item => {
          ensureSpace(8);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
          setC(bulletColor);
          pdf.text(bulletChar, M.l + 3, y);
          setC(C.text);
          const lines = pdf.splitTextToSize(String(item), CW - 12);
          lines.forEach((line, li) => { if (li > 0) ensureSpace(4.2); pdf.text(line, M.l + 10, y); if (li < lines.length - 1) y += 4.2; });
          y += 5;
        });
      };

      // ─── COVER PAGE ─────────────────────────────
      setF(C.primary); pdf.rect(0, 0, W, 4, 'F');

      y = 45;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(36); setC(C.primary);
      pdf.text('GROWAGENT', M.l, y);
      y += 9;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(13); setC(C.muted);
      pdf.text('CRO Audit Intelligence Report', M.l, y);

      y += 18;
      setD(C.border); pdf.setLineWidth(0.4); pdf.line(M.l, y, W - M.r, y);

      y += 14;
      pdf.setFontSize(10); setC(C.muted); pdf.text('WEBSITE ANALYZED', M.l, y);
      y += 7;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); setC(C.text);
      const displayUrl = url.length > 55 ? url.substring(0, 55) + '...' : url;
      pdf.text(displayUrl, M.l, y);

      y += 14;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); setC(C.muted);
      pdf.text('REPORT DATE', M.l, y);
      y += 7;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); setC(C.text);
      pdf.text(new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), M.l, y);

      // Score display
      y += 30;
      const scoreVal = report.overall_score || 0;
      const sColor = scoreColor(scoreVal);
      // Score background card
      setF(C.bgLight); pdf.rect(M.l, y - 12, CW, 50, 'F');
      setF(sColor); pdf.rect(M.l, y - 12, 4, 50, 'F');

      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(56); setC(sColor);
      pdf.text(`${scoreVal}`, W / 2, y + 12, { align: 'center' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); setC(C.muted);
      pdf.text('OVERALL CRO SCORE (0-100)', W / 2, y + 22, { align: 'center' });
      y += 48;

      // Summary
      y += 8;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10.5); setC(C.text);
      const summaryLines = pdf.splitTextToSize(report.summary || '', CW);
      summaryLines.forEach(line => { pdf.text(line, M.l, y); y += 4.8; });

      // Cover footer
      setF(C.primary); pdf.rect(0, H - 4, W, 4, 'F');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); setC(C.muted);
      pdf.text('Generated by GROWAGENT  |  AI-Powered CRO Analysis  |  growme.ca', W / 2, H - 9, { align: 'center' });

      // ─── PAGE 2+: CONTENT ──────────────────────
      pdf.addPage(); y = M.t;

      // Executive Summary
      sectionTitle('Executive Summary');

      if (report.strengths?.length > 0) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setC(C.success);
        pdf.text('What\'s Working', M.l + 2, y); y += 6;
        drawBullet(report.strengths, C.success, '+');
        y += 2;
      }

      if (report.quick_wins?.length > 0) {
        ensureSpace(12);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setC(C.warning);
        pdf.text('Quick Wins', M.l + 2, y); y += 6;
        drawBullet(report.quick_wins, C.primary, '>');
        y += 2;
      }

      // ─── CHECKLIST SCORES ──────────────────────
      if (report.checklist_scores && Object.keys(report.checklist_scores).length > 0) {
        sectionTitle('CRO Checklist Scores');

        const entries = Object.entries(report.checklist_scores);
        const colW = (CW - 6) / 2;

        entries.forEach(([key, score], i) => {
          const label = CHECKLIST_LABELS[key] || key.replace(/_/g, ' ');
          const col = i % 2;
          const x = M.l + col * (colW + 6);
          if (col === 0) ensureSpace(13);

          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setC(C.muted);
          pdf.text(label, x, y);
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setC(scoreColor(score));
          pdf.text(`${score}`, x + colW, y, { align: 'right' });
          drawScoreBar(score, x, y + 2, colW);
          if (col === 1) y += 13;
        });
        if (entries.length % 2 === 1) y += 13;
        y += 4;
      }

      // ─── CRITICAL FAILURES ─────────────────────
      if (report.checklist_flags?.length > 0) {
        sectionTitle('Critical Checklist Failures');
        const blockH = report.checklist_flags.length * 7.5 + 8;
        ensureSpace(blockH);
        setF(C.bgAccent); pdf.rect(M.l, y - 3, CW, blockH, 'F');
        setF(C.danger); pdf.rect(M.l, y - 3, 3, blockH, 'F');
        y += 2;
        report.checklist_flags.forEach(flag => {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
          setC(C.danger); pdf.text('X', M.l + 7, y);
          setC(C.text);
          const flines = pdf.splitTextToSize(flag, CW - 16);
          flines.forEach(fl => { pdf.text(fl, M.l + 14, y); y += 4.2; });
          y += 3;
        });
        y += 6;
      }

      // ─── COMPETITOR ANALYSIS ───────────────────
      if (report.competitor_analysis?.comparisons?.length > 0) {
        sectionTitle('Competitive Intelligence');
        wrappedText(report.competitor_analysis.overview, M.l, 10, C.text, 'normal', CW, 4.5);
        y += 6;

        // Comparison Table
        if (report.competitor_analysis.comparisons.some(c => c.competitor_scores)) {
          const cats = Object.entries(CHECKLIST_LABELS);
          const comps = report.competitor_analysis.comparisons;
          const catColW = 44;
          const sColW = (CW - catColW) / (comps.length + 1);

          ensureSpace(20);
          // Table header
          setF([235, 237, 242]); pdf.rect(M.l, y, CW, 8, 'F');
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5);
          setC(C.muted); pdf.text('Category', M.l + 2, y + 5.5);
          setC(C.success); pdf.text('Your Site', M.l + catColW + sColW * 0.5, y + 5.5, { align: 'center' });
          comps.forEach((c, i) => {
            setC(C.primary);
            const cName = c.competitor?.length > 18 ? c.competitor.substring(0, 18) + '..' : (c.competitor || '');
            pdf.text(cName, M.l + catColW + sColW * (i + 1) + sColW * 0.5, y + 5.5, { align: 'center' });
          });
          y += 10;

          cats.forEach(([key, label], idx) => {
            ensureSpace(7.5);
            if (idx % 2 === 0) { setF([250, 251, 253]); pdf.rect(M.l, y - 1.5, CW, 7, 'F'); }
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setC(C.text);
            pdf.text(label, M.l + 2, y + 2.5);
            const yScore = report.checklist_scores?.[key] || 0;
            pdf.setFont('helvetica', 'bold'); setC(scoreColor(yScore));
            pdf.text(`${yScore}`, M.l + catColW + sColW * 0.5, y + 2.5, { align: 'center' });
            comps.forEach((c, i) => {
              const cs = c.competitor_scores?.[key];
              if (cs != null) {
                setC(scoreColor(cs));
                pdf.text(`${cs}`, M.l + catColW + sColW * (i + 1) + sColW * 0.5, y + 2.5, { align: 'center' });
                const diff = cs - yScore;
                if (diff !== 0) {
                  pdf.setFontSize(6.5); setC(diff > 0 ? C.danger : C.success);
                  pdf.text(diff > 0 ? `+${diff}` : `${diff}`, M.l + catColW + sColW * (i + 1) + sColW * 0.5 + 10, y + 2.5);
                  pdf.setFontSize(8);
                }
              }
            });
            y += 7;
          });
          y += 4;
          pdf.setFontSize(6.5); setC(C.muted);
          pdf.text('Scores 0-100.  +N = competitor leads (red),  -N = you lead (green).', M.l, y); y += 6;
        }

        // Steal-Worthy Ideas
        report.competitor_analysis.comparisons.forEach(comp => {
          if (comp.steal_worthy?.length > 0) {
            ensureSpace(14);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); setC(C.primary);
            pdf.text(`Ideas to Steal from ${comp.competitor || 'Competitor'}`, M.l + 2, y); y += 6;
            comp.steal_worthy.forEach(idea => {
              ensureSpace(8);
              pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); setC(C.text);
              const il = pdf.splitTextToSize(`- ${idea}`, CW - 8);
              il.forEach(line => { pdf.text(line, M.l + 5, y); y += 4; });
              y += 1.5;
            });
            y += 3;
          }
        });
        y += 4;
      }

      // ─── PAGE SCORES ──────────────────────────
      if (report.page_scores?.length > 0) {
        sectionTitle('Site-Wide Page Scores');
        ensureSpace(14);
        setF([235, 237, 242]); pdf.rect(M.l, y, CW, 8, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); setC(C.muted);
        pdf.text('Page URL', M.l + 2, y + 5.5);
        pdf.text('Type', M.l + 85, y + 5.5);
        pdf.text('Score', M.l + 118, y + 5.5);
        pdf.text('Top Issues', M.l + 135, y + 5.5);
        y += 10;

        report.page_scores.forEach((pg, idx) => {
          ensureSpace(10);
          if (idx % 2 === 0) { setF([250, 251, 253]); pdf.rect(M.l, y - 2, CW, 8, 'F'); }
          let pgPath; try { pgPath = new URL(pg.url).pathname || '/'; } catch { pgPath = pg.url; }
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); setC(C.text);
          pdf.text(pgPath.substring(0, 38), M.l + 2, y + 2);
          pdf.text(pg.page_type || '-', M.l + 85, y + 2);
          pdf.setFont('helvetica', 'bold'); setC(scoreColor(pg.overall_score));
          pdf.text(`${pg.overall_score}`, M.l + 118, y + 2);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setC(C.muted);
          const issues = (pg.top_issues || []).slice(0, 2).join('; ');
          const il = pdf.splitTextToSize(issues, CW - 137);
          il.slice(0, 1).forEach(line => pdf.text(line, M.l + 135, y + 2));
          y += 8;
        });
        y += 6;
      }

      // ─── RECOMMENDATIONS ──────────────────────
      sectionTitle('Prioritized Recommendations');
      const prioColors = { High: C.danger, Medium: C.warning, Low: C.success };

      (report.recommendations || []).forEach((rec, i) => {
        ensureSpace(38);

        // Header row: number + priority badge + category
        setF(C.primary);
        pdf.rect(M.l, y - 1, 7.5, 7.5, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); setC(C.white);
        pdf.text(`${i + 1}`, M.l + 3.75, y + 4, { align: 'center' });

        const prio = rec.priority || 'Medium';
        const pCol = prioColors[prio] || C.muted;
        setF(pCol);
        pdf.rect(M.l + 10, y - 0.5, 17, 6.5, 'F');
        pdf.setFontSize(7); setC(C.white);
        pdf.text(prio.toUpperCase(), M.l + 18.5, y + 4, { align: 'center' });

        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); setC(C.muted);
        pdf.text(rec.category || 'General', M.l + 30, y + 4);

        if (rec.checklist_ref) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setC(C.primary);
          const refText = rec.checklist_ref.length > 45 ? rec.checklist_ref.substring(0, 45) + '..' : rec.checklist_ref;
          pdf.text(refText, W - M.r, y + 4, { align: 'right' });
        }
        y += 10;

        // Issue (bold title)
        wrappedText(rec.issue || '', M.l + 2, 10.5, C.dark, 'bold', CW - 4, 4.8);
        y += 2;

        // Recommendation
        wrappedText(rec.recommendation || '', M.l + 2, 9.5, C.text, 'normal', CW - 4, 4.2);
        y += 3;

        // Impact & Implementation in two-column layout
        const detailStartY = y;
        const halfW = (CW - 8) / 2;

        if (rec.expected_impact) {
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); setC(C.success);
          pdf.text('EXPECTED IMPACT', M.l + 2, y); y += 4;
          const impLines = pdf.splitTextToSize(rec.expected_impact, halfW);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setC(C.text);
          impLines.forEach(line => { ensureSpace(4); pdf.text(line, M.l + 2, y); y += 3.8; });
        }

        const leftColEnd = y;
        if (rec.implementation) {
          y = detailStartY;
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); setC(C.primary);
          pdf.text('IMPLEMENTATION', M.l + halfW + 6, y); y += 4;
          const implLines = pdf.splitTextToSize(rec.implementation, halfW);
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); setC(C.text);
          implLines.forEach(line => { ensureSpace(4); pdf.text(line, M.l + halfW + 6, y); y += 3.8; });
        }
        y = Math.max(y, leftColEnd);
        y += 4;

        // Separator
        setD(C.border); pdf.setLineWidth(0.3); pdf.line(M.l, y, W - M.r, y);
        y += 7;
      });

      // ─── PAGE NUMBERS & HEADERS ON ALL PAGES ─
      const totalP = pdf.internal.getNumberOfPages();
      for (let p = 1; p <= totalP; p++) {
        pdf.setPage(p);
        if (p > 1) {
          // Top accent bar
          setF(C.primary); pdf.rect(0, 0, W, 2.5, 'F');
          // Header text
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setC(C.muted);
          pdf.text(`CRO Audit Report  |  ${displayUrl}`, M.l, 10);
          pdf.text(`GROWAGENT`, W - M.r, 10, { align: 'right' });
        }
        // Footer
        setD(C.border); pdf.setLineWidth(0.3);
        pdf.line(M.l, H - 14, W - M.r, H - 14);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); setC(C.muted);
        if (p === 1) {
          // Cover footer already drawn above
        } else {
          pdf.text('Generated by GROWAGENT  |  AI-Powered CRO Analysis', M.l, H - 10);
          pdf.text(`Page ${p} of ${totalP}`, W - M.r, H - 10, { align: 'right' });
        }
      }

      pdf.save(`GrowAgent_${new URL(url).hostname}_CRO_Report.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      setAppError("PDF export failed. Please try again.");
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

  // ─── New export format handlers (lazy-loaded) ─────────────
  const handleExportTXT = () => {
    if (!report) return;
    setShowExportMenu(false);
    try { exportTXT(report, url); } catch (err) { setAppError("TXT export failed."); }
  };

  const handleExportJPEG = async () => {
    if (!reportDashboardRef.current || !report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try { await exportJPEG(reportDashboardRef, url); }
    catch (err) { setAppError("JPEG export failed."); }
    finally { setIsExporting(false); }
  };

  const handleExportXLSX = async () => {
    if (!report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try { await exportXLSX(report, url); }
    catch (err) { console.error("XLSX export error:", err); setAppError("Excel export failed."); }
    finally { setIsExporting(false); }
  };

  const handleExportDOCX = async () => {
    if (!report) return;
    setShowExportMenu(false);
    setIsExporting(true);
    try { await exportDOCX(report, url); }
    catch (err) { console.error("DOCX export error:", err); setAppError("Word export failed."); }
    finally { setIsExporting(false); }
  };

  const handleReset = () => { setStatus("idle"); setAppError(null); setUrl(""); setAdditionalContext(""); setCompetitorsInput(""); setTargetKeywords(""); setAdditionalPagesInput(""); setShowAdvanced(false); setReport(null); setCodePatches({}); setAbTests({}); setChatHistory([]); setShowExportMenu(false); };
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
            color: #1a1a1a !important;
            font-size: 10.5pt !important;
            line-height: 1.5 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            box-shadow: none !important;
            text-shadow: none !important;
            animation: none !important;
            transition: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          .print-break { page-break-inside: avoid; break-inside: avoid; }

          /* ── LAYOUT ── */
          main { padding: 0 !important; max-width: 100% !important; }
          .print-invert-bg { background: #f7f8fa !important; border: 1px solid #e0e3e8 !important; }
          .print-invert-text { color: #1a1a1a !important; }

          /* ── GLASS CARDS: Light background ── */
          .glass-card {
            background: #f7f8fa !important;
            border: 1px solid #e0e3e8 !important;
            backdrop-filter: none !important;
          }
          .glass-card * { color: #2a2a2a; }
          .glass-card h3 { color: #1a1a1a !important; }

          /* ── HEADER ── */
          .sticky {
            position: relative !important;
            background: white !important;
            border-bottom: 3px solid #F25430 !important;
            padding: 10px 16px !important;
          }

          /* ── SVG CIRCLES: Preserve colors ── */
          svg circle { print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          svg linearGradient stop { print-color-adjust: exact !important; }

          /* ── CHECKLIST SCORES GRID ── */
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] {
            display: grid !important;
            grid-template-columns: repeat(5, 1fr) !important;
            gap: 10px !important;
          }
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] > div {
            background: #f7f8fa !important;
            border: 1px solid #e0e3e8 !important;
            page-break-inside: avoid !important;
          }
          [class*="grid-cols-2"][class*="sm:grid-cols-3"][class*="lg:grid-cols-5"] span { color: #1a1a1a !important; }

          /* Checklist flags */
          [class*="bg-[#F87171]/10"] {
            background: #fef2f2 !important;
            border: 1px solid #fca5a5 !important;
          }
          [class*="bg-[#F87171]/10"] * { color: #dc2626 !important; }

          /* ── FLIP CARDS: Flatten for print ── */
          .flip-card {
            perspective: none !important;
            height: auto !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 12px !important;
          }
          .flip-card-inner { position: relative !important; transform: none !important; transform-style: flat !important; }
          .flip-card-front {
            position: relative !important;
            background: #f7f8fa !important;
            border: 1px solid #e0e3e8 !important;
            border-left: 4px solid #F25430 !important;
            border-radius: 8px !important;
            color: #1a1a1a !important;
            height: auto !important;
          }
          .flip-card-front * { color: #2a2a2a !important; }
          .flip-card-front .text-white { color: #1a1a1a !important; }
          .flip-card-back {
            position: relative !important;
            transform: none !important;
            backface-visibility: visible !important;
            background: white !important;
            border: 1px solid #F25430 !important;
            border-radius: 8px !important;
            margin-top: 6px !important;
            height: auto !important;
            page-break-inside: avoid !important;
          }
          .flip-card-back * { color: #2a2a2a !important; }
          .flip-card-back .text-white { color: #1a1a1a !important; }

          /* ── GRIDS ── */
          .grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-3 {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 12px !important;
          }

          /* ── LIST VIEW ── */
          .space-y-6 > * {
            background: #f7f8fa !important;
            border: 1px solid #e0e3e8 !important;
            page-break-inside: avoid !important;
          }

          /* ── PRIORITY BADGES ── */
          [class*="rounded-full"][class*="tracking-widest"] {
            border: 1px solid currentColor !important;
            background: transparent !important;
            print-color-adjust: exact !important;
          }

          /* ── SCORE/IMPACT BARS ── */
          [class*="rounded-sm"][class*="shadow"] {
            print-color-adjust: exact !important;
          }

          /* ── TABLES (competitor matrix) ── */
          table { border-collapse: collapse !important; }
          table th { background: #f0f1f3 !important; color: #1a1a1a !important; }
          table td { color: #2a2a2a !important; border-bottom: 1px solid #e8eaed !important; }
          table tr:hover { background: transparent !important; }

          /* ── HIDE AMBIENT/DECORATIVE ELEMENTS ── */
          .animate-blob, .animate-ping, .animate-pulse, .animate-float,
          .bg-grid-pattern, .ai-engine-graphic,
          [class*="blur-3xl"], [class*="opacity-5"],
          [class*="opacity-10"],
          [class*="pointer-events-none"][class*="absolute"]:not([class*="z-10"]) {
            display: none !important;
          }

          /* ── DARK BG ELEMENTS: Convert to light ── */
          [class*="bg-[#08090D]"], [class*="bg-[#12151B]"], [class*="bg-[#161920]"], [class*="bg-[#1E222A]"] {
            background: #f7f8fa !important;
          }
          .text-white, [style*="color: rgb(255, 255, 255)"], [style*="color: #fff"] { color: #1a1a1a !important; }
          [style*="color: #8B95A5"], [style*="color: rgb(139, 149, 165)"] { color: #555 !important; }

          /* ── PAGE SETUP ── */
          @page {
            size: A4;
            margin: 1.5cm 1.5cm 1.8cm 1.5cm;
          }
          @page :first { margin-top: 1cm; }
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

                    {/* Row 2: Keywords + Additional Pages */}
                    <div className="space-y-2.5">
                      <label className="text-[#8B95A5] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                        <Search size={14} /> Target Keywords
                      </label>
                      <input
                        type="text"
                        value={targetKeywords}
                        onChange={(e) => setTargetKeywords(e.target.value)}
                        placeholder="E.g., CRO agency, conversion optimization"
                        className="w-full bg-[#08090D] border border-[#1E222A] rounded-xl px-4 py-3 text-white text-[15px] focus:outline-none focus:border-[#F25430]/40 focus:ring-1 focus:ring-[#F25430]/20 transition-all placeholder:text-[#3A4050]"
                      />
                      <div className="text-[10px] text-[#5A6270]">Comma-separated. Used for SEO alignment scoring.</div>
                    </div>

                    <div className="space-y-2.5">
                      <label className="text-[#8B95A5] text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                        <LayoutGrid size={14} /> Batch Pages <span className="text-[10px] font-normal text-[#5A6270] lowercase tracking-normal ml-1">(Max 4, same site)</span>
                      </label>
                      <textarea
                        value={additionalPagesInput}
                        onChange={(e) => setAdditionalPagesInput(e.target.value)}
                        placeholder="E.g., example.com/pricing&#10;example.com/about&#10;example.com/contact"
                        className="w-full bg-[#08090D] border border-[#1E222A] rounded-xl p-4 text-white text-[15px] focus:outline-none focus:border-[#F25430]/40 focus:ring-1 focus:ring-[#F25430]/20 transition-all resize-none h-20 placeholder:text-[#3A4050]"
                      />
                    </div>

                    {/* Row 3: API Key */}
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
                      <div className="border-t-2 border-[#2A2F3A] my-1"></div>
                      <button onClick={handleExportXLSX} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors">
                        <FileSpreadsheet size={14} className="text-[#34D399]" /> Excel (.xlsx)
                      </button>
                      <button onClick={handleExportDOCX} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <FileText size={14} className="text-[#60A5FA]" /> Word (.docx)
                      </button>
                      <button onClick={handleExportTXT} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <FileType2 size={14} className="text-[#8B95A5]" /> Plain Text (.txt)
                      </button>
                      <button onClick={handleExportJPEG} className="w-full px-4 py-3 text-left text-sm font-bold text-white hover:bg-[#1A1E26] flex items-center gap-3 transition-colors border-t border-[#1E222A]">
                        <Download size={14} className="text-[#FBBF24]" /> JPEG Screenshot
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

                  {/* Comparison Matrix */}
                  {report.competitor_analysis.comparisons.some(c => c.competitor_scores) && (
                    <div className="relative z-10 mb-8 overflow-x-auto rounded-xl border border-[#1E222A]">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-[#08090D]">
                            <th className="text-left text-[#8B95A5] p-3 font-semibold text-xs uppercase tracking-wider sticky left-0 bg-[#08090D] z-10">Category</th>
                            <th className="text-center text-[#34D399] p-3 font-bold text-xs uppercase tracking-wider">Your Site</th>
                            {report.competitor_analysis.comparisons.map((c, i) => (
                              <th key={i} className="text-center text-[#F25430] p-3 font-bold text-xs uppercase tracking-wider whitespace-nowrap">{c.competitor}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
                            const yourScore = report.checklist_scores?.[key] || 0;
                            return (
                              <tr key={key} className="border-t border-[#1E222A]/50 hover:bg-[#12151B]/50 transition-colors">
                                <td className="p-3 text-white text-[13px] font-medium sticky left-0 bg-[#08090D]/90 backdrop-blur-sm z-10">{label}</td>
                                <td className="p-3 text-center">
                                  <span className="font-bold text-[13px]" style={{ color: yourScore >= 80 ? '#34D399' : yourScore >= 50 ? '#FBBF24' : '#F87171' }}>{yourScore}</span>
                                </td>
                                {report.competitor_analysis.comparisons.map((c, i) => {
                                  const compScore = c.competitor_scores?.[key];
                                  const diff = compScore != null ? compScore - yourScore : null;
                                  return (
                                    <td key={i} className="p-3 text-center">
                                      <span className="font-bold text-[13px]" style={{ color: compScore >= 80 ? '#34D399' : compScore >= 50 ? '#FBBF24' : '#F87171' }}>
                                        {compScore ?? '—'}
                                      </span>
                                      {diff != null && diff !== 0 && (
                                        <span className={`ml-1.5 text-[10px] font-bold ${diff > 0 ? 'text-[#F87171]' : 'text-[#34D399]'}`}>
                                          {diff > 0 ? `+${diff}` : diff}
                                        </span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="px-3 py-2 text-[10px] text-[#5A6270] bg-[#08090D] border-t border-[#1E222A]/50">
                        Scores based on HTML analysis. <span className="text-[#F87171]">+N</span> = competitor leads, <span className="text-[#34D399]">-N</span> = you lead.
                      </div>
                    </div>
                  )}

                  {/* Per-Competitor Cards with Steal-Worthy */}
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
                          {comp.steal_worthy?.length > 0 && (
                            <div>
                              <div className="text-[11px] text-[#FBBF24] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Lightbulb size={13} /> Steal-Worthy Ideas
                              </div>
                              <div className="space-y-2">
                                {comp.steal_worthy.map((idea, j) => (
                                  <div key={j} className="text-[#E5E7EB] text-[13px] font-medium leading-relaxed bg-[#FBBF24]/5 p-3 rounded-lg border border-[#FBBF24]/10 flex gap-2">
                                    <ArrowRight size={14} className="text-[#FBBF24] shrink-0 mt-0.5" />
                                    {idea}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SITE-WIDE PAGE SCORES (Multi-Page Analysis) */}
            {report.page_scores?.length > 0 && (
              <div className="mb-10 print-break animate-in slide-in-from-bottom-8 duration-700">
                <div className="print-invert-bg glass-card p-8 md:p-10 rounded-[2rem] shadow-2xl relative overflow-hidden">
                  <div className="absolute -right-16 -top-16 opacity-5 pointer-events-none">
                    <LayoutGrid size={250} />
                  </div>
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <div className="p-3 bg-[#F25430] rounded-2xl shadow-[0_0_20px_rgba(242,84,48,0.5)]">
                      <LayoutGrid size={28} color="#fff" />
                    </div>
                    <h3 className="print-invert-text" style={{ fontFamily: "'Montserrat', sans-serif", color: "#fff", fontSize: "28px", fontWeight: "900", letterSpacing: "-1px" }}>
                      Site-Wide Page Scores
                    </h3>
                  </div>
                  <p className="text-[#8B95A5] text-sm mb-6 relative z-10">Individual scores for each page analyzed across your site.</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10">
                    {report.page_scores.map((page, i) => {
                      const scoreColor = page.overall_score >= 80 ? '#34D399' : page.overall_score >= 50 ? '#FBBF24' : '#F87171';
                      let pagePath;
                      try { pagePath = new URL(page.url).pathname || '/'; } catch { pagePath = page.url; }
                      return (
                        <div key={i} className="bg-[#08090D]/80 border border-[#1E222A] rounded-xl p-5 text-center hover:border-[#2A2F3A] transition-colors">
                          <div className="text-[#F25430] text-[10px] font-black uppercase tracking-widest mb-3">{page.page_type || 'Page'}</div>
                          <div className="text-4xl font-black font-['Montserrat'] mb-2" style={{ color: scoreColor }}>{page.overall_score}</div>
                          <div className="text-[#5A6270] text-[11px] truncate mb-3" title={page.url}>{pagePath}</div>
                          {page.top_issues?.length > 0 && (
                            <div className="text-left mt-3 pt-3 border-t border-[#1E222A]/50">
                              {page.top_issues.slice(0, 2).map((issue, j) => (
                                <div key={j} className="text-[#8B95A5] text-[11px] leading-tight mb-1.5 flex items-start gap-1.5">
                                  <span className="text-[#F87171] mt-0.5 shrink-0">•</span> {issue}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
