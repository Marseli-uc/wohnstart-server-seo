/**
 * WohnStart Komplett – automatic document generation.
 *
 * The browser sends the customer's saved "Meine Angaben" plus a few
 * document-specific fields; this module turns them into a PDF with pdf-lib
 * (pure JavaScript, no native build step). Nothing is stored: the data only
 * lives for the duration of one request.
 *
 * All generated files are WohnStart TEMPLATES ("Vorlagen"), never official
 * documents; the Mieterselbstauskunft says so in its introduction.
 *
 * Only the layout lives below "design system". The data mapping (which
 * "Meine Angaben" field goes where) and the API are unchanged.
 */
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { lookup } = require("../security");

/* ---------------- input schema & sanitising ---------------- */

const STATUS_OPTIONS = ["Angestellte/r", "Beamtin / Beamter", "Selbstständig", "Ausbildung / Studium", "Rente / Pension", "Derzeit ohne Anstellung", "Sonstiges"];
const VERHAELTNIS_OPTIONS = ["unbefristet", "befristet", "in der Probezeit"];
const WOHNSITUATION_OPTIONS = ["zur Miete", "im Eigentum", "bei Eltern / Angehörigen", "in einer Wohngemeinschaft", "Sonstiges"];
const NACHFRAGE_OPTIONS = ["Einkommensnachweise", "Bonitätsauskunft (z. B. SCHUFA)", "Mietschuldenfreiheitsbescheinigung"];

// field -> [type, maxLength]
const PROFILE_FIELDS = {
  vorname: ["text", 60], nachname: ["text", 60], geburtsdatum: ["date"], telefon: ["text", 30], email: ["text", 120],
  strasse: ["text", 80], hausnummer: ["text", 10], plz: ["text", 10], ort: ["text", 60],
  einzug: ["date"], personen: ["int"], erwachsene: ["int"], kinder: ["int"], mitbewohner: ["multiline", 600],
  status: ["choice", STATUS_OPTIONS], beruf: ["text", 80], arbeitgeber: ["text", 100], beschaeftigtSeit: ["month"],
  arbeitsverhaeltnis: ["choice", VERHAELTNIS_OPTIONS], nettoeinkommen: ["money"], weitereEinnahmen: ["money"], weitereEinnahmenArt: ["text", 100],
  wohnsituation: ["choice", WOHNSITUATION_OPTIONS], wohnhaftSeit: ["month"], umzugsgrund: ["text", 160],
  vermieterName: ["text", 100], vermieterTelefon: ["text", 30], vermieterEmail: ["text", 120], vermieterKontakt: ["choice", ["Ja", "Nein"]],
  haustiere: ["choice", ["Nein", "Ja"]], haustiereArt: ["text", 120], rauchen: ["choice", ["Nein", "Ja"]],
  aufNachfrage: ["multi", NACHFRAGE_OPTIONS], notizen: ["multiline", 800],
};

const EXTRA_FIELDS = {
  wohnung: ["text", 160], // address or listing number of the apartment applied for
  empfaengerName: ["text", 100], empfaengerStrasse: ["text", 100], empfaengerPlzOrt: ["text", 100],
  anrede: ["choice", ["Herr", "Frau", "neutral"]], ansprechpartner: ["text", 80],
  text: ["multiline", 6000], // cover letter body (pre-filled in the browser, editable by the user)
  anlagen: ["list", 20, 120], // document names for "Anlagen" / Deckblatt
};

function clean(v, max) {
  return String(v == null ? "" : v)
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, max);
}

function sanitize(input, schema) {
  const out = {};
  const src = input && typeof input === "object" ? input : {};
  for (const [key, [type, a, b]] of Object.entries(schema)) {
    const v = src[key];
    if (v == null || v === "") continue;
    switch (type) {
      case "text": { const s = clean(v, a).replace(/\n/g, " "); if (s) out[key] = s; break; }
      case "multiline": { const s = clean(v, a); if (s) out[key] = s; break; }
      case "date": { const s = String(v); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) out[key] = s; break; }
      case "month": { const s = String(v); if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) out[key] = s.slice(0, 7); break; }
      case "int": { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0 && n <= 30) out[key] = n; break; }
      case "money": { const n = Number(v); if (Number.isFinite(n) && n >= 0 && n <= 1000000) out[key] = Math.round(n); break; }
      case "choice": { if (a.includes(v)) out[key] = v; break; }
      case "multi": { if (Array.isArray(v)) { const s = v.filter((x) => a.includes(x)); if (s.length) out[key] = s; } break; }
      case "list": { if (Array.isArray(v)) { const s = v.map((x) => clean(x, b).replace(/\n/g, " ")).filter(Boolean).slice(0, a); if (s.length) out[key] = s; } break; }
    }
  }
  return out;
}

