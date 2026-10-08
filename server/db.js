const Database = require("better-sqlite3");
const path = require("path");

// SQLite is used here so the whole project runs with zero external
// infrastructure while you're testing. For a real production deployment,
// swap this for a hosted database (Postgres, MySQL, etc.) — the queries
// below are simple enough to port directly. If you deploy to a platform
// with an ephemeral filesystem (most serverless platforms), this SQLite
// file will NOT persist between deploys/restarts, so plan to migrate to a
// hosted DB before going live in that kind of environment.
const db = new Database(path.join(__dirname, "data.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT,
    customer_email TEXT,
    package TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    stripe_checkout_session_id TEXT NOT NULL UNIQUE,
    stripe_payment_intent_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/**
 * Insert or update an order row from a Stripe Checkout Session object.
 *
 * This is the ONLY place that grants/updates paid access, and it is only
 * ever called from the webhook handler after Stripe's signature has been
 * verified — never from anything the frontend/client can trigger directly.
 *
 * It is idempotent: the UNIQUE constraint on stripe_checkout_session_id
 * means redelivering the same webhook event (which Stripe does, by design,
 * for reliability) just re-applies the same values instead of creating a
 * duplicate order.
 */
function upsertOrderFromSession(session) {
  const packageId = (session.metadata && session.metadata.package_id) || "unknown";
  const amount = session.amount_total ?? 0;
  const currency = (session.currency || "eur").toUpperCase();
  const email =
    (session.customer_details && session.customer_details.email) ||
    session.customer_email ||
    null;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent && session.payment_intent.id) || null;
  const status = session.payment_status === "paid" ? "paid" : session.payment_status || "pending";

  const existing = db
    .prepare("SELECT id FROM orders WHERE stripe_checkout_session_id = ?")
    .get(session.id);

  if (existing) {
    db.prepare(
      `UPDATE orders SET
         customer_email = ?,
         package = ?,
         amount = ?,
         currency = ?,
         stripe_payment_intent_id = ?,
         payment_status = ?,
         updated_at = datetime('now')
       WHERE stripe_checkout_session_id = ?`
    ).run(email, packageId, amount, currency, paymentIntentId, status, session.id);
  } else {
    db.prepare(
      `INSERT INTO orders
         (customer_id, customer_email, package, amount, currency,
          stripe_checkout_session_id, stripe_payment_intent_id, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session.client_reference_id || null,
      email,
      packageId,
      amount,
      currency,
      session.id,
      paymentIntentId,
      status
    );
  }
}

function getOrderBySessionId(sessionId) {
  return db.prepare("SELECT * FROM orders WHERE stripe_checkout_session_id = ?").get(sessionId);
}

/* ---------------- KI-Dokumenten-Check usage limits ----------------
 * Only counters are stored here — never documents or results.
 *
 * ai_free_usage: free checks, counted per visitor identity. A visitor has
 *   several keys (server-issued cookie ID + hashed IP); the highest count
 *   across them applies, so clearing cookies or switching networks alone
 *   does not reset the free checks.
 * ai_check_usage: checks used per paid order (Stripe Checkout Session ID).
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_free_usage (
    usage_key TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS ai_check_usage (
    stripe_checkout_session_id TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function getFreeUsed(keys) {
  const get = db.prepare("SELECT used FROM ai_free_usage WHERE usage_key = ?");
  return keys.reduce((max, k) => Math.max(max, (get.get(k) || {}).used || 0), 0);
}

/** Atomically reserve one free check. Returns false if none are left. */
const reserveFreeCheck = db.transaction((keys, limit) => {
  const used = getFreeUsed(keys);
  if (used >= limit) return false;
  const upsert = db.prepare(
    `INSERT INTO ai_free_usage (usage_key, used) VALUES (?, ?)
     ON CONFLICT(usage_key) DO UPDATE SET used = MAX(used, excluded.used), updated_at = datetime('now')`
  );
  keys.forEach((k) => upsert.run(k, used + 1));
  return true;
});

/** Give a reserved free check back (the analysis failed). */
const refundFreeCheck = db.transaction((keys) => {
  const dec = db.prepare(
    "UPDATE ai_free_usage SET used = MAX(used - 1, 0), updated_at = datetime('now') WHERE usage_key = ?"
  );
  keys.forEach((k) => dec.run(k));
});

function getPaidUsed(sessionId) {
  const row = db
    .prepare("SELECT used FROM ai_check_usage WHERE stripe_checkout_session_id = ?")
    .get(sessionId);
  return row ? row.used : 0;
}

/** Atomically reserve one check from a paid order's allowance. */
const reservePaidCheck = db.transaction((sessionId, limit) => {
  db.prepare("INSERT OR IGNORE INTO ai_check_usage (stripe_checkout_session_id, used) VALUES (?, 0)").run(sessionId);
  return (
    db
      .prepare(
        `UPDATE ai_check_usage SET used = used + 1, updated_at = datetime('now')
         WHERE stripe_checkout_session_id = ? AND used < ?`
      )
      .run(sessionId, limit).changes === 1
  );
});

function refundPaidCheck(sessionId) {
  db.prepare(
    `UPDATE ai_check_usage SET used = MAX(used - 1, 0), updated_at = datetime('now')
     WHERE stripe_checkout_session_id = ?`
  ).run(sessionId);
}

module.exports = {
  db,
  upsertOrderFromSession,
  getOrderBySessionId,
  getFreeUsed,
  reserveFreeCheck,
  refundFreeCheck,
  getPaidUsed,
  reservePaidCheck,
  refundPaidCheck,
};
