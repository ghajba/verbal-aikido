# Verbális Aikidó: The Empathy Firewall

> Mobil-első, mikro-interakciókra épülő Progresszív Web Alkalmazás (PWA) de-eszkalációs és asszertív kommunikáció kondicionálására.

[![CI Pipeline](https://github.com/serious-games/verbalis-aikido/actions/workflows/ci.yml/badge.svg)](https://github.com/serious-games/verbalis-aikido/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 24 LTS](https://img.shields.io/badge/Node-24%20LTS-green.svg)](.nvmrc)

---

## 1. Áttekintés és Értékajánlat

A **Verbális Aikidó: The Empathy Firewall** egy játékosított pszichofiziológiai szimuláció, amely megtanítja a felhasználót arra, hogy munkahelyi és személyes verbális agresszió vagy érzelmi manipuláció esetén asszertív jelenléttel és hipnoszisztémás kérdezéstechnikával (pacing, validálás, meta-modell tisztázás, reframing) reagáljon ahelyett, hogy reaktív védekezésbe vagy visszatámadásba bocsátkozna.

### Célcsoport és Perszónák
- **P1: Stressznek Kitett Vezető / PM (30–45 év):** Frusztrált elvárások és határidők kezelése megbeszéléseken.
- **P2: Frontvonalbeli Ügyfélkapcsolati Szakértő (22–35 év):** Azonnali panaszkezelés felindult ügyfelekkel, kiégés nélkül.

---

## 2. Játékmenet és Matematikai Modell

A játék diszkrét körökre osztott mikro-szituációkat szimulál (körönként 3–7 támadással). A játékos kezébe körönként 3 kártya kerül (garantáltan legalább egy konstruktív és egy reaktív választással).

### Dinamikus mérőszámok:
- **Partner Eszkalációs Szint ($E \in [0, 100]$):** Kezdőérték: 40–70. Ha eléri a 100-at: **Szakadás (Vereség)**.
- **Játékos Belső Földelése / Érzelmi HP ($F \in [0, 100]$):** Kezdőérték: 100. Ha eléri a 0-t: **Kimerüléses lefagyás (Vereség)**.
- **Kognitív Megakadás / Trance Index ($K \in [0, 100]$):** Kezdőérték: 0. Ha eléri a 80-at: **Kognitív áttörés (Győzelem)**.
- **Eszkalációs momentum ($M_{eszk} \in [0, 4]$):** Sorozatos reaktív kártyák esetén fokozza az eszkaláció növekedését.

### Kártyakategóriák:
1. **PACING:** Érzelmi validáció egyetértés nélkül ($\Delta E < 0, \Delta F > 0, \Delta K > 0$).
2. **META_MODEL:** Törlés, torzítás, általánosítás tisztázása ($\Delta K \gg 0$).
3. **REFRAMING:** Magasabb közös szándék beemelése.
4. **DEFENSE:** Kifogáskeresés, magyarázkodás (reaktív csapda).
5. **ATTACK:** Vádolás, személyeskedés visszafordítása (reaktív csapda).

---

## 3. Rendszerarchitektúra & Technológiai Stack

A szoftver 100%-ban kliensoldali, offline-first PWA architektúrára épül:

- **UI & Reaktivitás:** [Preact](https://preactjs.com/) 10.x és [`@preact/signals`](https://github.com/preactjs/signals) (minimális méret, gyors renderelés).
- **Típusbiztonság:** TypeScript 5.x (`strict`, `noUncheckedIndexedAccess`).
- **Build eszköz:** [Vite](https://vite.dev/) + `vite-plugin-pwa` (Workbox Service Worker).
- **Perzisztencia:** IndexedDB aszinkron tároló LocalStorage tartalékmechanizmussal.
- **Szenzoros visszajelzés:**
  - Szintetizált **Web Audio API** (külső hangfájlok nélkül generált szinusz hullámok).
  - W3C **Vibration API** mobil eszközökhöz (asztali/iOS eszközökön csendes no-op fallback).
- **Többnyelvűség (i18n):** Magyar (`hu`, referencia), Angol (`en`), Német (`de`) runtime váltással.
- **Determinisztikus motor:** Seedelt `mulberry32` PRNG motor a determinisztikus újrajátszhatóságért.
- **Tesztelés:** [Vitest](https://vitest.dev/) (egységtesztek), [Playwright](https://playwright.dev/) (E2E és PWA audit).

---

## 4. Projekt Struktúra

```
verbalis-aikido/
├── .github/workflows/ci.yml     # GitHub Actions pipeline (validate, unit, build, e2e, pwa, deploy)
├── schemas/                     # JSON sémák (scenario.schema.json, catalog.schema.json)
├── scripts/                     # Validátor és CI ellenőrző scriptek
├── public/
│   ├── scenarios/               # Szcenárió JSON-ök és a katalógus
│   ├── icons/                   # PWA ikonok
│   └── favicon.svg              # SVG master ikon
├── src/
│   ├── app/                     # Fő vezérlő (GameController, Router, Settings, Clock)
│   ├── engine/                  # Tiszta, izolált játékmotor (FSM, metrikák, RNG, ágak, kéz)
│   ├── content/                 # Szcenárió típusok és katalógus betöltő
│   ├── storage/                 # IndexedDB és LocalStorage meghajtók
│   ├── telemetry/               # Offline eseménybuffer és szinkronizáció
│   ├── feedback/                # Szintetizált audio és haptikai modulok
│   ├── ui/                      # Preact képernyők, komponensek, hookok és stílusok
│   └── i18n/                    # Magyar, angol, német szótárak
└── tests/
    ├── spec/                    # Gherkin .feature leírások (@SBE azonosítókkal)
    ├── unit/                    # Vitest egységtesztek
    └── e2e/                     # Playwright integrációs tesztek
```

---

## 5. Beépített Szcenáriók (v1.0)

1. `scen_angry_pm_deadline_001`: **A Bedőlt Sprint és a Dühös Projektmenedzser** (P1, Közepes)
2. `scen_stakeholder_scope_002`: **A Scope-Kúszás Hétfő Reggel** (P1, Kezdő)
3. `scen_customer_refund_003`: **A Visszatérített Pénz, Ami Nem Jött Meg** (P2, Közepes)
4. `scen_customer_gaslight_004`: **"Ezt Sosem Mondtam!"** (P2, Haladó, 15 mp-es stressz-időzítővel)

---

## 6. Fejlesztői Környezet & Parancsok

### Előfeltételek
- **Node.js**: `24.x LTS` (lásd [`.nvmrc`](.nvmrc))
- **npm**: `10.x` vagy frissebb

### Telepítés
```bash
npm install
```

### Fejlesztői szerver indítása
```bash
npm run dev
```

### Szcenáriók validálása
```bash
npm run validate:scenarios
```

### Tesztek futtatása
```bash
# Egységtesztek futtatása lefedettséggel
npm test

# E2E böngészőtesztek futtatása (Playwright)
npm run test:e2e

# PWA és offline viselkedés ellenőrzése
npm run test:pwa
```

### Éles build és csomagmérési ellenőrzés
```bash
npm run build
```

---

## 7. Licenc

A szoftver az [MIT Licenc](LICENSE) feltételei szerint szabadon használható, módosítható és terjeszthető.
