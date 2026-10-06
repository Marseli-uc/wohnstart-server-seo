/**
 * SEO layer for WohnStart.
 *
 * Everything here is ADDITIVE. It does not touch the single-page app, its
 * router, Stripe, the PDF system, the autofill or the calculator:
 *
 *   - new standalone content pages at real, crawlable URLs
 *     (/wohnungssuche, /wohnungsbewerbung, /mieterselbstauskunft,
 *      /keine-schufa, /mietpreis-rechner)
 *   - /robots.txt and /sitemap.xml generated from BASE_URL
 *   - canonical / Open Graph / JSON-LD injected into the existing index.html
 *     as it is served (the file on disk keeps its own <title> and description)
 *   - /index.html redirected to / so the homepage has exactly one URL
 *
 * Absolute URLs come from BASE_URL (see .env). No domain is invented here: if
 * BASE_URL is still localhost, the sitemap and canonicals point at localhost
 * and a warning is logged at startup.
 */

const fs = require("fs");
const path = require("path");
const { PAGES } = require("./pages");

const INDEX_HTML = path.join(__dirname, "..", "..", "public", "index.html");

/* ---------------- helpers ---------------- */

const baseUrl = () => (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const abs = (p) => baseUrl() + (p.startsWith("/") ? p : "/" + p);
const isPlaceholderBase = () => /localhost|127\.0\.0\.1/.test(baseUrl());

/** Escapes text for use in HTML text nodes and attributes. */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON-LD must not be able to close its own <script> tag. */
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

/* ---------------- shared metadata ---------------- */

const SITE_NAME = "WohnStart";
const SITE_DESCRIPTION =
  "WohnStart hilft bei der Wohnungssuche in Deutschland: Wohnkosten berechnen, Unterlagen vorbereiten und die Wohnungsbewerbung organisieren.";

const organizationLd = () => ({
  "@type": "Organization",
  "@id": abs("/#organization"),
  name: SITE_NAME,
  url: baseUrl() + "/",
  description: SITE_DESCRIPTION,
  areaServed: { "@type": "Country", name: "Deutschland" },
});

const websiteLd = () => ({
  "@type": "WebSite",
  "@id": abs("/#website"),
  name: SITE_NAME,
  url: baseUrl() + "/",
  inLanguage: "de-DE",
  publisher: { "@id": abs("/#organization") },
});

/**
 * Social/meta tags shared by every page. og:image is intentionally omitted:
 * the site has no real image asset, and inventing a URL would produce a
 * broken preview. Add one later and set OG_IMAGE_PATH in .env.
 */
function metaTags({ title, description, url }) {
  const ogImage = process.env.OG_IMAGE_PATH ? abs(process.env.OG_IMAGE_PATH) : null;
  return [
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="de_DE" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : null,
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ].filter(Boolean);
}

/* ---------------- page shell ---------------- */

const LOGO_SVG = `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path d="M4 14L14 5l10 9" stroke="#1E3F73" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7 12v9.5a1 1 0 0 0 1 1h4.2v-6.2h3.6V22.5h4.2a1 1 0 0 0 1-1V12" stroke="#1E3F73" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;

/** Design tokens copied from public/index.html so the pages match the site. */
const PAGE_CSS = `
  :root {
    --bg:#FBFCFD; --bg-alt:#F1F4F8; --surface:#FFFFFF; --ink:#0E1A2B; --ink-soft:#4A5568;
    --line:#E3E8EF; --blue:#2C5CA6; --blue-deep:#1E3F73; --blue-tint:#EAF1FB;
    --green:#1F7A5C; --green-tint:#E7F5EF; --focus:#2C5CA6;
  }
  :root:not([data-theme="light"]) {
    @media (prefers-color-scheme: dark) {
      --bg:#0E1A2B; --bg-alt:#101F33; --surface:#14243A; --ink:#F2F5F9; --ink-soft:#AEBACB;
      --line:#223349; --blue:#6FA0DE; --blue-deep:#9DC0EC; --blue-tint:#16283F; --green-tint:#103726;
    }
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    font-size:17px; line-height:1.65;
    padding-top:env(safe-area-inset-top,0px); padding-bottom:env(safe-area-inset-bottom,0px);
    -webkit-text-size-adjust:100%;
  }
  .font-display { font-family:'Fraunces',Georgia,serif; }
  h1,h2,h3,.font-display { letter-spacing:-0.01em; }
  .wrap { max-width:760px; margin:0 auto; padding:0 20px; }
  .site-header { position:sticky; top:0; z-index:50; backdrop-filter:blur(8px);
    background:color-mix(in srgb, var(--bg) 88%, transparent); border-bottom:1px solid var(--line); }
  .site-header .inner { max-width:1100px; margin:0 auto; padding:0 20px; height:72px;
    display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .brand { display:flex; align-items:center; gap:8px; text-decoration:none; color:var(--ink); flex-shrink:0; }
  .brand span { font-size:1.25rem; font-weight:600; }
  .site-nav { display:flex; gap:20px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
  .site-nav a { color:var(--ink-soft); text-decoration:none; font-size:.95rem; }
  .site-nav a:hover, .site-nav a[aria-current="page"] { color:var(--ink); }
  .btn { display:inline-block; padding:13px 22px; border-radius:10px; font-weight:600;
    text-decoration:none; font-size:.95rem; transition:transform .15s ease, box-shadow .15s ease; }
  .btn-primary { background:var(--blue-deep); color:#fff; }
  .btn-primary:hover { box-shadow:0 8px 20px -8px rgba(30,63,115,.5); transform:translateY(-1px); }
  .btn-secondary { border:1px solid var(--line); color:var(--ink); background:transparent; }
  .btn-secondary:hover { border-color:var(--blue); background:var(--blue-tint); }
  .crumbs { font-size:.85rem; color:var(--ink-soft); padding:22px 0 0; }
  .crumbs a { color:var(--ink-soft); }
  main h1 { font-size:clamp(2rem,5vw,2.85rem); line-height:1.12; margin:18px 0 0; font-family:'Fraunces',Georgia,serif; font-weight:600; }
  .lead { font-size:1.12rem; color:var(--ink-soft); margin:18px 0 0; }
  main h2 { font-size:clamp(1.35rem,3.2vw,1.7rem); margin:46px 0 0; font-family:'Fraunces',Georgia,serif; font-weight:600; }
  main h3 { font-size:1.08rem; margin:30px 0 0; font-weight:600; }
  main p { margin:14px 0 0; }
  main ul, main ol { margin:14px 0 0; padding-left:22px; }
  main li { margin:8px 0 0; }
  main a { color:var(--blue-deep); text-underline-offset:2px; }
  code { background:var(--bg-alt); padding:2px 6px; border-radius:4px; font-size:.9em; }
  .cta-box { margin:48px 0 0; padding:26px; border-radius:16px; background:var(--blue-tint);
    display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
  .cta-box p { margin:0; flex:1 1 240px; font-weight:600; color:var(--blue-deep); }
  .faq { margin-top:16px; border-top:1px solid var(--line); }
  .faq details { border-bottom:1px solid var(--line); padding:16px 0; }
  .faq summary { cursor:pointer; font-weight:600; list-style:none; }
  .faq summary::-webkit-details-marker { display:none; }
  .faq summary::after { content:"+"; float:right; color:var(--ink-soft); }
  .faq details[open] summary::after { content:"−"; }
  .faq p { color:var(--ink-soft); }
  .related { margin:50px 0 0; padding:24px; border:1px solid var(--line); border-radius:16px; background:var(--surface); }
  .related h2 { margin:0 0 4px; font-size:1.1rem; }
  .related ul { list-style:none; padding:0; margin:10px 0 0; }
  .related li { margin:9px 0 0; }
  .site-footer { margin-top:70px; border-top:1px solid var(--line); }
  .site-footer .inner { max-width:1100px; margin:0 auto; padding:30px 20px;
    display:flex; flex-wrap:wrap; gap:14px; justify-content:space-between;
    font-size:.88rem; color:var(--ink-soft); }
  .site-footer a { color:var(--ink-soft); }
  a:focus-visible, summary:focus-visible { outline:2px solid var(--focus); outline-offset:3px; border-radius:4px; }
  @media (prefers-reduced-motion: reduce) { *{transition:none!important; scroll-behavior:auto!important;} }
`;

function renderPage(page) {
  const url = abs("/" + page.slug);

  const nav = PAGES.map(
    (p) =>
      `<a href="/${p.slug}"${p.slug === page.slug ? ' aria-current="page"' : ""}>${esc(p.nav)}</a>`
  ).join("\n        ");

  const ctas = (page.ctas || [])
    .map(
      (c, i) =>
        `<a class="btn ${i === 0 ? "btn-primary" : "btn-secondary"}" href="${esc(c.href)}">${esc(c.label)}</a>`
    )
    .join("\n      ");

  const faqHtml = (page.faq || []).length
    ? `
    <h2>Häufige Fragen</h2>
    <div class="faq">
      ${page.faq
        .map(
          (f) =>
            `<details>\n        <summary>${esc(f.q)}</summary>\n        <p>${esc(f.a)}</p>\n      </details>`
        )
        .join("\n      ")}
    </div>`
    : "";

  // Internal linking: every page links to the other topic pages.
  const related = PAGES.filter((p) => p.slug !== page.slug)
    .map((p) => `<li><a href="/${p.slug}">${esc(p.title.split(":")[0])}</a></li>`)
    .join("\n        ");

  const graph = [organizationLd(), websiteLd(), {
    "@type": "WebPage",
    "@id": url + "#webpage",
    url,
    name: page.title,
    description: page.description,
    inLanguage: "de-DE",
    isPartOf: { "@id": abs("/#website") },
    about: { "@id": abs("/#organization") },
  }, {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Startseite", item: baseUrl() + "/" },
      { "@type": "ListItem", position: 2, name: page.breadcrumb, item: url },
    ],
  }];

  // FAQPage is only added when the questions and answers are really visible.
  if ((page.faq || []).length) {
    graph.push({
      "@type": "FAQPage",
      "@id": url + "#faq",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(page.title)} | ${esc(SITE_NAME)}</title>
<meta name="description" content="${esc(page.description)}" />
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
${metaTags({ title: page.title, description: page.description, url }).join("\n")}
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/favicon.svg" />
<link rel="manifest" href="/site.webmanifest" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style>
<script type="application/ld+json">
${jsonLd({ "@context": "https://schema.org", "@graph": graph })}
</script>
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="brand" href="/">
      ${LOGO_SVG}
      <span class="font-display">WohnStart</span>
    </a>
    <nav class="site-nav" aria-label="Themen">
        ${nav}
      <a href="/" class="btn btn-primary" style="padding:9px 16px">Zur App</a>
    </nav>
  </div>
</header>

<div class="wrap">
  <nav class="crumbs" aria-label="Brotkrümelnavigation">
    <a href="/">Startseite</a> › <span>${esc(page.breadcrumb)}</span>
  </nav>

  <main>
    <h1>${esc(page.h1)}</h1>
    <p class="lead">${esc(page.intro)}</p>
${page.body.trim()}

    <div class="cta-box">
      <p>Bereit für den nächsten Schritt?</p>
      ${ctas}
    </div>
${faqHtml}

    <aside class="related">
      <h2>Weiterlesen</h2>
      <ul>
        ${related}
      </ul>
    </aside>
  </main>
</div>

<footer class="site-footer">
  <div class="inner">
    <p>© ${new Date().getFullYear()} WohnStart · <a href="/">Zur Wohnungssuche-App</a></p>
    <p>Keine Rechts- oder Finanzberatung. Alle Angaben ohne Gewähr.</p>
  </div>
</footer>
</body>
</html>`;
}

/* ---------------- homepage metadata injection ---------------- */

const HOME_TITLE = "Wohnungssuche in Deutschland – Kosten, Unterlagen und Bewerbung | WohnStart";
const HOME_DESCRIPTION =
  "Wohnkosten berechnen, Bewerbungsunterlagen vorbereiten und die Wohnungssuche organisieren. WohnStart begleitet dich Schritt für Schritt zur Mietwohnung in Deutschland.";

/**
 * Injects canonical/OG/JSON-LD into the existing index.html and replaces the
 * <title>/description with the SEO versions. The file on disk is not modified,
 * so the app keeps working exactly as before even without this layer.
 */
function buildHomepage(html) {
  const url = baseUrl() + "/";
  const graph = [organizationLd(), websiteLd(), {
    "@type": "WebPage",
    "@id": url + "#webpage",
    url,
    name: HOME_TITLE,
    description: HOME_DESCRIPTION,
    inLanguage: "de-DE",
    isPartOf: { "@id": abs("/#website") },
  }, {
    // Describes the free calculator that is genuinely on this page.
    "@type": "WebApplication",
    "@id": url + "#mietrechner",
    name: "WohnStart Mietpreis-Rechner",
    url: abs("/mietpreis-rechner"),
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: "de-DE",
    isPartOf: { "@id": abs("/#website") },
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  }];

  const head = [
    ...metaTags({ title: HOME_TITLE, description: HOME_DESCRIPTION, url }),
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="/favicon.svg" />`,
    `<link rel="manifest" href="/site.webmanifest" />`,
    `<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />`,
    `<script type="application/ld+json">\n${jsonLd({ "@context": "https://schema.org", "@graph": graph })}\n</script>`,
  ].join("\n");

  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(HOME_TITLE)}</title>`)
    .replace(
      /<meta name="description"[^>]*>/i,
      `<meta name="description" content="${esc(HOME_DESCRIPTION)}" />`
    )
    .replace("</head>", head + "\n</head>");
}

/* ---------------- router ---------------- */

function createSeoRouter(express) {
  const router = express.Router();
  const bySlug = new Map(PAGES.map((p) => [p.slug, p]));

  // index.html has exactly one canonical URL: "/".
  router.get(["/index.html", "/index.htm"], (req, res) => res.redirect(301, "/"));

  router.get("/", (req, res, next) => {
    fs.readFile(INDEX_HTML, "utf8", (err, html) => {
      if (err) return next(err);
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(buildHomepage(html));
    });
  });

  PAGES.forEach((page) => {
    router.get("/" + page.slug, (req, res) => {
      res.set("Content-Type", "text/html; charset=utf-8");
      res.send(renderPage(bySlug.get(page.slug)));
    });
  });

  router.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(
      [
        "User-agent: *",
        "Allow: /",
        "",
        "# Private areas: order pages, paid documents and API endpoints.",
        "Disallow: /success.html",
        "Disallow: /cancel.html",
        "Disallow: /account.html",
        "Disallow: /api/",
        "Disallow: /webhook",
        "",
        `Sitemap: ${abs("/sitemap.xml")}`,
        "",
      ].join("\n")
    );
  });

  router.get("/sitemap.xml", (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      { loc: baseUrl() + "/", priority: "1.0", changefreq: "weekly" },
      ...PAGES.map((p) => ({ loc: abs("/" + p.slug), priority: "0.8", changefreq: "monthly" })),
    ];
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls
          .map(
            (u) =>
              `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n` +
              `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
          )
          .join("\n") +
        `\n</urlset>\n`
    );
  });

  // Site icon + manifest (no binary asset needed).
  router.get("/favicon.svg", (req, res) => {
    res
      .type("image/svg+xml")
      .set("Cache-Control", "public, max-age=86400")
      .send(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="6" fill="#EAF1FB"/><path d="M4.5 14L14 5.5l9.5 8.5" fill="none" stroke="#1E3F73" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.4 12.4v9.1a1 1 0 0 0 1 1h4v-6h3.2v6h4a1 1 0 0 0 1-1v-9.1" fill="none" stroke="#1E3F73" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      );
  });

  router.get("/site.webmanifest", (req, res) => {
    res.type("application/manifest+json").json({
      name: "WohnStart – Wohnungssuche in Deutschland",
      short_name: "WohnStart",
      description: SITE_DESCRIPTION,
      start_url: "/",
      display: "standalone",
      background_color: "#FBFCFD",
      theme_color: "#1E3F73",
      lang: "de-DE",
      icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    });
  });

  return router;
}

function warnAboutSeoConfiguration() {
  if (isPlaceholderBase()) {
    console.warn(
      `ℹ️  SEO: BASE_URL is ${baseUrl()}, so canonical URLs and /sitemap.xml point at localhost. ` +
        "Set BASE_URL to your real domain before submitting the sitemap to Google Search Console."
    );
  }
  if (!process.env.OG_IMAGE_PATH) {
    console.warn(
      "ℹ️  SEO: no OG_IMAGE_PATH set, so shared links have no preview image. " +
        "Add an image to public/ and set OG_IMAGE_PATH=/dein-bild.png (1200×630) when you have one."
    );
  }
}

module.exports = { createSeoRouter, warnAboutSeoConfiguration, PAGES, buildHomepage };
