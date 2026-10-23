# Verbális Aikidó: The Empathy Firewall

> Mobil-első, mikro-interakciókra épülő Progresszív Web Alkalmazás (PWA) de-eszkalációs és asszertív kommunikáció kondicionálására.

🎮 **Élő játék:** [Játssz a Verbális Aikidóval GitHub Pages-en](https://ghajba.github.io/verbal-aikido/)

🌐 **Nyelvek:** [English](README.md) | [Magyar](README.hu.md) | [Deutsch](README.de.md)

[![Játék indítása](https://img.shields.io/badge/J%C3%A1t%C3%A9k-Online%20Dem%C3%B3-brightgreen?logo=googlechrome&logoColor=white)](https://ghajba.github.io/verbal-aikido/)
[![CI Pipeline](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml/badge.svg)](https://github.com/ghajba/verbal-aikido/actions/workflows/ci.yml)
[![Támogatás](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?logo=github-sponsors)](https://github.com/sponsors/ghajba)
[![Licenc: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 24 LTS](https://img.shields.io/badge/Node-24%20LTS-green.svg)](.nvmrc)

---

## 1. Áttekintés és Értékajánlat

A **Verbális Aikidó: The Empathy Firewall** egy játékosított pszichofiziológiai szimuláció, amely megtanítja a felhasználót arra, hogy munkahelyi és személyes verbális agresszió vagy érzelmi manipuláció esetén asszertív jelenléttel és hipnoszisztémás kérdezéstechnikával (pacing, validálás, meta-modell tisztázás, reframing) reagáljon ahelyett, hogy reaktív védekezésbe vagy visszatámadásba bocsátkozna.

### Célcsoport és Perszónák

- **P1: Stressznek Kitett Vezető / PM (30–45 év):** Frusztrált elvárások és szűk határidők higgadt kezelése megbeszéléseken.
- **P2: Frontvonalbeli Ügyfélkapcsolati Szakértő (22–35 év):** Azonnali panaszkezelés felindult ügyfelekkel, mentális kimerülés és kiégés nélkül.

---

## 2. Játékmenet és Matematikai Modell

A játék diszkrét körökre osztott mikro-szituációkat szimulál (körönként 3–7 támadással). A játékos kezébe körönként 3 kártya kerül garantált egyensúllyal (legalább egy konstruktív és legalább egy reaktív csapda).

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

- **UI & Reaktivitás:** [Preact](https://preactjs.com/) 10.x és [`@preact/signals`](https://github.com/preactjs/signals) (finomhangolt, azonnali állapotfrissítés).
- **Típusbiztonság:** TypeScript 5.x (`strict: true`, `noUncheckedIndexedAccess: true`).
- **Build eszköz:** [Vite](https://vite.dev/) + `vite-plugin-pwa` (Workbox Service Worker).
- **Perzisztencia:** IndexedDB aszinkron tároló LocalStorage tartalékmechanizmussal.
- **Szenzoros visszajelzés:**
  - Szintetizált **Web Audio API** (külső hangfájlok nélkül generált tiszta szinusz hullámok).
  - W3C **Vibration API** mobil eszközökhöz (asztali/iOS eszközökön csendes no-op fallback).
- **Determinisztikus tiszta motor:** Seedelt `mulberry32` PRNG az újrajátszhatóságért és determinisztikus tesztekért.
- **Többnyelvűség (i18n):** Angol (fő fejlesztési nyelv), Magyar (referencia), Német runtime nyelvváltással.
- **Tesztelés:** [Vitest](https://vitest.dev/) (egységtesztek), [Playwright](https://playwright.dev/) (E2E és PWA audit).

---

## 4. Dinamikus AI Sparring (DEV.to Open-Source AI Challenge 2026)

A statikus forgatókönyvek véges újrajátszhatóságának áthidalására a **Verbális Aikidó** hibrid körönkénti AI sparring ágenst vezet be:

- **100% Böngészőben Futó & Privát (WebLLM + WebGPU):** Helyi nyílt modellek (`SmolLM2-1.7B-Instruct`, `Llama-3.2`) futtatása a kliens grafikus gyorsítóján (WebGPU) keresztül. Semmilyen szöveg, hang vagy metrika nem hagyja el az eszközt. Kifejezetten alkalmas bizalmas munkahelyi konfliktusok gyakorlására.
- **Hozd a Saját Kulcsodat (BYO-Key):** Közvetlen kliensoldali API kapcsolat modern felhős modellekhez:
  - Google Gemini 3.8 Flash
  - Anthropic Claude 5.5 Sonnet
  - OpenAI GPT-5-mini
  - OpenRouter és helyi Ollama (`http://localhost:11434`)
    Az API kulcsokat kizárólag a helyi böngésző tárolja, köztes proxyszerverek nélkül.
- **Szigorú Pszichológiai és Matematikai Korlátok:** Az LLM válaszait szigorú JSON Schema (`src/ai/schema.ts`) validálja. A kártyakategóriák determinisztikus matematikai hatásokhoz ($\Delta E, \Delta F, \Delta K$) kapcsolódnak, megőrizve a játék egyensúlyát és a verbális aikidó módszertanát.
- **Késleltetés-elrejtés (Latency Hiding) és Fallback Védelem:** A motor a felbontási animációk alatt a háttérben előre lekéri a következő kört. WebGPU vagy hálózati kimaradás esetén a motor azonnal determinisztikus tartalék node-ot állít elő, így a játékmenet sosem akad meg.

---

## 5. Projekt Struktúra

```
verbal-aikido/
├── .github/
│   ├── workflows/ci.yml         # GitHub Actions pipeline
│   └── FUNDING.yml              # GitHub Sponsors konfiguráció
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
│   └── i18n/                    # Angol, magyar, német szótárak
└── tests/
    ├── spec/                    # Gherkin specifikációs feature leírások (@SBE azonosítókkal)
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

## 7. Támogatás & Szponzoráció

Ha hasznosnak találod a projektet és szeretnéd támogatni a fejlesztését:

👉 **[Támogatás a GitHub Sponsors-on keresztül](https://github.com/sponsors/ghajba)** 💖

---

## 8. Licenc

A szoftver az [MIT Licenc](LICENSE) feltételei szerint szabadon használható, módosítható és terjeszthető.
