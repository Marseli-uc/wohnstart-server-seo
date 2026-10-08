const express = require("express");
const multer = require("multer");
const { analyzePdf, isConfigured, AiCheckError } = require("../services/ai-document-check");
const crypto = require("crypto");
const packages = require("../config/packages");
const { lookup, secureCookieOptions } = require("../security");
const {
  getOrderBySessionId,
  getFreeUsed, reserveFreeCheck, refundFreeCheck,
  getPaidUsed, reservePaidCheck, refundPaidCheck,
} = require("../db");

const router = express.Router();

/*
 * KI-Dokumenten-Check API
 *   GET  /api/ai-check/status   → { available }
 *   POST /api/ai-check/analyze  → multipart field "file" (one PDF)
 *
 * Open to all visitors (no access links). Cost and abuse are controlled by
 * per-IP limits and a global concurrency cap, configurable in .env:
 *   AI_CHECK_DAILY_LIMIT   analyses per IP per 24 h   (default 20)
 *   AI_CHECK_MAX_PARALLEL  analyses running at once   (default 4)
 */

const MAX_PDF_BYTES = 15 * 1024 * 1024; // base64 stays well under Anthropic's 32 MB request limit
const MAX_PDF_PAGES = 30;
const DAILY_LIMIT = parseInt(process.env.AI_CHECK_DAILY_LIMIT, 10) || 20;
const MAX_PARALLEL = parseInt(process.env.AI_CHECK_MAX_PARALLEL, 10) || 4;

// PDF stays in memory only; never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 2 },
});

router.use("/ai-check", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  next();
});

/* ---------------- limits ---------------- */
const DAY_MS = 24 * 60 * 60 * 1000;
const BURST_MS = 60 * 1000;
const BURST_MAX = 5;
const hits = new Map(); // ip -> timestamps of successful starts
function overLimit(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < DAY_MS);
  hits.set(ip, list);
  if (list.length >= DAILY_LIMIT) return "day";
  if (list.filter((t) => now - t < BURST_MS).length >= BURST_MAX) return "burst";
  return null;
}
function recordHit(ip) { hits.get(ip).push(Date.now()); }
function refundHit(ip) { const l = hits.get(ip); if (l && l.length) l.pop(); }
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < DAY_MS)) hits.delete(ip);
}, 60 * 60 * 1000).unref();
let running = 0;

/* ---------------- helpers ---------------- */
const isPdf = (buf) => buf.length > 5 && buf.slice(0, 5).toString("latin1") === "%PDF-";
// Scan at most 4 MB: enough to count pages, and avoids turning a 15 MB upload
// into a 15 MB string on every request.
function roughPageCount(buf) {
  const m = buf.slice(0, 4 * 1024 * 1024).toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g);
  return m ? m.length : 0;
}
const todayBerlin = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());

/* ---------------- routes ---------------- */
/* ---------------- usage limits (2 free checks + package allowance) ----------------
 * Enforced here on the server; the browser only displays the numbers.
 * Free checks are counted per visitor across two identities: a random ID in
 * an httpOnly cookie (JavaScript can't read or change it) and a hash of the
 * IP address. The higher count applies, so clearing browser storage or
 * cookies does not reset the free checks. Paid allowance comes from the
 * existing orders table (webhook-confirmed "paid" rows only) and
 * packages.js → aiChecks; the order is remembered in an httpOnly cookie
 * that is set when the success/account page confirms the payment.
 */
const FREE_CHECKS = 2;
const VISITOR_COOKIE = "ws_vid";
const ORDER_COOKIE = "ws_order";
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
// Secure flag needs TRUST_PROXY (or FORCE_SECURE_COOKIES) behind a proxy.
function cookieOptions(req) {
  return secureCookieOptions(req, COOKIE_MAX_AGE);
}
function ipKey(ip) {
  let a = String(ip || "").replace(/^::ffff:/, "");
  if (a.indexOf(":") !== -1) a = a.split(":").slice(0, 4).join(":"); // IPv6: one household = one /64
  return "ip:" + crypto.createHash("sha256").update("wohnstart-ai-free:" + a).digest("hex").slice(0, 32);
}

/** Called by routes/orders.js once a payment is confirmed as paid. */
function setPaidAccessCookie(req, res, sessionId) {
  res.cookie(ORDER_COOKIE, sessionId, cookieOptions(req));
}

function identify(req, res) {
  let vid = readCookie(req, VISITOR_COOKIE);
  if (!vid || !/^[a-f0-9]{32}$/.test(vid)) {
    vid = crypto.randomBytes(16).toString("hex");
    res.cookie(VISITOR_COOKIE, vid, cookieOptions(req));
  }
  let order = null;
  const sid = readCookie(req, ORDER_COOKIE);
  if (sid && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sid)) {
    const row = getOrderBySessionId(sid);
    const pkg = row && row.payment_status === "paid" ? lookup(packages, row.package) : null;
    if (pkg && pkg.aiChecks > 0) order = { sessionId: sid, packageName: pkg.name, limit: pkg.aiChecks };
  }
  return { keys: ["v:" + vid, ipKey(req.ip)], order };
}

