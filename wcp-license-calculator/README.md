# WCP License Calculator & Market Forecast

Pricing- und Business-Case-Tool (HTML/CSS/JavaScript, keine Build-Schritte) zum Berechnen, Vergleichen und Hochrechnen von WCP-Lizenzmodellen auf Märkte.

**Start:** `index.html` im Browser öffnen. Chart.js, SheetJS (Excel) und jsPDF werden von CDNs geladen. Alle Eingaben werden automatisch im `localStorage` des Browsers gespeichert und lassen sich als JSON exportieren/importieren.

## Seiten

| # | Seite | Inhalt |
|---|-------|--------|
| 1 | Märkte | Stammdaten je Markt (Standorte, Mitarbeiter, aktive/gelegentliche User, Werkstätten, Service-MA, Verkäufer, Wachstum, Rollout-Jahr, Marktumsatz), Marktvergleich |
| 2 | Lizenzmodelle | 14 Modelle mit Jahres-/Monatsumsatz, Umsatz pro Markt/Standort/User, Lizenzverteilung, Heatmap Markt × Modell |
| 3 | Preiskatalog | Alle Preisparameter je Modell und Kostenbasis für Break-Even |
| 4 | Forecast | 1/3/5 Jahre mit Wachstum, neuen Standorten/Usern, Preissteigerung, Rollout-Jahren und Ramp-up |
| 5 | Szenarien | Best/Realistic/Worst Case (Volumen, Wachstum, Preis, Rollout-Verzögerung, Adoption) nebeneinander |
| 6 | Management Dashboard | KPI-Tiles, Top profitabelste Modelle, Break-Even, Empfehlung (Scoring), Sensitivitätsanalyse (Tornado + Heatmap) |
| 7 | Export | Excel (mehrere Blätter), PDF-Management-Report, CSV, JSON |
| ★ | Pricing Optimizer | Benötigte Preise für ein Umsatzziel je Modell und Preishebel; Monte-Carlo-Simulation mit P10/P50/P90, VaR, Verlust-/Zielwahrscheinlichkeit |

## Lizenzmodelle

Basis: User, Named User, Concurrent User, Standort, Werkstatt, Unternehmenslizenz (Flat Fee/Markt), Umsatzbasiert, Hybrid.
Erweitert: Tier (Small/Medium/Enterprise), Consumption (Logins, Sessions, API Calls, AI Requests), Transaction (Auftrag, Werkstattauftrag, Fahrzeug, Rechnung), Freemium → Premium, Modulbasiert, AI Add-On.

## Rechenlogik (Kurzfassung)

- Monatspreise × 12 = Jahresumsatz; „Vollausbau“ = aktuelle Stammdaten, alle Märkte aktiv.
- Forecast-Jahr *t*: User × (1+Wachstum)^t × (1+neue User)^t, Standorte × (1+neue Standorte)^t, Preise × (1+Preissteigerung)^t (nicht beim umsatzbasierten Modell). Märkte zählen ab ihrem Rollout-Jahr, im Rollout-Jahr nur mit der eingestellten Adoption.
- Kosten: Plattform einmalig im Startjahr, Rollout je Markt im Rollout-Jahr, Betrieb pro User und Markt.
- Empfehlung: Score = 35 % Umsatz · 20 % Robustheit (Worst/Best) · 15 % Break-Even · 15 % Fairness (Streuung Umsatz/User über Märkte) · 15 % Einfachheit.
- Optimizer: Modelle sind linear in ihren Preisen, daher exakte Lösung je Hebel bzw. proportionaler Faktor.

Die Rechen-Engine (`js/calc.js`) hat keine DOM-Abhängigkeit und kann in Node genutzt werden (`require('./js/calc.js')`).

CI-Farben sind als CSS-Variablen in `css/styles.css` (`--ci-*`) zentral anpassbar.
