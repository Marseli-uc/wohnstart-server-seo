const express = require("express");
const path = require("path");
const { getOrderBySessionId } = require("../db");
const { getEntitlement } = require("../entitlement");

const router = express.Router();

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
router.get("/download/:document", (req, res) => {
  let sessionId = req.query.session_id;
  const documentId = req.params.document;

  if (!sessionId) {
    // Fallback: the httpOnly order cookie set after a verified payment.
    const ent = getEntitlement(req);
    if (ent.active) sessionId = ent.sessionId;
  }

  if (!sessionId) {
    return res.status(400).send("session_id fehlt.");
  }

  const document = DOCUMENTS[documentId];

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
