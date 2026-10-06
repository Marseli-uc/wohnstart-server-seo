const express = require("express");
const { getOrderBySessionId } = require("../db");
const packages = require("../config/packages");
const { setPaidAccessCookie } = require("./ai-check");

const router = express.Router();

/**
 * GET /api/order-status?session_id=cs_test_...
 *
 * The success page calls this to find out whether a payment actually went
 * through. It reads ONLY from the database row written by the verified
 * webhook (see routes/webhook.js) — reaching this endpoint or the success
 * page itself never grants access on its own.
 *
 * The Stripe Checkout Session ID is unguessable and only known to the
 * customer who completed that specific checkout (Stripe puts it in the
 * redirect URL), so it functions as a reasonable access token for this
 * single read-only lookup. If you add user accounts later, also check that
 * the requesting user owns this order before returning it.
 */
router.get("/order-status", (req, res) => {
  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).json({ error: "session_id fehlt." });
  }

  const order = getOrderBySessionId(session_id);

  if (!order) {
    // Normal race condition: the customer can land on the success page
    // slightly before Stripe's webhook has reached us. Report "pending",
    // not an error — the frontend polls briefly to cover this.
    return res.json({ status: "pending" });
  }

  const pkg = packages[order.package];

  // Unlock the package's KI-Dokumenten-Check allowance in this browser.
  if (order.payment_status === "paid") setPaidAccessCookie(req, res, session_id);

  res.json({
    status: order.payment_status === "paid" ? "paid" : "pending",
    package: order.package,
    packageName: pkg ? pkg.name : order.package,
    features: pkg ? pkg.features : [],
    amount: order.amount,
    currency: order.currency,
    email: order.customer_email,
  });
});

module.exports = router;
