// ─── SHARED SECURITY UTILITIES ──────────────────────────────
// Underscore prefix prevents Vercel from treating this as an API endpoint.

// ─── URL VALIDATION (SSRF Prevention) ──────────────────────

const PRIVATE_IP_RANGES = [
  /^127\./,                          // 127.0.0.0/8 loopback
  /^10\./,                           // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\./,     // 172.16.0.0/12 private
  /^192\.168\./,                     // 192.168.0.0/16 private
  /^169\.254\./,                     // 169.254.0.0/16 link-local
  /^0\./,                            // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 CGNAT
];

const BLOCKED_HOSTNAMES = ['localhost', 'metadata.google.internal', 'metadata', 'instance-data'];

/**
 * Validates a URL for safe server-side fetching.
 * Rejects non-http(s) schemes, private/internal IPs, and localhost.
 * @param {string} urlStr - The URL to validate
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Scheme check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, error: `Blocked URL scheme: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Blocked hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    return { valid: false, error: `Blocked hostname: ${hostname}` };
  }

  // IPv6 loopback
  if (hostname === '[::1]' || hostname === '::1') {
    return { valid: false, error: 'Blocked: IPv6 loopback address' };
  }

  // IPv4 private/internal range check
  // Strip brackets for IPv6 (basic check) — mainly targeting IPv4
  const bare = hostname.replace(/^\[|\]$/g, '');
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(bare)) {
      return { valid: false, error: `Blocked: private/internal IP address (${bare})` };
    }
  }

  return { valid: true };
}

// ─── RATE LIMITER (best-effort, Map-based, resets on cold start) ──────

const rateLimitMap = new Map(); // key: IP string, value: { count, windowStart }

/**
 * Simple in-memory rate limiter. Best-effort — resets when the serverless
 * function cold-starts. Returns true if the request is allowed, false if rate limited.
 * @param {object} req - Vercel request object
 * @param {number} maxPerMinute - Max requests allowed per IP per 60-second window
 * @returns {boolean} true = allowed, false = rate limited
 */
export function rateLimit(req, maxPerMinute) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();
  const windowMs = 60_000;

  // Inline cleanup: prune stale entries if map grows large (serverless-safe)
  if (rateLimitMap.size > 100) {
    for (const [key, val] of rateLimitMap) {
      if (now - val.windowStart > 120_000) rateLimitMap.delete(key);
    }
  }

  let entry = rateLimitMap.get(ip);

  if (!entry || (now - entry.windowStart) > windowMs) {
    // New window
    entry = { count: 1, windowStart: now };
    rateLimitMap.set(ip, entry);
    return true;
  }

  entry.count++;

  if (entry.count > maxPerMinute) {
    return false;
  }

  return true;
}

// Clean stale entries inline during rate limit checks (serverless-safe, no setInterval)
