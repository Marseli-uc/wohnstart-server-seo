const express = require("express");
const path = require("path");
const { getOrderBySessionId } = require("../db");
const { getEntitlement } = require("../entitlement");
const { lookup, isSessionId, rateLimit } = require("../security");

const router = express.Router();

// Abuse protection: generous enough for real customers re-downloading their PDFs.
const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: "Zu viele Downloads in kurzer Zeit. Bitte warte einen Moment.",
});

// Blank templates (static PDFs in private/documents). Included in WohnStart
// Komplett; legacy package ids stay listed so existing customers keep access.
const DOCUMENTS = {
  mieterselbstauskunft: {
    file: "mieterselbstauskunft.pdf",
    packages: ["komplett", "standard", "plus", "premium"],
  },

  wohnungsbewerbung: {
    file: "wohnungsbewerbung-checkliste.pdf",
    packages: ["komplett", "standard", "plus", "premium"],
  },
};

/**
 * GET /api/download/:document?session_id=cs_...
 * GET /api/download/:document            (browser already unlocked via the ws_order cookie)
 */
router.get("/download/:document", downloadLimiter, (req, res) => {
  // Only accept a well-formed Stripe Checkout Session ID; anything else is
  // ignored so it never reaches the database lookup.
  let sessionId = isSessionId(req.query.session_id) ? req.query.session_id : null;
  const documentId = req.params.document;

  if (!sessionId) {
    // Fallback: the httpOnly order cookie set after a verified payment.
    const ent = getEntitlement(req);
    if (ent.active) sessionId = ent.sessionId;
  }

  if (!sessionId) {
    return res.status(400).send("session_id fehlt.");
  }

  // hasOwnProperty-safe: DOCUMENTS["constructor"] must not pass the 404 guard.
  const document = lookup(DOCUMENTS, documentId);

  if (!document) {
    return res.status(404).send("Dokument nicht gefunden.");
  }

  const order = getOrderBySessionId(sessionId);

  if (!order || order.payment_status !== "paid") {
    return res.status(403).send("Kein bezahlter Zugriff.");
  }

  if (!document.packages.includes(order.package)) {
    return res.status(403).send("Dieses Dokument ist in deinem Paket nicht enthalten.");
  }

  const filePath = path.join(
    __dirname,
    "..",
    "..",
    "private",
    "documents",
    document.file
  );

  return res.download(filePath, document.file);
});

module.exports = router;
