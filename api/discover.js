// ─── /api/discover ───────────────────────────────────────────
// POST { url } → { pages: [...], source: "sitemap"|"crawl"|"mixed" }
//
// Given a single URL, returns up to 25 same-origin internal pages
// by trying (1) sitemap.xml / sitemap_index.xml, (2) Sitemap: directive
// in robots.txt, (3) crawling internal links from the homepage and a
// few high-intent pages.
//
// Same security posture as /api/analyze: validateUrl (SSRF), rateLimit.

import { validateUrl, rateLimit } from './_utils.js';
import {
  extractLinks,
  parseSitemap,
  isCrawlableUrl,
  prioritizePages,
  normalizeUrl
} from './_extract.js';

const MAX_PAGES = 25;
const HARD_URL_CAP = 200;          // never parse beyond this from sitemaps
const FETCH_TIMEOUT_MS = 10000;    // per-request
const PRIORITY_PROBE_PATHS = ['/about', '/services', '/contact', '/pricing'];

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; GrowAgent-CRO-Audit/1.8)'
};

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Try /sitemap.xml, /sitemap_index.xml, and any Sitemap: line in /robots.txt.
// Resolves nested sitemap-index entries (one level deep) to gather URLs.
async function discoverFromSitemap(origin) {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

  // robots.txt may list custom sitemap locations.
  const robotsTxt = await fetchText(`${origin}/robots.txt`, 5000);
  if (robotsTxt) {
    const sitemapLineRe = /^\s*Sitemap:\s*(\S+)/gim;
    let m;
    while ((m = sitemapLineRe.exec(robotsTxt)) !== null) {
      const u = m[1].trim();
      if (u && !candidates.includes(u)) candidates.push(u);
    }
  }

  const collected = new Set();
  const visitedSitemaps = new Set();

  async function processSitemap(sitemapUrl, depth) {
    if (visitedSitemaps.has(sitemapUrl) || depth > 2) return;
    visitedSitemaps.add(sitemapUrl);

    const xml = await fetchText(sitemapUrl);
    if (!xml) return;
    const { urls, sitemaps } = parseSitemap(xml);

    for (const u of urls) {
      if (collected.size >= HARD_URL_CAP) break;
      collected.add(u);
    }

    // Recurse into nested sitemap indexes (depth 1 only — most sites have
    // one level of nesting).
    for (const child of sitemaps.slice(0, 5)) {
      if (collected.size >= HARD_URL_CAP) break;
      await processSitemap(child, depth + 1);
    }
  }

  for (const c of candidates) {
    if (collected.size >= HARD_URL_CAP) break;
    await processSitemap(c, 0);
  }

  return [...collected];
}

// Fallback: crawl the homepage and a few high-intent pages for internal links.
async function discoverFromCrawl(origin, baseUrl) {
  const found = new Set();
  found.add(baseUrl);

  async function harvest(pageUrl) {
    const html = await fetchText(pageUrl);
    if (!html) return;
    const links = extractLinks(html, pageUrl);
    for (const l of links) {
      if (!l.isInternal || !l.href) continue;
      if (isCrawlableUrl(l.href, origin)) found.add(l.href);
      if (found.size >= HARD_URL_CAP) return;
    }
  }

  await harvest(baseUrl);

  // Depth-1 BFS from priority probe paths if they exist in the harvest.
  const probes = PRIORITY_PROBE_PATHS
    .map(p => `${origin}${p}`)
    .filter(u => found.has(u) || found.has(u + '/'));

  // Cap depth-1 work to keep us well under 30s.
  for (const probe of probes.slice(0, 4)) {
    if (found.size >= HARD_URL_CAP) break;
    await harvest(probe);
  }

  return [...found];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Rate limit — more generous than /analyze since discovery is cheap.
  if (!rateLimit(req, 10)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute and try again.' });
  }

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const urlCheck = validateUrl(url);
  if (!urlCheck.valid) return res.status(400).json({ error: urlCheck.error });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  const origin = parsed.origin;
  const baseUrl = normalizeUrl(url, url) || `${origin}/`;

  const logId = Math.random().toString(36).substring(7);
  const start = Date.now();
  console.log(`[${logId}] [DISCOVER] ${origin}`);

  try {
    // Try sitemap first.
    let pages = await discoverFromSitemap(origin);
    let source = pages.length > 0 ? 'sitemap' : 'crawl';
    console.log(`[${logId}] [DISCOVER] Sitemap returned ${pages.length} URLs`);

    // If sitemap gave nothing (or very few), fall back to crawling.
    if (pages.length < 3) {
      const crawled = await discoverFromCrawl(origin, baseUrl);
      console.log(`[${logId}] [DISCOVER] Crawl returned ${crawled.length} URLs`);
      if (pages.length > 0 && crawled.length > 0) source = 'mixed';
      else if (crawled.length > 0) source = 'crawl';
      pages = [...new Set([...pages, ...crawled])];
    }

    // Filter to same-origin, crawlable, normalized.
    const normalized = pages
      .map(u => normalizeUrl(u, baseUrl))
      .filter(Boolean)
      .filter(u => isCrawlableUrl(u, origin));

    const deduped = [...new Set(normalized)];
    const prioritized = prioritizePages(deduped, baseUrl).slice(0, MAX_PAGES);

    console.log(`[${logId}] [DISCOVER] Done in ${Date.now() - start}ms. Returning ${prioritized.length} pages (source: ${source}).`);

    return res.status(200).json({
      pages: prioritized,
      source,
      total_found: deduped.length,
      origin
    });
  } catch (err) {
    console.error(`[${logId}] [DISCOVER] FAIL: ${err.message}`);
    return res.status(500).json({ error: `Discovery failed: ${err.message}` });
  }
}