/* ---------------- formatting ---------------- */

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const fmtDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const fmtMonth = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : "");
const fmtMoney = (n) => (n == null ? "" : `${n.toLocaleString("de-DE")} €`);
const todayBerlin = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
const longDate = (iso) => `${parseInt(iso.slice(8, 10), 10)}. ${MONTHS[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
const fullName = (p) => [p.vorname, p.nachname].filter(Boolean).join(" ");
const streetLine = (p) => [p.strasse, p.hausnummer].filter(Boolean).join(" ");
const cityLine = (p) => [p.plz, p.ort].filter(Boolean).join(" ");

/* ---------------- design system ----------------
 * One shared look for every WohnStart PDF: A4, generous margins, a slim
 * branded header, uppercase section bands, boxed form fields that also work
 * on paper, and a quiet footer with page numbers. Colours follow the website
 * (navy #1E3F73 as primary, one muted green accent, light grey surfaces).
 */
const { setCharacterSpacing } = require("pdf-lib");

const A4 = [595.28, 841.89];
const MX = 56; // left/right margin (~20 mm)
const MT = 42; // top margin
const MB = 58; // bottom margin (room for the footer)
const HEADER_H = 46;
const FOOTER_TEXT = "WohnStart · Professionelle Unterstützung bei der Wohnungssuche";

const C = {
  navy: rgb(0.118, 0.247, 0.451), // #1E3F73
  ink: rgb(0.055, 0.102, 0.169), // #0E1A2B
  soft: rgb(0.353, 0.392, 0.459), // #5A6475
  faint: rgb(0.58, 0.62, 0.68),
  line: rgb(0.835, 0.863, 0.898), // #D5DCE5
  band: rgb(0.945, 0.957, 0.973), // #F1F4F8
  tint: rgb(0.918, 0.945, 0.984), // #EAF1FB
  accent: rgb(0.122, 0.478, 0.361), // #1F7A5C (site green, used sparingly)
  white: rgb(1, 1, 1),
};

class Layout {
  /**
   * meta: { title, docLabel, author, rightTop?: string[] }
   *   docLabel  – small document name under "WohnStart" in the header
   *   rightTop  – up to two short lines shown right-aligned in the header
   */
  static async create(meta) {
    const l = new Layout();
    l.doc = await PDFDocument.create();
    l.doc.setTitle(meta.title);
    l.doc.setSubject(meta.subject || "Vorlage für Wohnungsbewerbungen");
    l.doc.setAuthor(meta.author || "WohnStart");
    l.doc.setCreator("WohnStart");
    l.doc.setProducer("WohnStart");
    l.doc.setLanguage("de-DE");
    l.font = await l.doc.embedFont(StandardFonts.Helvetica);
    l.bold = await l.doc.embedFont(StandardFonts.HelveticaBold);
    l.italic = await l.doc.embedFont(StandardFonts.HelveticaOblique);
    l.charset = new Set(l.font.getCharacterSet());
    l.meta = meta;
    l.width = A4[0] - 2 * MX;
    l.addPage();
    return l;
  }

  /** Replace characters the standard PDF font can't encode. */
  t(s) {
    return Array.from(String(s == null ? "" : s))
      .map((ch) => {
        if (ch === "\n") return ch;
        if (this.charset.has(ch.codePointAt(0))) return ch;
        const map = { "\u2009": " ", "\u202F": " ", "\u00A0": " ", "\u2012": "-", "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2610": "", "\u2611": "" };
        return map[ch] == null ? "" : map[ch];
      })
      .join("");
  }

  w(str, size, font = this.font, spacing = 0) {
    const s = this.t(str);
    return font.widthOfTextAtSize(s, size) + Math.max(0, s.length - 1) * spacing;
  }

  text(str, x, y, size, font = this.font, color = C.ink, spacing = 0) {
    const s = this.t(str);
    if (!s) return;
    if (spacing) this.page.pushOperators(setCharacterSpacing(spacing));
    this.page.drawText(s, { x, y, size, font, color });
    if (spacing) this.page.pushOperators(setCharacterSpacing(0));
  }

  /** Cut a single line with "…" so it fits into maxWidth. */
  fit(str, size, font, maxWidth) {
    let s = this.t(str);
    if (font.widthOfTextAtSize(s, size) <= maxWidth) return s;
    while (s.length > 1 && font.widthOfTextAtSize(s + "…", size) > maxWidth) s = s.slice(0, -1);
    return s.trimEnd() + "…";
  }

  logo(x, yTop, size) {
    // the website's house mark, as a simple outline
    const k = size / 28;
    this.page.drawSvgPath("M4 14L14 5l10 9 M7 12v9.5a1 1 0 0 0 1 1h4.2v-6.2h3.6V22.5h4.2a1 1 0 0 0 1-1V12", {
      x, y: yTop, scale: k, borderColor: C.navy, borderWidth: 2.2, borderLineCap: 1,
    });
  }

  header() {
    const top = A4[1] - MT;
    this.logo(MX - 2, top + 3, 17);
    this.text("WohnStart", MX + 18, top - 11, 11.5, this.bold, C.navy);
    if (this.meta.docLabel) this.text(this.meta.docLabel, MX + 18, top - 24, 8.5, this.italic, C.soft);
    (this.meta.rightTop || []).filter(Boolean).slice(0, 2).forEach((line, i) => {
      const font = i ? this.font : this.bold;
      const s = this.fit(line, 8, font, this.width * 0.55);
      this.page.drawText(s, { x: A4[0] - MX - font.widthOfTextAtSize(s, 8), y: top - 11 - i * 12, size: 8, font, color: i ? C.soft : C.ink });
    });
    this.page.drawLine({ start: { x: MX, y: top - HEADER_H + 10 }, end: { x: A4[0] - MX, y: top - HEADER_H + 10 }, thickness: 0.6, color: C.line });
    this.y = top - HEADER_H - 8;
  }

  addPage() {
    this.page = this.doc.addPage(A4);
    this.header();
  }

  /** Make sure h points fit on the current page, otherwise start a new one. */
  ensure(h) { if (this.y - h < MB + 2) this.addPage(); }
  space(h) { this.y -= h; }

  wrap(text, font, size, maxWidth) {
    const lines = [];
    for (const para of this.t(text).split("\n")) {
      if (!para.trim()) { lines.push(""); continue; }
      let line = "";
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(tryLine, size) <= maxWidth) { line = tryLine; continue; }
        // Word doesn't fit: first try to put part of it on the current line,
        // breaking after "-", ".", "@", "/" or "_" (names, streets, e-mails).
        let w = word;
        const room = line ? maxWidth - font.widthOfTextAtSize(line + " ", size) : maxWidth;
        const cut = font.widthOfTextAtSize(w, size) > maxWidth ? this.softBreak(w, font, size, room) : 0;
        if (cut) { lines.push(line ? line + " " + w.slice(0, cut) : w.slice(0, cut)); w = w.slice(cut); }
        else if (line) lines.push(line);
        while (font.widthOfTextAtSize(w, size) > maxWidth) {
          let i = this.softBreak(w, font, size, maxWidth);
          if (!i) { // no break point: hard break
            i = w.length;
            while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxWidth) i--;
          }
          lines.push(w.slice(0, i));
          w = w.slice(i);
        }
        line = w;
      }
      lines.push(line);
    }
    return lines;
  }

  /** Last position after "-", ".", "@", "/" or "_" at which w.slice(0, i) still fits into maxWidth (0 = none). */
  softBreak(w, font, size, maxWidth) {
    if (maxWidth < size * 3) return 0;
    for (let i = w.length - 1; i > 1; i--) {
      if ("-.@/_".includes(w[i - 1]) && font.widthOfTextAtSize(w.slice(0, i), size) <= maxWidth) return i;
    }
    return 0;
  }

  /** Paragraph that flows across pages. */
  para(text, { size = 10, font = this.font, color = C.ink, x = MX, width = this.width, gap = 1.5 } = {}) {
    const lh = size * gap;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lh);
      if (line) this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= lh;
    }
  }

  /** Document title on page 1. */
  title(main, sub) {
    this.space(10);
    for (const line of this.wrap(main, this.bold, 22, this.width)) { this.text(line, MX, this.y - 22, 22, this.bold, C.ink); this.y -= 28; }
    if (sub) { this.text(sub, MX, this.y - 10, 10.5, this.font, C.soft); this.y -= 18; }
    this.space(12);
  }

  /** Light grey key-value strip below the title, e.g. "Bewerber/in · Wohnung · Einzug". */
  infoStrip(pairs) {
    pairs = pairs.filter(([, v]) => v);
    if (!pairs.length) return;
    const pad = 12, gap = 18;
    const colW = (this.width - 2 * pad - gap * (pairs.length - 1)) / pairs.length;
    const cols = pairs.map(([k, v]) => [k, this.wrap(v, this.bold, 10, colW).slice(0, 4)]);
    const h = pad * 2 + 10 + Math.max(...cols.map(([, ls]) => ls.length)) * 13;
    this.ensure(h + 10);
    this.page.drawRectangle({ x: MX, y: this.y - h, width: this.width, height: h, color: C.band });
    this.page.drawRectangle({ x: MX, y: this.y - h, width: 3, height: h, color: C.navy });
    cols.forEach(([k, ls], i) => {
      const x = MX + pad + 4 + i * (colW + gap);
      this.text(k.toUpperCase(), x, this.y - pad - 7, 6.8, this.bold, C.soft, 0.6);
      ls.forEach((ln, j) => this.page.drawText(ln, { x, y: this.y - pad - 21 - j * 13, size: 10, font: this.bold, color: C.ink }));
    });
    this.y -= h + 16;
  }

  /** Small note box (light tint, navy bar). */
  note(text, title) {
    const pad = 11;
    const lines = this.wrap(text, this.font, 8.6, this.width - 2 * pad - 6);
    const h = pad * 2 + (title ? 13 : 0) + lines.length * 12.2 - 3;
    this.ensure(h + 12);
    this.page.drawRectangle({ x: MX, y: this.y - h, width: this.width, height: h, color: C.tint });
    this.page.drawRectangle({ x: MX, y: this.y - h, width: 3, height: h, color: C.navy });
    let y = this.y - pad - 8.6;
    if (title) { this.text(title, MX + pad + 6, y, 9, this.bold, C.navy); y -= 13; }
    for (const line of lines) { if (line) this.page.drawText(line, { x: MX + pad + 6, y, size: 8.6, font: this.font, color: C.ink }); y -= 12.2; }
    this.y -= h + (this.compact ? 10 : 16);
  }

  /** Section band: "01  PERSÖNLICHE ANGABEN". Kept together with what follows. */
  section(num, title, keep = 70) {
    this.ensure(26 + keep);
    this.space(6);
    const h = 22;
    this.page.drawRectangle({ x: MX, y: this.y - h, width: this.width, height: h, color: C.band });
    this.page.drawRectangle({ x: MX, y: this.y - h, width: 3, height: h, color: C.navy });
    let x = MX + 12;
    if (num) { this.text(num, x, this.y - 14.6, 8.5, this.bold, C.accent, 0.4); x += this.w(num, 8.5, this.bold, 0.4) + 9; }
    this.text(title.toUpperCase(), x, this.y - 14.6, 8.5, this.bold, C.navy, 0.9);
    this.y -= h + 12;
  }

  /** Small uppercase sub-heading (no band). */
  subheading(text, keep = 40) {
    this.ensure(18 + keep);
    this.space(this.compact ? 2 : 4);
    this.text(text.toUpperCase(), MX, this.y - 8, 7.5, this.bold, C.navy, 0.8);
    this.y -= this.compact ? 13 : 16;
  }

  /**
   * Row of labelled input boxes. cols = [{ label, value, w, suffix }]; w = width fraction.
   * Boxes grow with long values; empty boxes stay tall enough to write in by hand.
   */
  fields(cols, { minLines = 1 } = {}) {
    const gap = 12, size = 10, lh = 13, padX = 7, padY = 6.5;
    const avail = this.width - gap * (cols.length - 1);
    const prep = cols.map((c) => {
      const w = avail * (c.w || 1 / cols.length);
      const sfx = c.suffix ? this.w(c.suffix, 9, this.font) + 6 : 0;
      const labelLines = c.label ? this.wrap(c.label, this.font, 7.6, w).slice(0, 2) : [];
      return { ...c, w, sfx, labelLines, lines: c.value ? this.wrap(c.value, this.font, size, w - 2 * padX - sfx) : [] };
    });
    const n = Math.max(minLines, ...prep.map((c) => c.lines.length || 1));
    const boxH = Math.max(this.compact ? 21 : 24, padY * 2 + n * lh - 2);
    const labelH = Math.max(0, ...prep.map((c) => c.labelLines.length)) * 9 + (prep.some((c) => c.label) ? 3 : 0);
    this.ensure(labelH + boxH + 2); // the gap after the box may fall into the margin
    let x = MX;
    for (const c of prep) {
      // labels sit bottom-aligned on the box, so boxes in one row stay aligned
      c.labelLines.forEach((ln, i) => this.page.drawText(ln, { x, y: this.y - labelH + 3 + (c.labelLines.length - 1 - i) * 9 + 2.4, size: 7.6, font: this.font, color: C.soft }));
      const top = this.y - labelH;
      this.page.drawRectangle({ x, y: top - boxH, width: c.w, height: boxH, color: C.white, borderColor: C.line, borderWidth: 0.7 });
      c.lines.forEach((ln, i) => { if (ln) this.page.drawText(ln, { x: x + padX, y: top - padY - 9 - i * lh, size, font: this.font, color: C.ink }); });
      if (c.suffix) this.text(c.suffix, x + c.w - padX - this.w(c.suffix, 9), top - boxH / 2 - 3.2, 9, this.font, C.faint);
      x += c.w + gap;
    }
    this.y -= labelH + boxH + (this.compact ? 8 : 10);
  }

  checkbox(x, yTop, s, on) {
    this.page.drawRectangle({ x, y: yTop - s, width: s, height: s, borderColor: on ? C.navy : C.faint, borderWidth: 0.8, color: on ? C.navy : C.white });
    if (on) {
      this.page.drawLine({ start: { x: x + s * 0.22, y: yTop - s * 0.55 }, end: { x: x + s * 0.42, y: yTop - s * 0.76 }, thickness: 1.3, color: C.white });
      this.page.drawLine({ start: { x: x + s * 0.42, y: yTop - s * 0.76 }, end: { x: x + s * 0.8, y: yTop - s * 0.26 }, thickness: 1.3, color: C.white });
    }
  }

  /** Label + row of tick boxes; `selected` is a string or array. */
  options(label, opts, selected) {
    const sel = Array.isArray(selected) ? selected : selected ? [selected] : [];
    this.ensure(40);
    this.page.drawText(this.t(label), { x: MX, y: this.y - 7.6, size: 7.6, font: this.font, color: C.soft });
    this.y -= 15;
    let x = MX;
    const rowH = 17;
    for (const o of opts) {
      const on = sel.includes(o);
      const w = 10 + 6 + this.w(o, 9.5, on ? this.bold : this.font) + 20;
      if (x + w - 20 > A4[0] - MX && x > MX) { x = MX; this.y -= rowH; this.ensure(rowH); }
      this.checkbox(x, this.y - 0.5, 10, on);
      this.text(o, x + 16, this.y - 8.6, 9.5, on ? this.bold : this.font, on ? C.ink : C.soft);
      x += w;
    }
    this.y -= rowH + 6;
  }

  /** Checklist item: box + bold label + optional explanation. */
  checkItem(label, desc) {
    const k = this.compact;
    const ls = k ? 9.3 : 9.8, llh = k ? 12 : 13, ds = k ? 8 : 8.4, dlh = k ? 10.2 : 11.2;
    const tx = MX + 20, tw = this.width - 20;
    const lab = this.wrap(label, this.bold, ls, tw);
    const des = desc ? this.wrap(desc, this.font, ds, tw) : [];
    const h = lab.length * llh + des.length * dlh + (k ? 5 : 7);
    this.ensure(h);
    this.checkbox(MX, this.y - 0.5, k ? 10.5 : 11, false);
    let y = this.y - 8.6;
    lab.forEach((ln) => { this.page.drawText(ln, { x: tx, y, size: ls, font: this.bold, color: C.ink }); y -= llh; });
    des.forEach((ln) => { this.page.drawText(ln, { x: tx, y: y + 1.5, size: ds, font: this.font, color: C.soft }); y -= dlh; });
    this.y -= h;
  }

  /** Simple table. cols = [{ label, w, align }], rows = array of arrays (strings or {check:true}). */
  table(cols, rows, { rowH = this.compact ? 22 : 24, headerSize = 7.2 } = {}) {
    const widths = cols.map((c) => c.w * this.width);
    const headH = 22;
    const drawHead = () => {
      this.page.drawRectangle({ x: MX, y: this.y - headH, width: this.width, height: headH, color: C.navy });
      let x = MX;
      cols.forEach((c, i) => {
        const tx = c.align === "center" ? x + widths[i] / 2 - this.w(c.label.toUpperCase(), headerSize, this.bold, 0.5) / 2 : x + 8;
        this.text(c.label.toUpperCase(), tx, this.y - 14, headerSize, this.bold, C.white, 0.5);
        x += widths[i];
      });
      this.y -= headH;
    };
    this.ensure(headH + rowH * Math.min(rows.length, 2));
    drawHead();
    rows.forEach((row, r) => {
      const cells = row.map((cell, i) => (typeof cell === "string" ? this.wrap(cell, i === 0 ? this.bold : this.font, i === 0 ? 9.2 : 8.6, widths[i] - 16) : cell));
      const subLines = row.sub ? this.wrap(row.sub, this.font, 7.8, widths[0] - 16) : [];
      const k = this.compact;
      const h = Math.max(rowH, (k ? 7 : 8) + (Array.isArray(cells[0]) ? cells[0].length : 1) * 11.5 + subLines.length * (k ? 9.2 : 9.8) + (k ? 3.5 : 5));
      if (this.y - h < MB + 2) { this.addPage(); drawHead(); }
      if (r % 2 === 1) this.page.drawRectangle({ x: MX, y: this.y - h, width: this.width, height: h, color: C.band });
      let x = MX;
      cells.forEach((cell, i) => {
        if (Array.isArray(cell)) {
          let y = this.y - (this.compact ? 13.5 : 14);
          cell.forEach((ln) => { this.page.drawText(ln, { x: x + 8, y, size: i === 0 ? 9.2 : 8.6, font: i === 0 ? this.bold : this.font, color: C.ink }); y -= 11.5; });
          if (i === 0) subLines.forEach((ln) => { this.page.drawText(ln, { x: x + 8, y: y + 1.5, size: 7.8, font: this.font, color: C.soft }); y -= this.compact ? 9.2 : 9.8; });
        } else if (cell && cell.check) {
          this.checkbox(x + widths[i] / 2 - 5.5, this.y - h / 2 + 5.5, 11, false);
        }
        x += widths[i];
      });
      this.page.drawLine({ start: { x: MX, y: this.y - h }, end: { x: A4[0] - MX, y: this.y - h }, thickness: 0.5, color: C.line });
      this.y -= h;
    });
    this.y -= 14;
  }

  /** Blank writing lines (notes). */
  lines(n, gap = 22) {
    for (let i = 0; i < n; i++) {
      this.ensure(gap);
      this.y -= gap;
      this.page.drawLine({ start: { x: MX, y: this.y }, end: { x: A4[0] - MX, y: this.y }, thickness: 0.6, color: C.line });
    }
    this.y -= 10;
  }

  /** Signature row: lines with captions underneath. cols = [{ label, value, w }] */
  signatures(cols) {
    const gap = 26;
    const avail = this.width - gap * (cols.length - 1);
    this.ensure(64);
    this.y -= 34;
    let x = MX;
    cols.forEach((c) => {
      const w = avail * c.w;
      if (c.value) {
        let size = 10, v = this.t(c.value);
        while (size > 7.5 && this.font.widthOfTextAtSize(v, size) > w - 4) size -= 0.5;
        if (this.font.widthOfTextAtSize(v, size) > w - 4 && c.keepEnd) {
          const end = this.t(c.keepEnd);
          v = this.fit(v.slice(0, v.length - end.length), size, this.font, w - 4 - this.font.widthOfTextAtSize(end, size)) + end;
        } else v = this.fit(v, size, this.font, w - 4);
        this.page.drawText(v, { x: x + 2, y: this.y + 6, size, font: this.font, color: C.ink });
      }
      this.page.drawLine({ start: { x, y: this.y }, end: { x: x + w, y: this.y }, thickness: 0.8, color: C.soft });
      this.page.drawText(this.t(c.label), { x, y: this.y - 11, size: 7.6, font: this.font, color: C.soft });
      x += w + gap;
    });
    this.y -= 26;
  }

  finish() {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const y = MB - 26;
      p.drawLine({ start: { x: MX, y: y + 12 }, end: { x: A4[0] - MX, y: y + 12 }, thickness: 0.5, color: C.line });
      p.drawText(this.t(FOOTER_TEXT), { x: MX, y, size: 7, font: this.font, color: C.soft });
      if (pages.length > 1) {
        const right = `WohnStart · Seite ${i + 1} von ${pages.length}`;
        p.drawText(right, { x: A4[0] - MX - this.font.widthOfTextAtSize(right, 7), y, size: 7, font: this.font, color: C.soft });
      }
    });
    return this.doc.save();
  }
}

/* ---------------- documents ---------------- */

async function mieterselbstauskunft(p, x, opts = {}) {
  const blank = !!opts.blank;
  const name = fullName(p);
  const l = await Layout.create({
    title: "Mieterselbstauskunft", docLabel: "Mieterselbstauskunft", author: name || "WohnStart",
    rightTop: blank ? [] : [name, `erstellt am ${fmtDate(todayBerlin())}`],
  });
  l.title("Mieterselbstauskunft", "Freiwillige Selbstauskunft zur Wohnungsbewerbung");
  if (!blank) l.infoStrip([["Bewerber/in", name], ["Wohnung", x.wohnung], ["Einzug ab", fmtDate(p.einzug)]]);
  l.note(
    "Diese Selbstauskunft ist freiwillig und enthält nur Angaben, die bei Wohnungsbewerbungen häufig erfragt werden. " +
      (blank ? "Fülle nur aus, was im konkreten Fall angemessen ist; Felder, die du nicht beantworten möchtest, bleiben leer. " : "Leere Felder wurden bewusst nicht ausgefüllt. ") +
      "Zu sensiblen Themen (z. B. Herkunft, Religion, Gesundheit, Familienplanung) enthält dieses Formular keine Fragen. WohnStart-Vorlage – kein amtliches Formular."
  );

  l.section("01", "Persönliche Angaben");
  l.fields([{ label: "Nachname", value: p.nachname }, { label: "Vorname", value: p.vorname }]);
  l.fields([{ label: "Geburtsdatum", value: fmtDate(p.geburtsdatum), w: 0.24 }, { label: "Telefon", value: p.telefon, w: 0.3 }, { label: "E-Mail", value: p.email, w: 0.46 }]);
  l.fields([{ label: "Aktuelle Anschrift – Straße und Hausnummer", value: streetLine(p), w: 0.5 }, { label: "PLZ", value: p.plz, w: 0.14 }, { label: "Ort", value: p.ort, w: 0.36 }]);

  l.section("02", "Angaben zur Wohnung");
  l.fields([{ label: "Wohnung (Adresse oder Exposé-Nr.)", value: x.wohnung, w: 0.66 }, { label: "Gewünschter Einzugstermin", value: fmtDate(p.einzug), w: 0.34 }]);

  l.section("03", "Haushalt");
  l.fields([
    { label: "Personen insgesamt (inkl. Bewerber/in)", value: p.personen != null ? String(p.personen) : "" },
    { label: "davon Erwachsene", value: p.erwachsene != null ? String(p.erwachsene) : "" },
    { label: "davon Kinder", value: p.kinder != null ? String(p.kinder) : "" },
  ]);
  l.fields([{ label: "Weitere einziehende Personen (Name, Alter, Beziehung)", value: p.mitbewohner }], { minLines: p.mitbewohner ? 1 : 2 });

  l.section("04", "Beschäftigung und Einkommen", 90);
  l.options("Beschäftigungsstatus", STATUS_OPTIONS, p.status);
  l.fields([{ label: "Arbeitgeber / Unternehmen", value: p.arbeitgeber, w: 0.7 }, { label: "Beschäftigt seit", value: fmtMonth(p.beschaeftigtSeit), w: 0.3 }]);
  l.fields([{ label: "Beruf / Tätigkeit", value: p.beruf, w: 0.6 }, { label: "Monatliches Nettoeinkommen", value: p.nettoeinkommen != null ? p.nettoeinkommen.toLocaleString("de-DE") : "", w: 0.4, suffix: "€" }]);
  l.options("Arbeitsverhältnis", VERHAELTNIS_OPTIONS, p.arbeitsverhaeltnis);
  l.fields([{ label: "Weitere Einnahmen pro Monat", value: p.weitereEinnahmen != null ? p.weitereEinnahmen.toLocaleString("de-DE") : "", w: 0.34, suffix: "€" }, { label: "Art der weiteren Einnahmen", value: p.weitereEinnahmenArt, w: 0.66 }]);

  l.section("05", "Aktuelle Wohnsituation", 90);
  l.options("Ich wohne derzeit", WOHNSITUATION_OPTIONS, p.wohnsituation);
  l.fields([{ label: "Wohnhaft dort seit", value: fmtMonth(p.wohnhaftSeit), w: 0.28 }, { label: "Grund für den Umzug", value: p.umzugsgrund, w: 0.72 }]);
  l.fields([{ label: "Aktueller Vermieter – Name / Firma", value: p.vermieterName, w: 0.4 }, { label: "Telefon", value: p.vermieterTelefon, w: 0.25 }, { label: "E-Mail", value: p.vermieterEmail, w: 0.35 }]);
  l.options("Darf der aktuelle Vermieter bei konkretem Interesse kontaktiert werden?", ["Ja", "Nein"], p.vermieterKontakt);

  l.section("06", "Haustiere und Rauchen");
  l.options("Halten Sie Haustiere?", ["Nein", "Ja"], p.haustiere);
  if (blank || p.haustiere === "Ja" || p.haustiereArt) l.fields([{ label: "Falls ja: Art und Anzahl der Tiere", value: p.haustiereArt }]);
  l.options("Wird in der Wohnung geraucht?", ["Nein", "Ja"], p.rauchen);

  l.section("07", "Weitere Angaben");
  l.options("Auf Nachfrage kann ich zur Verfügung stellen", NACHFRAGE_OPTIONS, p.aufNachfrage);
  l.fields([{ label: "Was mir sonst noch wichtig ist", value: p.notizen }], { minLines: p.notizen ? 1 : 3 });

  l.section("08", "Bestätigung und Unterschrift", 130);
  l.para("Ich bestätige, dass meine Angaben nach bestem Wissen vollständig und wahrheitsgemäß sind. Mir ist bewusst, dass diese Selbstauskunft freiwillig ist und ich nur Angaben mache, die ich für die Wohnungsbewerbung angemessen finde.", { size: 9.2, color: C.ink });
  l.signatures([{ label: "Ort, Datum", value: blank ? "" : [p.ort, fmtDate(todayBerlin())].filter(Boolean).join(", "), keepEnd: (p.ort ? ", " : "") + fmtDate(todayBerlin()), w: 0.38 }, { label: "Unterschrift Bewerber/in", w: 0.62 }]);
  l.signatures([{ label: "Ort, Datum", w: 0.38 }, { label: "Unterschrift weitere volljährige Person (optional)", w: 0.62 }]);

  return l.finish();
}

async function anschreiben(p, x) {
  const name = fullName(p);
  const l = await Layout.create({ title: "Bewerbung um eine Wohnung", docLabel: "Bewerbungsanschreiben", author: name || "WohnStart" });

  // sender (right) and recipient (left), DIN-5008-like
  const sender = [name, streetLine(p), cityLine(p), p.telefon && `Tel. ${p.telefon}`, p.email].filter(Boolean);
  const top = l.y - 6;
  const colW = l.width * 0.45;
  let sy = top - 10;
  sender.forEach((s, i) => {
    const font = i === 0 ? l.bold : l.font, size = i === 0 ? 10 : 9;
    l.wrap(s, font, size, colW).forEach((ln) => {
      l.page.drawText(ln, { x: A4[0] - MX - font.widthOfTextAtSize(ln, size), y: sy, size, font, color: i === 0 ? C.ink : C.soft });
      sy -= 13;
    });
  });
  const rec = [x.empfaengerName, x.empfaengerStrasse, x.empfaengerPlzOrt].filter(Boolean)
    .reduce((acc, s) => acc.concat(l.wrap(s, l.font, 10.5, l.width * 0.5)), []);
  const recTop = sy - 22;
  rec.forEach((s, i) => l.page.drawText(s, { x: MX, y: recTop - 10 - i * 14.5, size: 10.5, font: l.font, color: C.ink }));
  l.y = recTop - Math.max(rec.length, 3) * 14.5 - 18;

  const dateStr = [p.ort, longDate(todayBerlin())].filter(Boolean).join(", ");
  l.wrap(dateStr, l.font, 10, l.width * 0.6).forEach((ln) => {
    l.page.drawText(ln, { x: A4[0] - MX - l.font.widthOfTextAtSize(ln, 10), y: l.y - 10, size: 10, font: l.font, color: C.ink });
    l.y -= 14;
  });
  l.y -= 24;

  const subject = x.wohnung ? `Bewerbung um die Wohnung ${x.wohnung}` : "Bewerbung um eine Wohnung";
  l.para(subject, { font: l.bold, size: 11.5, color: C.navy, gap: 1.35 });
  l.y -= 14;

  let salutation = "Sehr geehrte Damen und Herren,";
  if (x.ansprechpartner && x.anrede === "Herr") salutation = `Sehr geehrter Herr ${x.ansprechpartner},`;
  else if (x.ansprechpartner && x.anrede === "Frau") salutation = `Sehr geehrte Frau ${x.ansprechpartner},`;
  else if (x.ansprechpartner) salutation = `Guten Tag ${x.ansprechpartner},`;
  l.para(salutation, { size: 10.5 });
  l.y -= 7;
  l.para(x.text, { size: 10.5, gap: 1.55 });
  l.y -= 16;
  l.para("Mit freundlichen Grüßen", { size: 10.5 });
  l.ensure(56);
  l.y -= 36;
  l.para(name, { size: 10.5, font: l.bold });

  if (x.anlagen && x.anlagen.length) {
    l.y -= 18;
    l.ensure(30);
    l.text("ANLAGEN", MX, l.y - 8, 7.5, l.bold, C.navy, 0.8);
    l.y -= 16;
    x.anlagen.forEach((a) => l.para(`–  ${a}`, { size: 9.2, color: C.soft, gap: 1.4 }));
  }
  return l.finish();
}

async function deckblatt(p, x, opts = {}) {
  const dense = !!opts.dense; // second pass with tighter spacing if the first one needs two pages
  const name = fullName(p);
  const l = await Layout.create({ title: "Bewerbungsmappe", docLabel: "Bewerbungsmappe", author: name || "WohnStart" });
  let nameSize = 30;
  while (nameSize > 22 && l.wrap(name, l.bold, nameSize, l.width).length > 2) nameSize -= 2;
  const long = l.wrap(name, l.bold, nameSize, l.width).length > 1 || (x.anlagen || []).length > 5;
  l.y -= dense ? 6 : long ? 30 : 70;
  l.text("BEWERBUNGSMAPPE", MX, l.y - 10, 10, l.bold, C.accent, 2);
  l.y -= 24;
  if (x.wohnung) { l.para(`für die Wohnung ${x.wohnung}`, { size: 12.5, color: C.soft, gap: 1.35 }); }
  l.y -= 22;
  for (const line of l.wrap(name, l.bold, nameSize, l.width)) { l.text(line, MX, l.y - nameSize, nameSize, l.bold, C.ink); l.y -= nameSize * 1.2; }
  l.page.drawRectangle({ x: MX, y: l.y - 8, width: 44, height: 2.5, color: C.navy });
  l.y -= 28;
  [streetLine(p), cityLine(p), p.telefon && `Telefon  ${p.telefon}`, p.email && `E-Mail  ${p.email}`].filter(Boolean)
    .forEach((s) => l.para(s, { size: 11, color: C.soft, gap: dense ? 1.35 : 1.5 }));
  l.y -= dense ? 20 : 34;

  const facts = [
    ["Gewünschter Einzug", fmtDate(p.einzug)],
    ["Personen im Haushalt", p.personen != null ? String(p.personen) : ""],
    ["Beruf / Tätigkeit", p.beruf],
    ["Arbeitgeber", p.arbeitgeber],
    ["Haustiere", p.haustiere === "Ja" ? (p.haustiereArt ? `Ja – ${p.haustiereArt}` : "Ja") : p.haustiere],
    ["Rauchen in der Wohnung", p.rauchen],
  ].filter(([, v]) => v);
  if (facts.length) {
    l.subheading("Auf einen Blick");
    facts.forEach(([k, v], i) => {
      const lines = l.wrap(v, l.font, 10.5, l.width - 190);
      const h = (dense ? 8 : 12) + lines.length * (dense ? 13 : 14);
      l.ensure(h);
      if (i % 2 === 0) l.page.drawRectangle({ x: MX, y: l.y - h, width: l.width, height: h, color: C.band });
      l.text(k, MX + 10, l.y - 15, 9, l.font, C.soft);
      lines.forEach((ln, j) => l.page.drawText(ln, { x: MX + 180, y: l.y - 15 - j * 14, size: 10.5, font: l.font, color: C.ink }));
      l.y -= h;
    });
    l.y -= dense ? 16 : 28;
  }

  if (x.anlagen && x.anlagen.length) {
    l.subheading("Enthaltene Unterlagen");
    x.anlagen.forEach((a, i) => {
      const lines = l.wrap(a, l.font, 10.5, l.width - 34);
      const h = (dense ? 8 : 10) + lines.length * (dense ? 13 : 14);
      l.ensure(h);
      l.text(String(i + 1).padStart(2, "0"), MX, l.y - 14, 9.5, l.bold, C.accent);
      lines.forEach((ln, j) => l.page.drawText(ln, { x: MX + 30, y: l.y - 14 - j * 14, size: 10.5, font: l.font, color: C.ink }));
      l.y -= h;
      l.page.drawLine({ start: { x: MX, y: l.y }, end: { x: A4[0] - MX, y: l.y }, thickness: 0.5, color: C.line });
    });
  }
  return l.finish();
}

/** Cover sheet should stay on one page: if it doesn't fit, set it again more densely. */
async function deckblattOnePage(p, x) {
  const bytes = await deckblatt(p, x);
  if ((await PDFDocument.load(bytes)).getPageCount() === 1) return bytes;
  return deckblatt(p, x, { dense: true });
}

/* ---------------- static download: "Wohnungsbewerbung – Die komplette Checkliste" ----------------
 * Same content as the earlier ReportLab version, in the shared design.
 * Rebuilt with:  node scripts/build-static-pdfs.js
 */
const CHECKLIST_CHAPTERS = [
  {
    title: "Bevor du dich bewirbst", sub: "Budget, Suchprofil und Vorbereitung",
    intro: "Klare Eckdaten sparen Zeit: Wer sein Budget und seine Wünsche kennt, kann Anzeigen schneller einordnen und sich gezielter bewerben.",
    render(l) {
      l.subheading("Checkliste");
      [["Maximale Warmmiete festgelegt", "Gesamtmiete inkl. Nebenkosten und Heizung – die Summe, die du monatlich sicher tragen kannst."],
        ["Maximale Kaltmiete festgelegt", "Nettokaltmiete ohne Nebenkosten."], ["Gewünschte Wohnfläche festgelegt"], ["Gewünschte Zimmeranzahl festgelegt"],
        ["Bevorzugte Lage festgelegt"], ["Einzugstermin festgelegt"], ["Arbeitsweg / Fahrzeit geprüft", "Teste die Strecke möglichst zu deiner üblichen Pendelzeit."],
        ["Nebenkosten berücksichtigt", "Nebenkosten und Heizkosten können je nach Wohnung stark variieren."],
        ["Kaution finanziell eingeplant", "Bei Wohnraum darf sie in der Regel höchstens drei Nettokaltmieten betragen."],
        ["Eventuelle Maklerkosten geprüft", "Bei Mietwohnungen gilt in der Regel das Bestellerprinzip – lies die Anzeige genau."],
        ["Haustiere berücksichtigt, falls relevant"], ["Benötigte Unterlagen vorbereitet"]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(6);
      l.subheading("Mein Suchprofil", 120);
      l.fields([{ label: "Budget Warmmiete", suffix: "€" }, { label: "Max. Kaltmiete", suffix: "€" }]);
      l.fields([{ label: "Zimmer" }, { label: "Wohnfläche", suffix: "m²" }]);
      l.fields([{ label: "Gewünschter Einzug", w: 0.35 }, { label: "Bevorzugte Orte", w: 0.65 }]);
      l.fields([{ label: "Besonderheiten / Wünsche" }]);
      l.subheading("Einzugskosten im Blick", 40);
      l.fields([{ label: "Kaution (Betrag)", suffix: "€" }, { label: "Umzugskosten", suffix: "€" }, { label: "Möbel / Erstausstattung", suffix: "€" }, { label: "Sonstiges", suffix: "€" }]);
    },
  },
  {
    title: "Deine Bewerbungsunterlagen", sub: "Häufig angefragte und situationsabhängige Unterlagen",
    intro: "Vermieter und Hausverwaltungen fragen unterschiedliche Unterlagen an. Stelle deshalb nur die Dokumente zusammen, die im jeweiligen Fall angemessen sind und tatsächlich angefragt werden. Hier findest du eine Orientierung – keine Pflichtliste.",
    render(l) {
      const cols = [{ label: "Unterlage", w: 0.61 }, { label: "vorhanden", w: 0.13, align: "center" }, { label: "geprüft", w: 0.13, align: "center" }, { label: "vollständig", w: 0.13, align: "center" }];
      const row = (label, sub) => Object.assign([label, { check: true }, { check: true }, { check: true }], { sub });
      l.subheading("Häufig angefragte Unterlagen", 90);
      l.table(cols, [
        row("Mieterselbstauskunft", "Angaben zu Person, Beruf und Einkommen – oft vom Vermieter bereitgestellt."),
        row("Einkommensnachweise", "Zum Beispiel Gehaltsabrechnungen der letzten Monate – je nach Anfrage."),
        row("Arbeitsvertrag oder Beschäftigungsnachweis", "Nur, wenn angefragt; nicht relevante Vertragsinhalte kannst du schwärzen."),
        row("Personalausweis / Reisepass", "Viele Bewerber reichen Ausweiskopien erst nach einer Zusage ein."),
        row("Nachweis über bisheriges Mietverhältnis", "Zum Beispiel Kontaktdaten des bisherigen Vermieters."),
        row("Mietschuldenfreiheitsbescheinigung", "Falls vorhanden / angefragt. Bearbeitungszeit einplanen."),
        row("SCHUFA-Auskunft", "Falls angefragt. Kläre vorab, welche Auskunftsform akzeptiert wird."),
      ]);
      l.subheading("Je nach Situation zusätzlich", 90);
      l.table(cols, [
        row("Bürgschaft", "Zum Beispiel von Eltern, wenn der Vermieter sie verlangt."),
        row("Nachweis über Studien-/Ausbildungsstatus"), row("Nachweis über staatliche Leistungen, falls relevant"),
        row("Aufenthaltstitel / entsprechender Nachweis, falls relevant"), row("Weitere vom Vermieter angeforderte Unterlagen"),
      ]);
      l.note("Nicht jede Wohnungsbewerbung benötigt dieselben Unterlagen. Prüfe immer, welche Unterlagen tatsächlich verlangt werden. Gib nur die Informationen weiter, die für die Vermietung erforderlich sind – bei Unsicherheit hilft eine kurze Rückfrage beim Vermieter oder eine Beratung, z. B. durch einen Mieterverein.", "Wichtig");
      l.subheading("Mein Unterlagenstatus", 45);
      l.fields([{ label: "Einkommensnachweise aktuell bis" }, { label: "SCHUFA-Auskunft vom" }, { label: "Mietschuldenfreiheit beantragt am" }, { label: "Bürgschaft geklärt mit" }]);
    },
  },
  {
    title: "Deine Dokumente kontrollieren", sub: "Qualitätscheck, Dateinamen, Bewerbungsordner",
    intro: "Ein sauberer, vollständiger Eindruck zählt: Kontrolliere deine Unterlagen, bevor du sie verschickst.",
    render(l) {
      l.subheading("Qualitätscheck");
      [["Alle Namen sind korrekt geschrieben"], ["Aktuelle Adresse ist angegeben"], ["Telefonnummer ist korrekt"], ["E-Mail-Adresse ist korrekt"],
        ["Dokumente sind vollständig"], ["Dokumente sind gut lesbar", "Keine schiefen, abgeschnittenen oder unscharfen Scans bzw. Fotos."],
        ["Einkommensnachweise sind aktuell", "Verwende die zuletzt ausgestellten Nachweise."], ["Dateien haben verständliche Namen"],
        ["Keine unnötigen persönlichen Informationen enthalten", "Angaben, die für die Bewerbung nicht nötig sind, kannst du schwärzen."],
        ["PDFs lassen sich öffnen"], ["Alle Dokumente wurden in einem Ordner gesammelt"]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(8);
      l.subheading("Dateinamen – Beispiel  ·  Mein Bewerbungsordner", 110);
      const left = ["Mieterselbstauskunft.pdf", "Einkommensnachweis_01.pdf", "Einkommensnachweis_02.pdf", "SCHUFA.pdf", "Arbeitsvertrag.pdf"];
      const right = ["Bewerbungsunterlagen", "Einkommensnachweise", "Identitätsnachweis", "Weitere Nachweise"];
      const h = 18 + left.length * 16;
      l.ensure(h + 10);
      const half = (l.width - 14) / 2;
      [[left, MX, false], [right, MX + half + 14, true]].forEach(([items, x0, box]) => {
        l.page.drawRectangle({ x: x0, y: l.y - h, width: half, height: h, color: C.band });
        items.forEach((s, i) => {
          const y = l.y - 20 - i * 16;
          if (box) l.checkbox(x0 + 12, y + 8.5, 9, false);
          else l.page.drawCircle({ x: x0 + 16, y: y + 3, size: 1.8, color: C.navy });
          l.text(s, x0 + 28, y, 9.2, l.font, C.ink);
        });
      });
      l.y -= h + 10;
      l.para("Tipp: Lege den Ordner digital an (z. B. auf deinem Smartphone) – so kannst du bei einer neuen Anzeige sofort reagieren.", { size: 8.6, color: C.soft });
      l.space(8);
      l.note("Versende Unterlagen nur an Empfänger, die du als Vermieter, Hausverwaltung oder Makler nachvollziehen kannst. Gib sensible Dokumente nicht über unsichere Kanäle weiter, und überlege bei jedem Dokument, ob der Empfänger es in diesem Stadium wirklich benötigt.", "Datenschutz-Tipp");
    },
  },
  {
    title: "Vor der Bewerbung: Wohnung prüfen", sub: "Anzeige, Kosten und Besichtigung",
    intro: "Nicht jede Anzeige passt zu dir – und nicht jede Anzeige ist seriös. Prüfe Inserat und Anbieter, bevor du Zeit und persönliche Daten investierst.",
    render(l) {
      l.subheading("Anzeige prüfen");
      [["Ist die Gesamtmiete innerhalb meines Budgets?"], ["Wie hoch sind die Nebenkosten?", "Vorauszahlung oder Pauschale? Gibt es Hinweise auf frühere Abrechnungen?"],
        ["Ist eine Kaution angegeben?", "Höhe und Zahlungsmodalitäten notieren."], ["Welche Heizkosten sind enthalten?"], ["Ist die Wohnung frei / ab wann verfügbar?"],
        ["Gibt es eine Mindestmietdauer?"], ["Ist die Wohnung provisionsfrei?"], ["Gibt es Besonderheiten bei der Wohnung?"], ["Sind Haustiere erlaubt, falls relevant?"],
        ["Ist die Lage für mich geeignet?"],
        ["Habe ich die Anzeige auf auffällige Merkmale geprüft?", "Zum Beispiel: sehr niedrige Miete, Bitte um Vorauszahlung, Druck zur schnellen Entscheidung, Angebote ohne Besichtigung."],
        ["Habe ich die Kontaktdaten des Anbieters geprüft?", "Vollständiges Impressum, erreichbare Telefonnummer, nachvollziehbare Absenderadresse."]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(6);
      l.subheading("Besichtigung");
      [["Termin vereinbart"], ["Adresse gespeichert"], ["Fragen vorbereitet", "Zum Beispiel zu Nebenkosten, Heizung, Internet, Hausordnung, Nachbarschaft."], ["Mietkosten notiert"],
        ["Zustand der Wohnung geprüft", "Fenster, Bad, Küche, Feuchtigkeit/Schimmel, Steckdosen, Mobilfunk-Empfang."],
        ["Fotos / Notizen gemacht, soweit erlaubt", "Frage vorher kurz, ob Fotos in Ordnung sind."]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(6);
      l.subheading("Meine Eindrücke", 120);
      l.fields([{ label: "Adresse", w: 0.5 }, { label: "Warmmiete", suffix: "€", w: 0.25 }, { label: "Kaution", suffix: "€", w: 0.25 }]);
      l.fields([{ label: "Positiv / negativ aufgefallen" }], { minLines: 2 });
    },
  },
  {
    title: "Bewerbung vorbereiten und senden", sub: "Checkliste, Formulierungshilfe, Versandprotokoll",
    intro: "Eine klare, freundliche und vollständige Nachricht macht es dem Vermieter leicht, dich einzuordnen.",
    render(l) {
      l.subheading("Schritt für Schritt");
      [["Richtige Kontaktperson verwendet"], ["Freundliche Anrede verwendet"], ["Kurz vorgestellt"], ["Beruf / Ausbildung genannt"], ["Gewünschter Einzugstermin genannt"],
        ["Relevante Informationen angegeben", "Zum Beispiel Anzahl der einziehenden Personen, Haustiere, Kontaktdaten."], ["Unterlagen angehängt"],
        ["Anhänge vor dem Senden überprüft", "Richtige Dateien? Lesbar? Nicht zu groß für den Versand?"], ["Betreff eindeutig formuliert", "Mit Adresse oder Objektnummer der Wohnung."],
        ["E-Mail-Adresse des Empfängers kontrolliert"], ["Bewerbung abgeschickt"]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(8);
      l.note("Betreff: Anfrage Wohnung Musterstraße 12, 3. OG – [Vor- und Nachname]\nSehr geehrte Frau / Sehr geehrter Herr [Name], ich interessiere mich für Ihre 2-Zimmer-Wohnung in der Musterstraße 12. Ich bin [Beruf / Ausbildung] bei [Arbeitgeber] und würde gern zum [Datum] einziehen. Meine Unterlagen habe ich als PDF angehängt. Über eine Einladung zur Besichtigung freue ich mich. Mit freundlichen Grüßen, [Name, Telefonnummer]", "Formulierungshilfe (zum Anpassen)");
      l.note("„Kann die Person auf der anderen Seite innerhalb weniger Sekunden verstehen, wer du bist, wann du einziehen möchtest und welche Unterlagen du mitgeschickt hast?“", "Vor dem Absenden");
      l.subheading("Versandprotokoll", 80);
      l.fields([{ label: "Gesendet am", w: 0.3 }, { label: "An", w: 0.7 }]);
      l.fields([{ label: "Wohnung / Adresse" }]);
    },
  },
  {
    title: "Nach der Bewerbung", sub: "Nachfassen und Bewerbungsübersicht",
    intro: "Bleib organisiert: Wer den Überblick behält, kann schnell und höflich reagieren.",
    render(l) {
      l.subheading("Checkliste");
      [["Bewerbung gespeichert"], ["Datum notiert"], ["Ansprechpartner notiert"], ["Telefonnummer gespeichert"], ["Rückmeldung abwarten"], ["Bei Rückfragen erreichbar sein"],
        ["Weitere Wohnungen parallel suchen"], ["Bei Bedarf höflich nach dem Stand fragen", "Sinnvoll ist eine kurze, freundliche Nachfrage, wenn einige Tage keine Rückmeldung gekommen ist."]].forEach(([a, b]) => l.checkItem(a, b));
      l.space(8);
      l.subheading("Meine Bewerbungsübersicht", 120);
      l.table([{ label: "Wohnung", w: 0.22 }, { label: "Ort", w: 0.14 }, { label: "Kontakt", w: 0.2 }, { label: "Bewerbung am", w: 0.15 }, { label: "Rückmeldung", w: 0.15 }, { label: "Status", w: 0.14 }],
        Array.from({ length: 9 }, () => ["", "", "", "", "", ""]), { rowH: 26 });
    },
  },
  {
    title: "Meine Wohnungsbewerbung", sub: "Persönliche Abschlusscheckliste und Notizen",
    intro: "Deine persönliche Abschlusscheckliste – drucke sie für jede Wohnung aus, auf die du dich bewirbst.",
    render(l) {
      l.fields([{ label: "Wohnung / Adresse" }]);
      l.space(4);
      l.subheading("Abschlusscheckliste");
      ["Wohnung gefunden", "Besichtigung vereinbart", "Besichtigung durchgeführt", "Unterlagen vorbereitet", "Unterlagen geprüft", "Bewerbung erstellt",
        "Bewerbung abgeschickt", "Rückmeldung erhalten", "Weitere Schritte erledigt"].forEach((a) => { l.checkItem(a); l.space(3); });
      l.space(6);
      l.subheading("Meine Notizen", 100);
      l.lines(7);
      l.ensure(60);
      const h = 50;
      l.page.drawRectangle({ x: MX, y: l.y - h, width: l.width, height: h, color: C.navy });
      const q = "„Gut vorbereitet. Klar organisiert. Bereit für die nächste Wohnungsbewerbung.“";
      l.text("WohnStart", A4[0] / 2 - l.w("WohnStart", 10.5, l.bold) / 2, l.y - 20, 10.5, l.bold, C.white);
      l.text(q, A4[0] / 2 - l.w(q, 9, l.italic) / 2, l.y - 36, 9, l.italic, C.white);
      l.y -= h + 10;
    },
  },
];

async function checkliste() {
  const l = await Layout.create({ title: "Wohnungsbewerbung – Die komplette Checkliste", subject: "Checkliste für die Wohnungsbewerbung", docLabel: "Checkliste Wohnungsbewerbung" });
  l.compact = true; // denser spacing so every chapter fits on one page
  // cover + table of contents (page numbers filled in after the chapters are laid out)
  l.y -= 60;
  l.text("WOHNUNGSBEWERBUNG", MX, l.y - 10, 10, l.bold, C.accent, 2);
  l.y -= 22;
  l.text("Die komplette Checkliste", MX, l.y - 28, 28, l.bold, C.ink);
  l.y -= 40;
  l.para("Schritt für Schritt vorbereitet zur nächsten Wohnungsbewerbung – zum Abhaken, Organisieren und Vorbereiten deiner Bewerbungsunterlagen.", { size: 11.5, color: C.soft, gap: 1.45, width: l.width * 0.85 });
  l.page.drawRectangle({ x: MX, y: l.y - 14, width: 44, height: 2.5, color: C.navy });
  l.y -= 44;
  l.subheading("Inhalt", 300);
  const coverPage = l.page;
  const tocRows = CHECKLIST_CHAPTERS.map((ch, i) => {
    const y = l.y;
    l.text(String(i + 1).padStart(2, "0"), MX, y - 12, 10, l.bold, C.accent);
    l.text(ch.title, MX + 32, y - 12, 11, l.bold, C.ink);
    l.text(ch.sub, MX + 32, y - 26, 8.6, l.font, C.soft);
    l.page.drawLine({ start: { x: MX, y: y - 36 }, end: { x: A4[0] - MX, y: y - 36 }, thickness: 0.5, color: C.line });
    l.y -= 44;
    return y;
  });
  const usageY = l.y - 8;
  l.y -= 8 + 70; // room for the "So nutzt du" note (drawn after page numbers are known)
  const hintText = "Diese Checkliste dient der persönlichen Organisation und ersetzt keine Rechtsberatung. Welche Unterlagen verlangt werden, entscheidet sich im Einzelfall – richte dich immer nach den Angaben des jeweiligen Vermieters bzw. der Hausverwaltung.";

  const startPages = [];
  CHECKLIST_CHAPTERS.forEach((ch, i) => {
    l.addPage();
    startPages.push(l.doc.getPageCount());
    l.space(6);
    l.text(`KAPITEL ${i + 1}`, MX, l.y - 8, 7.5, l.bold, C.accent, 1.2);
    l.y -= 16;
    for (const line of l.wrap(ch.title, l.bold, 19, l.width)) { l.text(line, MX, l.y - 19, 19, l.bold, C.ink); l.y -= 25; }
    l.space(2);
    l.para(ch.intro, { size: 9.8, color: C.soft, gap: 1.5 });
    l.space(10);
    ch.render(l);
  });

  // fill in TOC page numbers and the usage note on the cover
  const keep = l.page; const keepY = l.y;
  l.page = coverPage;
  tocRows.forEach((y, i) => {
    const n = String(startPages[i]);
    l.text(n, A4[0] - MX - l.w(n, 10.5, l.bold), y - 12, 10.5, l.bold, C.navy);
  });
  l.y = usageY;
  const reprint = [0, 4, 5].map((i) => startPages[i]);
  l.note(`Drucke das Dokument aus oder fülle es digital am Tablet bzw. PC aus. Arbeite die Kapitel der Reihe nach ab – oder springe direkt zu dem Schritt, den du gerade brauchst. Die Seiten ${reprint[0]}, ${reprint[1]} und ${reprint[2]} kannst du für jede neue Wohnung erneut ausdrucken.`, "So nutzt du diese Checkliste");
  l.para(hintText, { size: 7.8, color: C.soft, gap: 1.45 });
  l.page = keep; l.y = keepY;
  return l.finish();
}

/* ---------------- public API ---------------- */

const DOCUMENTS = {
  mieterselbstauskunft: { label: "Mieterselbstauskunft", build: mieterselbstauskunft, required: ["vorname", "nachname"] },
  anschreiben: { label: "Bewerbungsanschreiben", build: anschreiben, required: ["vorname", "nachname"], requiredExtra: ["text"] },
  deckblatt: { label: "Bewerbungsmappe-Deckblatt", build: deckblattOnePage, required: ["vorname", "nachname"] },
};

const LABELS = { vorname: "Vorname", nachname: "Nachname", text: "Text des Anschreibens" };

class DocumentInputError extends Error {}

/** Returns { bytes, filename } or throws DocumentInputError. */
async function generateDocument(type, rawProfile, rawExtra) {
  const def = lookup(DOCUMENTS, type);
  if (!def) throw new DocumentInputError("Unbekannte Vorlage.");
  const profile = sanitize(rawProfile, PROFILE_FIELDS);
  const extra = sanitize(rawExtra, EXTRA_FIELDS);
  const missing = def.required.filter((k) => !profile[k]).concat((def.requiredExtra || []).filter((k) => !extra[k]));
  if (missing.length) {
    throw new DocumentInputError(`Bitte ergänze zuerst: ${missing.map((k) => LABELS[k] || k).join(", ")}.`);
  }
  const bytes = await def.build(profile, extra);
  const namePart = [profile.nachname, profile.vorname].filter(Boolean).join("_")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[^A-Za-z0-9_-]+/g, "-");
  const filename = `${def.label.replace(/[^A-Za-z0-9]+/g, "-")}_${namePart || "WohnStart"}.pdf`;
  return { bytes: Buffer.from(bytes), filename };
}

/** The two static downloads in private/documents (see scripts/build-static-pdfs.js). */
const STATIC_DOCUMENTS = {
  "mieterselbstauskunft.pdf": () => mieterselbstauskunft({}, {}, { blank: true }),
  "wohnungsbewerbung-checkliste.pdf": () => checkliste(),
};

module.exports = { generateDocument, DocumentInputError, DOCUMENT_TYPES: Object.keys(DOCUMENTS), STATIC_DOCUMENTS };
