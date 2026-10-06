/**
 * SEO tests + functional regression check.
 * Verifies the SEO layer AND that nothing it added broke the existing app.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DB = path.join(ROOT, "server", "data.sqlite");
const WEBHOOK_SECRET = "whsec_test_" + "a".repeat(32);
const DOMAIN = "https://wohnstart.example";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

let BASE, child;
const SLUGS = ["wohnungssuche", "wohnungsbewerbung", "mieterselbstauskunft", "keine-schufa", "mietpreis-rechner"];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const count = (html, re) => (html.match(re) || []).length;
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, ct: r.headers.get("content-type") || "", body: await r.text(), r }; };

test("SEO layer + existing functionality", async (t) => {
  if (fs.existsSync(DB)) fs.rmSync(DB);
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["server/index.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), BASE_URL: DOMAIN,
      STRIPE_SECRET_KEY: "sk_test_d", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_PRICE_KOMPLETT: "price_d", ANTHROPIC_API_KEY: "", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  for (let i = 0; i < 400 && !out.includes("running at"); i++) await sleep(25);
  assert.ok(out.includes("running at"), "server started:\n" + out);
  t.after(() => { child.kill(); if (fs.existsSync(DB)) fs.rmSync(DB); });

  /* ---------------- homepage ---------------- */

  await t.test("homepage: exactly one H1, SEO title, description, canonical, OG, JSON-LD", async () => {
    const { status, body } = await get("/");
    assert.equal(status, 200);
    assert.equal(count(body, /<h1\b/g), 1, "exactly one H1");
    assert.match(body, /<title>[^<]*Wohnungssuche in Deutschland[^<]*<\/title>/);
    assert.equal(count(body, /<title>/g), 1, "no duplicate title");
    assert.equal(count(body, /<meta name="description"/g), 1, "no duplicate description");
    assert.ok(body.includes(`<link rel="canonical" href="${DOMAIN}/"`), "canonical");
    for (const tag of ["og:title", "og:description", "og:url", "og:type", "og:site_name", "twitter:card"]) {
      assert.ok(body.includes(tag), "missing " + tag);
    }
    assert.ok(body.includes('rel="manifest"') && body.includes("favicon.svg"), "icons/manifest");
    assert.ok(!body.includes("og:image"), "no invented og:image when none is configured");
  });

  await t.test("homepage JSON-LD is valid and claims nothing false", async () => {
    const { body } = await get("/");
    const blocks = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length >= 1);
    for (const b of blocks) {
      const data = JSON.parse(b[1]); // throws if invalid
      assert.equal(data["@context"], "https://schema.org");
      const types = data["@graph"].map((n) => n["@type"]);
      assert.ok(types.includes("Organization") && types.includes("WebSite"));
      const s = JSON.stringify(data);
      assert.ok(!/aggregateRating|reviewCount|ratingValue|award/.test(s), "no fake ratings/awards");
    }
  });

  await t.test("/index.html redirects to / so the homepage has one URL", async () => {
    const r = await fetch(BASE + "/index.html", { redirect: "manual" });
    assert.equal(r.status, 301);
    assert.equal(r.headers.get("location"), "/");
  });

  /* ---------------- SEO content pages ---------------- */

  await t.test("all five SEO pages return 200 with unique title, description and one H1", async () => {
    const titles = new Set(), descs = new Set(), h1s = new Set();
    for (const slug of SLUGS) {
      const { status, body } = await get("/" + slug);
      assert.equal(status, 200, slug);
      assert.equal(count(body, /<h1\b/g), 1, slug + ": one H1");
      const title = body.match(/<title>([^<]*)<\/title>/)[1];
      const desc = body.match(/<meta name="description" content="([^"]*)"/)[1];
      const h1 = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
      assert.ok(title.length > 20 && title.length < 140, slug + " title length " + title.length);
      assert.ok(desc.length > 70 && desc.length < 190, slug + " desc length " + desc.length);
      titles.add(title); descs.add(desc); h1s.add(h1);
      assert.ok(body.includes(`<link rel="canonical" href="${DOMAIN}/${slug}"`), slug + " canonical");
      assert.ok(/<h2\b/.test(body), slug + " has H2s");
      assert.ok(body.includes('name="robots" content="index'), slug + " indexable");
    }
    assert.equal(titles.size, SLUGS.length, "titles unique");
    assert.equal(descs.size, SLUGS.length, "descriptions unique");
    assert.equal(h1s.size, SLUGS.length, "H1s unique");
  });

  await t.test("SEO pages carry real content, not thin filler", async () => {
    for (const slug of SLUGS) {
      const { body } = await get("/" + slug);
      const words = text(body).split(" ").length;
      assert.ok(words > 350, `${slug} has only ${words} words`);
      assert.ok(count(body, /<h2\b/g) >= 3, slug + " needs real structure");
    }
  });

  await t.test("SEO pages avoid guarantees and fabricated legal claims", async () => {
    const banned = [/garantiert eine Wohnung/i, /sicher akzeptiert/i, /Erfolgsgarantie/i, /zu 100 ?%/i, /gesetzlich vorgeschrieben, dass du/i];
    for (const slug of SLUGS) {
      const { body } = await get("/" + slug);
      const t2 = text(body);
      for (const re of banned) assert.ok(!re.test(t2), `${slug} contains banned claim ${re}`);
      assert.ok(/entscheidet der Vermieter|hängt vom|keine Rechtsberatung|Einzelfall|ohne Gewähr/i.test(t2), slug + " should qualify its claims");
    }
  });

  await t.test("JSON-LD on every SEO page is valid; FAQ markup matches visible questions", async () => {
    for (const slug of SLUGS) {
      const { body } = await get("/" + slug);
      const block = body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
      const data = JSON.parse(block);
      const graph = data["@graph"];
      const types = graph.map((n) => n["@type"]);
      assert.ok(types.includes("WebPage") && types.includes("BreadcrumbList"), slug);
      const faq = graph.find((n) => n["@type"] === "FAQPage");
      if (faq) {
        for (const q of faq.mainEntity) {
          assert.ok(body.includes(q.name.replace(/&/g, "&amp;")), `${slug}: FAQ "${q.name.slice(0, 40)}" must be visible on the page`);
          assert.ok(q.acceptedAnswer.text.length > 30, slug + " answer too short");
        }
      }
      assert.ok(!/aggregateRating|ratingValue|reviewCount/.test(block), slug + " no fake ratings");
    }
  });

  await t.test("internal linking: pages link to each other and into the app", async () => {
    for (const slug of SLUGS) {
      const { body } = await get("/" + slug);
      const links = [...body.matchAll(/href="\/([a-z-]*)"/g)].map((m) => m[1]);
      const others = SLUGS.filter((s) => s !== slug).filter((s) => links.includes(s));
      assert.ok(others.length >= 2, `${slug} links to only ${others.length} sibling pages`);
      assert.ok(body.includes('href="/"'), slug + " links home");
      assert.ok(/href="\/(#|mietpreis-rechner|wohnungsbewerbung)/.test(body), slug + " links into the funnel");
    }
  });

  await t.test("no internal link on an SEO page is broken", async () => {
    const seen = new Set();
    for (const slug of SLUGS) {
      const { body } = await get("/" + slug);
      for (const m of body.matchAll(/href="(\/[^"#]*)"/g)) seen.add(m[1]);
    }
    for (const href of seen) {
      const r = await fetch(BASE + href, { redirect: "manual" });
      assert.ok([200, 301].includes(r.status), `${href} returned ${r.status}`);
    }
  });

  /* ---------------- robots / sitemap ---------------- */

  await t.test("robots.txt allows the site, blocks private areas, points at the sitemap", async () => {
    const { status, body, ct } = await get("/robots.txt");
    assert.equal(status, 200);
    assert.match(ct, /text\/plain/);
    assert.ok(/^User-agent: \*/m.test(body) && /^Allow: \//m.test(body));
    assert.ok(!/^Disallow: \/$/m.test(body), "must never block the whole site");
    for (const p of ["/api/", "/webhook", "/success.html", "/account.html", "/cancel.html"]) {
      assert.ok(body.includes("Disallow: " + p), "should block " + p);
    }
    assert.ok(body.includes(`Sitemap: ${DOMAIN}/sitemap.xml`));
  });

  await t.test("sitemap.xml is valid, uses BASE_URL and exposes nothing private", async () => {
    const { status, body, ct } = await get("/sitemap.xml");
    assert.equal(status, 200);
    assert.match(ct, /xml/);
    assert.ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(body.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(locs.length, SLUGS.length + 1);
    assert.ok(locs.includes(DOMAIN + "/"));
    for (const s of SLUGS) assert.ok(locs.includes(`${DOMAIN}/${s}`), "missing " + s);
    for (const bad of ["success", "cancel", "account", "/api/", "webhook", ".pdf", "session_id", "cs_test", "private"]) {
      assert.ok(!body.includes(bad), "sitemap must not expose " + bad);
    }
    for (const loc of locs) {
      assert.ok(loc.startsWith(DOMAIN), "absolute URL from BASE_URL: " + loc);
      const r = await fetch(loc.replace(DOMAIN, BASE), { redirect: "manual" });
      assert.equal(r.status, 200, loc + " must not 404");
    }
  });

  await t.test("private pages are noindex and have their own metadata", async () => {
    for (const p of ["/success.html", "/cancel.html", "/account.html"]) {
      const { status, body } = await get(p);
      assert.equal(status, 200, p + " must still load");
      assert.ok(/name="robots" content="noindex/.test(body), p + " must be noindex");
      assert.ok(/<meta name="description"/.test(body), p + " description");
    }
  });

  await t.test("favicon and web manifest are served", async () => {
    const icon = await get("/favicon.svg");
    assert.equal(icon.status, 200);
    assert.match(icon.ct, /image\/svg/);
    const mf = await get("/site.webmanifest");
    assert.equal(mf.status, 200);
    const m = JSON.parse(mf.body);
    assert.equal(m.lang, "de-DE");
    assert.ok(m.icons.length >= 1);
  });

  /* ---------------- mobile / accessibility ---------------- */

  await t.test("every page has a correct mobile viewport and lang=de", async () => {
    for (const p of ["/", ...SLUGS.map((s) => "/" + s), "/success.html", "/account.html", "/cancel.html"]) {
      const { body } = await get(p);
      assert.ok(/<html lang="de">/.test(body), p + " lang");
      assert.ok(/name="viewport"[^>]*width=device-width/.test(body), p + " viewport");
      assert.ok(!/user-scalable=no|maximum-scale=1/.test(body), p + " must allow zoom");
    }
  });

  await t.test("decorative SVGs on the homepage are hidden from assistive tech", async () => {
    const { body } = await get("/");
    const svgs = body.match(/<svg\b[^>]*>/g) || [];
    const bare = svgs.filter((s) => !/aria-hidden|role=|aria-label/.test(s));
    assert.equal(bare.length, 0, bare.length + " SVGs still lack aria-hidden");
  });

  /* ---------------- EXISTING FUNCTIONALITY MUST STILL WORK ---------------- */

  await t.test("REGRESSION: the app's own routes, scripts and markup are untouched", async () => {
    const { body } = await get("/");
    for (const marker of [
      'id="more-menu-dropdown"', 'data-checkout="komplett"',
      'id="page-rechner"', 'id="page-mietpreise"', 'id="page-ki-check"', 'id="page-mein-wohnstart"',
      'id="mr-kalt"', 'id="qm-kalt"', 'validRoutes', 'startCheckout', 'id="page-neu-in-deutschland"',
    ]) assert.ok(body.includes(marker), "app markup lost: " + marker);
    assert.equal(count(body, /<section class="route-page"/g), 10, "all 10 app sections intact");
  });

  await t.test("REGRESSION: Stripe checkout endpoint unchanged", async () => {
    const r = await fetch(BASE + "/api/create-checkout-session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packageId: "nope" }),
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, "Unbekanntes Paket.");
  });

  await t.test("REGRESSION: Stripe webhook still verifies signatures and creates paid orders", async () => {
    const sid = "cs_test_" + "A1b2C3d4E5".repeat(2);
    const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {
      id: sid, amount_total: 2900, currency: "eur", payment_status: "paid",
      customer_details: { email: "k@example.com" }, payment_intent: "pi_1", metadata: { package_id: "komplett" } } } });
    const ts = Math.floor(Date.now() / 1000);
    const sig = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${payload}`).digest("hex");

    // forged signature rejected
    const bad = await fetch(BASE + "/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=dead" }, body: payload });
    assert.equal(bad.status, 400);

    // valid signature accepted
    const ok = await fetch(BASE + "/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${ts},v1=${sig}` }, body: payload });
    assert.equal(ok.status, 200);
    const st = await (await fetch(`${BASE}/api/order-status?session_id=${sid}`)).json();
    assert.equal(st.status, "paid");
    return sid;
  });

  await t.test("REGRESSION: PDF download and PDF autofill still work for a paid customer", async () => {
    const sid = "cs_test_" + "A1b2C3d4E5".repeat(2);
    const dl = await fetch(`${BASE}/api/download/mieterselbstauskunft?session_id=${sid}`);
    assert.equal(dl.status, 200);
    assert.equal(Buffer.from(await dl.arrayBuffer()).slice(0, 5).toString("latin1"), "%PDF-");

    const gen = await fetch(BASE + "/api/documents/generate", {
      method: "POST", headers: { "content-type": "application/json", cookie: `ws_order=${sid}` },
      body: JSON.stringify({ type: "mieterselbstauskunft", profile: { vorname: "Max", nachname: "Mustermann", nettoeinkommen: 2400 }, extra: { wohnung: "Musterstr. 12" } }),
    });
    assert.equal(gen.status, 200);
    assert.equal(gen.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await gen.arrayBuffer()).slice(0, 5).toString("latin1"), "%PDF-");
  });

  await t.test("REGRESSION: security headers from the previous audit are still applied", async () => {
    for (const p of ["/", "/wohnungssuche"]) {
      const { r } = await get(p);
      assert.equal((r.headers.get("x-frame-options") || "").toLowerCase(), "deny", p);
      assert.ok((r.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), p);
      assert.equal(r.headers.get("x-powered-by"), null, p);
    }
  });

  await t.test("REGRESSION: static assets still served", async () => {
    for (const a of ["/css/komplett.css", "/js/komplett.js", "/js/ki-check.js", "/css/ki-check.css"]) {
      assert.equal((await get(a)).status, 200, a);
    }
  });
});
