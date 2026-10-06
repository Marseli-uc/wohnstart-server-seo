/**
 * Central package configuration.
 *
 * This is the ONLY place package names, features, and Stripe price
 * environment variable names are defined. The frontend only ever sends a
 * package id; it never determines what is actually charged.
 *
 * The actual amount charged is controlled by the Stripe Price object your
 * STRIPE_PRICE_* env var points to, configured in the Stripe Dashboard.
 * The homepage reads the live amount from that Stripe Price (GET /api/packages),
 * so the displayed price always matches what Stripe charges. `displayPrice`
 * below is only a fallback for when Stripe can't be reached.
 *
 * WohnStart sells ONE product: WohnStart Komplett (`purchasable: true`).
 *
 * STANDARD / PLUS / PREMIUM are no longer sold (`purchasable: false`), but they
 * stay here because orders for them already exist in the database. Those
 * customers keep their AI-check allowance and — via `grantsKomplett` — get
 * access to all WohnStart Komplett features. Set `grantsKomplett: false` on a
 * legacy package if you don't want that.
 */

module.exports = {
  komplett: {
    id: "komplett",
    purchasable: true,
    grantsKomplett: true,
    aiChecks: 50, // KI-Dokumenten-Check: checks included after the 2 free ones (fair-use limit)
    name: "WohnStart Komplett",
    displayPrice: "29,99", // fallback only — the real price comes from STRIPE_PRICE_KOMPLETT
    stripePriceEnvVar: "STRIPE_PRICE_KOMPLETT",
    badge: null,
    features: [
      "Persönliche Angaben einmal eingeben",
      "Dokumente automatisch ausfüllen (Mieterselbstauskunft, Anschreiben, Deckblatt)",
      "Vorlagen nutzen",
      "KI-Dokumenten-Check (50 Prüfungen zusätzlich zu den 2 kostenlosen)",
      "Bewerbungs-Checkliste",
      "Unterlagen organisieren",
    ],
  },

  /* ---------- legacy packages (not sold anymore, kept for existing orders) ---------- */
  standard: {
    id: "standard",
    purchasable: false,
    grantsKomplett: true,
    aiChecks: 10,
    name: "STANDARD",
    displayPrice: "9,99",
    stripePriceEnvVar: "STRIPE_PRICE_STANDARD",
    badge: null,
    features: [
      "Basic apartment application document preparation",
      "Mieterselbstauskunft",
      "Application checklist",
      "Basic document organization",
    ],
  },
  plus: {
    id: "plus",
    purchasable: false,
    grantsKomplett: true,
    aiChecks: 25,
    name: "PLUS",
    displayPrice: "19,99",
    stripePriceEnvVar: "STRIPE_PRICE_PLUS",
    badge: "Beliebteste Wahl",
    features: [
      "Everything in Standard",
      "Complete application document package",
      "Professional application cover letter",
      "Document checklist",
      "Additional application templates",
      "Better formatting and customization",
    ],
  },
  premium: {
    id: "premium",
    purchasable: false,
    grantsKomplett: true,
    aiChecks: 50,
    name: "PREMIUM",
    displayPrice: "39,99",
    stripePriceEnvVar: "STRIPE_PRICE_PREMIUM",
    badge: null,
    features: [
      "Everything in Plus",
      "Complete premium application package",
      "Personalized document preparation",
      "Multiple document templates",
      "Advanced application guidance",
      "Final document review checklist",
    ],
  },
};
