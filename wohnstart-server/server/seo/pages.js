/**
 * Content for the public SEO pages.
 *
 * These are NEW standalone pages. They do not touch the single-page app in
 * public/index.html — no route, no script and no existing section is changed by
 * them. Each page has its own URL, its own title/description/H1 and its own
 * text, so search engines get distinct pages instead of ten topics competing
 * for one URL.
 *
 * Writing rules followed here:
 *   - no legal claims presented as fact; anything that depends on the landlord,
 *     the city or the individual case says so,
 *   - no promises that someone will get an apartment,
 *   - no invented statistics, ratings, prices or sources,
 *   - keywords only where they match what the paragraph is actually about.
 *
 * `body` is trusted HTML written here in this file (never user input).
 */

const PAGES = [
  /* ------------------------------------------------------------------ */
  {
    slug: "wohnungssuche",
    nav: "Wohnungssuche",
    title: "Wohnungssuche in Deutschland: Ablauf, Unterlagen und Tipps",
    description:
      "Wie die Wohnungssuche in Deutschland abläuft: von der Budgetplanung über Besichtigung und Unterlagen bis zur Bewerbung. Mit praktischen Tipps und häufigen Fehlern.",
    h1: "Wohnungssuche in Deutschland",
    intro:
      "Eine Mietwohnung zu finden ist in vielen deutschen Städten vor allem ein Wettbewerb um Aufmerksamkeit und Geschwindigkeit. Diese Seite erklärt, wie der Ablauf typischerweise aussieht, welche Unterlagen häufig verlangt werden und womit du dir die Suche leichter machst.",
    breadcrumb: "Wohnungssuche",
    body: `
<h2>So läuft die Wohnungssuche typischerweise ab</h2>
<p>Der Weg zur Mietwohnung ähnelt sich fast überall, auch wenn Dauer und Konkurrenz je nach Stadt stark schwanken:</p>
<ol>
  <li><strong>Budget klären.</strong> Entscheidend ist die Warmmiete, nicht die Kaltmiete. Dazu kommen einmalige Kosten zum Einzug.</li>
  <li><strong>Suchprofil festlegen.</strong> Zimmerzahl, Fläche, Lage und frühester Einzugstermin. Je klarer das Profil, desto schneller kannst du Anzeigen einordnen.</li>
  <li><strong>Anzeigen verfolgen.</strong> Auf den gängigen Portalen, über Wohnungsgenossenschaften, kommunale Wohnungsunternehmen, Aushänge und das eigene Umfeld.</li>
  <li><strong>Anfrage schicken.</strong> Kurz, freundlich und vollständig – wer sich meldet, bekommt eher einen Besichtigungstermin.</li>
  <li><strong>Besichtigung.</strong> Oft als Sammel- oder Einzeltermin.</li>
  <li><strong>Bewerbung einreichen.</strong> Meist mit Mieterselbstauskunft und den angefragten Nachweisen.</li>
  <li><strong>Zusage und Mietvertrag.</strong> Erst danach werden in der Regel Ausweiskopien und Kontodaten relevant.</li>
</ol>
<p>Wie lange das dauert, hängt stark vom Wohnort ab. In angespannten Märkten sind viele Bewerbungen auf eine Wohnung normal – das sagt nichts über dich aus.</p>

<h2>Was die Wohnung wirklich kostet</h2>
<p>Bei der Budgetplanung zählt die Summe, die monatlich tatsächlich vom Konto geht:</p>
<ul>
  <li><strong>Kaltmiete</strong> – die reine Miete für die Wohnfläche.</li>
  <li><strong>Nebenkosten</strong> – Betriebskosten wie Müll, Wasser, Hausreinigung; meist als Vorauszahlung.</li>
  <li><strong>Heizkosten</strong> – je nach Gebäude und Energieträger sehr unterschiedlich.</li>
  <li><strong>Strom und Internet</strong> – schließt du in der Regel selbst ab; in der Miete sind sie meist nicht enthalten.</li>
</ul>
<p>Dazu kommen einmalige Kosten zum Einzug: die Kaution (bei Wohnraum höchstens drei Nettokaltmieten), eventuell eine Maklerprovision (bei Mietwohnungen gilt in der Regel das Bestellerprinzip) sowie Umzug und Erstausstattung.</p>
<p>Mit dem <a href="/mietpreis-rechner">Mietpreis-Rechner</a> kannst du deine voraussichtlichen monatlichen Wohnkosten und den Preis pro Quadratmeter überschlagen.</p>

<h2>Welche Unterlagen häufig verlangt werden</h2>
<p>Es gibt keine gesetzlich festgelegte Liste. Was eingereicht werden soll, entscheidet der Vermieter oder die Hausverwaltung. Häufig angefragt werden:</p>
<ul>
  <li><a href="/mieterselbstauskunft">Mieterselbstauskunft</a></li>
  <li>Einkommensnachweise, oft die letzten drei Gehaltsabrechnungen</li>
  <li>eine Bonitätsauskunft, zum Beispiel von der SCHUFA</li>
  <li>eine Mietschuldenfreiheitsbescheinigung des bisherigen Vermieters, falls vorhanden</li>
  <li>ein Ausweisdokument – häufig erst bei konkretem Interesse oder zum Vertragsabschluss</li>
</ul>
<p>Welche Unterlagen in welchem Schritt angemessen sind, erklärt die Seite <a href="/wohnungsbewerbung">Wohnungsbewerbung</a> genauer.</p>

<h2>Praktische Tipps</h2>
<ul>
  <li><strong>Vorbereitet sein.</strong> Wer seine Unterlagen schon als PDF beisammen hat, kann innerhalb von Minuten statt Tagen antworten.</li>
  <li><strong>Schnell, aber nicht hektisch.</strong> Eine kurze, vollständige Nachricht schlägt eine lange, die Rückfragen auslöst.</li>
  <li><strong>Suchbereich erweitern.</strong> Ein Stadtteil weiter oder eine S-Bahn-Station später verändert Angebot und Preis oft deutlich.</li>
  <li><strong>Mehrgleisig suchen.</strong> Genossenschaften und kommunale Wohnungsunternehmen vergeben teils außerhalb der großen Portale.</li>
  <li><strong>Besichtigung nutzen.</strong> Frag nach Heizung, Nebenkostenabrechnung, Internet und Hausordnung; schau dir Fenster, Bad und mögliche Feuchtigkeitsspuren an.</li>
  <li><strong>Absagen einordnen.</strong> Bei vielen Interessenten entscheiden oft Kleinigkeiten oder der Zufall.</li>
</ul>

<h2>Häufige Fehler</h2>
<ul>
  <li>Nur mit der Kaltmiete rechnen und die Warmmiete unterschätzen.</li>
  <li>Unterlagen erst zusammensuchen, wenn die Zusage für eine Besichtigung da ist.</li>
  <li>Unscharfe Handyfotos statt lesbarer PDFs verschicken.</li>
  <li>Sehr persönliche Dokumente ungefragt und zu früh mitschicken.</li>
  <li>Auf Angebote eingehen, bei denen vor einer Besichtigung Geld verlangt wird oder zu schnellen Entscheidungen gedrängt wird.</li>
  <li>Die Kaution bei der Umzugsplanung vergessen.</li>
</ul>

<h2>Wie WohnStart dabei hilft</h2>
<p>WohnStart ist eine Vorbereitungshilfe: Du berechnest deine Wohnkosten, stellst deine Angaben einmal zusammen und erzeugst daraus deine Bewerbungsunterlagen. WohnStart vermittelt keine Wohnungen und ersetzt keine Rechtsberatung.</p>
`,
    ctas: [
      { href: "/mietpreis-rechner", label: "Wohnkosten berechnen" },
      { href: "/wohnungsbewerbung", label: "Wohnungsbewerbung vorbereiten" },
    ],
    faq: [
      {
        q: "Welche Unterlagen braucht man für eine Wohnungsbewerbung?",
        a: "Eine gesetzlich festgelegte Liste gibt es nicht. Häufig angefragt werden eine Mieterselbstauskunft, Einkommensnachweise, eine Bonitätsauskunft und – meist erst später – ein Ausweisdokument. Was tatsächlich nötig ist, entscheidet der Vermieter bzw. die Hausverwaltung.",
      },
      {
        q: "Wie viel Miete kann ich mir leisten?",
        a: "Als grobe Orientierung wird oft genannt, dass die Warmmiete etwa ein Drittel des Nettoeinkommens nicht deutlich überschreiten sollte. Das ist keine Regel und keine Finanzberatung – entscheidend sind deine übrigen Ausgaben und deine Lebenssituation.",
      },
      {
        q: "Wie lange dauert die Wohnungssuche in Deutschland?",
        a: "Das hängt stark von Stadt, Lage, Wohnungsgröße und Zeitpunkt ab. In angespannten Märkten sind mehrere Monate und viele Bewerbungen auf dieselbe Wohnung üblich.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "wohnungsbewerbung",
    nav: "Wohnungsbewerbung",
    title: "Wohnungsbewerbung: Unterlagen, Aufbau und Checkliste",
    description:
      "Wie du eine Wohnungsbewerbung aufbaust: welche Unterlagen üblich sind, wie du sie ordnest und was du vor dem Absenden prüfen solltest. Mit Checkliste und Vorlagen.",
    h1: "Wohnungsbewerbung: so bereitest du deine Unterlagen vor",
    intro:
      "Eine Wohnungsbewerbung ist die Zusammenstellung aus kurzem Anschreiben, Selbstauskunft und den angefragten Nachweisen. Sie entscheidet nicht allein über die Zusage – aber sie entscheidet, ob du überhaupt in die engere Auswahl kommst.",
    breadcrumb: "Wohnungsbewerbung",
    body: `
<h2>Was eine Wohnungsbewerbung ist</h2>
<p>Anders als bei einer Jobbewerbung gibt es kein vorgeschriebenes Format. In der Praxis besteht eine Bewerbung meist aus drei Teilen:</p>
<ul>
  <li><strong>Kurzes Anschreiben</strong> – wer du bist, was du beruflich machst, ab wann du einziehen möchtest, wer mit einzieht.</li>
  <li><strong>Mieterselbstauskunft</strong> – strukturierte Angaben zu Person, Haushalt und Einkommen.</li>
  <li><strong>Nachweise</strong> – genau die Unterlagen, die angefragt wurden.</li>
</ul>
<p>Viele Vermieter verschicken ein eigenes Formular. Liegt keines vor, kannst du eine eigene <a href="/mieterselbstauskunft">Mieterselbstauskunft</a> beilegen.</p>

<h2>Welche Unterlagen üblich sind</h2>
<p>Was verlangt wird, entscheidet der Vermieter bzw. die Hausverwaltung – nicht jede Wohnung erfordert dieselben Unterlagen.</p>
<h3>Häufig angefragt</h3>
<ul>
  <li><strong>Mieterselbstauskunft</strong></li>
  <li><strong>Einkommensnachweise</strong> – oft die letzten drei Gehaltsabrechnungen. Angaben, die für die Vermietung nicht nötig sind, kannst du schwärzen.</li>
  <li><strong>Bonitätsauskunft</strong> – häufig eine SCHUFA-Auskunft. Es gibt verschiedene Varianten; welche akzeptiert wird, ist unterschiedlich.</li>
  <li><strong>Mietschuldenfreiheitsbescheinigung</strong> – vom bisherigen Vermieter, falls vorhanden. Es besteht kein allgemeiner Anspruch darauf.</li>
</ul>
<h3>Je nach Situation</h3>
<ul>
  <li>Arbeitsvertrag, etwa bei neuer Stelle oder in der Probezeit</li>
  <li>Studien- oder Ausbildungsbescheinigung</li>
  <li>Steuerbescheid oder BWA bei Selbstständigkeit</li>
  <li>Bürgschaft, wenn der Vermieter sie verlangt</li>
  <li>Aufenthaltstitel, falls relevant – siehe <a href="/keine-schufa">neu in Deutschland</a></li>
</ul>
<h3>Erst später</h3>
<p>Ausweiskopien und Kontodaten werden üblicherweise erst bei konkretem Interesse oder zum Vertragsabschluss gebraucht. Du musst sie nicht ungefragt mit der ersten Anfrage mitschicken.</p>

<h2>Wie du die Bewerbung ordnest</h2>
<ul>
  <li><strong>Ein PDF statt zehn Dateien.</strong> Eine sortierte Mappe lässt sich leichter sichten als lose Anhänge.</li>
  <li><strong>Sprechende Dateinamen.</strong> <code>Mieterselbstauskunft_Mustermann.pdf</code> statt <code>IMG_4821.jpg</code>.</li>
  <li><strong>Sinnvolle Reihenfolge.</strong> Deckblatt oder Anschreiben, dann Selbstauskunft, dann Nachweise.</li>
  <li><strong>Lesbare Scans.</strong> Gerade, vollständig, ausreichend beleuchtet.</li>
  <li><strong>Angemessener Umfang.</strong> Mehr Dokumente sind nicht automatisch besser – schick, was angefragt wurde.</li>
</ul>

<h2>Vor dem Absenden prüfen</h2>
<ul>
  <li>Stimmen Name, Adresse, Telefonnummer und E-Mail?</li>
  <li>Ist der Betreff eindeutig, mit Adresse oder Objektnummer?</li>
  <li>Sind alle Anhänge wirklich angehängt und lassen sie sich öffnen?</li>
  <li>Sind die Einkommensnachweise aktuell?</li>
  <li>Sind nicht benötigte persönliche Angaben geschwärzt?</li>
  <li>Ist der Empfänger plausibel – nachvollziehbares Impressum, erreichbare Nummer?</li>
</ul>

<h2>Wie WohnStart dabei hilft</h2>
<p>Mit WohnStart hinterlegst du deine Angaben einmal und erzeugst daraus Mieterselbstauskunft, Anschreiben und ein Deckblatt als fertige PDFs. Der KI-Dokumenten-Check sieht sich ein hochgeladenes Dokument an und weist auf fehlende oder unklare Angaben hin. Das ist eine Vorbereitungshilfe – keine Rechtsberatung und keine Zusage, dass eine Bewerbung erfolgreich ist.</p>
`,
    ctas: [
      { href: "/#angaben", label: "Unterlagen vorbereiten" },
      { href: "/mieterselbstauskunft", label: "Mieterselbstauskunft erstellen" },
    ],
    faq: [
      {
        q: "Was gehört in eine Wohnungsbewerbung?",
        a: "Üblich sind ein kurzes Anschreiben, eine Mieterselbstauskunft und die angefragten Nachweise, zum Beispiel Einkommensnachweise und eine Bonitätsauskunft. Welche Unterlagen nötig sind, entscheidet der Vermieter bzw. die Hausverwaltung.",
      },
      {
        q: "Muss ich der Bewerbung eine Ausweiskopie beilegen?",
        a: "In der Regel nicht schon bei der ersten Anfrage. Ausweisdokumente werden meist erst bei konkretem Interesse oder zum Vertragsabschluss relevant.",
      },
      {
        q: "Darf ich Angaben in meinen Unterlagen schwärzen?",
        a: "Angaben, die für die Vermietung nicht erforderlich sind, werden in der Praxis häufig geschwärzt. Was im Einzelfall angemessen ist, hängt von der Situation ab; im Zweifel hilft eine Rückfrage oder eine Beratung, etwa bei einem Mieterverein.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "mieterselbstauskunft",
    nav: "Mieterselbstauskunft",
    title: "Mieterselbstauskunft: Inhalt, Vorlage und Hinweise",
    description:
      "Was in einer Mieterselbstauskunft steht, welche Angaben üblich sind und welche Fragen als unzulässig gelten. Mit Vorlage zum Ausfüllen und Download als PDF.",
    h1: "Mieterselbstauskunft",
    intro:
      "Die Mieterselbstauskunft ist das Formular, mit dem Mietinteressenten Angaben zu Person, Haushalt und Einkommen machen. Sie ist freiwillig – in der Praxis fragen viele Vermieter sie aber an, bevor sie eine Wohnung vergeben.",
    breadcrumb: "Mieterselbstauskunft",
    body: `
<h2>Was eine Mieterselbstauskunft ist</h2>
<p>Die Selbstauskunft fasst zusammen, wer einziehen möchte und ob die Miete voraussichtlich dauerhaft gezahlt werden kann. Sie ist kein amtliches Dokument und kein Vertrag. Es gibt kein einheitliches Formular: Manche Vermieter stellen ein eigenes bereit, sonst bringst du eine eigene mit.</p>

<h2>Welche Angaben üblich sind</h2>
<ul>
  <li><strong>Person:</strong> Name, Geburtsdatum, aktuelle Anschrift, Telefon und E-Mail</li>
  <li><strong>Haushalt:</strong> Zahl der einziehenden Personen, Erwachsene und Kinder</li>
  <li><strong>Beschäftigung:</strong> Beruf oder Tätigkeit, Arbeitgeber, seit wann, befristet oder unbefristet</li>
  <li><strong>Einkommen:</strong> monatliches Nettoeinkommen, ggf. weitere regelmäßige Einnahmen</li>
  <li><strong>Wohnsituation:</strong> aktuelle Situation und gewünschter Einzugstermin</li>
  <li><strong>Sonstiges:</strong> Haustiere, Rauchen, auf Nachfrage verfügbare Nachweise</li>
  <li><strong>Unterschrift</strong> mit Ort und Datum</li>
</ul>

<h2>Fragen, die als unzulässig gelten</h2>
<p>Nicht jede Frage ist zulässig, nur weil sie auf einem Formular steht. Als unzulässig gelten in der Regel Fragen nach Themen, die für das Mietverhältnis nicht erforderlich sind – etwa Kinderwunsch oder Schwangerschaft, Religion, Herkunft, Gesundheit, Partei- oder Gewerkschaftszugehörigkeit oder Vorstrafen ohne Bezug zur Vermietung.</p>
<p>Wie damit umzugehen ist, hängt vom Einzelfall ab. Bei Unsicherheit ist eine Beratung sinnvoll, zum Beispiel bei einem Mieterverein oder einer Verbraucherzentrale. Diese Seite gibt allgemeine Hinweise und keine Rechtsberatung.</p>

<h2>Beim Ausfüllen beachten</h2>
<ul>
  <li><strong>Wahrheitsgemäß ausfüllen.</strong> Falsche Angaben zu wesentlichen Punkten können das Mietverhältnis gefährden.</li>
  <li><strong>Vollständig, wo es passt.</strong> Lücken bei zentralen Angaben wie Einkommen führen oft zu Rückfragen.</li>
  <li><strong>Unterschrift nicht vergessen.</strong> Eine nicht unterschriebene Selbstauskunft wirkt unfertig.</li>
  <li><strong>Aktuell halten.</strong> Nach einem Jobwechsel oder Umzug anpassen.</li>
  <li><strong>Sparsam mit Daten.</strong> Was nicht erforderlich ist, muss nicht hinein.</li>
</ul>

<h2>Vorlage von WohnStart</h2>
<p>WohnStart erzeugt eine Mieterselbstauskunft als PDF: Du hinterlegst deine Angaben einmal, das Dokument wird daraus automatisch ausgefüllt. Die Vorlage enthält bewusst keine Fragen zu sensiblen Themen wie Herkunft, Religion, Gesundheit oder Familienplanung. Es ist eine WohnStart-Vorlage, kein amtliches Formular.</p>
<p>Passt eine Angabe nicht zu deiner Situation, lass das Feld leer oder sprich es bei der Besichtigung an.</p>
`,
    ctas: [
      { href: "/#angaben", label: "Mieterselbstauskunft erstellen" },
      { href: "/wohnungsbewerbung", label: "Zur Wohnungsbewerbung" },
    ],
    faq: [
      {
        q: "Ist eine Mieterselbstauskunft Pflicht?",
        a: "Nein, sie ist freiwillig. In der Praxis vergeben viele Vermieter eine Wohnung aber nur an Interessenten, die die üblichen Angaben machen.",
      },
      {
        q: "Welche Fragen sind in einer Mieterselbstauskunft unzulässig?",
        a: "Als unzulässig gelten in der Regel Fragen, die für das Mietverhältnis nicht erforderlich sind – etwa nach Kinderwunsch oder Schwangerschaft, Religion, Herkunft, Gesundheit oder Partei- und Gewerkschaftszugehörigkeit. Im Einzelfall hilft eine Beratung, zum Beispiel bei einem Mieterverein.",
      },
      {
        q: "Was passiert bei falschen Angaben?",
        a: "Falsche Angaben zu wesentlichen Punkten – etwa zum Einkommen – können das Mietverhältnis gefährden. Die Folgen hängen vom Einzelfall ab.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "keine-schufa",
    nav: "Keine SCHUFA",
    title: "Wohnung ohne SCHUFA-Historie: neu in Deutschland mieten",
    description:
      "Noch keine SCHUFA-Historie, weil du neu in Deutschland bist? Was eine SCHUFA-Auskunft aussagt, welche Alternativen es gibt und wie du dich trotzdem gut bewirbst.",
    h1: "Wohnung ohne SCHUFA-Historie – neu in Deutschland",
    intro:
      "Wer erst seit Kurzem in Deutschland lebt, hat oft keine oder nur eine sehr kurze SCHUFA-Historie. Das ist kein Makel, sondern schlicht die Folge einer kurzen Zeit im Land. Diese Seite erklärt, was das bedeutet und welche Möglichkeiten realistisch sind.",
    breadcrumb: "Keine SCHUFA",
    body: `
<h2>Was eine SCHUFA-Auskunft aussagt</h2>
<p>Die SCHUFA ist eine private Auskunftei, die Daten zu laufenden Verträgen, Krediten und Zahlungsstörungen sammelt. Eine Auskunft zeigt, welche Daten dort über eine Person gespeichert sind.</p>
<p>Wichtig: <strong>Keine Historie ist nicht dasselbe wie eine negative Historie.</strong> Wer gerade erst zugezogen ist, hat meist noch kaum Einträge – das wird in einer Auskunft auch so sichtbar. Eine Auskunft lässt sich nicht „schnell aufbauen“; Einträge entstehen über Zeit durch Verträge wie Girokonto, Mobilfunk oder Ratenkäufe.</p>
<p>Ob und welche Bonitätsauskunft verlangt wird, entscheidet der Vermieter. Es gibt verschiedene Formen der SCHUFA-Auskunft; welche akzeptiert wird, ist unterschiedlich.</p>

<h2>Was du stattdessen zeigen kannst</h2>
<p>Ziel ist, die Frage „Kann die Miete dauerhaft gezahlt werden?“ nachvollziehbar zu beantworten. Je nach Situation kommen in Frage:</p>
<ul>
  <li><strong>Arbeitsvertrag</strong> – besonders aussagekräftig, wenn noch keine Gehaltsabrechnungen vorliegen.</li>
  <li><strong>Gehaltsabrechnungen</strong>, sobald die ersten vorhanden sind.</li>
  <li><strong>Kontoauszüge</strong> mit regelmäßigem Geldeingang.</li>
  <li><strong>Bürgschaft</strong>, etwa von Eltern oder Arbeitgeber – nur, wenn die bürgende Person das wirklich leisten kann und will.</li>
  <li><strong>Nachweis über Ersparnisse</strong>, wenn du ihn zeigen möchtest.</li>
  <li><strong>Bescheinigung der Hochschule oder des Arbeitgebers</strong> über Immatrikulation oder Anstellung.</li>
  <li><strong>Referenz eines früheren Vermieters</strong>, auch aus dem Ausland – nicht überall üblich, aber manche Vermieter berücksichtigen sie.</li>
</ul>
<p>Du musst nicht alles davon einreichen. Sinnvoll ist, was zu deiner Situation passt und angefragt wurde.</p>

<h2>Realistisch bleiben</h2>
<p>Ein paar Dinge gehören zu einer ehrlichen Einschätzung:</p>
<ul>
  <li>Manche Vermieter bestehen auf einer SCHUFA-Auskunft. Dann hilft auch eine gute Alternative nicht weiter – such in dem Fall weiter.</li>
  <li>Angebote, die gegen Gebühr eine „SCHUFA-freie Wohnung“ oder einen besseren Score versprechen, sind mit Vorsicht zu betrachten.</li>
  <li>Zahl nichts vor einer Besichtigung und vor einem unterschriebenen Mietvertrag.</li>
  <li>Eine Kaution von mehr als drei Nettokaltmieten ist bei Wohnraum nicht vorgesehen.</li>
  <li>Zwischenmiete, Untermiete oder möbliertes Wohnen für die erste Zeit können realistische Zwischenschritte sein – auch, um erste Einträge und eine Meldeadresse aufzubauen.</li>
</ul>

<h2>Wie du dich trotzdem gut bewirbst</h2>
<ul>
  <li><strong>Lücke ansprechen.</strong> Ein Satz im Anschreiben – seit wann du in Deutschland bist und was du stattdessen beilegst – wirkt besser als eine unerklärte Lücke.</li>
  <li><strong>Vollständig bleiben.</strong> Alles, was angefragt wurde und vorliegt, gehört dazu.</li>
  <li><strong>Deutsche Übersetzung,</strong> wenn Unterlagen in einer anderen Sprache vorliegen und das machbar ist.</li>
  <li><strong>Früh anfragen,</strong> wo längere Bearbeitungszeiten üblich sind, etwa bei Genossenschaften oder kommunalen Wohnungsunternehmen.</li>
  <li><strong>Beratung nutzen.</strong> Mietervereine, Verbraucherzentralen und kommunale Beratungsstellen helfen bei Fragen zum Mietrecht weiter.</li>
</ul>
<p>Diese Seite gibt allgemeine Hinweise und keine Rechtsberatung. Was im Einzelfall gilt, hängt von deiner Situation und vom Vermieter ab.</p>
`,
    ctas: [
      { href: "/#neu-in-deutschland", label: "Zum Bereich „Neu in Deutschland“" },
      { href: "/wohnungsbewerbung", label: "Wohnungsbewerbung vorbereiten" },
    ],
    faq: [
      {
        q: "Bekomme ich ohne SCHUFA-Historie eine Wohnung?",
        a: "Das hängt vom Vermieter ab. Manche bestehen auf einer Bonitätsauskunft, andere akzeptieren Alternativen wie Arbeitsvertrag, Kontoauszüge oder eine Bürgschaft. Eine fehlende Historie ist nicht dasselbe wie eine negative.",
      },
      {
        q: "Wie bekomme ich schnell eine SCHUFA-Historie?",
        a: "Gar nicht – Einträge entstehen über Zeit durch Verträge wie Girokonto, Mobilfunk oder Ratenkäufe. Angebote, die einen sofortigen Aufbau oder einen besseren Score gegen Gebühr versprechen, sind mit Vorsicht zu betrachten.",
      },
      {
        q: "Was kann ich statt einer SCHUFA-Auskunft einreichen?",
        a: "Je nach Situation zum Beispiel Arbeitsvertrag, Gehaltsabrechnungen, Kontoauszüge mit regelmäßigem Geldeingang, eine Bürgschaft oder eine Bescheinigung von Hochschule oder Arbeitgeber. Ob das genügt, entscheidet der Vermieter.",
      },
    ],
  },

  /* ------------------------------------------------------------------ */
  {
    slug: "mietpreis-rechner",
    nav: "Mietpreis-Rechner",
    title: "Mietpreis-Rechner: Wohnkosten und Preis pro m² berechnen",
    description:
      "Berechne deine voraussichtlichen monatlichen Wohnkosten, die Kosten pro Jahr und den Preis pro Quadratmeter. Kostenlos, ohne Anmeldung – als Orientierung für die Wohnungssuche.",
    h1: "Mietpreis-Rechner",
    intro:
      "Mit dem Mietpreis-Rechner von WohnStart überschlägst du, was eine Wohnung dich monatlich tatsächlich kostet – und ob der Quadratmeterpreis zu dem passt, was in deiner Stadt üblich ist. Kostenlos und ohne Anmeldung.",
    breadcrumb: "Mietpreis-Rechner",
    body: `
<h2>Was der Rechner berechnet</h2>
<p>Der Rechner besteht aus mehreren Teilen:</p>
<ul>
  <li><strong>Monatliche Wohnkosten.</strong> Kaltmiete, Nebenkosten, Heizkosten, Strom, Internet und sonstige laufende Kosten werden zu einer Summe addiert.</li>
  <li><strong>Wohnkosten pro Jahr.</strong> Die monatliche Summe mal zwölf – hilfreich, um Angebote über einen längeren Zeitraum zu vergleichen.</li>
  <li><strong>Preis pro Quadratmeter.</strong> Kaltmiete geteilt durch Wohnfläche. So lassen sich unterschiedlich große Wohnungen vergleichen.</li>
  <li><strong>Maximale Kaltmiete.</strong> Umgekehrt gerechnet: gewünschte Fläche mal maximaler Quadratmeterpreis.</li>
</ul>

<h2>Welche Eingaben du brauchst</h2>
<p>Die meisten Werte stehen in der Anzeige: Kaltmiete, Nebenkosten, Heizkosten und Wohnfläche. Strom und Internet schließt du in der Regel selbst ab – hier reichen Erfahrungswerte aus deinem bisherigen Haushalt. Fehlt eine Angabe, lass das Feld zunächst auf null und ergänze es nach der Besichtigung.</p>

<h2>Was das Ergebnis bedeutet – und was nicht</h2>
<p>Das Ergebnis ist eine Orientierung auf Basis deiner Eingaben, keine Marktpreisauskunft und keine Finanzberatung. Mietpreise unterscheiden sich stark nach:</p>
<ul>
  <li><strong>Lage</strong> – zwischen Stadtteilen derselben Stadt liegen oft deutliche Unterschiede</li>
  <li><strong>Baujahr und Zustand</strong> – Sanierungsstand und Energieeffizienz wirken sich auf Kalt- und Heizkosten aus</li>
  <li><strong>Ausstattung</strong> – Balkon, Aufzug, Stellplatz, Einbauküche</li>
  <li><strong>Wohnungsgröße</strong> – kleine Wohnungen haben häufig einen höheren Quadratmeterpreis</li>
</ul>
<p>Auch Nebenkosten sind Vorauszahlungen: Die tatsächliche Höhe zeigt erst die jährliche Abrechnung. Die Vergleichswerte im Städtevergleich der App sind Beispieldaten zur Veranschaulichung, keine aktuellen Marktdaten.</p>

<h2>Kosten zum Einzug nicht vergessen</h2>
<p>Zusätzlich zur monatlichen Belastung fallen einmalige Kosten an: die Kaution (bei Wohnraum höchstens drei Nettokaltmieten), gegebenenfalls eine Maklerprovision (bei Mietwohnungen gilt in der Regel das Bestellerprinzip), der Umzug selbst sowie Erstausstattung wie Küche oder Möbel.</p>

<h2>Wie viel Miete ist sinnvoll?</h2>
<p>Als grobe Orientierung wird häufig genannt, dass die Warmmiete etwa ein Drittel des Nettoeinkommens nicht deutlich überschreiten sollte. Das ist eine Faustregel, keine Vorgabe: Entscheidend sind deine übrigen Fixkosten und deine Lebenssituation. Manche Vermieter nutzen eine ähnliche Orientierung bei der Auswahl – verbindlich ist sie nicht.</p>
`,
    ctas: [
      { href: "/#rechner", label: "Rechner öffnen" },
      { href: "/wohnungssuche", label: "Zur Wohnungssuche" },
    ],
    faq: [
      {
        q: "Wie berechnet man die Warmmiete?",
        a: "Die Warmmiete ergibt sich aus Kaltmiete plus Nebenkosten plus Heizkosten. Strom und Internet sind meist nicht enthalten und kommen in der Regel zusätzlich dazu.",
      },
      {
        q: "Wie berechnet man den Preis pro Quadratmeter?",
        a: "Kaltmiete geteilt durch Wohnfläche. 900 Euro Kaltmiete bei 60 Quadratmetern ergeben 15 Euro pro Quadratmeter.",
      },
      {
        q: "Wie viel Miete sollte man vom Einkommen ausgeben?",
        a: "Als grobe Orientierung wird oft etwa ein Drittel des Nettoeinkommens für die Warmmiete genannt. Das ist eine Faustregel und keine Finanzberatung – entscheidend sind deine übrigen Ausgaben.",
      },
    ],
  },
];

module.exports = { PAGES };
