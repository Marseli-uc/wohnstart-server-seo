/**
 * Shared security helpers. Added by the security audit — no business logic here.
 *
 * Everything in this file is deliberately additive: it hardens how requests are
 * handled without changing any existing route behaviour, price, payment flow or
 * page design.
 *
 * Relevant .env settings (all optional, safe defaults):
 *   TRUST_PROXY=1            set when running behind a reverse proxy / PaaS
 *                            (Render, Railway, Fly, nginx, Cloudflare …) so that
 *                            req.ip is the real visitor and cookies get "Secure".
 *   FORCE_SECURE_COOKIES=true force the Secure cookie flag (HTTPS-only sites).
 *   CSP_REPORT_ONLY=true     run the Content-Security-Policy in report-only mode
 *                            (use while testing a stricter policy).
 *   DISABLE_CSP=true         emergency switch if the CSP ever breaks a page.
 */

const helmet = require("helmet");

/* ------------------------------------------------------------------ *
 * 1. Safe object lookup
 * ------------------------------------------------------------------ */

/**
 * Look a user-supplied key up in a plain object WITHOUT hitting inherited
 * properties. `obj["constructor"]` / `obj["__proto__"]` return truthy values
 * that pass a naive `if (!found) return 404` guard and then blow up later.
 */
function lookup(obj, key) {
  if (typeof key !== "string") return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

/* ------------------------------------------------------------------ *
 * 2. Identifier validation
 * ------------------------------------------------------------------ */

/** Stripe Checkout Session IDs, e.g. cs_test_a1B2… / cs_live_… */
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;
const isSessionId = (v) => typeof v === "string" && SESSION_ID_RE.test(v);

/* ------------------------------------------------------------------ *
 * 3. Cookies
 * ------------------------------------------------------------------ */

/**
 * Secure cookie options. `req.secure` only reports the truth once Express
 * trusts the proxy (see TRUST_PROXY), so FORCE_SECURE_COOKIES is available as
 * an explicit override for HTTPS-only deployments.
 */
function secureCookieOptions(req, maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(req.secure) || process.env.FORCE_SECURE_COOKIES === "true",
    maxAge: maxAgeMs,
    path: "/",
  };
}

/* ------------------------------------------------------------------ *
 * 4. Rate limiting
 * ------------------------------------------------------------------ */

/**
 * Small in-memory per-IP limiter (same approach already used by the AI check
 * and PDF generation routes, kept dependency-free).
 *
 * NOTE: in-memory means per process. If you ever run several instances, move
 * this to a shared store (Redis) or your proxy's rate limiting.
 */
function rateLimit({ windowMs, max, message, code = "rate_limited" }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, list] of hits) {
      const fresh = list.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, Math.min(windowMs, 10 * 60 * 1000));
  if (timer.unref) timer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const key = req.ip || "unknown";
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => t > now - windowMs);
    if (list.length >= max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: message, code });
    }
    list.push(now);
    hits.set(key, list);
    next();
  };
}

/* ------------------------------------------------------------------ *
 * 5. Security headers
 * ------------------------------------------------------------------ */

/**
 * Content-Security-Policy tuned to what the site actually loads today:
 *   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
 *   - Tailwind Play CDN (cdn.tailwindcss.com)
 *
 * 'unsafe-inline' and 'unsafe-eval' are included ON PURPOSE: the pages use
 * inline <script> blocks, ~22 inline onclick= handlers and many inline
 * style="" attributes, and the Tailwind Play CDN compiles CSS at runtime.
 * Removing them would break the site.
 *
 * Even so this policy is a real improvement: it restricts WHERE scripts,
 * styles, images, fonts and network calls may come from or go to (blocking
 * exfiltration to an attacker-controlled domain) and forbids framing the site.
 *
 * To tighten later: replace the inline onclick= handlers with addEventListener,
 * move the inline <script> blocks into files, build Tailwind ahead of time,
 * then drop 'unsafe-inline'/'unsafe-eval'. Test with CSP_REPORT_ONLY=true first.
 */
