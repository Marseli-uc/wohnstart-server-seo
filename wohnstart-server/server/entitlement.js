/**
 * WohnStart Komplett entitlement.
 *
 * Access is unlocked ONLY by a paid order row that the signature-verified
 * Stripe webhook wrote (server/routes/webhook.js). The browser is linked to
 * that order through the existing httpOnly "ws_order" cookie, which
 * /api/order-status sets once the success/account page has confirmed the
 * payment (server/routes/orders.js → setPaidAccessCookie). JavaScript can't
 * read or forge it into a paid order: every request re-checks the database.
 */
const { getOrderBySessionId } = require("./db");
const packages = require("./config/packages");
const { lookup } = require("./security");

const ORDER_COOKIE = "ws_order";
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/** Returns { active, packageId, packageName, sessionId } for this request. */
function getEntitlement(req) {
  const sid = readCookie(req, ORDER_COOKIE);
  if (!sid || !SESSION_ID_RE.test(sid)) return { active: false };
  const row = getOrderBySessionId(sid);
  if (!row || row.payment_status !== "paid") return { active: false };
  const pkg = lookup(packages, row.package);
  if (!pkg || !pkg.grantsKomplett) return { active: false };
  return { active: true, packageId: pkg.id, packageName: pkg.name, sessionId: sid };
}

/** Express middleware: 402 unless the browser has a paid WohnStart Komplett order. */
function requireKomplett(req, res, next) {
  const ent = getEntitlement(req);
  if (!ent.active) {
    return res.status(402).json({
      error: "Diese Funktion ist Teil von WohnStart Komplett. Bitte schalte WohnStart Komplett frei.",
      code: "komplett_required",
    });
  }
  req.entitlement = ent;
  next();
}

module.exports = { getEntitlement, requireKomplett, SESSION_ID_RE };
