const express = require("express");
const Stripe = require("stripe");
const { upsertOrderFromSession } = require("../db");

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /webhook
 *
 * This is the ONLY place that ever marks an order as paid. The success
 * page never grants access on its own — it just displays whatever this
 * webhook has already verified and stored (see routes/orders.js).
 *
 * IMPORTANT: this route must receive the RAW request body, not
 * JSON-parsed, because Stripe's signature is computed over the raw bytes.
 * That's why it's mounted before `express.json()` in server/index.js, and
 * why `express.raw()` is used here instead of the global JSON parser.
 */
router.post("/", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // Signature invalid or missing — reject. Do NOT process the payload.
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // upsertOrderFromSession keys off the unique stripe_checkout_session_id,
  // so Stripe redelivering the same event (which it does routinely for
  // reliability) is handled safely — it just re-applies the same state.
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      upsertOrderFromSession(session);
      break;
    }
    default:
      // Other event types are ignored. Add cases above if you need them
      // (e.g. charge.refunded to revoke access on a refund).
      break;
  }

  res.json({ received: true });
});

module.exports = router;
