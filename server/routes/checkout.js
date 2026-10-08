const express = require("express");
const Stripe = require("stripe");
const packages = require("../config/packages");
const { lookup, rateLimit } = require("../security");

const router = express.Router();

// Stops automated spamming of Stripe session creation. Far above normal use:
// a real customer starts checkout a handful of times at most.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Zu viele Zahlungsversuche in kurzer Zeit. Bitte warte einen Moment.",
});
const packagesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: "Zu viele Anfragen. Bitte warte einen Moment.",
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/create-checkout-session
 * Body: { packageId: "komplett" }
 *
 * Only packages marked `purchasable: true` in config/packages.js can be
 * bought (currently just WohnStart Komplett). The old STANDARD/PLUS/PREMIUM
 * entries stay in the config for existing orders but are rejected here.
 *
 * The frontend sends ONLY a package id — never a price or amount. This
 * route looks up the correct Stripe Price ID itself from environment
 * variables, so the amount actually charged can never be influenced by the
 * client (a modified request body cannot make this charge a different
 * amount).
 */
router.post("/create-checkout-session", checkoutLimiter, async (req, res) => {
  try {
    const { packageId } = req.body || {};
    const pkg = lookup(packages, packageId);

    if (!pkg || !pkg.purchasable) {
      return res.status(400).json({ error: "Unbekanntes Paket." });
    }

    const priceId = process.env[pkg.stripePriceEnvVar];
    if (!priceId) {
      console.error(
        `Missing environment variable ${pkg.stripePriceEnvVar} for package "${packageId}". ` +
          "Set it to the Stripe Price ID created in the Dashboard (see README)."
      );
      return res.status(500).json({ error: "Zahlung ist derzeit nicht verfügbar." });
    }

    if (!process.env.BASE_URL) {
      console.error("Missing BASE_URL environment variable.");
      return res.status(500).json({ error: "Server ist nicht korrekt konfiguriert." });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.BASE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/cancel.html`,
      // metadata.package_id is what the webhook uses to record which
      // package was purchased — it comes from OUR lookup above, not from
      // anything the client could tamper with after the fact.
      metadata: { package_id: pkg.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating checkout session:", err);
    res.status(500).json({ error: "Checkout konnte nicht gestartet werden." });
  }
});

/**
 * GET /api/packages
 * Display data for the packages that can currently be bought. The price is
 * read from the Stripe Price object itself (cached for 10 minutes), so the
 * page always shows exactly what Stripe will charge. If Stripe can't be
 * reached, the fallback `displayPrice` from config/packages.js is returned
 * with `priceSource: "fallback"`.
 */
const PRICE_CACHE_MS = 10 * 60 * 1000;
const priceCache = new Map(); // priceId -> { at, amount, currency }

function formatAmount(cents, currency) {
  const value = (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency.toUpperCase() === "EUR" ? value : `${value} ${currency.toUpperCase()}`;
}

async function livePrice(priceId) {
  const hit = priceCache.get(priceId);
  if (hit && Date.now() - hit.at < PRICE_CACHE_MS) return hit;
  const price = await stripe.prices.retrieve(priceId);
  if (typeof price.unit_amount !== "number") return null;
  const entry = { at: Date.now(), amount: price.unit_amount, currency: price.currency || "eur" };
  priceCache.set(priceId, entry);
  return entry;
}

router.get("/packages", packagesLimiter, async (req, res) => {
  const list = Object.values(packages).filter((p) => p.purchasable);
  const out = await Promise.all(
    list.map(async (pkg) => {
      const base = { id: pkg.id, name: pkg.name, features: pkg.features, aiChecks: pkg.aiChecks };
      const priceId = process.env[pkg.stripePriceEnvVar];
      if (priceId && process.env.STRIPE_SECRET_KEY) {
        try {
          const p = await livePrice(priceId);
          if (p) return { ...base, price: formatAmount(p.amount, p.currency), priceSource: "stripe" };
        } catch (err) {
          console.warn(`[packages] Could not read Stripe price for ${pkg.id}: ${err.message}`);
        }
      }
      return { ...base, price: pkg.displayPrice, priceSource: "fallback" };
    })
  );
  res.set("Cache-Control", "no-store");
  res.json({ packages: out });
});

module.exports = router;
