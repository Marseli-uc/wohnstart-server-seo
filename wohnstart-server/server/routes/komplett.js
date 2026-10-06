const express = require("express");
const { getEntitlement, requireKomplett } = require("../entitlement");
const { generateDocument, DocumentInputError } = require("../services/document-generator");

const router = express.Router();

/*
 * WohnStart Komplett API
 *   GET  /api/entitlement          → { komplett: bool, packageName }
 *   POST /api/documents/generate   → PDF (WohnStart Komplett only)
 *        body: { type: "mieterselbstauskunft" | "anschreiben" | "deckblatt", profile: {...}, extra: {...} }
 *
 * Personal data arrives with the request, is turned into a PDF and is not
 * stored anywhere on the server. The saved "Meine Angaben" live in the
 * customer's own browser (see public/js/komplett.js).
 */

router.use(["/entitlement", "/documents"], (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/entitlement", (req, res) => {
  const ent = getEntitlement(req);
  res.json({ komplett: ent.active, packageName: ent.active ? ent.packageName : null });
});

// Light abuse protection for PDF generation (per IP, in memory).
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 120;
const hits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
}, WINDOW_MS).unref();

router.post("/documents/generate", requireKomplett, async (req, res) => {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ error: "Bitte warte etwas, bevor du weitere Dokumente erstellst.", code: "rate_limited" });
  }
  list.push(now);
  hits.set(req.ip, list);

  const { type, profile, extra } = req.body || {};
  try {
    const { bytes, filename } = await generateDocument(type, profile, extra);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.set("X-Content-Type-Options", "nosniff");
    res.send(bytes);
  } catch (e) {
    if (e instanceof DocumentInputError) return res.status(400).json({ error: e.message, code: "invalid_input" });
    console.error("[documents] generation failed:", e && e.message);
    res.status(500).json({ error: "Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.", code: "internal" });
  }
});

module.exports = router;
