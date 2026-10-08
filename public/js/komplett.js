/* WohnStart Komplett — frontend.
 *
 *   #mein-wohnstart      Übersicht
 *   #angaben             Meine Angaben (entered once, saved in this browser)
 *   #dokument-erstellen  Meine Angaben → Dokument auswählen → automatisch ausfüllen → Vorschau → PDF erstellen
 *   #unterlagen          Meine Unterlagen (files stay in this browser, IndexedDB)
 *
 * What is enforced where:
 *   - PDF generation:  server (/api/documents/generate checks the paid order)
 *   - KI-Check limits: server (/api/ai-check/*, unchanged)
 *   - The rest only shows/hides UI. Personal data and files never leave the
 *     browser except when the customer creates a PDF or starts a KI-Check.
 * Everything rendered from user data is HTML-escaped.
 */
(function () {
  "use strict";

  var LS = {
    profile: "wohnstart_profile_v1",
    docs: "wohnstart_unterlagen_v1",
    generated: "wohnstart_generated_v1",
    extra: "wohnstart_doc_extra_v1"
  };

  /* ---------------- helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function lsGet(key, fallback) { try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
  function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (e) { /* noop */ } }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDate(iso) { return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; }
  function fmtMonth(ym) { return ym && /^\d{4}-\d{2}/.test(ym) ? ym.slice(5, 7) + "/" + ym.slice(0, 4) : ""; }
  function fmtMoney(n) { return n === "" || n == null || !isFinite(Number(n)) ? "" : Number(n).toLocaleString("de-DE") + " €"; }
  function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function daysSince(iso) { return Math.floor((Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000); }

  var toastTimer = null;
  function toast(msg) {
    var el = $("ws-toast");
    if (!el) { el = document.createElement("div"); el.id = "ws-toast"; el.className = "ws-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-on"); }, 3200);
  }

  /* ---------------- entitlement (display only — the server enforces it) ---------------- */
  var entPromise = null;
  function entitlement(force) {
    if (!entPromise || force) {
      entPromise = fetch("/api/entitlement", { cache: "no-store", credentials: "same-origin" })
        .then(function (r) { return r.ok ? r.json() : { komplett: false }; })
        .catch(function () { return { komplett: false }; });
    }
    return entPromise;
  }

  function upsellCard(title, text) {
    return '<div class="surface rounded-2xl p-6 sm:p-8" style="border-color:var(--blue-deep)">' +
      '<span class="ws-pill is-off">Teil von WohnStart Komplett</span>' +
      '<p class="font-display text-xl font-semibold mt-3" style="color:var(--ink)">' + esc(title) + "</p>" +
      '<p class="text-sm mt-2" style="color:var(--ink-soft)">' + esc(text) + "</p>" +
      '<div class="flex flex-wrap gap-3 mt-5"><a href="#kurs" class="btn-primary px-6 py-3.5 rounded-lg font-semibold">WohnStart Komplett ansehen</a></div>' +
      '<p class="text-xs mt-4" style="color:var(--ink-soft)">Schon gekauft? Öffne den Link aus deiner Bestellbestätigung („Zu meinen Dokumenten“) in diesem Browser, um deinen Zugang freizuschalten.</p>' +
    "</div>";
  }

  /* ---------------- Meine Angaben: field definitions ----------------
     Keys match server/services/document-generator.js. Only fields that the
     supported documents actually use are asked for. */
  var STATUS_OPTIONS = ["Angestellte/r", "Beamtin / Beamter", "Selbstständig", "Ausbildung / Studium", "Rente / Pension", "Derzeit ohne Anstellung", "Sonstiges"];
  var SECTIONS = [
    { id: "person", title: "Angaben zur Person", fields: [
      { k: "vorname", label: "Vorname", type: "text", req: true, rule: "name", max: 60, ac: "given-name" },
      { k: "nachname", label: "Nachname", type: "text", req: true, rule: "name", max: 60, ac: "family-name" },
      { k: "geburtsdatum", label: "Geburtsdatum", type: "date", rule: "birthdate", ac: "bday" },
      { k: "telefon", label: "Telefonnummer", type: "tel", rec: true, rule: "phone", max: 20, ac: "tel", ph: "+49 151 23456789" },
      { k: "email", label: "E-Mail", type: "email", rec: true, rule: "email", max: 120, ac: "email", ph: "max@beispiel.de", wide: true }
    ] },
    { id: "anschrift", title: "Aktuelle Anschrift", fields: [
      { k: "strasse", label: "Straße", type: "text", rec: true, max: 80, ac: "address-line1", wide: true },
      { k: "hausnummer", label: "Hausnummer", type: "text", rec: true, rule: "housenumber", max: 10, ph: "12a" },
      { k: "plz", label: "PLZ", type: "text", rec: true, rule: "plz", max: 5, ac: "postal-code", ph: "45127", inputmode: "numeric" },
      { k: "ort", label: "Ort", type: "text", rec: true, max: 60, ac: "address-level2", wide: true }
    ] },
    { id: "haushalt", title: "Einzug & Haushalt", fields: [
      { k: "einzug", label: "Gewünschter Einzugstermin", type: "date" },
      { k: "personen", label: "Personen im Haushalt (inkl. dir)", type: "number", min: 1, max: 15 },
      { k: "erwachsene", label: "davon Erwachsene", type: "number", min: 0, max: 15, opt: true },
      { k: "kinder", label: "davon Kinder", type: "number", min: 0, max: 15, opt: true },
      { k: "mitbewohner", label: "Weitere einziehende Personen", type: "textarea", max: 600, opt: true, wide: true, ph: "z. B. Jonas Weber, 31, Partner" }
    ] },
    { id: "arbeit", title: "Beruf & Einkommen", fields: [
      { k: "status", label: "Beschäftigungsstatus", type: "select", options: STATUS_OPTIONS },
      { k: "arbeitsverhaeltnis", label: "Arbeitsverhältnis", type: "select", options: ["unbefristet", "befristet", "in der Probezeit"], opt: true },
      { k: "beruf", label: "Beruf / Tätigkeit", type: "text", max: 80, ac: "organization-title" },
      { k: "arbeitgeber", label: "Arbeitgeber", type: "text", max: 100, ac: "organization" },
      { k: "beschaeftigtSeit", label: "Beschäftigt seit", type: "month", opt: true },
      { k: "nettoeinkommen", label: "Monatliches Nettoeinkommen (€)", type: "number", min: 0, max: 1000000 },
      { k: "weitereEinnahmen", label: "Weitere Einnahmen pro Monat (€)", type: "number", min: 0, max: 1000000, opt: true },
      { k: "weitereEinnahmenArt", label: "Art der weiteren Einnahmen", type: "text", max: 100, opt: true, ph: "z. B. Nebentätigkeit, Kindergeld" }
    ] },
    { id: "wohnen", title: "Aktuelle Wohnsituation", fields: [
      { k: "wohnsituation", label: "Ich wohne derzeit", type: "select", options: ["zur Miete", "im Eigentum", "bei Eltern / Angehörigen", "in einer Wohngemeinschaft", "Sonstiges"] },
      { k: "wohnhaftSeit", label: "Dort wohnhaft seit", type: "month", opt: true },
      { k: "umzugsgrund", label: "Grund für den Umzug", type: "text", max: 160, opt: true, wide: true },
      { k: "vermieterName", label: "Aktueller Vermieter – Name / Firma", type: "text", max: 100, opt: true, wide: true },
      { k: "vermieterTelefon", label: "Telefon Vermieter", type: "tel", max: 30, opt: true },
      { k: "vermieterEmail", label: "E-Mail Vermieter", type: "email", rule: "email", max: 120, opt: true },
      { k: "vermieterKontakt", label: "Darf der aktuelle Vermieter kontaktiert werden?", type: "select", options: ["Ja", "Nein"], opt: true, wide: true }
    ] },
    { id: "tiere", title: "Haustiere & Rauchen", fields: [
      { k: "haustiere", label: "Haustiere", type: "select", options: ["Nein", "Ja"] },
      { k: "rauchen", label: "Wird in der Wohnung geraucht?", type: "select", options: ["Nein", "Ja"] },
      { k: "haustiereArt", label: "Art und Anzahl der Tiere", type: "text", max: 120, wide: true, showIf: function (p) { return p.haustiere === "Ja"; } }
    ] },
    { id: "weiteres", title: "Weitere Angaben", fields: [
      { k: "aufNachfrage", label: "Auf Nachfrage kann ich zur Verfügung stellen", type: "multi", options: ["Einkommensnachweise", "Bonitätsauskunft (z. B. SCHUFA)", "Mietschuldenfreiheitsbescheinigung"], opt: true, wide: true },
      { k: "notizen", label: "Was mir sonst noch wichtig ist", type: "textarea", max: 800, opt: true, wide: true }
    ] }
  ];
  var FIELD_BY_KEY = {};
  SECTIONS.forEach(function (s) { s.fields.forEach(function (f) { FIELD_BY_KEY[f.k] = f; }); });
  var CORE_KEYS = ["vorname", "nachname", "geburtsdatum", "telefon", "email", "strasse", "hausnummer", "plz", "ort", "einzug", "personen", "status", "beruf", "arbeitgeber", "nettoeinkommen", "wohnsituation", "haustiere", "rauchen"];

  var NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’]+(?:[ -][A-Za-zÀ-ÖØ-öø-ÿĀ-ž'’]+)*$/;
  var RULES = {
    name: function (v) { return NAME_RE.test(v) ? null : "Bitte nur Buchstaben, Leerzeichen und Bindestriche verwenden."; },
    email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : "Bitte gib eine gültige E-Mail-Adresse ein."; },
    phone: function (v) { var d = v.replace(/[\s\/()-]/g, ""); return /^\+?[0-9]{6,15}$/.test(d) ? null : "Bitte gib eine gültige Telefonnummer ein."; },
    plz: function (v) { return /^[0-9]{5}$/.test(v) ? null : "Die PLZ muss aus genau 5 Ziffern bestehen."; },
    housenumber: function (v) { return /^[0-9]+[a-zA-Z]?(?:\s?[-\/]\s?[0-9]+[a-zA-Z]?)?$/.test(v) ? null : "Bitte gib eine gültige Hausnummer ein (z. B. 12 oder 12a)."; },
    birthdate: function (v) { return v > todayISO() ? "Das Geburtsdatum darf nicht in der Zukunft liegen." : null; }
  };

  function getProfile() { return lsGet(LS.profile, {}) || {}; }
  function saveProfile(p) { p._updated = new Date().toISOString(); return lsSet(LS.profile, p); }
  function patchProfile(patch) {
    var p = getProfile();
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (v === "" || v == null) delete p[k]; else p[k] = v;
    });
    saveProfile(p);
    return p;
  }
  function filled(p, k) { var v = p[k]; return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== ""; }
  function profileStats(p) {
    p = p || getProfile();
    var n = CORE_KEYS.filter(function (k) { return filled(p, k); }).length;
    return {
      pct: Math.round(n / CORE_KEYS.length * 100),
      missingRequired: ["vorname", "nachname"].filter(function (k) { return !filled(p, k); }).map(function (k) { return FIELD_BY_KEY[k].label; }),
      missingRecommended: ["telefon", "email", "strasse", "hausnummer", "plz", "ort"].filter(function (k) { return !filled(p, k); }).map(function (k) { return FIELD_BY_KEY[k].label; })
    };
  }
  /** The profile in the shape the server expects (numbers as numbers, no internal keys). */
  function profilePayload() {
    var p = getProfile(), out = {};
    Object.keys(FIELD_BY_KEY).forEach(function (k) {
      if (!filled(p, k)) return;
      var f = FIELD_BY_KEY[k];
      out[k] = f.type === "number" ? Number(p[k]) : p[k];
    });
    return out;
  }

  /* ---------------- Meine Unterlagen: storage ---------------- */
  var FOLDERS = [
    { id: "identitaet", label: "Identität", desc: "Ausweis, Pass, Aufenthaltstitel" },
    { id: "einkommen", label: "Einkommen", desc: "Gehaltsabrechnungen, Verträge, Bescheide" },
    { id: "bonitaet", label: "Bonität", desc: "SCHUFA, Mietschuldenfreiheit, Bürgschaft" },
    { id: "weitere", label: "Weitere Unterlagen", desc: "Selbstauskunft, Anschreiben, Sonstiges" }
  ];
  // Keys match the KI-Check document types (server/services/ai-document-check.js).
  var DOC_TYPES = [
    { id: "personalausweis", label: "Personalausweis", folder: "identitaet", kw: /ausweis|perso|\bid\b/i },
    { id: "reisepass", label: "Reisepass", folder: "identitaet", kw: /reisepass|passport/i },
    { id: "aufenthaltstitel", label: "Aufenthaltstitel", folder: "identitaet", kw: /aufenthalt|visum|visa/i },
    { id: "gehaltsabrechnung", label: "Gehaltsabrechnung", folder: "einkommen", kw: /gehalt|lohn|entgelt|abrechnung|payslip/i },
    { id: "arbeitsvertrag", label: "Arbeitsvertrag", folder: "einkommen", kw: /arbeitsvertrag|arbeitgeberbescheinigung|anstellung/i },
    { id: "ausbildungsvertrag", label: "Ausbildungsvertrag", folder: "einkommen", kw: /ausbildung/i },
    { id: "immatrikulation", label: "Immatrikulationsbescheinigung", folder: "einkommen", kw: /immatrikulation|studienbescheinigung|enrol/i },
    { id: "einkommensteuerbescheid_bwa", label: "Steuerbescheid / BWA", folder: "einkommen", kw: /steuerbescheid|\bbwa\b/i },
    { id: "arbeitslosengeld_buergergeld", label: "Leistungsbescheid (ALG / Bürgergeld)", folder: "einkommen", kw: /b(ü|ue)rgergeld|arbeitslosengeld|\balg\b|jobcenter/i },
    { id: "kontoauszug", label: "Kontoauszug", folder: "einkommen", kw: /konto/i },
    { id: "schufa", label: "SCHUFA-Auskunft", folder: "bonitaet", kw: /schufa|bonit/i },
    { id: "mietschuldenfreiheit", label: "Mietschuldenfreiheitsbescheinigung", folder: "bonitaet", kw: /mietschulden|vormieter/i },
    { id: "buergschaft", label: "Bürgschaft", folder: "bonitaet", kw: /b(ü|ue)rgschaft/i },
    { id: "mieterselbstauskunft", label: "Mieterselbstauskunft", folder: "weitere", kw: /selbstauskunft/i },
    { id: "anschreiben", label: "Bewerbungsanschreiben", folder: "weitere", kw: /anschreiben|bewerbungsschreiben/i },
    { id: "deckblatt", label: "Deckblatt Bewerbungsmappe", folder: "weitere", kw: /deckblatt/i },
    { id: "sonstiges", label: "Sonstiges Dokument", folder: "weitere", kw: null }
  ];
  var TYPE_BY_ID = {};
  DOC_TYPES.forEach(function (t) { TYPE_BY_ID[t.id] = t; });
  function guessType(name) {
    for (var i = 0; i < DOC_TYPES.length; i++) if (DOC_TYPES[i].kw && DOC_TYPES[i].kw.test(name || "")) return DOC_TYPES[i].id;
    return "";
  }
  // Common landlord expectations about document age (same values as the KI-Check).
  var AGE_DAYS = { schufa: [90, "älter als 3 Monate"], gehaltsabrechnung: [100, "älter als 3 Monate"], kontoauszug: [60, "älter als 2 Monate"], mietschuldenfreiheit: [180, "älter als 6 Monate"] };
  var MAX_FILE = 25 * 1024 * 1024;

  var dbPromise = null;
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) return reject(new Error("no-idb"));
        var req = indexedDB.open("wohnstart", 1);
        req.onupgradeneeded = function () { req.result.createObjectStore("files"); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error("idb")); };
      });
      dbPromise.catch(function () { dbPromise = null; });
    }
    return dbPromise;
  }
  function idbOp(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("files", mode);
        var req = fn(tx.objectStore("files"));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = tx.onabort = function () { reject(tx.error || new Error("idb-tx")); };
      });
    });
  }
  function getDocs() { return lsGet(LS.docs, []) || []; }
  function setDocs(list) { lsSet(LS.docs, list); }
  function addDoc(blob, meta) {
    var id = uid();
    var entry = { id: id, name: meta.name || "Dokument", type: meta.type || "sonstiges", mime: blob.type || "application/octet-stream", size: blob.size, date: meta.date || "", added: new Date().toISOString(), source: meta.source || "upload" };
    return idbOp("readwrite", function (s) { return s.put(blob, id); }).then(function () {
      var list = getDocs(); list.push(entry); setDocs(list);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      return entry;
    });
  }
  function updateDoc(id, patch) {
    var list = getDocs();
    list.forEach(function (d) { if (d.id === id) Object.keys(patch).forEach(function (k) { d[k] = patch[k]; }); });
    setDocs(list);
  }
  function removeDoc(id) {
    setDocs(getDocs().filter(function (d) { return d.id !== id; }));
    return idbOp("readwrite", function (s) { return s.delete(id); }).catch(function () {});
  }
  function getBlob(id) { return idbOp("readonly", function (s) { return s.get(id); }); }

  /** Warning for one stored document, or null. */
  function docWarning(d) {
    if (d.aiStatus === "problem") return "KI-Check: Problem erkannt";
    if (d.aiStatus === "aufmerksamkeit") return "KI-Check: Aufmerksamkeit nötig";
    var rule = AGE_DAYS[d.type];
    if (rule && d.date && daysSince(d.date) > rule[0]) return "Ausgestellt am " + fmtDate(d.date) + " – " + rule[1];
    return null;
  }

  /* ---------------- sub navigation ---------------- */
  var TABS = [
    ["mein-wohnstart", "Übersicht"], ["angaben", "Meine Angaben"], ["dokument-erstellen", "Dokumente erstellen"],
    ["unterlagen", "Meine Unterlagen"], ["ki-check", "KI-Check"]
  ];
  function renderTabs() {
    document.querySelectorAll("[data-ws-tabs]").forEach(function (nav) {
      var active = nav.getAttribute("data-ws-tabs");
      nav.classList.add("ws-tabs");
      nav.setAttribute("aria-label", "Mein WohnStart");
      nav.innerHTML = TABS.map(function (t) {
        return '<a href="#' + t[0] + '" class="ws-tab' + (t[0] === active ? " is-active" : "") + '"' + (t[0] === active ? ' aria-current="page"' : "") + ">" + t[1] + "</a>";
      }).join("");
    });
  }

  /* ---------------- Übersicht ---------------- */
  function renderHub() {
    var root = $("ws-hub");
    if (!root) return;
    var stats = profileStats();
    var docs = getDocs();
    var gen = lsGet(LS.generated, {}) || {};
    var genCount = Object.keys(gen).length;
    entitlement().then(function (ent) {
      $("ws-hub-status").innerHTML = ent.komplett
        ? '<span class="ws-pill is-on">✓ WohnStart Komplett aktiv</span>'
        : '<span class="ws-pill is-off">WohnStart Komplett noch nicht freigeschaltet</span> <a href="#kurs" class="ws-link ml-2">Jetzt freischalten</a>';
    });

    var cards = [
      ["angaben", "Meine Angaben", stats.pct + " % ausgefüllt", "Einmal eingeben – in allen Dokumenten wiederverwenden."],
      ["dokument-erstellen", "Dokumente erstellen", genCount ? genCount + (genCount === 1 ? " Dokument" : " Dokumente") + " erstellt" : "Noch keine Dokumente", "Mieterselbstauskunft, Anschreiben und Deckblatt automatisch ausfüllen."],
      ["unterlagen", "Meine Unterlagen", docs.length + (docs.length === 1 ? " Datei" : " Dateien"), "Identität, Einkommen, Bonität und weitere Unterlagen ordnen."],
      ["ki-check", "KI-Dokumenten-Check", "PDF prüfen lassen", "Lesbarkeit, fehlende Seiten, Aktualität und Widersprüche."]
    ];
    $("ws-hub-cards").innerHTML = cards.map(function (c) {
      return '<a href="#' + c[0] + '" class="card-lift surface rounded-2xl p-5 block">' +
        '<p class="text-xs font-semibold" style="color:var(--blue-deep)">' + esc(c[2]) + "</p>" +
        '<p class="font-semibold text-lg mt-1" style="color:var(--ink)">' + esc(c[1]) + "</p>" +
        '<p class="text-sm mt-1" style="color:var(--ink-soft)">' + esc(c[3]) + "</p></a>";
    }).join("");
  }

  /* ---------------- Meine Angaben ---------------- */
  var formBuilt = false, saveTimer = null;
  function fieldHtml(f, p) {
    var v = p[f.k] == null ? "" : p[f.k];
    var id = "ws-f-" + f.k;
    var labelTxt = esc(f.label) + (f.req ? " *" : f.opt ? ' <span class="ws-opt">(optional)</span>' : "");
    var wrapCls = "ws-label" + (f.wide ? " sm:col-span-2" : "");
    var hidden = f.showIf && !f.showIf(p) ? " hidden" : "";
    var common = ' id="' + id + '" data-k="' + f.k + '" class="ws-input"' + (f.ac ? ' autocomplete="' + f.ac + '"' : "") + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "");
    var control;
    if (f.type === "select") {
      control = '<select' + common + '><option value="">Bitte wählen</option>' + f.options.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === v ? " selected" : "") + ">" + esc(o) + "</option>";
      }).join("") + "</select>";
    } else if (f.type === "textarea") {
      control = '<textarea' + common + ' rows="3" maxlength="' + f.max + '">' + esc(v) + "</textarea>";
    } else if (f.type === "multi") {
      var sel = Array.isArray(v) ? v : [];
      return '<div class="' + wrapCls + hidden + '" data-wrap="' + f.k + '"><span>' + labelTxt + '</span><div class="grid sm:grid-cols-3 gap-2 mt-1.5">' +
        f.options.map(function (o, i) {
          return '<label class="ws-check"><input type="checkbox" data-k="' + f.k + '" data-multi="1" value="' + esc(o) + '"' + (sel.indexOf(o) !== -1 ? " checked" : "") + ' class="w-4 h-4"> <span>' + esc(o) + "</span></label>";
        }).join("") + "</div></div>";
    } else {
      var type = f.type === "month" ? "month" : f.type;
      var extra = (f.max ? ' maxlength="' + f.max + '"' : "") + (f.min != null ? ' min="' + f.min + '"' : "") + (f.type === "number" && f.max ? ' max="' + f.max + '"' : "") +
        (f.inputmode ? ' inputmode="' + f.inputmode + '"' : f.type === "number" ? ' inputmode="numeric"' : "") + (f.type === "month" ? ' placeholder="JJJJ-MM"' : "") +
        (f.type === "date" && f.rule === "birthdate" ? ' min="1900-01-01" max="' + todayISO() + '"' : "");
      if (f.type === "number") extra = extra.replace(/ maxlength="[^"]*"/, "");
      control = '<input type="' + type + '"' + common + extra + ' value="' + esc(v) + '">';
    }
    return '<label class="' + wrapCls + hidden + '" data-wrap="' + f.k + '"><span>' + labelTxt + "</span>" + control +
      '<span class="field-error hidden" id="' + id + '-error"></span></label>';
  }

  function buildForm() {
    var root = $("ws-angaben-form");
    if (!root) return;
    var p = getProfile();
    root.innerHTML = SECTIONS.map(function (s, i) {
      return '<fieldset class="ws-fieldset surface rounded-2xl p-5 sm:p-7' + (i ? " mt-5" : "") + '">' +
        '<legend class="sr-only">' + esc(s.title) + "</legend>" +
        '<p class="ws-legend"><span style="color:var(--blue-deep)">' + String(i + 1).padStart(2, "0") + "</span>&nbsp; " + esc(s.title) + "</p>" +
        '<div class="grid sm:grid-cols-2 gap-4 mt-4">' + s.fields.map(function (f) { return fieldHtml(f, p); }).join("") + "</div></fieldset>";
    }).join("");
    root.addEventListener("input", onFieldChange);
    root.addEventListener("change", onFieldChange);
    root.addEventListener("focusout", function (e) { if (e.target.getAttribute && e.target.getAttribute("data-k")) validateField(e.target); });
    formBuilt = true;
  }

  function normalizeMonth(v) {
    var m = String(v).trim().match(/^(\d{1,2})[\/.](\d{4})$/);
    if (m) return m[2] + "-" + m[1].padStart(2, "0");
    return v;
  }
  function validateField(el) {
    var k = el.getAttribute("data-k"), f = FIELD_BY_KEY[k];
    if (!f || el.getAttribute("data-multi")) return true;
    var v = (el.value || "").trim(), err = $("ws-f-" + k + "-error"), msg = null;
    if (v && f.rule && RULES[f.rule]) msg = RULES[f.rule](v);
    if (v && f.type === "month" && !/^\d{4}-\d{2}$/.test(normalizeMonth(v))) msg = "Bitte im Format JJJJ-MM oder MM/JJJJ eingeben.";
    el.classList.toggle("field-invalid", !!msg);
    if (err) { err.textContent = msg || ""; err.classList.toggle("hidden", !msg); }
    return !msg;
  }
  function onFieldChange(e) {
    var el = e.target, k = el.getAttribute && el.getAttribute("data-k");
    if (!k) return;
    var patch = {};
    if (el.getAttribute("data-multi")) {
      patch[k] = Array.prototype.slice.call(document.querySelectorAll('[data-k="' + k + '"][data-multi]:checked')).map(function (c) { return c.value; });
    } else {
      var v = el.value;
      if (FIELD_BY_KEY[k].type === "month") v = normalizeMonth(v);
      patch[k] = typeof v === "string" ? v.trim() : v;
      if (el.classList.contains("field-invalid")) validateField(el);
    }
    var p = patchProfile(patch);
    // conditional fields
    SECTIONS.forEach(function (s) { s.fields.forEach(function (f) {
      if (!f.showIf) return;
      var w = document.querySelector('[data-wrap="' + f.k + '"]');
      if (w) w.classList.toggle("hidden", !f.showIf(p));
    }); });
    clearTimeout(saveTimer);
    $("ws-angaben-saved").textContent = "";
    saveTimer = setTimeout(function () { $("ws-angaben-saved").textContent = "✓ Automatisch gespeichert"; }, 350);
    renderAngabenMeter();
  }
  function renderAngabenMeter() {
    var s = profileStats();
    $("ws-angaben-pct").textContent = s.pct + " % ausgefüllt";
    $("ws-angaben-bar").style.width = s.pct + "%";
  }
  function renderAngaben() {
    if (!$("ws-angaben-form")) return;
    if (!formBuilt) buildForm();
    else {
      // refresh values (the "Jetzt starten" flow may have changed them)
      var p = getProfile();
      document.querySelectorAll("#ws-angaben-form [data-k]").forEach(function (el) {
        var k = el.getAttribute("data-k");
        if (el.getAttribute("data-multi")) el.checked = Array.isArray(p[k]) && p[k].indexOf(el.value) !== -1;
        else if (document.activeElement !== el) el.value = p[k] == null ? "" : p[k];
      });
    }
    renderAngabenMeter();
  }
  function initAngaben() {
    var del = $("ws-angaben-clear");
    if (del) del.addEventListener("click", function () {
      if (!window.confirm("Alle gespeicherten Angaben in diesem Browser löschen?")) return;
      lsDel(LS.profile); lsDel(LS.extra);
      formBuilt = false; $("ws-angaben-form").innerHTML = "";
      renderAngaben();
      toast("Deine Angaben wurden gelöscht.");
    });
    var save = $("ws-angaben-done");
    if (save) save.addEventListener("click", function () {
      var ok = true, first = null;
      document.querySelectorAll("#ws-angaben-form [data-k]").forEach(function (el) { if (!validateField(el)) { ok = false; first = first || el; } });
      var s = profileStats();
      if (s.missingRequired.length) { toast("Bitte ergänze: " + s.missingRequired.join(", ")); var n = $("ws-f-vorname"); if (n) n.focus(); return; }
      if (!ok) { toast("Bitte prüfe die markierten Felder."); first.focus(); return; }
      location.hash = "#dokument-erstellen";
    });
  }

  /* ---------------- Dokumente erstellen ---------------- */
  var DOCS = {
    mieterselbstauskunft: { label: "Mieterselbstauskunft", desc: "Deine Angaben zur Person, zum Haushalt, Einkommen und zur Wohnsituation – fertig zum Unterschreiben.", extras: ["wohnung"] },
    anschreiben: { label: "Bewerbungsanschreiben", desc: "Ein sachliches Anschreiben an Vermieter oder Hausverwaltung – automatisch vorformuliert, frei anpassbar.", extras: ["wohnung", "empfaengerName", "empfaengerStrasse", "empfaengerPlzOrt", "anrede", "ansprechpartner", "persoenlich", "text", "anlagen"] },
    deckblatt: { label: "Deckblatt Bewerbungsmappe", desc: "Titelseite mit deinen Kontaktdaten, Eckdaten und einer Liste der enthaltenen Unterlagen.", extras: ["wohnung", "anlagen"] }
  };
  var EXTRA_DEFS = {
    wohnung: { label: "Wohnung (Adresse oder Exposé-Nr.)", type: "text", max: 160, ph: "z. B. Rüttenscheider Str. 10, 3. OG oder Exposé 12345", wide: true },
    empfaengerName: { label: "Empfänger (Vermieter / Hausverwaltung)", type: "text", max: 100, wide: true, opt: true },
    empfaengerStrasse: { label: "Straße und Hausnummer", type: "text", max: 100, opt: true },
    empfaengerPlzOrt: { label: "PLZ und Ort", type: "text", max: 100, opt: true },
    anrede: { label: "Anrede", type: "select", options: ["neutral", "Frau", "Herr"], labels: { neutral: "Sehr geehrte Damen und Herren", Frau: "Frau …", Herr: "Herr …" } },
    ansprechpartner: { label: "Nachname Ansprechpartner/in", type: "text", max: 80, opt: true },
    persoenlich: { label: "Ein persönlicher Satz über dich", type: "textarea", max: 600, opt: true, wide: true, ph: "z. B. Ich bin ruhig, zuverlässig und suche ein langfristiges Zuhause." }
  };
  var selectedDoc = null;
  function getExtra() { return lsGet(LS.extra, {}) || {}; }
  function patchExtra(patch) { var x = getExtra(); Object.keys(patch).forEach(function (k) { x[k] = patch[k]; }); lsSet(LS.extra, x); return x; }

  /** Documents the user has (stored in "Meine Unterlagen" or created here), for the "Anlagen" list. */
  function availableAnlagen() {
    var list = [];
    var gen = lsGet(LS.generated, {}) || {};
    if (gen.mieterselbstauskunft) list.push("Mieterselbstauskunft");
    getDocs().forEach(function (d) {
      if (d.type === "anschreiben" || d.type === "deckblatt" || d.type === "sonstiges") return;
      var t = TYPE_BY_ID[d.type];
      if (t && list.indexOf(t.label) === -1) list.push(t.label);
    });
    return list;
  }

  function defaultLetterText(p, x) {
    var parts = [];
    parts.push("mit großem Interesse habe ich Ihre Anzeige" + (x.wohnung ? " für die Wohnung " + x.wohnung : "") + " gelesen und bewerbe mich hiermit um diese Wohnung.");
    var me = [];
    if (p.beruf && p.arbeitgeber) me.push("Ich arbeite als " + p.beruf + " bei " + p.arbeitgeber + (p.arbeitsverhaeltnis === "unbefristet" ? " in einem unbefristeten Arbeitsverhältnis" : "") + ".");
    else if (p.beruf) me.push("Ich arbeite als " + p.beruf + ".");
    else if (p.status === "Ausbildung / Studium") me.push("Ich befinde mich derzeit in Ausbildung bzw. im Studium.");
    var n = parseInt(p.personen, 10);
    if (n === 1) me.push("Ich würde die Wohnung allein beziehen.");
    else if (n > 1) me.push("Ich würde die Wohnung zusammen mit " + (n - 1 === 1 ? "einer weiteren Person" : (n - 1) + " weiteren Personen") + " beziehen.");
    var life = [];
    if (p.rauchen === "Nein") life.push("In der Wohnung wird nicht geraucht");
    if (p.haustiere === "Nein") life.push("ich habe keine Haustiere");
    if (life.length) me.push(life.join(" und ").replace(/^./, function (c) { return c.toUpperCase(); }) + ".");
    if (p.haustiere === "Ja" && p.haustiereArt) me.push("Ich halte " + p.haustiereArt + ".");
    if (me.length) parts.push(me.join(" "));
    if (x.persoenlich) parts.push(x.persoenlich);
    if (p.einzug) parts.push("Ein Einzug wäre ab dem " + fmtDate(p.einzug) + " möglich.");
    parts.push("Gerne stelle ich Ihnen meine Bewerbungsunterlagen zur Verfügung. Über eine Einladung zur Besichtigung würde ich mich sehr freuen.");
    return parts.join("\n\n");
  }

  function renderDocChooser() {
    var wrap = $("ws-doc-cards");
    if (!wrap) return;
    var gen = lsGet(LS.generated, {}) || {};
    wrap.innerHTML = Object.keys(DOCS).map(function (id) {
      var d = DOCS[id];
      return '<button type="button" class="ws-doc-card surface rounded-2xl p-5' + (selectedDoc === id ? " is-selected" : "") + '" data-doc-choose="' + id + '">' +
        '<span class="ws-badge is-template">Vorlage</span>' +
        '<p class="font-semibold text-lg mt-3" style="color:var(--ink)">' + esc(d.label) + "</p>" +
        '<p class="text-sm mt-1" style="color:var(--ink-soft)">' + esc(d.desc) + "</p>" +
        (gen[id] ? '<p class="text-xs font-semibold mt-3" style="color:var(--green)">✓ Zuletzt erstellt am ' + esc(fmtDate(gen[id])) + "</p>" : "") +
      "</button>";
    }).join("");
  }

  function extraFieldHtml(k, x) {
    if (k === "text" || k === "anlagen") return "";
    var f = EXTRA_DEFS[k], v = x[k] == null ? "" : x[k], id = "ws-x-" + k;
    var label = esc(f.label) + (f.opt ? ' <span class="ws-opt">(optional)</span>' : "");
    var control;
    if (f.type === "select") control = '<select id="' + id + '" data-x="' + k + '" class="ws-input">' + f.options.map(function (o) { return '<option value="' + o + '"' + (o === (v || "neutral") ? " selected" : "") + ">" + esc(f.labels[o]) + "</option>"; }).join("") + "</select>";
    else if (f.type === "textarea") control = '<textarea id="' + id + '" data-x="' + k + '" class="ws-input" rows="2" maxlength="' + f.max + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + ">" + esc(v) + "</textarea>";
    else control = '<input type="text" id="' + id + '" data-x="' + k + '" class="ws-input" maxlength="' + f.max + '" value="' + esc(v) + '"' + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : "") + ">";
    return '<label class="ws-label' + (f.wide ? " sm:col-span-2" : "") + '"><span>' + label + "</span>" + control + "</label>";
  }

  var letterTouched = false, anlagenSel = null;
  function renderDocDetails() {
    var box = $("ws-doc-details");
    if (!box) return;
    if (!selectedDoc) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var d = DOCS[selectedDoc], x = getExtra(), p = getProfile();

    // step 3: what gets filled in automatically
    var used = autoFillSummary(selectedDoc, p);
    $("ws-autofill").innerHTML =
      '<p class="text-sm" style="color:var(--ink-soft)">Aus <a href="#angaben" class="ws-link">Meine Angaben</a> übernommen:</p>' +
      '<div class="flex flex-wrap gap-2 mt-3">' + used.map(function (u) {
        return '<span class="ws-badge ' + (u[1] ? "is-ok" : "") + '">' + (u[1] ? "✓ " : "– ") + esc(u[0]) + "</span>";
      }).join("") + "</div>";

    $("ws-doc-extra").innerHTML = '<div class="grid sm:grid-cols-2 gap-4">' + d.extras.map(function (k) { return extraFieldHtml(k, x); }).join("") + "</div>";

    // letter text
    var letter = $("ws-letter-wrap");
    letter.classList.toggle("hidden", selectedDoc !== "anschreiben");
    if (selectedDoc === "anschreiben") {
      letterTouched = !!x.textTouched;
      $("ws-letter-text").value = letterTouched && x.text ? x.text : defaultLetterText(p, x);
    }
    // anlagen
    var anl = $("ws-anlagen-wrap");
    var wantsAnlagen = d.extras.indexOf("anlagen") !== -1;
    anl.classList.toggle("hidden", !wantsAnlagen);
    if (wantsAnlagen) {
      var avail = availableAnlagen();
      anlagenSel = avail.slice();
      $("ws-anlagen").innerHTML = avail.length
        ? avail.map(function (a, i) { return '<label class="ws-check"><input type="checkbox" class="w-4 h-4" data-anlage="' + i + '" checked> <span>' + esc(a) + "</span></label>"; }).join("")
        : '<p class="text-sm" style="color:var(--ink-soft)">Noch keine Unterlagen vorhanden. Lege sie unter <a href="#unterlagen" class="ws-link">Meine Unterlagen</a> ab, dann erscheinen sie hier.</p>';
      $("ws-anlagen").setAttribute("data-avail", JSON.stringify(avail));
    }
    renderPreview();
    renderSteps();
  }

  function autoFillSummary(type, p) {
    var keys = type === "mieterselbstauskunft"
      ? ["vorname", "nachname", "geburtsdatum", "telefon", "email", "strasse", "plz", "ort", "einzug", "personen", "status", "arbeitgeber", "beruf", "nettoeinkommen", "wohnsituation", "haustiere", "rauchen"]
      : type === "anschreiben"
        ? ["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "beruf", "arbeitgeber", "personen", "einzug", "haustiere", "rauchen"]
        : ["vorname", "nachname", "strasse", "plz", "ort", "telefon", "email", "einzug", "personen", "beruf", "arbeitgeber"];
    return keys.map(function (k) { return [FIELD_BY_KEY[k].label.replace(" (inkl. dir)", "").replace(" (€)", ""), filled(p, k)]; });
  }

  function selectedAnlagen() {
    var wrap = $("ws-anlagen");
    if (!wrap) return [];
    var avail = [];
    try { avail = JSON.parse(wrap.getAttribute("data-avail") || "[]"); } catch (e) { avail = []; }
    return Array.prototype.slice.call(wrap.querySelectorAll("[data-anlage]")).filter(function (c) { return c.checked; }).map(function (c) { return avail[parseInt(c.getAttribute("data-anlage"), 10)]; });
  }

  function currentExtraPayload() {
    var x = getExtra(), out = {};
    var d = DOCS[selectedDoc];
    d.extras.forEach(function (k) {
      if (k === "text") out.text = $("ws-letter-text").value;
      else if (k === "anlagen") out.anlagen = selectedAnlagen();
      else if (k !== "persoenlich" && x[k]) out[k] = x[k];
    });
    if (selectedDoc === "anschreiben" && !out.anrede) out.anrede = "neutral";
    return out;
  }

  /* Preview (HTML that mirrors the PDF layout). Auto-filled values are highlighted. */
  function pf(label, value) {
    var has = value !== "" && value != null;
    return '<div class="p-f' + (has ? "" : " is-empty") + '"><small>' + esc(label) + "</small><b" + (has ? ' class="p-hl"' : "") + ">" + (has ? esc(value) : "—") + "</b></div>";
  }
  function psec(n, t) { return '<div class="p-sec"><span>' + n + "</span>" + esc(t) + "</div>"; }
  function previewHtml() {
    var p = getProfile(), x = currentExtraPayload();
    var name = [p.vorname, p.nachname].filter(Boolean).join(" ");
    var street = [p.strasse, p.hausnummer].filter(Boolean).join(" ");
    var city = [p.plz, p.ort].filter(Boolean).join(" ");
    if (selectedDoc === "mieterselbstauskunft") {
      return '<p class="p-brand">WOHNSTART</p><h4 class="mt-2">Mieterselbstauskunft</h4><p class="p-soft">Freiwillige Selbstauskunft zur Wohnungsbewerbung</p>' +
        psec("01", "Angaben zur Person") + '<div class="p-grid">' + pf("Nachname", p.nachname) + pf("Vorname", p.vorname) + pf("Geburtsdatum", fmtDate(p.geburtsdatum)) + pf("Telefon", p.telefon) + pf("E-Mail", p.email) + pf("Straße und Hausnummer", street) + pf("PLZ / Ort", city) + "</div>" +
        psec("02", "Gewünschte Wohnung und Einzug") + '<div class="p-grid">' + pf("Wohnung", x.wohnung) + pf("Einzugstermin", fmtDate(p.einzug)) + "</div>" +
        psec("03", "Haushalt") + '<div class="p-grid">' + pf("Personen insgesamt", p.personen) + pf("davon Erwachsene", p.erwachsene) + pf("davon Kinder", p.kinder) + pf("Weitere einziehende Personen", p.mitbewohner) + "</div>" +
        psec("04", "Beschäftigung und Einkommen") + '<div class="p-grid">' + pf("Beschäftigungsstatus", p.status) + pf("Arbeitgeber", p.arbeitgeber) + pf("Beschäftigt seit", fmtMonth(p.beschaeftigtSeit)) + pf("Beruf / Tätigkeit", p.beruf) + pf("Nettoeinkommen", fmtMoney(p.nettoeinkommen)) + pf("Arbeitsverhältnis", p.arbeitsverhaeltnis) + pf("Weitere Einnahmen", fmtMoney(p.weitereEinnahmen)) + "</div>" +
        psec("05", "Aktuelle Wohnsituation") + '<div class="p-grid">' + pf("Ich wohne derzeit", p.wohnsituation) + pf("Wohnhaft seit", fmtMonth(p.wohnhaftSeit)) + pf("Grund für den Umzug", p.umzugsgrund) + pf("Aktueller Vermieter", p.vermieterName) + pf("Kontakt erlaubt", p.vermieterKontakt) + "</div>" +
        psec("06", "Haustiere und Rauchen") + '<div class="p-grid">' + pf("Haustiere", p.haustiere === "Ja" && p.haustiereArt ? "Ja – " + p.haustiereArt : p.haustiere) + pf("Rauchen in der Wohnung", p.rauchen) + "</div>" +
        psec("07", "Weitere Angaben") + '<div class="p-grid">' + pf("Auf Nachfrage verfügbar", (p.aufNachfrage || []).join(", ")) + pf("Notizen", p.notizen) + "</div>" +
        psec("08", "Bestätigung und Unterschrift") + '<div class="p-grid">' + pf("Ort, Datum", [p.ort, fmtDate(todayISO())].filter(Boolean).join(", ")) + pf("Unterschrift", "") + "</div>";
    }
    if (selectedDoc === "anschreiben") {
      var sal = "Sehr geehrte Damen und Herren,";
      if (x.ansprechpartner && x.anrede === "Herr") sal = "Sehr geehrter Herr " + x.ansprechpartner + ",";
      else if (x.ansprechpartner && x.anrede === "Frau") sal = "Sehr geehrte Frau " + x.ansprechpartner + ",";
      else if (x.ansprechpartner) sal = "Guten Tag " + x.ansprechpartner + ",";
      var d = new Date();
      var dateStr = [p.ort, d.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(", ");
      return '<p><b class="p-hl">' + esc(name || "Dein Name") + '</b></p><p class="p-soft">' + [street, city, p.telefon && "Tel. " + p.telefon, p.email].filter(Boolean).map(esc).join("<br>") + "</p>" +
        '<p class="mt-6">' + ([x.empfaengerName, x.empfaengerStrasse, x.empfaengerPlzOrt].filter(Boolean).map(esc).join("<br>") || '<span class="p-soft">Empfänger (optional)</span>') + "</p>" +
        '<p class="mt-4" style="text-align:right">' + esc(dateStr) + "</p>" +
        '<p class="mt-4"><b>' + esc(x.wohnung ? "Bewerbung um die Wohnung " + x.wohnung : "Bewerbung um eine Wohnung") + "</b></p>" +
        '<p class="mt-3">' + esc(sal) + "</p>" +
        '<div class="mt-2" style="white-space:pre-wrap">' + esc(x.text || "") + "</div>" +
        '<p class="mt-4">Mit freundlichen Grüßen</p><p class="mt-6">' + esc(name) + "</p>" +
        (x.anlagen && x.anlagen.length ? '<p class="mt-4" style="font-size:.72rem"><b>Anlagen</b><br>' + x.anlagen.map(function (a) { return "– " + esc(a); }).join("<br>") + "</p>" : "");
    }
    // deckblatt
    var facts = [["Gewünschter Einzug", fmtDate(p.einzug)], ["Personen im Haushalt", p.personen], ["Beruf / Tätigkeit", p.beruf], ["Arbeitgeber", p.arbeitgeber],
      ["Haustiere", p.haustiere === "Ja" && p.haustiereArt ? "Ja – " + p.haustiereArt : p.haustiere], ["Rauchen in der Wohnung", p.rauchen]].filter(function (f) { return f[1] !== undefined && f[1] !== ""; });
    return '<p class="p-brand">WOHNSTART</p><p class="p-brand mt-8">BEWERBUNGSMAPPE</p>' + (x.wohnung ? '<p class="p-soft">für die Wohnung ' + esc(x.wohnung) + "</p>" : "") +
      '<h4 class="mt-5" style="font-size:1.7rem"><span class="p-hl">' + esc(name || "Dein Name") + "</span></h4>" +
      '<p class="p-soft mt-2">' + [street, city, p.telefon && "Telefon: " + p.telefon, p.email && "E-Mail: " + p.email].filter(Boolean).map(esc).join("<br>") + "</p>" +
      (facts.length ? '<div class="mt-5">' + facts.map(function (f) { return '<div class="p-f" style="display:flex;gap:1rem;min-height:0"><small style="width:42%">' + esc(f[0]) + "</small><b>" + esc(f[1]) + "</b></div>"; }).join("") + "</div>" : "") +
      (x.anlagen && x.anlagen.length ? '<p class="mt-5"><b>Enthaltene Unterlagen</b></p><ol class="mt-1" style="padding-left:1.1rem;list-style:decimal">' + x.anlagen.map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") + "</ol>" : "");
  }
  function renderPreview() {
    if (!selectedDoc) return;
    $("ws-preview").innerHTML = previewHtml();
    entitlement().then(function (ent) {
      $("ws-preview-lock").classList.toggle("hidden", !!ent.komplett);
      $("ws-pdf-btn").textContent = ent.komplett ? "PDF erstellen" : "Mit WohnStart Komplett als PDF erstellen";
    });
    var s = profileStats();
    var warn = $("ws-doc-warn");
    if (s.missingRequired.length) {
      warn.innerHTML = "Bitte ergänze zuerst in <a href=\"#angaben\" class=\"ws-link\">Meine Angaben</a>: " + esc(s.missingRequired.join(", ")) + ".";
      warn.classList.remove("hidden");
    } else if (s.missingRecommended.length) {
      warn.innerHTML = "Tipp: Noch leer sind " + esc(s.missingRecommended.join(", ")) + ". <a href=\"#angaben\" class=\"ws-link\">Jetzt ergänzen</a>";
      warn.classList.remove("hidden");
    } else warn.classList.add("hidden");
  }

  function renderSteps() {
    var s = profileStats();
    var step = !selectedDoc ? (s.missingRequired.length ? 1 : 2) : 4;
    var done = { 1: !s.missingRequired.length, 2: !!selectedDoc, 3: !!selectedDoc, 4: false, 5: selectedDoc && justCreated === selectedDoc };
    if (done[5]) step = 6;
    document.querySelectorAll("#ws-doc-steps li").forEach(function (li) {
      var n = parseInt(li.getAttribute("data-step"), 10);
      li.classList.toggle("is-done", !!done[n] || n < step);
      li.classList.toggle("is-current", n === step);
    });
    var st = profileStats();
    $("ws-doc-profile").innerHTML = st.missingRequired.length
      ? '<span class="ws-st is-missing">!</span><span><b style="color:var(--ink)">Meine Angaben fehlen noch.</b> <a href="#angaben" class="ws-link">Jetzt eingeben</a></span>'
      : '<span class="ws-st is-ok">✓</span><span><b style="color:var(--ink)">Meine Angaben: ' + st.pct + ' % ausgefüllt.</b> <a href="#angaben" class="ws-link">Bearbeiten</a></span>';
  }

  var justCreated = null;
  function createPdf() {
    if (!selectedDoc) return;
    var btn = $("ws-pdf-btn"), err = $("ws-pdf-error");
    err.classList.add("hidden");
    entitlement(true).then(function (ent) {
      if (!ent.komplett) { location.hash = "#kurs"; return; }
      var s = profileStats();
      if (s.missingRequired.length) { err.textContent = "Bitte ergänze zuerst: " + s.missingRequired.join(", ") + "."; err.classList.remove("hidden"); return; }
      var payload = { type: selectedDoc, profile: profilePayload(), extra: currentExtraPayload() };
      if (selectedDoc === "anschreiben" && !String(payload.extra.text || "").trim()) { err.textContent = "Der Text des Anschreibens ist leer."; err.classList.remove("hidden"); return; }
      btn.disabled = true; btn.textContent = "PDF wird erstellt…";
      var filename = "WohnStart.pdf";
      fetch("/api/documents/generate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(payload) })
        .then(function (res) {
          if (!res.ok) return res.json().catch(function () { return {}; }).then(function (d) { throw Object.assign(new Error(d.error || "Das PDF konnte nicht erstellt werden."), { code: d.code }); });
          var cd = res.headers.get("Content-Disposition") || "";
          var m = cd.match(/filename="([^"]+)"/);
          if (m) filename = m[1];
          return res.blob();
        })
        .then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
          var gen = lsGet(LS.generated, {}) || {}; gen[selectedDoc] = todayISO(); lsSet(LS.generated, gen);
          justCreated = selectedDoc;
          // Keep a copy in "Meine Unterlagen" (replaces the previous version of the same document)
          var prev = getDocs().filter(function (d) { return d.source === "generated" && d.type === selectedDoc; });
          return Promise.all(prev.map(function (d) { return removeDoc(d.id); }))
            .then(function () { return addDoc(blob, { name: filename, type: selectedDoc, date: todayISO(), source: "generated" }); })
            .then(function () { $("ws-pdf-done").classList.remove("hidden"); }, function () { $("ws-pdf-done").classList.remove("hidden"); $("ws-pdf-done-store").textContent = "(Konnte nicht in Meine Unterlagen gespeichert werden.)"; });
        })
        .catch(function (e) {
          if (e.code === "komplett_required") { entitlement(true); location.hash = "#kurs"; return; }
          err.textContent = e.message || "Das PDF konnte nicht erstellt werden. Bitte versuche es erneut.";
          err.classList.remove("hidden");
        })
        .then(function () {
          btn.disabled = false;
          renderPreview(); renderDocChooser(); renderSteps();
        });
    });
  }

  function initDokumentErstellen() {
    var wrap = $("ws-doc-cards");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("[data-doc-choose]");
      if (!b) return;
      selectedDoc = b.getAttribute("data-doc-choose");
      justCreated = null;
      $("ws-pdf-done").classList.add("hidden");
      $("ws-pdf-done-store").textContent = "";
      renderDocChooser(); renderDocDetails();
      $("ws-doc-details").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("ws-doc-extra").addEventListener("input", function (e) {
      var k = e.target.getAttribute("data-x");
      if (!k) return;
      var patch = {}; patch[k] = e.target.value;
      var x = patchExtra(patch);
      if (selectedDoc === "anschreiben" && !letterTouched) $("ws-letter-text").value = defaultLetterText(getProfile(), x);
      renderPreview();
    });
    $("ws-letter-text").addEventListener("input", function () { letterTouched = true; patchExtra({ text: $("ws-letter-text").value, textTouched: true }); renderPreview(); });
    $("ws-letter-reset").addEventListener("click", function () {
      letterTouched = false; patchExtra({ text: "", textTouched: false });
      $("ws-letter-text").value = defaultLetterText(getProfile(), getExtra()); renderPreview();
    });
    $("ws-anlagen").addEventListener("change", renderPreview);
    $("ws-pdf-btn").addEventListener("click", createPdf);
  }
  function renderDokumentErstellen() {
    if (!$("ws-doc-cards")) return;
    renderDocChooser();
    renderDocDetails();
    renderSteps();
    entitlement().then(function (ent) {
      var blank = $("ws-blank-templates");
      blank.innerHTML = ent.komplett
        ? '<div class="flex flex-wrap gap-3 mt-3"><a href="/api/download/mieterselbstauskunft" class="btn-secondary px-5 py-3 rounded-lg font-semibold text-sm">Mieterselbstauskunft (leer, zum Ausdrucken)</a><a href="/api/download/wohnungsbewerbung" class="btn-secondary px-5 py-3 rounded-lg font-semibold text-sm">Checkliste Wohnungsbewerbung (PDF)</a></div>'
        : '<p class="text-sm mt-2" style="color:var(--ink-soft)">Mit WohnStart Komplett kannst du hier außerdem die leere Mieterselbstauskunft und die ausführliche Bewerbungs-Checkliste als PDF herunterladen.</p>';
    });
  }

  /* ---------------- Meine Unterlagen ---------------- */
  var pending = []; // files chosen but not yet saved
  function typeOptions(sel) {
    return '<option value="">Dokumentart wählen…</option>' + FOLDERS.map(function (f) {
      return '<optgroup label="' + esc(f.label) + '">' + DOC_TYPES.filter(function (t) { return t.folder === f.id; }).map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === sel ? " selected" : "") + ">" + esc(t.label) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
  }
  function addPendingFiles(fileList) {
    var errEl = $("ws-up-error"), errs = [];
    Array.prototype.slice.call(fileList || []).forEach(function (file) {
      var okType = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(file.type) || /\.(pdf|jpe?g|png|webp|heic)$/i.test(file.name);
      if (!okType) { errs.push(file.name + ": nur PDF oder Bilder (JPG, PNG)"); return; }
      if (file.size > MAX_FILE) { errs.push(file.name + ": größer als 25 MB"); return; }
      if (!file.size) { errs.push(file.name + ": Datei ist leer"); return; }
      pending.push({ key: uid(), file: file, name: file.name, type: guessType(file.name) || preselectType, date: "" });
    });
    errEl.textContent = errs.join(" · ");
    errEl.classList.toggle("hidden", !errs.length);
    if (fileList && fileList.length) setPreselect("");
    renderPending();
  }
  var preselectType = "";
  function setPreselect(typeId) {
    preselectType = typeId || "";
    var hint = $("ws-up-hint");
    if (!hint) return;
    hint.textContent = preselectType ? "Wähle jetzt die Datei für: " + TYPE_BY_ID[preselectType].label : "";
    hint.classList.toggle("hidden", !preselectType);
  }
  function renderPending() {
    var box = $("ws-pending");
    if (!pending.length) { box.innerHTML = ""; box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    box.innerHTML = '<p class="font-semibold" style="color:var(--ink)">Neu hinzufügen</p>' + pending.map(function (p) {
      return '<div class="surface rounded-xl p-4 mt-3" data-pending="' + p.key + '">' +
        '<p class="text-sm font-semibold truncate" style="color:var(--ink)">' + esc(p.file.name) + ' <span class="font-normal" style="color:var(--ink-soft)">· ' + fmtSize(p.file.size) + "</span></p>" +
        '<div class="grid sm:grid-cols-3 gap-3 mt-3">' +
          '<label class="ws-label">Dokumentart *<select class="ws-input" data-p="type">' + typeOptions(p.type) + "</select></label>" +
          '<label class="ws-label">Ausstellungsdatum <span class="ws-opt">(optional)</span><input type="date" class="ws-input" data-p="date" max="' + todayISO() + '" value="' + esc(p.date) + '"></label>' +
          '<label class="ws-label">Name<input type="text" class="ws-input" data-p="name" maxlength="120" value="' + esc(p.name) + '"></label>' +
        "</div>" +
        '<div class="flex flex-wrap gap-3 mt-3"><button type="button" class="btn-primary px-4 py-2.5 rounded-lg font-semibold text-sm" data-p-save>Speichern</button><button type="button" class="btn-secondary px-4 py-2.5 rounded-lg font-semibold text-sm" data-p-cancel>Verwerfen</button></div>' +
        '<p class="field-error hidden" data-p-err></p>' +
      "</div>";
    }).join("");
  }
  function onPendingEvent(e) {
    var card = e.target.closest("[data-pending]");
    if (!card) return;
    var item = pending.filter(function (p) { return p.key === card.getAttribute("data-pending"); })[0];
    if (!item) return;
    var field = e.target.getAttribute("data-p");
    if (field && (e.type === "input" || e.type === "change")) { item[field] = e.target.value; return; }
    if (e.type !== "click") return;
    if (e.target.hasAttribute("data-p-cancel")) { pending = pending.filter(function (p) { return p !== item; }); renderPending(); return; }
    if (e.target.hasAttribute("data-p-save")) {
      var err = card.querySelector("[data-p-err]");
      if (!item.type) { err.textContent = "Bitte wähle die Dokumentart aus."; err.classList.remove("hidden"); return; }
      e.target.disabled = true; e.target.textContent = "Wird gespeichert…";
      addDoc(item.file, { name: item.name || item.file.name, type: item.type, date: item.date })
        .then(function () {
          pending = pending.filter(function (p) { return p !== item; });
          renderPending(); renderUnterlagenList();
          toast("Gespeichert in „" + FOLDERS.filter(function (f) { return f.id === TYPE_BY_ID[item.type].folder; })[0].label + "“");
        })
        .catch(function () {
          e.target.disabled = false; e.target.textContent = "Speichern";
          err.textContent = "Speichern nicht möglich. Dein Browser erlaubt evtl. keinen lokalen Speicher (z. B. im privaten Modus) oder der Speicher ist voll.";
          err.classList.remove("hidden");
        });
    }
  }

  var editing = null;
  function fileRow(d) {
    var t = TYPE_BY_ID[d.type] || TYPE_BY_ID.sonstiges;
    var isPdf = /pdf/.test(d.mime) || /\.pdf$/i.test(d.name);
    var warnTxt = docWarning(d);
    var badges = [];
    if (d.source === "generated") badges.push('<span class="ws-badge is-template">Mit WohnStart erstellt</span>');
    if (d.aiStatus === "bereit") badges.push('<span class="ws-badge is-ok">KI-Check: bereit</span>');
    if (warnTxt) badges.push('<span class="ws-badge ' + (d.aiStatus === "problem" ? "is-bad" : "is-warn") + '">' + esc(warnTxt) + "</span>");
    if (d.aiType && d.aiType !== d.type && TYPE_BY_ID[d.aiType]) badges.push('<span class="ws-badge">KI erkannte: ' + esc(TYPE_BY_ID[d.aiType].label) + ' <button type="button" class="ws-link" data-act="usetype" data-id="' + d.id + '">übernehmen</button></span>');
    var meta = [t.label, d.date ? "vom " + fmtDate(d.date) : "", fmtSize(d.size)].filter(Boolean).join(" · ");
    var editHtml = editing === d.id
      ? '<div class="grid sm:grid-cols-3 gap-3 mt-3">' +
          '<label class="ws-label">Dokumentart<select class="ws-input" data-e="type">' + typeOptions(d.type) + "</select></label>" +
          '<label class="ws-label">Ausstellungsdatum<input type="date" class="ws-input" data-e="date" max="' + todayISO() + '" value="' + esc(d.date) + '"></label>' +
          '<label class="ws-label">Name<input type="text" class="ws-input" data-e="name" maxlength="120" value="' + esc(d.name) + '"></label>' +
        '</div><div class="flex gap-3 mt-3"><button type="button" class="btn-primary px-4 py-2 rounded-lg font-semibold text-sm" data-act="saveedit" data-id="' + d.id + '">Übernehmen</button><button type="button" class="btn-secondary px-4 py-2 rounded-lg font-semibold text-sm" data-act="canceledit">Abbrechen</button></div>'
      : "";
    return '<div class="ws-file" data-file="' + d.id + '">' +
      '<span class="ws-file-icon' + (isPdf ? " is-pdf" : "") + '" aria-hidden="true">' + (isPdf ? "PDF" : "BILD") + "</span>" +
      '<div class="min-w-0 flex-1">' +
        '<p class="font-semibold text-sm truncate" style="color:var(--ink)">' + esc(d.name) + "</p>" +
        '<p class="text-xs mt-0.5" style="color:var(--ink-soft)">' + esc(meta) + "</p>" +
        (badges.length ? '<div class="flex flex-wrap gap-1.5 mt-2">' + badges.join("") + "</div>" : "") +
        '<div class="flex flex-wrap gap-x-4 gap-y-1 mt-2">' +
          '<button type="button" class="ws-link" data-act="view" data-id="' + d.id + '">Ansehen</button>' +
          (isPdf ? '<button type="button" class="ws-link" data-act="ki" data-id="' + d.id + '">Mit KI prüfen</button>' : "") +
          '<button type="button" class="ws-link" data-act="edit" data-id="' + d.id + '">Bearbeiten</button>' +
          '<button type="button" class="ws-link is-danger" data-act="remove" data-id="' + d.id + '">Entfernen</button>' +
        "</div>" + editHtml +
      "</div></div>";
  }
  var openFolders = { identitaet: true, einkommen: true, bonitaet: true, weitere: true };
  function renderUnterlagenList() {
    var root = $("ws-folders");
    if (!root) return;
    var docs = getDocs();
    root.innerHTML = FOLDERS.map(function (f) {
      var items = docs.filter(function (d) { return (TYPE_BY_ID[d.type] || TYPE_BY_ID.sonstiges).folder === f.id; })
        .sort(function (a, b) { return (b.added || "").localeCompare(a.added || ""); });
      return '<details class="ws-folder surface rounded-2xl px-5 py-4 mt-4" data-folder="' + f.id + '"' + (openFolders[f.id] ? " open" : "") + ">" +
        '<summary class="flex items-center gap-3">' +
          '<svg width="26" height="22" viewBox="0 0 26 22" fill="none" aria-hidden="true"><path d="M2 5a2 2 0 0 1 2-2h5.6l2.2 2.4H22a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" fill="var(--blue-tint)" stroke="var(--blue-deep)" stroke-width="1.5" stroke-linejoin="round"/></svg>' +
          '<span class="flex-1 min-w-0"><span class="font-semibold block" style="color:var(--ink)">' + esc(f.label) + '</span><span class="text-xs block" style="color:var(--ink-soft)">' + esc(f.desc) + "</span></span>" +
          '<span class="ws-badge">' + items.length + "</span>" +
          '<svg class="ws-folder-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        "</summary>" +
        '<div class="mt-3">' + (items.length ? items.map(fileRow).join("") : '<p class="text-sm py-3" style="color:var(--ink-soft);border-top:1px solid var(--line)">Noch keine Dateien in diesem Ordner.</p>') + "</div>" +
      "</details>";
    }).join("");
    root.querySelectorAll("details[data-folder]").forEach(function (det) {
      det.addEventListener("toggle", function () { openFolders[det.getAttribute("data-folder")] = det.open; });
    });
    $("ws-unterlagen-count").textContent = docs.length + (docs.length === 1 ? " Datei" : " Dateien");
  }
  function viewDoc(id) {
    var d = getDocs().filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var w = window.open("", "_blank"); // opened inside the click, so popup blockers allow it
    getBlob(id).then(function (blob) {
      if (!blob) throw new Error("missing");
      var url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else { var a = document.createElement("a"); a.href = url; a.download = d.name; document.body.appendChild(a); a.click(); a.remove(); }
      setTimeout(function () { URL.revokeObjectURL(url); }, 120000);
    }).catch(function () { if (w) w.close(); toast("Die Datei konnte nicht geöffnet werden."); });
  }
  function kiCheckDoc(id) {
    var d = getDocs().filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    getBlob(id).then(function (blob) {
      var file = new File([blob], /\.pdf$/i.test(d.name) ? d.name : d.name + ".pdf", { type: "application/pdf" });
      location.hash = "#ki-check";
      setTimeout(function () {
        if (window.WohnStartKiCheck) window.WohnStartKiCheck.useFile(file, { docId: id });
      }, 60);
    }).catch(function () { toast("Die Datei konnte nicht geladen werden."); });
  }
  function onFolderClick(e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    var id = b.getAttribute("data-id"), act = b.getAttribute("data-act");
    if (act === "view") viewDoc(id);
    else if (act === "ki") kiCheckDoc(id);
    else if (act === "edit") { editing = id; renderUnterlagenList(); }
    else if (act === "canceledit") { editing = null; renderUnterlagenList(); }
    else if (act === "saveedit") {
      var row = document.querySelector('[data-file="' + id + '"]');
      var patch = {};
      row.querySelectorAll("[data-e]").forEach(function (el) { patch[el.getAttribute("data-e")] = el.value.trim(); });
      if (!patch.type) delete patch.type;
      if (!patch.name) delete patch.name;
      // a manual change of type or date makes an earlier KI result obsolete
      var old = getDocs().filter(function (x) { return x.id === id; })[0] || {};
      if ((patch.type && patch.type !== old.type) || patch.date !== old.date) { patch.aiStatus = null; patch.aiType = null; }
      updateDoc(id, patch); editing = null; renderUnterlagenList();
    }
    else if (act === "usetype") {
      var doc = getDocs().filter(function (x) { return x.id === id; })[0];
      if (doc && doc.aiType) updateDoc(id, { type: doc.aiType, aiType: null });
      renderUnterlagenList();
    }
    else if (act === "remove") {
      var d = getDocs().filter(function (x) { return x.id === id; })[0];
      if (!d || !window.confirm("„" + d.name + "“ aus Meine Unterlagen entfernen?")) return;
      removeDoc(id).then(function () {
        renderUnterlagenList();
          toast("Datei entfernt.");
      });
    }
  }
  function initUnterlagen() {
    var input = $("ws-up-input"), drop = $("ws-up-drop");
    if (!input) return;
    input.addEventListener("change", function () { addPendingFiles(input.files); input.value = ""; });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) { addPendingFiles(e.dataTransfer && e.dataTransfer.files); });
    var pend = $("ws-pending");
    ["click", "input", "change"].forEach(function (ev) { pend.addEventListener(ev, onPendingEvent); });
    $("ws-folders").addEventListener("click", onFolderClick);
  }
  function renderUnterlagen() {
    if (!$("ws-folders")) return;
    entitlement().then(function (ent) {
      $("ws-unterlagen-locked").innerHTML = ent.komplett ? "" : upsellCard("Unterlagen hochladen und organisieren", "Mit WohnStart Komplett legst du Ausweis, Gehaltsabrechnungen, SCHUFA & Co. geordnet ab – und nutzt sie direkt für Anschreiben, Deckblatt und KI-Check.");
      $("ws-unterlagen-main").classList.toggle("hidden", !ent.komplett);
    });
    renderUnterlagenList();
    idb().catch(function () {
      var e = $("ws-up-error");
      e.textContent = "Dein Browser erlaubt hier keinen lokalen Speicher (z. B. im privaten Modus). Dateien können deshalb nicht gespeichert werden.";
      e.classList.remove("hidden");
    });
  }

  /* ---------------- KI-Check bridge ---------------- */
  document.addEventListener("wohnstart:kicheck-result", function (e) {
    var det = e.detail || {};
    if (!det.meta || !det.meta.docId || !det.result) return;
    var r = det.result;
    updateDoc(det.meta.docId, { aiStatus: r.status, aiType: r.dokumenttyp && r.dokumenttyp !== "unbekannt" && r.dokumenttyp !== "sonstiges" ? r.dokumenttyp : null, aiAt: todayISO() });
    var res = $("kc-result");
    if (res) {
      var p = document.createElement("p");
      p.className = "text-sm mt-4";
      p.innerHTML = '<a href="#unterlagen" class="ws-link">← Zurück zu Meine Unterlagen</a> <span style="color:var(--ink-soft)">· Das Ergebnis wurde bei der Datei vermerkt.</span>';
      res.appendChild(p);
    }
  });

  /* ---------------- routing hook ---------------- */
  function onRoute(route) {
    renderTabs();
    if (route === "mein-wohnstart") renderHub();
    if (route === "angaben") renderAngaben();
    if (route === "dokument-erstellen") renderDokumentErstellen();
    if (route === "unterlagen") renderUnterlagen();
  }
  document.addEventListener("wohnstart:route", function (e) { onRoute(e.detail); });

  document.addEventListener("DOMContentLoaded", function () {
    renderTabs();
    initAngaben();
    initDokumentErstellen();
    initUnterlagen();
    onRoute((location.hash || "#home").replace("#", ""));
  });

  /* ---------------- public API (used by index.html) ---------------- */
  window.WS = {
    getProfile: getProfile,
    patchProfile: patchProfile,
    entitlement: entitlement,
    getDocs: getDocs,
    escape: esc,
    /** Opens "Meine Unterlagen" with the document type preselected for the next upload. */
    startUpload: function (typeId) {
      setPreselect(typeId);
      location.hash = "#unterlagen";
      // Opening the file picker needs a recent click; browsers that refuse it show the hint instead.
      setTimeout(function () { var input = $("ws-up-input"); if (input) try { input.click(); } catch (e) { /* noop */ } }, 50);
    }
  };
})();
