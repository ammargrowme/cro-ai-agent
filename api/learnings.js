import { createClient } from 'redis';

// ─── REDIS CONNECTION ──────────────────────────────────────
// Vercel Redis auto-injects REDIS_URL env var when the store is linked.
// Connection is created per-request (serverless) with a short timeout.
const getRedis = async () => {
  const client = createClient({ url: process.env.REDIS_URL });
  client.on('error', (err) => console.error('[REDIS]', err.message));
  await client.connect();
  return client;
};

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
  let redis;
  try {
    redis = await getRedis();
  } catch (err) {
    console.error("[LEARNINGS] Redis connection failed:", err.message);
    // Graceful degradation — return empty data so the app still works
    if (req.method === 'GET') {
      return res.status(200).json({ learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 });
    }
    return res.status(500).json({ error: 'Database unavailable' });
  }

  try {
    // ── GET: Return global learnings + insights for AI prompt injection ──
    if (req.method === 'GET') {
      // node-redis lRange returns strings — we need to JSON.parse each
      const rawLearnings = await redis.lRange(LEARNINGS_KEY, -20, -1) || [];
      const rawInsights = await redis.lRange(INSIGHTS_KEY, -30, -1) || [];

      const learnings = rawLearnings.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
      const insights = rawInsights.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

      const totalLearnings = await redis.lLen(LEARNINGS_KEY) || 0;
      const totalInsights = await redis.lLen(INSIGHTS_KEY) || 0;

      return res.status(200).json({ learnings, insights, totalLearnings, totalInsights });
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

      if (type === 'audit') {
        if (!validateAuditData(data)) {
          return res.status(400).json({ error: 'Invalid audit data. Required: url (string), score (number 0-100).' });
        }

        const entry = JSON.stringify({
          url: data.url,
          score: data.score,
          timestamp: data.timestamp || new Date().toISOString(),
          topIssues: (data.topIssues || []).slice(0, 5),
          topCategories: (data.topCategories || []).slice(0, 5),
          checklistWeaknesses: (data.checklistWeaknesses || []).slice(0, 10),
          checklistStrengths: (data.checklistStrengths || []).slice(0, 10),
          allChecklistScores: data.allChecklistScores || {},
          criticalFlags: (data.criticalFlags || []).slice(0, 5)
        });

        // RPUSH + LTRIM for atomic append-and-cap
        await redis.rPush(LEARNINGS_KEY, entry);
        await redis.lTrim(LEARNINGS_KEY, -MAX_LEARNINGS, -1);

        const total = await redis.lLen(LEARNINGS_KEY);
        return res.status(200).json({ ok: true, totalLearnings: total });
      }

      if (type === 'insight') {
        if (!validateInsightData(data)) {
          return res.status(400).json({ error: 'Invalid insight data. Required: text (string, max 500 chars).' });
        }

        const entry = JSON.stringify({
          text: data.text.substring(0, 500),
          timestamp: new Date().toISOString(),
          sourceUrl: (data.sourceUrl || "").substring(0, 500)
        });

        await redis.rPush(INSIGHTS_KEY, entry);
        await redis.lTrim(INSIGHTS_KEY, -MAX_INSIGHTS, -1);

        const total = await redis.lLen(INSIGHTS_KEY);
        return res.status(200).json({ ok: true, totalInsights: total });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error("[LEARNINGS ERROR]", err.message);
    if (req.method === 'GET') {
      return res.status(200).json({ learnings: [], insights: [], totalLearnings: 0, totalInsights: 0 });
    }
    return res.status(500).json({ error: 'Failed to save learning data.' });
  } finally {
    // Always disconnect in serverless to avoid hanging connections
    try { await redis.disconnect(); } catch {}
  }
}
