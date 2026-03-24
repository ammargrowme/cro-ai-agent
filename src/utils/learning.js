/**
 * Learning System — Server-Side (Upstash Redis) + Local Fallback (localStorage)
 *
 * Architecture:
 * - Server: All users contribute to a shared knowledge base via /api/learnings
 * - Local: localStorage is kept as a cache and fallback if the server is unavailable
 * - On audit completion: data saved to BOTH server and localStorage
 * - On app load: server learnings fetched and merged with local data
 * - Deduplication: by url+timestamp to prevent double-counting
 */

const LOCAL_LEARNINGS_KEY = "growagent_learnings";
const LOCAL_INSIGHTS_KEY = "growagent_insights";

// ─── Local helpers (kept as fallback) ───────────────────────

export const getLocalLearnings = () => {
  try {
    const raw = localStorage.getItem(LOCAL_LEARNINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

export const buildLearningEntry = (auditResult) => ({
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

export const saveLocalLearning = (auditResult) => {
  try {
    const learnings = getLocalLearnings();
    const entry = buildLearningEntry(auditResult);
    learnings.push(entry);
    localStorage.setItem(LOCAL_LEARNINGS_KEY, JSON.stringify(learnings.slice(-20)));
    return entry;
  } catch { return null; }
};

export const addLocalInsight = (insight) => {
  try {
    const insights = JSON.parse(localStorage.getItem(LOCAL_INSIGHTS_KEY) || "[]");
    insights.push({ text: insight, timestamp: new Date().toISOString() });
    localStorage.setItem(LOCAL_INSIGHTS_KEY, JSON.stringify(insights.slice(-50)));
  } catch { /* Storage full or unavailable */ }
};

// ─── Server-side helpers (fire-and-forget, non-blocking) ────

export const saveServerLearning = (auditResult) => {
  const entry = buildLearningEntry(auditResult);
  fetch('/api/learnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'audit', data: entry })
  }).catch(() => {}); // Silent fail — localStorage is the backup
};

export const saveServerInsight = (insightText, sourceUrl) => {
  fetch('/api/learnings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'insight', data: { text: insightText, sourceUrl: sourceUrl || "" } })
  }).catch(() => {}); // Silent fail
};

export const fetchServerLearnings = async () => {
  try {
    const res = await fetch('/api/learnings');
    if (!res.ok) throw new Error("Server learnings unavailable");
    return await res.json();
  } catch {
    return { learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 };
  }
};

// ─── Merge local + server learnings ─────────────────────────

export const mergeLearnings = (localLearnings, serverData) => {
  const serverLearnings = serverData.learnings || [];
  const seen = new Set();
  const merged = [];
  // Server learnings first (shared knowledge), then local
  for (const entry of [...serverLearnings, ...localLearnings]) {
    const key = `${entry.url}|${entry.timestamp}`;
    if (!seen.has(key)) { seen.add(key); merged.push(entry); }
  }

  // Merge insights from both sources
  try {
    const localInsights = JSON.parse(localStorage.getItem(LOCAL_INSIGHTS_KEY) || "[]");
    const serverInsights = (serverData.insights || []).map(i => typeof i === 'string' ? JSON.parse(i) : i);
    const allInsightTexts = [...new Set([...serverInsights, ...localInsights].map(i => i.text))].slice(-20);

    // Attach insights to the last learning entry for prompt inclusion
    if (allInsightTexts.length > 0 && merged.length > 0) {
      merged[merged.length - 1].feedbackInsights = allInsightTexts;
    }
  } catch { /* Insight merge failed, continue without */ }

  return merged;
};

// ─── Track chat modifications ───────────────────────────────

export const trackChatModification = () => {
  try {
    const learnings = getLocalLearnings();
    if (learnings.length > 0) {
      learnings[learnings.length - 1].chatModifications =
        (learnings[learnings.length - 1].chatModifications || 0) + 1;
      localStorage.setItem(LOCAL_LEARNINGS_KEY, JSON.stringify(learnings));
    }
  } catch { /* Storage unavailable */ }
};
