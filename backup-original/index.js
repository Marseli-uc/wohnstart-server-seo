require("dotenv").config();
const express = require("express");
const path = require("path");

const downloadRoutes = require("./routes/downloads");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhook");
const orderRoutes = require("./routes/orders");
const aiCheckRoutes = require("./routes/ai-check");
const komplettRoutes = require("./routes/komplett");

const app = express();

// IMPORTANT: mounted BEFORE express.json() below. Stripe webhook signature
// verification needs the raw, unparsed request body — if express.json()
// ran first, the body would already be parsed/re-serialized and signature
// verification would fail.
app.use("/webhook", webhookRoutes);

app.use(express.json());
app.use("/api", checkoutRoutes);
app.use("/api", orderRoutes);
app.use("/api", downloadRoutes);
// KI-Dokumenten-Check (multipart uploads are parsed inside the route, in memory only)
app.use("/api", aiCheckRoutes);
// WohnStart Komplett: entitlement + automatic document generation
app.use("/api", komplettRoutes);

// Serves index.html, success.html, cancel.html, and all static assets.
app.use(express.static(path.join(__dirname, "..", "public")));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WohnStart server running at http://localhost:${PORT}`);
});
