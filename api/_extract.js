// ─── STATIC HTML EXTRACTION + URL HEALTH ─────────────────────
// Pure functions for non-AI analysis of scraped HTML. Used by
// api/analyze.js (Phase 1.5 link/button/form audit) and
// api/discover.js (sitemap + homepage link discovery).
//
// Why regex instead of cheerio/jsdom: keeps the Vercel function
// bundle tiny (<50MB limit) and avoids a new dependency. The trade-
// off is some malformed HTML may be parsed imperfectly — acceptable
// for a CRO audit that's already approximate.
//
// Underscore prefix prevents Vercel from treating this file as an
// API endpoint.

// CTA detection — text or class match strongly suggests an action element.
const CTA_TEXT_RE = /\b(get|start|book|call|contact|sign\s*up|signup|register|learn\s*more|try|buy|shop|order|request|quote|free|download|subscribe|join|schedule|reserve|claim|apply|enroll|continue|next|submit\s+request|view\s+plans|see\s+pricing|talk\s+to)\b/i;
const CTA_CLASS_RE = /\b(btn|button|cta|action|primary|call-to-action|hero-button)\b/i;

const GENERIC_CTA_RE = /^(submit|click here|click|send|buy now|go|ok|done|continue)\.?$/i;

// Detect "Call/Phone" CTA that should be a tel: link but isn't.
const PHONE_CTA_RE = /\b(call\s+us|call\s+now|phone|dial)\b/i;

