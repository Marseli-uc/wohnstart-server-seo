require("dotenv").config();
const express = require("express");
const path = require("path");

const downloadRoutes = require("./routes/downloads");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhook");
const orderRoutes = require("./routes/orders");
const aiCheckRoutes = require("./routes/ai-check");
const komplettRoutes = require("./routes/komplett");
const security = require("./security");
const { createSeoRouter, warnAboutSeoConfiguration } = require("./seo");

const app = express();

/* ---------------- security (added by the security audit) ----------------
 * Set TRUST_PROXY=1 when running behind a reverse proxy / PaaS so that
 * req.ip is the real visitor (per-IP rate limits) and req.secure is correct
 * (Secure cookies). Left off by default so local development is unchanged.
 */
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY;
  app.set("trust proxy", /^\d+$/.test(v) ? parseInt(v, 10) : v === "true" ? 1 : v);
}
app.disable("x-powered-by");
app.use(security.securityHeaders());

// IMPORTANT: mounted BEFORE express.json() below. Stripe webhook signature
// verification needs the raw, unparsed request body — if express.json()
// ran first, the body would already be parsed/re-serialized and signature
// verification would fail.
app.use("/webhook", webhookRoutes);

app.use(express.json({ limit: "200kb" }));
app.use("/api", checkoutRoutes);
app.use("/api", orderRoutes);
app.use("/api", downloadRoutes);
// KI-Dokumenten-Check (multipart uploads are parsed inside the route, in memory only)
app.use("/api", aiCheckRoutes);
// WohnStart Komplett: entitlement + automatic document generation
app.use("/api", komplettRoutes);

// SEO layer: crawlable content pages, robots.txt, sitemap.xml, favicon and the
// metadata injected into index.html. Mounted BEFORE express.static so that "/"
// is served with its canonical/OG/JSON-LD tags. Purely additive — it does not
// touch the app's own routing, Stripe, PDFs or the calculator.
app.use(createSeoRouter(express));

// Serves index.html, success.html, cancel.html, and all static assets.
app.use(
  express.static(path.join(__dirname, "..", "public"), {
    dotfiles: "ignore", // never serve .env-style files even if one is placed here
    redirect: false,
  })
);

// Unknown /api route → JSON 404 (static files are served above).
app.use(security.notFoundHandler);
// Last-resort handler: replaces Express's default stack-trace page.
app.use(security.errorHandler);

const requiredEnvVars = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "BASE_URL"];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn(
    `⚠️  Missing environment variables: ${missing.join(", ")}. ` +
      "The server will start, but checkout/webhook requests will fail until these are set. See .env.example."
  );
}

if (!process.env.STRIPE_PRICE_KOMPLETT) {
  console.warn(
    "⚠️  STRIPE_PRICE_KOMPLETT is not set. Buying WohnStart Komplett will fail until you create the product in Stripe and add its Price ID to .env. See README."
  );
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "⚠️  ANTHROPIC_API_KEY is not set. The KI-Dokumenten-Check will show as unavailable until it is configured. See .env.example."
  );
}

security.warnAboutConfiguration();
warnAboutSeoConfiguration();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WohnStart server running at http://localhost:${PORT}`);
});