function usageFor(ident) {
  const freeUsed = Math.min(getFreeUsed(ident.keys), FREE_CHECKS);
  const free = { limit: FREE_CHECKS, used: freeUsed, remaining: FREE_CHECKS - freeUsed };
  let paid = null;
  if (ident.order) {
    const used = Math.min(getPaidUsed(ident.order.sessionId), ident.order.limit);
    paid = { packageName: ident.order.packageName, limit: ident.order.limit, used, remaining: ident.order.limit - used };
  }
  return { free, paid, remaining: free.remaining + (paid ? paid.remaining : 0) };
}

// Free checks are used first, then the package allowance.
function reserveCheck(ident) {
  if (reserveFreeCheck(ident.keys, FREE_CHECKS)) return "free";
  if (ident.order && reservePaidCheck(ident.order.sessionId, ident.order.limit)) return "paid";
  return null;
}
function releaseCheck(ident, source) {
  if (source === "free") refundFreeCheck(ident.keys);
  if (source === "paid") refundPaidCheck(ident.order.sessionId);
}
function limitReached(ident) {
  const usage = usageFor(ident);
  return {
    error: usage.paid
      ? "Die KI-Prüfungen deines Pakets sind aufgebraucht."
      : "Deine 2 kostenlosen Prüfungen sind aufgebraucht.",
    code: "limit_reached",
    usage,
  };
}

router.get("/ai-check/status", (req, res) => {
  res.json({ available: isConfigured(), maxBytes: MAX_PDF_BYTES, usage: usageFor(identify(req, res)) });
});

router.post("/ai-check/analyze", (req, res) => {
  if (!isConfigured()) {
    return res.status(503).json({ error: "Der KI-Dokumenten-Check ist gerade nicht verfügbar.", code: "not_configured" });
  }
  const limit = overLimit(req.ip);
  if (limit) {
    return res.status(429).json({
      error: limit === "day"
        ? "Du hast heute schon viele Dokumente prüfen lassen. Bitte versuche es morgen wieder."
        : "Bitte warte kurz, bevor du das nächste Dokument prüfst.",
      code: "rate_limited",
    });
  }
  // Refuse before the upload if nothing is left (re-checked atomically below).
  const ident = identify(req, res);
  if (usageFor(ident).remaining < 1) return res.status(402).json(limitReached(ident));

  upload.single("file")(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? "Die Datei ist zu groß. Maximal 15 MB sind erlaubt." : "Die Datei konnte nicht hochgeladen werden.",
        code: tooBig ? "too_large" : "upload_failed",
      });
    }
    const file = req.file;
    if (!file || !file.buffer || !file.buffer.length) {
      return res.status(400).json({ error: "Es wurde keine Datei empfangen. Bitte wähle eine PDF-Datei aus.", code: "no_file" });
    }
    // Trust the bytes, not the file name or browser-provided type.
    if (!isPdf(file.buffer)) {
      return res.status(415).json({ error: "Das ist keine gültige PDF-Datei. Bitte lade eine PDF hoch.", code: "not_pdf" });
    }
    if (roughPageCount(file.buffer) > MAX_PDF_PAGES) {
      return res.status(400).json({ error: `Die PDF hat mehr als ${MAX_PDF_PAGES} Seiten. Bitte lade nur die relevanten Seiten hoch.`, code: "too_many_pages" });
    }
    if (running >= MAX_PARALLEL) {
      return res.status(503).json({ error: "Gerade werden viele Dokumente geprüft. Bitte versuche es in einer Minute erneut.", code: "busy" });
    }

    // Reserve one check before calling the AI; given back below if anything fails.
    const source = reserveCheck(ident);
    if (!source) return res.status(402).json(limitReached(ident));

    running++;
    recordHit(req.ip);
    try {
      const result = await analyzePdf(file.buffer, todayBerlin());
      res.json({ result, usage: usageFor(ident) });
    } catch (e) {
      releaseCheck(ident, source); // failed analyses never count
      // Failures caused by our side or the provider don't count against the user's limit.
      if (!(e instanceof AiCheckError) || e.httpStatus >= 500) refundHit(req.ip);
      if (e instanceof AiCheckError) return res.status(e.httpStatus).json({ error: e.userMessage, code: e.code });
      console.error("[ai-check] unexpected error:", e && e.message);
      res.status(500).json({ error: "Die Analyse konnte nicht durchgeführt werden. Bitte versuche es erneut.", code: "internal" });
    } finally {
      running--;
      file.buffer = null;
    }
  });
});

module.exports = router;
module.exports.setPaidAccessCookie = setPaidAccessCookie;
