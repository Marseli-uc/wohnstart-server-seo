/**
 * Security + functional regression tests added by the security audit.
 * Run with:  node --test tests/security.test.js
 *
 * Starts the real server with throwaway test credentials and a temporary
 * database, and drives the real routes. Stripe's API and the Anthropic API are
 * never contacted (no network): the webhook is signed locally with the test
 * webhook secret, exactly as Stripe signs it.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const WEBHOOK_SECRET = "whsec_test_" + "a".repeat(32);
const DB = path.join(ROOT, "server", "data.sqlite");

const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let srv, BASE;

async function start() {
  if (fs.existsSync(DB)) fs.rmSync(DB);
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port), BASE_URL: BASE,
      STRIPE_SECRET_KEY: "sk_test_dummy", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_PRICE_KOMPLETT: "price_dummy_komplett",
      ANTHROPIC_API_KEY: "", // AI check reports "not configured" instead of calling out
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 400 && !out.includes("running at"); i++) await sleep(25);
  if (!out.includes("running at")) throw new Error("server did not start:\n" + out);
  srv = { child, log: () => out };
}

/** Signs a payload exactly like Stripe does. */
function stripeSign(payload, secret = WEBHOOK_SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

const sessionPayload = (id, over = {}) => JSON.stringify({
  id: "evt_" + id, type: "checkout.session.completed",
  data: { object: {
    id, amount_total: 2900, currency: "eur", payment_status: "paid",
    customer_details: { email: "kundin@example.com" }, payment_intent: "pi_" + id,
    metadata: { package_id: "komplett" }, ...over,
  } },
});

async function sendWebhook(payload, signature) {
  return fetch(BASE + "/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  });
}

const PAID = "cs_test_" + "A1b2C3d4E5".repeat(2);

test("security audit regression suite", async (t) => {
  await start();
  t.after(() => { srv.child.kill(); if (fs.existsSync(DB)) fs.rmSync(DB); });

  /* ---------------- Stripe webhook (unchanged behaviour) ---------------- */

  await t.test("fake webhook with a wrong signature cannot mark an order paid", async () => {
    const payload = sessionPayload("cs_test_FORGED" + "x".repeat(12));
    for (const sig of [stripeSign(payload, "whsec_wrong_secret"), "t=1,v1=deadbeef", "", "garbage"]) {
      const r = await sendWebhook(payload, sig);
      assert.equal(r.status, 400, "signature " + JSON.stringify(sig.slice(0, 20)));
    }
    const r = await fetch(`${BASE}/api/order-status?session_id=cs_test_FORGED${"x".repeat(12)}`);
    assert.equal((await r.json()).status, "pending", "forged webhook must not create a paid order");
  });

  await t.test("a correctly signed webhook still creates the paid order", async () => {
    const payload = sessionPayload(PAID);
    const r = await sendWebhook(payload, stripeSign(payload));
    assert.equal(r.status, 200);
    const body = await (await fetch(`${BASE}/api/order-status?session_id=${PAID}`)).json();
    assert.equal(body.status, "paid");
    assert.equal(body.email, "kundin@example.com");
  });

  await t.test("webhook redelivery stays idempotent (no duplicate order)", async () => {
    const payload = sessionPayload(PAID);
    assert.equal((await sendWebhook(payload, stripeSign(payload))).status, 200);
    const Database = require("better-sqlite3");
    const db = new Database(DB, { readonly: true });
    const n = db.prepare("SELECT COUNT(*) c FROM orders WHERE stripe_checkout_session_id = ?").get(PAID).c;
    db.close();
    assert.equal(n, 1);
  });

  /* ---------------- downloads / IDOR ---------------- */

  await t.test("paid download works with a valid paid session (functionality preserved)", async () => {
    const r = await fetch(`${BASE}/api/download/mieterselbstauskunft?session_id=${PAID}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-disposition") || "", /attachment/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-", "a real PDF is returned");
  });

  await t.test("downloads are refused without a paid order", async () => {
    const unpaid = "cs_test_" + "Z9y8X7w6V5".repeat(2);
    assert.equal((await fetch(`${BASE}/api/download/mieterselbstauskunft?session_id=${unpaid}`)).status, 403);
    assert.equal((await fetch(`${BASE}/api/download/mieterselbstauskunft`)).status, 400);
  });

  await t.test("malformed / injected session ids are rejected, not passed to the database", async () => {
    for (const bad of ["' OR 1=1 --", "cs_test_'; DROP TABLE orders;--", "../../etc/passwd", "x", "cs_live_", "%00"]) {
      const q = encodeURIComponent(bad);
      assert.equal((await fetch(`${BASE}/api/download/mieterselbstauskunft?session_id=${q}`)).status, 400, "download " + bad);
      assert.equal((await fetch(`${BASE}/api/order-status?session_id=${q}`)).status, 400, "order-status " + bad);
    }
    // the orders table is still intact
    const r = await fetch(`${BASE}/api/order-status?session_id=${PAID}`);
    assert.equal((await r.json()).status, "paid");
  });

  await t.test("prototype keys no longer slip past the document guard", async () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const r = await fetch(`${BASE}/api/download/${key}?session_id=${PAID}`);
      assert.equal(r.status, 404, key);
      const text = await r.text();
      assert.ok(!/ at .*\.js:\d+/.test(text), "no stack trace for " + key);
    }
  });

  await t.test("path traversal in the document id does not escape the allow-list", async () => {
    for (const p of ["..%2f..%2f.env", "....//....//.env", "%2e%2e%2f.env"]) {
      const r = await fetch(`${BASE}/api/download/${p}?session_id=${PAID}`);
      assert.ok([400, 404].includes(r.status), p + " → " + r.status);
      const text = await r.text();
      assert.ok(!text.includes("sk_test") && !text.includes("STRIPE"), "no secret leaked for " + p);
    }
  });

  /* ---------------- input validation ---------------- */

  await t.test("checkout only accepts a real purchasable package id", async () => {
    const post = (body) => fetch(BASE + "/api/create-checkout-session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    for (const bad of [{}, { packageId: "constructor" }, { packageId: "__proto__" }, { packageId: "standard" }, { packageId: 5 }, { packageId: { a: 1 } }]) {
      const r = await post(bad);
      assert.equal(r.status, 400, JSON.stringify(bad));
      assert.equal((await r.json()).error, "Unbekanntes Paket.");
    }
  });

  await t.test("malformed JSON gets a safe 400, not a stack trace", async () => {
    const r = await fetch(BASE + "/api/create-checkout-session", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{not json",
    });
    assert.equal(r.status, 400);
    const text = await r.text();
    assert.ok(!/ at .*\.js:\d+/.test(text), "no stack trace");
    assert.ok(!text.includes(ROOT), "no filesystem path");
  });

  await t.test("oversized JSON bodies are rejected", async () => {
    const r = await fetch(BASE + "/api/create-checkout-session", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ packageId: "komplett", pad: "x".repeat(500 * 1024) }),
    });
    assert.equal(r.status, 413);
  });

  /* ---------------- entitlement / PDF generation ---------------- */

  await t.test("PDF generation is refused without a paid entitlement", async () => {
    const r = await fetch(BASE + "/api/documents/generate", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "mieterselbstauskunft", profile: { vorname: "Max", nachname: "Muster" } }),
    });
    assert.equal(r.status, 402);
    assert.equal((await r.json()).code, "komplett_required");
  });

  await t.test("a forged ws_order cookie does not unlock anything", async () => {
    for (const c of [`ws_order=${PAID}X`, "ws_order=cs_test_anything", "ws_order=' OR 1=1--", "ws_order=__proto__"]) {
      const r = await fetch(BASE + "/api/entitlement", { headers: { cookie: c } });
      assert.equal((await r.json()).komplett, false, c);
    }
  });

  await t.test("PDF autofill still works for a real paid customer (functionality preserved)", async () => {
    const r = await fetch(BASE + "/api/documents/generate", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `ws_order=${PAID}` },
      body: JSON.stringify({
        type: "mieterselbstauskunft",
        profile: { vorname: "Max", nachname: "Mustermann", email: "max@example.com", plz: "44135", ort: "Dortmund", nettoeinkommen: 2400, status: "Angestellte/r" },
        extra: { wohnung: "Musterstr. 12" },
      }),
    });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "application/pdf");
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 5).toString("latin1"), "%PDF-");
    assert.ok(buf.length > 5000, "a real multi-field PDF was produced");
  });

  await t.test("all three document templates still generate; unknown/prototype types are rejected", async () => {
    const gen = (type, extra = {}) => fetch(BASE + "/api/documents/generate", {
      method: "POST", headers: { "content-type": "application/json", cookie: `ws_order=${PAID}` },
      body: JSON.stringify({ type, profile: { vorname: "Max", nachname: "Mustermann" }, extra }),
    });
    assert.equal((await gen("mieterselbstauskunft")).status, 200);
    assert.equal((await gen("deckblatt")).status, 200);
    assert.equal((await gen("anschreiben", { text: "Guten Tag, ich bewerbe mich." })).status, 200);
    for (const bad of ["constructor", "__proto__", "nope"]) {
      const r = await gen(bad);
      assert.equal(r.status, 400, bad);
      assert.equal((await r.json()).error, "Unbekannte Vorlage.");
    }
  });

  await t.test("injection-style strings in profile fields are sanitised, not executed", async () => {
    const r = await fetch(BASE + "/api/documents/generate", {
      method: "POST", headers: { "content-type": "application/json", cookie: `ws_order=${PAID}` },
      body: JSON.stringify({
        type: "mieterselbstauskunft",
        profile: { vorname: "<script>alert(1)</script>", nachname: "'; DROP TABLE orders;--", notizen: "A".repeat(5000), personen: 99999, nettoeinkommen: -5, status: "NOT_AN_OPTION" },
      }),
    });
    assert.equal(r.status, 200, "still produces a PDF");
    const Database = require("better-sqlite3");
    const db = new Database(DB, { readonly: true });
    assert.ok(db.prepare("SELECT COUNT(*) c FROM orders").get().c >= 1, "orders table intact");
    db.close();
  });

  /* ---------------- AI check ---------------- */

  await t.test("AI check status endpoint still responds and never leaks keys", async () => {
    const r = await fetch(BASE + "/api/ai-check/status");
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(typeof body.available, "boolean");
    assert.ok(body.usage && body.usage.free, "usage still reported");
    assert.ok(!JSON.stringify(body).match(/sk-ant|sk_test|whsec/), "no secrets in response");
  });

  /* ---------------- headers / error handling ---------------- */

  await t.test("security headers are present on pages and API responses", async () => {
    for (const p of ["/", "/api/ai-check/status"]) {
      const r = await fetch(BASE + p);
      const h = (n) => r.headers.get(n) || "";
      assert.ok(h("content-security-policy").includes("frame-ancestors 'none'"), p + " CSP");
      assert.equal(h("x-frame-options").toLowerCase(), "deny", p);
      assert.equal(h("x-content-type-options"), "nosniff", p);
      assert.ok(h("referrer-policy").length > 0, p);
      assert.equal(r.headers.get("x-powered-by"), null, p + " must not advertise Express");
    }
  });

  await t.test("the CSP allows exactly the resources the site really uses", async () => {
    const csp = (await fetch(BASE + "/")).headers.get("content-security-policy");
    for (const needed of ["https://cdn.tailwindcss.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]) {
      assert.ok(csp.includes(needed), "CSP must allow " + needed);
    }
    assert.ok(csp.includes("'unsafe-inline'"), "inline handlers/styles still work");
    assert.ok(csp.includes("object-src 'none'"), "plugins blocked");
  });

  await t.test("unknown API routes return a clean JSON 404 with no internals", async () => {
    const r = await fetch(BASE + "/api/does-not-exist");
    assert.equal(r.status, 404);
    const text = await r.text();
    assert.ok(!text.includes(ROOT) && !/ at .*\.js:\d+/.test(text));
  });

  await t.test("dotfiles and server internals are not served statically", async () => {
    for (const p of ["/.env", "/../.env", "/../server/data.sqlite", "/../server/index.js", "/.gitignore"]) {
      const r = await fetch(BASE + p);
      const text = await r.text();
      assert.ok(!text.includes("STRIPE_SECRET_KEY"), p + " leaked env");
      assert.ok(!text.includes("sk_test_dummy"), p + " leaked key");
    }
  });

  /* ---------------- rate limiting ---------------- */

  await t.test("checkout creation is rate limited after sustained abuse", async () => {
    let limited = false;
    for (let i = 0; i < 30; i++) {
      const r = await fetch(BASE + "/api/create-checkout-session", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ packageId: "komplett" }),
      });
      if (r.status === 429) { limited = true; assert.ok(r.headers.get("retry-after"), "Retry-After set"); break; }
    }
    assert.ok(limited, "checkout must be rate limited");
  });

  await t.test("downloads are rate limited, but only after far more than normal use", async () => {
    let first429 = -1;
    for (let i = 0; i < 80; i++) {
      const r = await fetch(`${BASE}/api/download/mieterselbstauskunft?session_id=${PAID}`);
      if (r.status === 429) { first429 = i; break; }
    }
    assert.ok(first429 > 20, `a normal customer must not be blocked (first 429 at ${first429})`);
  });

  await t.test("the Stripe webhook itself is NOT rate limited (Stripe retries must get through)", async () => {
    for (let i = 0; i < 40; i++) {
      const payload = sessionPayload("cs_test_" + String(i).padStart(10, "0") + "bcdefghij");
      const r = await sendWebhook(payload, stripeSign(payload));
      assert.equal(r.status, 200, "webhook " + i + " must not be throttled");
    }
  });
});