function contentSecurityPolicy() {
  return {
    useDefaults: false,
    reportOnly: process.env.CSP_REPORT_ONLY === "true",
    directives: {
      "default-src": ["'self'"],
      "base-uri": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"], // clickjacking
      "form-action": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:", "blob:"],
      "connect-src": ["'self'"],
      "frame-src": ["'none'"],
      "worker-src": ["'self'", "blob:"],
      "manifest-src": ["'self'"],
      "upgrade-insecure-requests": [],
    },
  };
}

/** Applies helmet with a configuration that does not break the existing site. */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: process.env.DISABLE_CSP === "true" ? false : contentSecurityPolicy(),
    // Stripe Checkout is a full-page redirect (not an embed), so a strict
    // cross-origin opener policy is safe; COEP stays off because it would
    // block the Google Fonts / Tailwind CDN resources.
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    // 180 days. Only sent over HTTPS; harmless on http://localhost.
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
    frameguard: { action: "deny" },
    noSniff: true,
    xPoweredBy: false,
  });
}

/* ------------------------------------------------------------------ *
 * 6. Error handling
 * ------------------------------------------------------------------ */

const wantsJson = (req) =>
  req.path.startsWith("/api/") ||
  req.path.startsWith("/webhook") ||
  (req.get("accept") || "").includes("application/json");

/** 404 for unknown /api routes (static files are handled before this). */
function notFoundHandler(req, res, next) {
  if (!wantsJson(req)) return next();
  res.status(404).json({ error: "Nicht gefunden.", code: "not_found" });
}

/**
 * Last-resort error handler. Express's built-in one returns a full stack trace
 * including absolute filesystem paths — this replaces it with a safe message
 * while the details stay in the server log.
 */
function errorHandler(err, req, res, next) {
  // Malformed JSON body (express.json throws this) is a client error.
  const isBadJson = err && err.type === "entity.parse.failed";
  const isTooLarge = err && (err.type === "entity.too.large" || err.status === 413);
  const status = isBadJson ? 400 : isTooLarge ? 413 : err && err.status >= 400 && err.status < 500 ? err.status : 500;

  if (status >= 500) {
    // Log the message and stack for ourselves; never send them to the client.
    console.error(`[error] ${req.method} ${req.originalUrl}:`, (err && err.stack) || err);
  } else {
    console.warn(`[error] ${req.method} ${req.originalUrl}: ${status} ${(err && err.message) || ""}`);
  }

  if (res.headersSent) return next(err);

  const message = isBadJson
    ? "Ungültige Anfrage."
    : isTooLarge
      ? "Die Anfrage ist zu groß."
      : status >= 500
        ? "Es ist ein Fehler aufgetreten. Bitte versuche es erneut."
        : "Ungültige Anfrage.";

  if (wantsJson(req)) return res.status(status).json({ error: message, code: "error" });
  res.status(status).type("text/plain; charset=utf-8").send(message);
}

/* ------------------------------------------------------------------ *
 * 7. Startup checks (warnings only — never blocks the server)
 * ------------------------------------------------------------------ */

function warnAboutConfiguration() {
  const base = process.env.BASE_URL || "";
  const isHttps = base.startsWith("https://");

  if (isHttps && !process.env.TRUST_PROXY && process.env.FORCE_SECURE_COOKIES !== "true") {
    console.warn(
      "⚠️  BASE_URL is https but TRUST_PROXY is not set. Behind a reverse proxy this means " +
        "rate limits count every visitor as the same IP and cookies are not marked Secure. " +
        "Set TRUST_PROXY=1 (see .env.example)."
    );
  }
  if (process.env.NODE_ENV !== "production" && isHttps) {
    console.warn("⚠️  NODE_ENV is not \"production\" on a live URL. Set NODE_ENV=production in your deployment.");
  }
  if (process.env.DISABLE_CSP === "true") {
    console.warn("⚠️  DISABLE_CSP=true — the Content-Security-Policy is switched off.");
  }
}

module.exports = {
  lookup,
  SESSION_ID_RE,
  isSessionId,
  secureCookieOptions,
  rateLimit,
  securityHeaders,
  notFoundHandler,
  errorHandler,
  warnAboutConfiguration,
};
