/* KI-Dokumenten-Check — frontend.
 * Flow: PDF hochladen → Dokument prüfen → Analyse läuft → Ergebnis.
 * The PDF goes only to our own backend (/api/ai-check/analyze); the API key
 * lives on the server. Results are kept in memory and never stored.
 * Everything from the server is HTML-escaped before rendering. */
(function () {
  "use strict";

  var MAX_BYTES = 15 * 1024 * 1024;
  var state = { file: null, xhr: null, meta: null }; // meta: set when a file comes from "Meine Unterlagen"

  function $(id) { return document.getElementById(id); }
  function show(id, on) { $(id).classList.toggle("hidden", !on); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtSize(b) {
    return b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  }

  /* ---------- steps & views ---------- */
  function setStep(n) {
    document.querySelectorAll(".kc-steps li").forEach(function (li) {
      var s = parseInt(li.getAttribute("data-step"), 10);
      li.classList.toggle("is-done", s < n);
      li.classList.toggle("is-current", s === n);
    });
  }
  /* ---------- remaining checks (display only; the server enforces the limit) ---------- */
  var locked = false;
  function renderUsage(u) {
    if (!u || !u.free) return;
    var f = u.free.remaining;
    var text = f === 2 ? "2 kostenlose Prüfungen verfügbar"
      : f === 1 ? "1 kostenlose Prüfung verbleibend"
      : f + " kostenlose Prüfungen verbleibend";
    if (u.paid) text += " · " + u.paid.remaining + " " + (u.paid.remaining === 1 ? "Prüfung" : "Prüfungen") + " aus deinem " + u.paid.packageName + "-Paket";
    $("kc-usage").textContent = text;
    show("kc-usage", true);
    locked = u.remaining < 1;
    if (u.paid) {
      $("kc-locked-title").textContent = "Die KI-Prüfungen deines Zugangs sind aufgebraucht.";
      $("kc-locked-text").textContent = "Alle KI-Dokumentenprüfungen aus deinem WohnStart-Zugang wurden genutzt. Bitte wende dich an den WohnStart-Support, wenn du weitere Prüfungen brauchst.";
      var cta = $("kc-locked-cta");
      if (cta) cta.classList.add("hidden");
    }
    if (locked && $("kc-result").classList.contains("hidden")) view("upload");
  }

  function view(name) {
    if (name === "upload" && locked) { show("kc-locked", true); name = "locked"; }
    else show("kc-locked", false);
    show("kc-upload", name === "upload");
    show("kc-loading", name === "loading");
    show("kc-error-box", name === "error");
    show("kc-result", name === "result");
  }

  /* ---------- file selection ---------- */
  function fileError(msg) {
    var el = $("kc-file-error");
    el.textContent = msg || "";
    el.classList.toggle("hidden", !msg);
  }
  function selectFile(file) {
    state.meta = null;
    fileError("");
    if (!file) return;
    var looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!looksPdf) { fileError("Bitte wähle eine PDF-Datei aus. Andere Formate werden noch nicht unterstützt."); return; }
    if (file.size === 0) { fileError("Die Datei ist leer."); return; }
    if (file.size > MAX_BYTES) { fileError("Die Datei ist " + fmtSize(file.size) + " groß. Maximal 15 MB sind erlaubt."); return; }
    state.file = file;
    $("kc-filename").textContent = file.name;
    $("kc-filesize").textContent = fmtSize(file.size);
    show("kc-selected", true);
    $("kc-drop").classList.add("has-file");
    setStep(2);
  }
  function clearFile() {
    state.file = null;
    $("kc-file").value = "";
    show("kc-selected", false);
    $("kc-drop").classList.remove("has-file");
    fileError("");
    setStep(1);
  }

  /* ---------- analysis ---------- */
  var STAGES = ["Dokumentart wird erkannt…", "Lesbarkeit wird geprüft…", "Wichtige Angaben werden gesucht…", "Seiten und Daten werden geprüft…", "Ergebnis wird zusammengestellt…"];
  var stageTimer = null, barTimer = null;

  function setBar(p) { $("kc-bar-fill").style.width = p + "%"; }
  function stopTimers() { clearInterval(stageTimer); clearInterval(barTimer); }

  function analyze() {
    if (!state.file) return;
    view("loading");
    setStep(3);
    setBar(3);
    $("kc-loading-detail").textContent = "Wird sicher hochgeladen…";

    var fd = new FormData();
    fd.append("file", state.file, state.file.name);
    var xhr = new XMLHttpRequest();
    state.xhr = xhr;
    xhr.open("POST", "/api/ai-check/analyze");
    xhr.responseType = "json";
    xhr.timeout = 180000;

    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) setBar(3 + Math.round((e.loaded / e.total) * 22));
    };
    xhr.upload.onload = function () {
      var i = 0, p = 25;
      $("kc-loading-detail").textContent = STAGES[0];
      stageTimer = setInterval(function () {
        i = Math.min(i + 1, STAGES.length - 1);
        $("kc-loading-detail").textContent = STAGES[i];
      }, 4500);
      // Eases toward 92 % while the AI works; jumps to 100 % on the result.
      barTimer = setInterval(function () { p += (92 - p) * 0.06; setBar(Math.round(p)); }, 600);
    };
    xhr.onload = function () {
      stopTimers();
      var data = xhr.response || {};
      if (xhr.status === 200 && data.result) {
        renderUsage(data.usage);
        setBar(100);
        setTimeout(function () { renderResult(data.result); }, 250);
      } else if (data.code === "limit_reached") {
        renderUsage(data.usage);
        view("upload");
        setStep(1);
      } else {
        showError(data.error || "Die Analyse konnte nicht durchgeführt werden (Fehler " + xhr.status + "). Bitte versuche es erneut.", data.code);
      }
    };
    xhr.onerror = function () { stopTimers(); showError("Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut."); };
    xhr.ontimeout = function () { stopTimers(); showError("Die Analyse hat zu lange gedauert. Bitte versuche es erneut."); };
    xhr.send(fd);
  }

  function showError(msg, code) {
    $("kc-error-text").textContent = msg;
    // Retrying the same file makes no sense if the file itself was the problem.
    var fileProblem = ["not_pdf", "too_large", "too_many_pages", "pdf_encrypted", "pdf_invalid", "pdf_pages", "no_file"].indexOf(code) !== -1;
    show("kc-retry", !fileProblem);
    view("error");
    setStep(2);
  }

  /* ---------- result ---------- */
  var STATUS = {
    bereit: { label: "Bereit", cls: "is-ready", text: "Das Dokument sieht gut aus." },
    aufmerksamkeit: { label: "Aufmerksamkeit nötig", cls: "is-attention", text: "Das Dokument ist nutzbar, aber du solltest etwas verbessern." },
    problem: { label: "Problem erkannt", cls: "is-problem", text: "So solltest du das Dokument noch nicht einreichen." }
  };
  var ICON = {
    ok: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="currentColor" opacity=".15"/><path d="M5.4 9.3l2.4 2.4 4.8-5.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    warn: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 2l7.4 13H1.6L9 2z" fill="currentColor" opacity=".15" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 7.2v3.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="9" cy="12.9" r=".95" fill="currentColor"/></svg>',
    bad: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="currentColor" opacity=".15"/><path d="M6.3 6.3l5.4 5.4M11.7 6.3l-5.4 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    unclear: '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="7.2" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.6 2.4"/><path d="M7.2 7.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="9" cy="12.7" r=".85" fill="currentColor"/></svg>'
  };
  var STATUS_ICON = { bereit: ICON.ok, aufmerksamkeit: ICON.warn, problem: ICON.bad };
  var CHECK_ICON = { ok: ["kc-c-ok", ICON.ok], problem: ["kc-c-bad", ICON.warn], nicht_erkennbar: ["kc-c-unclear", ICON.unclear] };
  var SEV = { kritisch: { cls: "kc-c-bad", label: "Problem" }, warnung: { cls: "kc-c-warn", label: "Aufmerksamkeit" }, hinweis: { cls: "kc-c-info", label: "Hinweis" } };

  function renderResult(r) {
    var st = STATUS[r.status] || STATUS.aufmerksamkeit;
    var title = r.dokumenttyp === "unbekannt" ? "Nicht eindeutig erkennbar" : r.dokumenttypLabel;
    var sub = r.dokumenttypBeschreibung && r.dokumenttypBeschreibung !== title ? r.dokumenttypBeschreibung : "";

    var checks = r.pruefpunkte.map(function (c) {
      var ic = CHECK_ICON[c.ergebnis];
      return '<li class="kc-check"><span class="' + ic[0] + '">' + ic[1] + "</span><span><span class=\"font-semibold\" style=\"color:var(--ink)\">" + esc(c.label) + '</span><span class="block text-sm mt-0.5" style="color:var(--ink-soft)">' + esc(c.erklaerung) + "</span></span></li>";
    }).join("");

    var okItems = r.inOrdnung.length ? r.inOrdnung : r.pruefpunkte.filter(function (c) { return c.ergebnis === "ok"; }).map(function (c) { return c.erklaerung; });
    var okHtml = okItems.length
      ? '<ul class="flex flex-col gap-2.5">' + okItems.map(function (t) { return '<li class="flex gap-2.5 text-sm" style="color:var(--ink)"><span class="kc-c-ok shrink-0">' + ICON.ok + "</span><span>" + esc(t) + "</span></li>"; }).join("") + "</ul>"
      : '<p class="text-sm" style="color:var(--ink-soft)">Nicht eindeutig erkennbar.</p>';

    var probHtml = r.probleme.length
      ? r.probleme.map(function (p) {
          var s = SEV[p.schwere] || SEV.warnung;
          return '<div class="kc-problem">' +
            '<p class="flex gap-2.5 text-sm" style="color:var(--ink)"><span class="' + s.cls + ' shrink-0">' + (p.schwere === "kritisch" ? ICON.bad : ICON.warn) + "</span><span>" + esc(p.problem) + "</span></p>" +
            '<p class="kc-todo text-sm mt-3"><span class="font-semibold" style="color:var(--ink)">Was soll ich tun?</span> <span style="color:var(--ink)">' + esc(p.empfehlung) + "</span></p>" +
          "</div>";
        }).join("")
      : '<p class="text-sm" style="color:var(--ink-soft)">Es wurden keine Probleme gefunden.</p>';

    var unclearHtml = r.nichtErkennbar.length
      ? '<div class="mt-8"><h3 class="kc-h">Nicht eindeutig erkennbar</h3><ul class="flex flex-col gap-2 mt-3">' +
        r.nichtErkennbar.map(function (t) { return '<li class="flex gap-2.5 text-sm" style="color:var(--ink)"><span class="kc-c-unclear shrink-0">' + ICON.unclear + "</span><span>" + esc(t) + "</span></li>"; }).join("") + "</ul></div>"
      : "";

    $("kc-result").innerHTML =
      '<div class="surface rounded-2xl overflow-hidden">' +
        '<div class="kc-head ' + st.cls + ' px-6 sm:px-8 py-6">' +
          '<p class="text-xs font-semibold" style="color:var(--ink-soft)">Dokument erkannt</p>' +
          '<h2 class="font-display text-2xl sm:text-3xl font-semibold mt-1" style="color:var(--ink)">' + esc(title) + "</h2>" +
          (sub ? '<p class="text-sm mt-1" style="color:var(--ink-soft)">' + esc(sub) + "</p>" : "") +
          '<p class="text-xs font-semibold mt-5" style="color:var(--ink-soft)">Status</p>' +
          '<div class="flex flex-wrap items-center gap-3 mt-1.5"><span class="kc-status ' + st.cls + '">' + STATUS_ICON[r.status] + esc(st.label) + "</span>" +
          '<span class="text-sm" style="color:var(--ink)">' + esc(r.zusammenfassung || st.text) + "</span></div>" +
          '<p class="text-xs mt-4" style="color:var(--ink-soft)">Datei: ' + esc(state.file ? state.file.name : "") + "</p>" +
        "</div>" +
        '<div class="px-6 sm:px-8 py-7">' +
          '<h3 class="kc-h">Was ist in Ordnung?</h3><div class="mt-3">' + okHtml + "</div>" +
          '<h3 class="kc-h mt-8">Was ist das Problem?</h3><div class="flex flex-col gap-3 mt-3">' + probHtml + "</div>" +
          unclearHtml +
          '<details class="kc-details mt-8"><summary class="text-sm font-semibold" style="color:var(--blue-deep)">Alle Prüfpunkte anzeigen</summary><ul class="flex flex-col gap-3 mt-4">' + checks + "</ul></details>" +
          '<div class="flex flex-wrap gap-3 mt-8"><button type="button" id="kc-again" class="btn-primary px-5 py-3 rounded-lg font-semibold">Weiteres Dokument prüfen</button></div>' +
          '<p class="text-xs mt-6" style="color:var(--ink-soft)">KI-gestützte Einschätzung – keine Echtheitsprüfung und keine Garantie, dass ein Vermieter das Dokument akzeptiert. Das Ergebnis wird nicht gespeichert.</p>' +
        "</div>" +
      "</div>";
    $("kc-again").addEventListener("click", function () { clearFile(); view("upload"); window.scrollTo({ top: 0, behavior: "smooth" }); });
    view("result");
    setStep(4);
    $("kc-result").scrollIntoView({ behavior: "smooth", block: "start" });
    // Lets "Meine Unterlagen" note the result on the stored file (public/js/komplett.js).
    try { document.dispatchEvent(new CustomEvent("wohnstart:kicheck-result", { detail: { result: r, meta: state.meta } })); } catch (e) { /* noop */ }
  }

  /* Used by "Meine Unterlagen" → "Mit KI prüfen": preselects a stored PDF.
     The user still starts the analysis with the normal "Dokument prüfen" button. */
  window.WohnStartKiCheck = {
    useFile: function (file, meta) {
      if (!$("page-ki-check")) return;
      clearFile();
      view("upload");
      selectFile(file);
      state.meta = state.file ? meta || null : null;
      var sel = $("kc-selected");
      if (sel && state.file) sel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  /* ---------- init ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    if (!$("page-ki-check")) return;
    var input = $("kc-file"), drop = $("kc-drop");
    input.addEventListener("change", function () { selectFile(input.files && input.files[0]); });
    ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("is-over"); }); });
    drop.addEventListener("drop", function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 1) fileError("Bitte lade ein Dokument nach dem anderen hoch.");
      else selectFile(files && files[0]);
    });
    // Stop the browser from opening a PDF dropped slightly outside the zone.
    ["dragover", "drop"].forEach(function (ev) {
      window.addEventListener(ev, function (e) { if (location.hash === "#ki-check") e.preventDefault(); });
    });
    $("kc-remove").addEventListener("click", clearFile);
    $("kc-submit").addEventListener("click", analyze);
    $("kc-retry").addEventListener("click", analyze);
    $("kc-other").addEventListener("click", function () { clearFile(); view("upload"); });

    fetch("/api/ai-check/status").then(function (r) { return r.json(); }).then(function (s) {
      if (!s.available) { show("kc-unavailable", true); show("kc-upload", false); return; }
      renderUsage(s.usage);
    }).catch(function () { /* the analyze call reports errors itself */ });
  });
})();
