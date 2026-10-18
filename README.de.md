# Verbal Aikido: The Empathy Firewall

> Eine mobil-fokussierte Serious-Game Progressive Web App (PWA) zur Konditionierung deeskalierender und assertiver Kommunikation.

🌐 **Sprachen:** [English](README.md) | [Magyar](README.hu.md) | [Deutsch](README.de.md)

[![CI Pipeline](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml/badge.svg)](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github-sponsors)](https://github.com/sponsors/ghajba)
[![Lizenz: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 24 LTS](https://img.shields.io/badge/Node-24%20LTS-green.svg)](.nvmrc)

---

## 1. Übersicht & Nutzenversprechen

**Verbal Aikido: The Empathy Firewall** ist eine spielerische psychophysiologische Simulation für das Training von Deeskalations- und Gesprächsführungstechniken im beruflichen und persönlichen Umfeld. Anstelle passiver Wissensvermittlung trainiert die Simulation, bei verbaler Aggression oder emotionaler Manipulation weder mit reflexiver Rechtfertigung noch mit Gegenangriffen zu reagieren, sondern mit achtsamer Erdung und hypnosystemischen Fragetechniken (Pacing, emotionale Validierung, Meta-Modell-Klärung, Reframing) konstruktiv zu deeskalieren.

### Zielgruppen & Personas
- **P1: Gestresste Führungskraft / Projektleiter (30–45 Jahre):** Souveräne Bewältigung von Termindruck, fordernden Stakeholdern und Konflikten im Team.
- **P2: Kundenservice-Experte im Front-Office (22–35 Jahre):** Konfliktbewältigung bei aufgebrachten Kunden ohne eigene emotionale Erschöpfung (Burnout).

---

## 2. Spielmechanik & Mathematisches Modell

Das Spiel simuliert diskrete Runden (3–7 Mikro-Angriffe pro Szenario). In jeder Runde erhält der Spieler 3 Handkarten (garantiert mindestens eine konstruktive Karte und mindestens eine reaktive Falle).

### Dynamische Metriken
- **Eskalationsniveau des Gegenübers ($E \in [0, 100]$):** Startwert: 40–70. Erreicht es 100: **Eskalationsabbruch (Niederlage)**.
- **Innere Erdung / Emotionale HP ($F \in [0, 100]$):** Startwert: 100. Erreicht es 0: **Erschöpfung / Freeze (Niederlage)**.
- **Kognitive Verwirrung / Trance-Index ($K \in [0, 100]$):** Startwert: 0. Erreicht es 80: **Kognitiver Durchbruch (Sieg)**.
- **Eskalations-Momentum ($M_{eszk} \in [0, 4]$):** Wiederholte reaktive Karten verstärken den Eskalationsanstieg.

### Kartenkategorien
1. **PACING:** Emotionale Validierung ohne inhaltliche Zustimmung ($\Delta E < 0, \Delta F > 0, \Delta K > 0$).
2. **META_MODEL:** Präzisionsfragen zur Klärung von Verzerrungen, Generalisierungen und Tilgungen ($\Delta K \gg 0$).
3. **REFRAMING:** Neuausrichtung auf ein übergeordnetes, gemeinsames Ziel.
4. **DEFENSE:** Rechtfertigungen und Ausflüchte (reaktive Falle).
5. **ATTACK:** Gegenangriff und Vorwürfe (reaktive Falle).

---

## 3. Architektur & Technologie-Stack

100% clientseitige, offline-fähige Progressive Web App:

- **UI & Reaktivität:** [Preact](https://preactjs.com/) 10.x & [`@preact/signals`](https://github.com/preactjs/signals).
- **Typsicherheit:** TypeScript 5.x (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Build-Tool:** [Vite](https://vite.dev/) & `vite-plugin-pwa` (Workbox Service Worker).
- **Persistenz:** IndexedDB mit LocalStorage-Fallback.
- **Feedback:** Synthetisierte **Web Audio API** und W3C **Vibration API**.
- **Deterministische Engine:** Seeded `mulberry32` PRNG für Reproduzierbarkeit.
- **Mehrsprachigkeit (i18n):** Englisch (Hauptsprache), Deutsch, Ungarisch.
- **Testing:** [Vitest](https://vitest.dev/) & [Playwright](https://playwright.dev/).

---

## 4. Szenarien (v1.0)

1. `scen_angry_pm_deadline_001`: **Der geplatzte Sprint und der wütende Projektmanager** (P1, Mittel)
2. `scen_stakeholder_scope_002`: **Scope Creep am Montagmorgen** (P1, Einsteiger)
3. `scen_customer_refund_003`: **Die fehlende Rückerstattung** (P2, Mittel)
4. `scen_customer_gaslight_004`: **"Das habe ich nie gesagt!"** (P2, Fortgeschritten, 15-Sekunden-Timer)

---

## 5. Unterstützung & Sponsoring

Wenn Sie dieses Projekt unterstützen möchten:

👉 **[Auf GitHub sponsern](https://github.com/sponsors/ghajba)** 💖

---

## 6. Lizenz

Veröffentlicht unter der [MIT-Lizenz](LICENSE).
