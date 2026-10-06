/**
 * Rebuilds the two static downloads in private/documents in the current
 * WohnStart PDF design (server/services/document-generator.js):
 *   - mieterselbstauskunft.pdf          (blank form, to print and fill in by hand)
 *   - wohnungsbewerbung-checkliste.pdf  (the complete application checklist)
 *
 * Usage:  node scripts/build-static-pdfs.js
 *
 * File names stay the same, so the download route (server/routes/downloads.js)
 * needs no change. The previous versions are kept once in private/documents/archiv/.
 */
const fs = require("fs");
const path = require("path");
const { STATIC_DOCUMENTS } = require("../server/services/document-generator");

const dir = path.join(__dirname, "..", "private", "documents");
const archive = path.join(dir, "archiv");

(async () => {
  for (const [file, build] of Object.entries(STATIC_DOCUMENTS)) {
    const target = path.join(dir, file);
    const backup = path.join(archive, file.replace(/\.pdf$/, "-alt.pdf"));
    if (fs.existsSync(target) && !fs.existsSync(backup)) {
      fs.mkdirSync(archive, { recursive: true });
      fs.copyFileSync(target, backup);
      console.log(`Archiviert: archiv/${path.basename(backup)}`);
    }
    const bytes = await build();
    fs.writeFileSync(target, bytes);
    console.log(`Erstellt:   ${file} (${Math.round(bytes.length / 1024)} KB)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
