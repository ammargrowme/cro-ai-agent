import { Redis } from '@upstash/redis';

// ─── REDIS CONNECTION ──────────────────────────────────────
// Vercel KV (now Upstash Redis) auto-injects these env vars when linked:
//   KV_REST_API_URL, KV_REST_API_TOKEN
// Falls back to UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""
});

const LEARNINGS_KEY = 'global:learnings';
const INSIGHTS_KEY = 'global:insights';
const MAX_LEARNINGS = 100;
const MAX_INSIGHTS = 200;

// ─── INPUT VALIDATION ──────────────────────────────────────
const validateAuditData = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.url !== 'string' || data.url.length === 0 || data.url.length > 500) return false;
  if (typeof data.score !== 'number' || data.score < 0 || data.score > 100) return false;
  return true;
};

const validateInsightData = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.text !== 'string' || data.text.length === 0 || data.text.length > 500) return false;
  return true;
};

// ─── HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  // ── GET: Return global learnings + insights for AI prompt injection ──
  if (req.method === 'GET') {
    try {
      // lrange returns parsed JSON automatically with @upstash/redis
      const learnings = await redis.lrange(LEARNINGS_KEY, -20, -1) || [];
      const insights = await redis.lrange(INSIGHTS_KEY, -30, -1) || [];

      return res.status(200).json({
        learnings,
        insights,
        totalLearnings: await redis.llen(LEARNINGS_KEY) || 0,
        totalInsights: await redis.llen(INSIGHTS_KEY) || 0
      });
    } catch (err) {
      console.error("[LEARNINGS GET ERROR]", err.message);
      // Graceful degradation — return empty so the app still works
      return res.status(200).json({ learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 });
    }
  }

  // ── POST: Save a new learning entry ──
  if (req.method === 'POST') {
    const { type, data } = req.body;

    if (!type || !['audit', 'insight'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Must be "audit" or "insight".' });
    }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Data object is required.' });
    }

    try {
      if (type === 'audit') {
        if (!validateAuditData(data)) {
          return res.status(400).json({ error: 'Invalid audit data. Required: url (string), score (number 0-100).' });
        }

        const entry = {
          url: data.url,
          score: data.score,
          timestamp: data.timestamp || new Date().toISOString(),
          topIssues: (data.topIssues || []).slice(0, 5),
          topCategories: (data.topCategories || []).slice(0, 5),
          checklistWeaknesses: (data.checklistWeaknesses || []).slice(0, 10),
          checklistStrengths: (data.checklistStrengths || []).slice(0, 10),
          allChecklistScores: data.allChecklistScores || {},
          criticalFlags: (data.criticalFlags || []).slice(0, 5)
        };

        // RPUSH + LTRIM is atomic enough for concurrent writes
        await redis.rpush(LEARNINGS_KEY, entry);
        await redis.ltrim(LEARNINGS_KEY, -MAX_LEARNINGS, -1);

        const total = await redis.llen(LEARNINGS_KEY);
        return res.status(200).json({ ok: true, totalLearnings: total });
      }

      if (type === 'insight') {
        if (!validateInsightData(data)) {
          return res.status(400).json({ error: 'Invalid insight data. Required: text (string, max 500 chars).' });
        }

        const entry = {
          text: data.text.substring(0, 500),
          timestamp: new Date().toISOString(),
          sourceUrl: (data.sourceUrl || "").substring(0, 500)
        };

        await redis.rpush(INSIGHTS_KEY, entry);
        await redis.ltrim(INSIGHTS_KEY, -MAX_INSIGHTS, -1);

        const total = await redis.llen(INSIGHTS_KEY);
        return res.status(200).json({ ok: true, totalInsights: total });
      }
    } catch (err) {
      console.error("[LEARNINGS POST ERROR]", err.message);
      return res.status(500).json({ error: 'Failed to save learning data.' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