const NON_HTTP_PROTOCOLS = /^(mailto:|tel:|javascript:|sms:|whatsapp:|data:)/i;
const FILE_EXT_RE = /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|tar|gz|mp4|mp3|woff2?|ttf|eot|ico|css|js)(\?|#|$)/i;

// Dropdown / menu-trigger detection — an <a href="#"> is INTENTIONAL when the
// link opens a sub-menu via JS. WordPress / Elementor / Webflow all emit class
// names like menu-item-has-children. Aria attrs are the most reliable signal.
const DROPDOWN_CLASS_RE = /\b(menu-item-has-children|has-children|has-submenu|has-dropdown|dropdown-toggle|dropdown__trigger|submenu-trigger|nav-dropdown|menu-trigger|js-dropdown|hs-menu-children-wrapper|sub-menu-trigger)\b/i;

// URLs we skip during the HEAD-check step because they're known JS-hydrated
// shims that always return 4xx when fetched server-side (false positive
// "broken link" otherwise). Cloudflare email-protection is the big one.
const IGNORED_HEALTH_CHECK_RE = /\/cdn-cgi\/(l\/email-protection|scrape-shield|challenge-platform|bm\/cv\/result|trace|rum)/i;

export function shouldSkipHealthCheck(url) {
  if (!url) return true;
  return IGNORED_HEALTH_CHECK_RE.test(url);
}

// ─── decodeHtmlEntities ──────────────────────────────────────
// Decodes the most common HTML entities found in attribute values.
function decodeHtmlEntities(text) {
  if (!text) return "";
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// Strip tags from inner HTML to get visible text. Cheap and accurate
// enough for CTA copy detection.
function stripTags(html) {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

// Pull a named attribute value from a single tag string.
function getAttr(tag, attrName) {
  const re = new RegExp(`${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return decodeHtmlEntities(m[1] || m[2] || m[3] || "");
}

// ─── normalizeUrl ────────────────────────────────────────────
// Resolves a possibly-relative URL against baseUrl, strips fragment,
// normalizes trailing slash. Returns null if invalid.
export function normalizeUrl(href, baseUrl) {
  if (!href || typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed === '#' || NON_HTTP_PROTOCOLS.test(trimmed)) return null;
  try {
    const u = new URL(trimmed, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    // Normalize trailing slash on path-only URLs (treat /about and /about/
    // as the same). Keep query params.
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

// ─── extractLinks ────────────────────────────────────────────
// Returns [{ href, text, isExternal, isCta, isPhoneLabel, raw }]
// from <a> tags in the given HTML.
export function extractLinks(html, baseUrl) {
  if (!html) return [];
  const baseOrigin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const rawHref = getAttr(attrs, 'href');
    const text = stripTags(inner);
    const className = getAttr(attrs, 'class') || "";

    // Track tel: / mailto: separately — they're not "broken" but they
    // matter for CTA-outcome auditing.
    const isTel = rawHref && /^tel:/i.test(rawHref);
    const isMailto = rawHref && /^mailto:/i.test(rawHref);

    const normalized = rawHref ? normalizeUrl(rawHref, baseUrl) : null;

    // Capture even non-normalizable hrefs (for "empty href" / "#" detection),
    // but only with diagnostic info, not as crawlable URLs.
    const isEmpty = !rawHref || rawHref.trim() === '' || rawHref.trim() === '#' || /^javascript:/i.test(rawHref || "");

    if (!normalized && !isTel && !isMailto && !isEmpty) continue;

    const isExternal = normalized && baseOrigin && !normalized.startsWith(baseOrigin);
    const isPhoneLabel = PHONE_CTA_RE.test(text);
    const isCta = (CTA_TEXT_RE.test(text) || CTA_CLASS_RE.test(className)) && text.length > 0 && text.length < 80;

    // Dropdown / sub-menu trigger detection — an <a href="#"> with these
    // signals is JS-handled, not a broken CTA. Suppresses the most common
    // false-positive class in WordPress / Elementor / Webflow navs.
    const ariaHasPopup = /\baria-haspopup\s*=\s*["'](?:true|menu|listbox|dialog)["']/i.test(attrs);
    const ariaExpanded = /\baria-expanded\s*=\s*["'][^"']+["']/i.test(attrs);
    const ariaControls = /\baria-controls\s*=\s*["'][^"']+["']/i.test(attrs);
    const roleMenuitem = /\brole\s*=\s*["'](?:menuitem|button)["']/i.test(attrs);
    const dataToggle = /\bdata-(?:toggle|target|dropdown|bs-toggle)\s*=/i.test(attrs);
    const isDropdownTrigger = ariaHasPopup || ariaExpanded || ariaControls || roleMenuitem || dataToggle || DROPDOWN_CLASS_RE.test(className);

    links.push({
      href: normalized || rawHref || "",
      text: text.substring(0, 120),
      isExternal: !!isExternal,
      isInternal: !!normalized && !isExternal,
      isCta,
      isPhoneLabel,
      isTel,
      isMailto,
      isEmpty,
      isGenericCta: isCta && GENERIC_CTA_RE.test(text),
      isDropdownTrigger,
      className: className.substring(0, 80)
    });
  }
  return links;
}

// ─── extractButtons ──────────────────────────────────────────
// Returns <button>, <input type="submit|button">, and role="button"
// elements with structural metadata.
export function extractButtons(html) {
  if (!html) return [];
  const buttons = [];

  // <button>...</button>
  const buttonRe = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = buttonRe.exec(html)) !== null) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const text = stripTags(inner);
    const onclick = getAttr(attrs, 'onclick');
    const className = getAttr(attrs, 'class') || "";
    const type = getAttr(attrs, 'type') || "button";
    buttons.push({
      kind: 'button',
      text: text.substring(0, 120),
      type,
      hasOnclick: !!onclick,
      hasHref: false,
      isCta: (CTA_TEXT_RE.test(text) || CTA_CLASS_RE.test(className)) && text.length > 0 && text.length < 80,
      isGenericCta: GENERIC_CTA_RE.test(text),
      className: className.substring(0, 80)
    });
  }

  // <input type="submit|button">
  const inputRe = /<input\b([^>]*)\/?>/gi;
  while ((m = inputRe.exec(html)) !== null) {
    const attrs = m[1] || "";
    const type = (getAttr(attrs, 'type') || "").toLowerCase();
    if (type !== 'submit' && type !== 'button' && type !== 'image') continue;
    const value = getAttr(attrs, 'value') || (type === 'submit' ? 'Submit' : '');
    const className = getAttr(attrs, 'class') || "";
    buttons.push({
      kind: 'input',
      text: value.substring(0, 120),
      type,
      hasOnclick: false,
      hasHref: false,
      isCta: type === 'submit' || CTA_TEXT_RE.test(value) || CTA_CLASS_RE.test(className),
      isGenericCta: GENERIC_CTA_RE.test(value),
      className: className.substring(0, 80)
    });
  }

  // role="button"
  const roleRe = /<([a-z]+)\b([^>]*\brole\s*=\s*["']button["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  while ((m = roleRe.exec(html)) !== null) {
    const attrs = m[2] || "";
    const inner = m[3] || "";
    const text = stripTags(inner);
    const className = getAttr(attrs, 'class') || "";
    buttons.push({
      kind: 'role-button',
      text: text.substring(0, 120),
      type: 'button',
      hasOnclick: !!getAttr(attrs, 'onclick'),
      hasHref: !!getAttr(attrs, 'href'),
      isCta: CTA_TEXT_RE.test(text) || CTA_CLASS_RE.test(className),
      isGenericCta: GENERIC_CTA_RE.test(text),
      className: className.substring(0, 80)
    });
  }

  return buttons;
}

// ─── extractForms ────────────────────────────────────────────
// Returns [{ action, method, fields: [...] }] for every <form>.
// Each field captures label/required/validation metadata so the
// AI form-friction call (and the static checklist) can score
// against CXL form rules.
export function extractForms(html, baseUrl) {
  if (!html) return [];
  const forms = [];
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let m;
  while ((m = formRe.exec(html)) !== null) {
    const attrs = m[1] || "";
    const inner = m[2] || "";
    const action = getAttr(attrs, 'action');
    const method = (getAttr(attrs, 'method') || "GET").toUpperCase();
    const formId = getAttr(attrs, 'id') || "";
    const formName = getAttr(attrs, 'name') || "";

    // Build a name→label map by scanning <label for="...">.
    const labelMap = new Map();
    const labelRe = /<label\b([^>]*)>([\s\S]*?)<\/label>/gi;
    let lm;
    while ((lm = labelRe.exec(inner)) !== null) {
      const forAttr = getAttr(lm[1], 'for');
      const labelText = stripTags(lm[2]);
      if (forAttr) labelMap.set(forAttr, labelText);
    }

    const fields = [];

    // <input>
    const fieldRe = /<input\b([^>]*)\/?>/gi;
    let fm;
    while ((fm = fieldRe.exec(inner)) !== null) {
      const fa = fm[1] || "";
      const type = (getAttr(fa, 'type') || "text").toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'image' || type === 'reset') continue;
      const name = getAttr(fa, 'name') || "";
      const id = getAttr(fa, 'id') || "";
      const placeholder = getAttr(fa, 'placeholder') || "";
      const required = /\brequired\b/i.test(fa);
      const pattern = getAttr(fa, 'pattern');
      const ariaLabel = getAttr(fa, 'aria-label');
      const label = labelMap.get(id) || labelMap.get(name) || ariaLabel || "";
      // Inline-label = no visible <label> AND only placeholder describes the field.
      const hasInlineLabel = !label && !!placeholder;
      fields.push({
        kind: 'input',
        type,
        name,
        label,
        placeholder: placeholder.substring(0, 80),
        required,
        hasInlineLabel,
        hasValidationPattern: !!pattern,
        hasAriaLabel: !!ariaLabel
      });
    }

    // <textarea>
    const taRe = /<textarea\b([^>]*)>/gi;
    while ((fm = taRe.exec(inner)) !== null) {
      const fa = fm[1] || "";
      const name = getAttr(fa, 'name') || "";
      const id = getAttr(fa, 'id') || "";
      const placeholder = getAttr(fa, 'placeholder') || "";
      const required = /\brequired\b/i.test(fa);
      const ariaLabel = getAttr(fa, 'aria-label');
      const label = labelMap.get(id) || labelMap.get(name) || ariaLabel || "";
      fields.push({
        kind: 'textarea',
        type: 'textarea',
        name,
        label,
        placeholder: placeholder.substring(0, 80),
        required,
        hasInlineLabel: !label && !!placeholder,
        hasValidationPattern: false,
        hasAriaLabel: !!ariaLabel
      });
    }

    // <select>
    const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    while ((fm = selRe.exec(inner)) !== null) {
      const fa = fm[1] || "";
      const optionsHtml = fm[2] || "";
      const name = getAttr(fa, 'name') || "";
      const id = getAttr(fa, 'id') || "";
      const required = /\brequired\b/i.test(fa);
      const ariaLabel = getAttr(fa, 'aria-label');
      const label = labelMap.get(id) || labelMap.get(name) || ariaLabel || "";
      const optionCount = (optionsHtml.match(/<option\b/gi) || []).length;
      fields.push({
        kind: 'select',
        type: 'select',
        name,
        label,
        placeholder: "",
        required,
        hasInlineLabel: false,
        hasValidationPattern: false,
        hasAriaLabel: !!ariaLabel,
        optionCount
      });
    }

    forms.push({
      action: action ? normalizeUrl(action, baseUrl) || action : "",
      method,
      id: formId,
      name: formName,
      fields,
      fieldCount: fields.length,
      requiredCount: fields.filter(f => f.required).length,
      hasInlineLabels: fields.some(f => f.hasInlineLabel),
      hasAnyValidation: fields.some(f => f.hasValidationPattern)
    });
  }
  return forms;
}

// ─── parseSitemap ────────────────────────────────────────────
// Extracts <loc>URL</loc> values from sitemap.xml or sitemap-index.xml.
// Returns { urls: [...], sitemaps: [...] } so callers can recurse into
// nested sitemap indexes.
export function parseSitemap(xmlText) {
  if (!xmlText) return { urls: [], sitemaps: [] };

  const urls = [];
  const sitemaps = [];

  // Inside <sitemap>…</sitemap> blocks the <loc> points to another sitemap.
  const sitemapBlockRe = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi;
  let m;
  const sitemapBlocks = [];
  while ((m = sitemapBlockRe.exec(xmlText)) !== null) {
    sitemapBlocks.push(m[1]);
    const locRe = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let lm;
    while ((lm = locRe.exec(m[1])) !== null) {
      sitemaps.push(decodeHtmlEntities(lm[1].trim()));
    }
  }

  // <url><loc>…</loc></url> blocks contain page URLs.
  const urlBlockRe = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
  while ((m = urlBlockRe.exec(xmlText)) !== null) {
    const locRe = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let lm;
    while ((lm = locRe.exec(m[1])) !== null) {
      urls.push(decodeHtmlEntities(lm[1].trim()));
    }
  }

  // Fallback: if no explicit <url>/<sitemap> wrappers, take all <loc>s.
  if (urls.length === 0 && sitemaps.length === 0) {
    const locRe = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
    let lm;
    while ((lm = locRe.exec(xmlText)) !== null) {
      urls.push(decodeHtmlEntities(lm[1].trim()));
    }
  }

  return { urls, sitemaps };
}

// ─── isCrawlableUrl ──────────────────────────────────────────
// True if a URL is fair game for the discovery pipeline (HTML page,
// same origin, not a file asset).
export function isCrawlableUrl(url, baseOrigin) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (baseOrigin && u.origin !== baseOrigin) return false;
    if (FILE_EXT_RE.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

// ─── prioritizePages ─────────────────────────────────────────
// Re-orders discovered URLs so homepage comes first, then high-intent
// pages (contact/pricing/about/services/etc), then alphabetical.
const HIGH_INTENT_PATTERNS = [
  /\/contact(?:[/?#]|$)/i,
  /\/pricing(?:[/?#]|$)/i,
  /\/plans(?:[/?#]|$)/i,
  /\/about(?:[/?#]|$)/i,
  /\/services(?:[/?#]|$)/i,
  /\/products?(?:[/?#]|$)/i,
  /\/get[-_]?started(?:[/?#]|$)/i,
  /\/book(?:[/?#]|$)/i,
  /\/demo(?:[/?#]|$)/i,
  /\/quote(?:[/?#]|$)/i,
  /\/sign[-_]?up(?:[/?#]|$)/i,
  /\/signup(?:[/?#]|$)/i,
  /\/free[-_]?trial(?:[/?#]|$)/i,
];

export function prioritizePages(urls, baseUrl) {
  const baseOrigin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();
  const homepage = baseOrigin;

  const scored = urls.map(u => {
    let priority = 100;
    if (u === homepage || u === baseUrl || u === `${baseOrigin}/`) priority = 0;
    else {
      for (let i = 0; i < HIGH_INTENT_PATTERNS.length; i++) {
        if (HIGH_INTENT_PATTERNS[i].test(u)) {
          priority = 1 + i;
          break;
        }
      }
    }
    return { url: u, priority };
  });

  scored.sort((a, b) => a.priority - b.priority || a.url.localeCompare(b.url));
  return scored.map(s => s.url);
}

// ─── checkUrls (concurrency-limited HEAD checker) ────────────
// Returns [{ url, status, ok, redirected, finalUrl, error? }] for each
// input URL. Falls back from HEAD to GET-with-Range when HEAD is blocked
// (405 / 403 / network error), so servers that disallow HEAD don't show
// as false-positive "broken".
export async function checkUrls(urls, { concurrency = 10, timeoutMs = 5000 } = {}) {
  if (!urls || urls.length === 0) return [];
  const unique = [...new Set(urls.filter(u => u && /^https?:/i.test(u)))];

  const results = new Array(unique.length);
  let cursor = 0;

  async function checkOne(url) {
    const tryFetch = async (method) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const init = {
          method,
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GrowAgent-CRO-Audit/1.8)',
            ...(method === 'GET' ? { 'Range': 'bytes=0-1' } : {})
          }
        };
        const res = await fetch(url, init);
        return {
          status: res.status,
          ok: res.ok || res.status === 206,
          redirected: res.redirected,
          finalUrl: res.url || url
        };
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const headRes = await tryFetch('HEAD');
      // 405 / 403 / 501 often mean "HEAD not allowed" — retry with GET.
      if (headRes.status === 405 || headRes.status === 403 || headRes.status === 501) {
        try {
          const getRes = await tryFetch('GET');
          return { url, ...getRes };
        } catch {
          return { url, ...headRes };
        }
      }
      return { url, ...headRes };
    } catch (err) {
      // HEAD network-failed — try GET once more before flagging broken.
      try {
        const getRes = await tryFetch('GET');
        return { url, ...getRes };
      } catch (err2) {
        return { url, status: 0, ok: false, redirected: false, finalUrl: url, error: err2.message };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= unique.length) return;
      results[idx] = await checkOne(unique[idx]);
    }
  });

  await Promise.all(workers);
  return results;
}

// ─── detectCtaIssues ─────────────────────────────────────────
// Static rules that flag CTA/button problems without needing AI.
// Returns [{ page, severity, issue, evidence }].
export function detectCtaIssues(pageUrl, links, buttons) {
  const issues = [];

  // 1. Empty / "#" / javascript: hrefs that are visible CTAs.
  // Skip dropdown / sub-menu triggers — those use href="#" intentionally and
  // are handled by JS. Without this guard, every WordPress / Elementor /
  // Webflow nav menu lights up the audit with false positives.
  for (const l of links) {
    if (l.isEmpty && l.text && l.text.length > 0 && l.text.length < 80 && !l.isDropdownTrigger) {
      issues.push({
        page: pageUrl,
        severity: 'high',
        issue: 'Link has empty or "#" href',
        evidence: `"${l.text}" → "${l.href}"`
      });
    }
  }

  // 2. "Call Us" CTA that's NOT a tel: link (CXL: outcome must match label).
  for (const l of links) {
    if (l.isPhoneLabel && !l.isTel && !l.isEmpty) {
      issues.push({
        page: pageUrl,
        severity: 'high',
        issue: 'Phone-labeled CTA does not use tel: link',
        evidence: `"${l.text}" → ${l.href}`
      });
    }
  }

  // 3. Generic CTA copy (CXL: avoid Submit/Click Here/Buy Now/Send).
  for (const l of links.filter(l => l.isCta)) {
    if (l.isGenericCta) {
      issues.push({
        page: pageUrl,
        severity: 'medium',
        issue: 'Generic CTA copy — replace with outcome-led text',
        evidence: `"${l.text}"`
      });
    }
  }
  for (const b of buttons.filter(b => b.isCta)) {
    if (b.isGenericCta) {
      issues.push({
        page: pageUrl,
        severity: 'medium',
        issue: 'Generic button copy — replace with outcome-led text',
        evidence: `"${b.text}"`
      });
    }
  }

  return issues;
}
