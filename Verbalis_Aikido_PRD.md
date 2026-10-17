# TERMÉKKÖVETELMÉNY-SPECIFIKÁCIÓ (PRD)

## VERBÁLIS AIKIDÓ: THE EMPATHY FIREWALL — SERIOUS GAME PWA

> Forrás: `Verbalis_Aikido_PRD.pdf` (5 oldal). Szöveghű átirat Markdownba, 2026-10-14. A tartalom nem módosult; a diagramok listaként, a JSON minta olvasható formázással szerepel.

| Mező | Érték |
|---|---|
| Dokumentum verzió | v1.0.0 (Release Candidate) |
| Kiadás dátuma | 2026. október 13. |
| Szerepkör | Lead Product Owner / Game Producer |
| Státusz | JÓVÁHAGYVA FEJLESZTÉSRE |

## 1. Vezetői Összefoglaló és Értékajánlat

A **Verbális Aikidó: The Empathy Firewall** egy mobil-első, mikro-interakciókra épülő Progresszív Web Alkalmazás (PWA), amelynek célja a munkahelyi és személyes de-eszkalációs kommunikáció kondicionálása. A hagyományos tréningek passzív tudásátadásával szemben a szoftver *játékosított pszichofiziológiai szimulációként* működik: megtanítja a felhasználót arra, hogy verbális agresszió vagy érzelmi manipuláció esetén se agresszióval, se megalázkodó behódolással ne reagáljon, hanem asszertív szomatikus jelenléttel és hipnoszisztémás kérdezéstechnikával (pacing, validálás, meta-modell tisztázás) terelje konstruktív mederbe a feleket.

## 2. Célcsoport és Felhasználói Perszónák

**P1: Stressznek Kitett Vezető / PM (30–45 év)**
Napi szinten szembesül szűk határidőkkel, frusztrált stakeholderi elvárásokkal és reaktív csapattagokkal. Célja: megőrizni a hidegvérét és strukturáltan mederben tartani a megbeszéléseket.

**P2: Frontvonalbeli Ügyfélkapcsolati Szakértő (22–35 év)**
Azonnali, szóbeli/írásbeli panaszkezelést végez dühös ügyfelekkel. Célja: az incidensek eszkalációjának megakadályozása a saját mentális kimerülése (kiégése) nélkül.

## 3. Rendszerarchitektúra és Adatáramlási Modell

A szoftver teljes egészében kliensoldali, zéró külső függőséggel bíró architektúrát követ, garantálva a pillanatszerű betöltést és az offline játszhatóságot.

Architektúra-blokkok (diagram):

1. **UI / PWA Shell**
   - Touch Gestures & Tap
   - Web Audio & Haptics
   - 60 FPS Render Engine
2. **Finit Állapotgép (FSM)**
   - Inger-generálás & Kártyahúzás
   - Matematikai Metrika-motor
   - (Eszkaláció, Földelés, Kognitív Puffer)
3. **Perzisztencia & Telemetria**
   - IndexedDB / LocalStorage
   - Forgatókönyv JSON Katalógus
   - Offline Analytics Event Buffer

> **Kiemelt Megkötés Fejlesztőknek:** A játék nem igényel kötelező felhős háttérrendszert (Backendless MVP). Minden forgatókönyv, hang asset szintetizáció és mentett játékállapot a kliens eszközön fut. A későbbi opcionális szinkronizációhoz kizárólag REST/JSON esemény-batching végpont készítendő fel.

## 4. Játékmenet Ciklus és Finit Állapotgép (FSM)

A játék diszkrét körökre (Turn-based interactions) osztott szituációkat szimulál. Egy szituáció 3–7 egymást követő mikro-támadásból áll. Az állapotgép szigorúan determinisztikus, a következő állapotok szerint:

1. **ATTACK_INCOMING:** Partner megszólalása (szöveg + hanglejtés).
2. **INTERVENTION_CHOICE:** 3 db véletlenszerűen húzott lap felkínálása a kézben.
3. **RESOLUTION_PHASE:** Metrikák újraszámítása, haptikus visszajelzés.
4. **OUTCOME_CHECK:** Győzelem / Vereség / Következő kör tranzíció.

## 5. Matematikai Modell és Dinamikus Mérőszámok

A rendszer három elsődleges folytonos változót és egy diszkrét momentum-szorzót követ nyomon a körök során:

- **Partner Eszkalációs Szint (E ∈ [0, 100]):** Kezdőérték forgatókönyvtől függően 40–70 pont. Ha eléri a 100-at: azonnali szakadás (Vereség).
- **Játékos Belső Földelése / Érzelmi HP (F ∈ [0, 100]):** Kezdőérték 100 pont. Ha eléri a 0-t: kimerüléses lefagyás (Vereség).
- **Kognitív Megakadás / Trance Index (K ∈ [0, 100]):** Kezdőérték 0 pont. Ha eléri a 80 pontot: kognitív áttörés, a partner megnyílik az együttműködésre (Győzelem).

**Körönkénti Kiszámítási Képlet:**

```
E_next = clamp(0, 100, E_curr + ΔE_card + (M_eszk × 1.25))
F_next = clamp(0, 100, F_curr + ΔF_card − (E_curr × 0.05))
K_next = clamp(0, 100, K_curr + ΔK_card)
```

## 6. Beavatkozási Kártyakategóriák és Hatásmátrix

| Kártyatípus | Kommunikációs Cél | ΔE (Eszkaláció) | ΔF (Földelés) | ΔK (Megakadás) |
|---|---|---|---|---|
| Pacing / Validálás | Érzelmi validáció egyetértés nélkül | −15 .. −25 | +5 .. +10 | +5 .. +10 |
| Meta-modell Kérdés | Törlés, általánosítás megkérdőjelezése | −5 .. +5 | 0 .. −5 | +25 .. +35 |
| Reframing (Átkeretezés) | Közös magasabb szándék beemelése | −10 .. −20 | +10 .. +15 | +15 .. +25 |
| Reaktív Védekezés | Kifogáskeresés, magyarázkodás | +15 .. +25 | −15 .. −20 | 0 |
| Visszatámadás | Személyeskedés, vádolás visszafordítása | +30 .. +45 | −25 .. −35 | −20 .. −30 |

## 7. Szenárió és Kártya Adatmodell (JSON Séma)

A forgatókönyveket a fejlesztői csapatnak szigorúan típusbiztos (TypeScript definiált) JSON fájlokból kell betöltenie. Tilos a dialógusokat és hatásértékeket közvetlenül a kódban beégetni (hardcode).

```json
{
  "$schema": "https://aikido-game.internal/schemas/v1/scenario.json",
  "id": "scen_angry_pm_deadline_001",
  "title": "A Bedőlt Sprint és a Dühös Projektmenedzser",
  "difficulty": "INTERMEDIATE",
  "initialState": { "escalation": 65, "grounding": 100, "confusion": 0 },
  "nodes": [
    {
      "nodeId": "step_01",
      "npcStatement": "Már megint képtelen voltál időben leadni a modult! Mindent nekem kell megoldanom helyetted?!",
      "availableCards": [
        {
          "cardId": "c_pace_01",
          "category": "PACING",
          "text": "Látom rajtad, hogy rettenetesen feszült vagy a csúszás és a határidő miatt.",
          "delta": { "escalation": -20, "grounding": 8, "confusion": 10 },
          "npcReaction": "Hát persze hogy feszült vagyok, az egész ügyfél erre vár!",
          "nextNodeId": "step_02_calmed"
        },
        {
          "cardId": "c_metamodel_01",
          "category": "META_MODEL",
          "text": "Mit értesz pontosan az alatt, hogy 'mindent neked kell megoldanod'?",
          "delta": { "escalation": -5, "grounding": -2, "confusion": 30 },
          "npcReaction": "Hát... konkrétan ezt a két API integrációt ma délután.",
          "nextNodeId": "step_02_focused"
        },
        {
          "cardId": "c_defense_01",
          "category": "DEFENSE",
          "text": "Nem az én hibám, te adtad át a specifikációt két nap késéssel!",
          "delta": { "escalation": 30, "grounding": -20, "confusion": -10 },
          "npcReaction": "Még te vádaskodsz?! Az én időmet pazarlod!",
          "nextNodeId": "step_02_escalated"
        }
      ]
    }
  ]
}
```

## 8. Döntési Fa és Dinamikus Branching Szabályok

1. **Dinamikus csomópontválasztás:** A `nextNodeId` átirányítása történhet statikus azonosító alapján, vagy ha az `escalation > 80` küszöb túllépésre kerül, az FSM azonnal átirányít a szituáció `_escalated_crisis` ágára.
2. **Deck Shuffling & Randomization:** Minden körben kötelező garantálni, hogy a felkínált kártyák között legyen legalább 1 konstruktív (PACING/METAMODEL) és legalább 1 reaktív csapda (DEFENSE/ATTACK), biztosítva a valós döntési feszültséget.
3. **Dynamic Text Interpolation:** A kártyaszövegek támogassák a `{npc_name}` és `{trigger_word}` változók dinamikus behelyettesítését.

## 9. Kliensoldali Állapotmentés (Persistence Contract)

- **Storage Driver:** IndexedDB (elsődleges), LocalStorage fallbackkel.
- **Mentett adatok:** Befejezett szcenáriók listája, elért RTO (Recovery Time Objective) értékek, kártya-választási statisztika (Constructive vs Reactive ratio), aktuális beállítások (Audio mute, Haptic intensity).

## 10. Funkcionális Követelménylista (FR Mátrix)

Minden fejlesztési tétel a Gherkin (Given-When-Then) szabvány szerinti elfogadási tesztekkel ellátott.

| ID | Funkció megnevezése | Elfogadási Kritérium (Acceptance Criteria) | Prioritás | Becslés |
|---|---|---|---|---|
| FR-01 | Kártya Megjelenítés és Swipe Kezelés | Gombnyomásra és fel-húzásra (swipe-up) a kártya 200 ms alatt a drop-zone-ba kerül, animált CSS transzformációval. | MUST HAVE | 3 SP |
| FR-02 | Valós Idejű Metrika Frissítés | A választást követően a mérősávok (E, F, K) számlálója lineáris easinggel, 400 ms alatt veszi fel az új állapotot. | MUST HAVE | 2 SP |
| FR-03 | Haptikus Visszacsatolás Motor | Mobil eszközön eseménytípusonként különböző rezgésmintát bocsát ki a W3C Vibration API-n keresztül. | MUST HAVE | 2 SP |
| FR-04 | Szintetizált Hangmotor (Web Audio) | Külső hangfájl betöltése nélkül generál tiszta szinuszhullámú visszajelző hangokat a választás minősége szerint. | SHOULD | 3 SP |
| FR-05 | Post-Scenario Debriefing | A játék végén elemző nézet mutatja: hány másodpercet töltött pánik zónában, és milyen kártyastílust részesített előnyben. | MUST HAVE | 4 SP |

## 11. Haptika és Audio Engine Specifikáció Fejlesztőknek

**Vibration API Minták (navigator.vibrate specifikáció):**

- *Könnyű megerősítés (Tap):* `[15]` ms (enyhe haptikus kattanás).
- *Érvényesítés / Sikeres Pacing:* `[30, 50, 30]` ms (nyugtató kettős rezgés).
- *Kognitív Áttörés (Megakadás elérése):* `[60, 40, 100]` ms (felfutó ritmus).
- *Eszkaláció / Sérülés:* `[120, 50, 120]` ms erős vibráció.

*Megjegyzés: Ha az eszköz nem támogatja (pl. asztali böngésző vagy iOS Safari megkötések), a modul csendben fallbackel no-op-ra hiba dobása nélkül!*

## 12. UI/UX Interakciós Szabályok

- **One-Thumb Reachability:** Minden döntési elem (kártyák, megerősítés) a képernyő alsó 40%-ában helyezkedik el.
- **Safe Area Insets:** Kötelező a `padding-bottom: env(safe-area-inset-bottom, 16px)` használata a notch/home bar elkerülésére.
- **No Double-Tap Zoom:** Kötelező `touch-action: manipulation;` alkalmazása minden gombra és kártyára.

## 13. Nem Funkcionális Követelmények (NFR)

| ID | Követelmény |
|---|---|
| NFR-01: Bundle Méret és Indulás | A teljes kezdeti PWA bundle mérete gzippelve < 350 KB. Első interaktív kirajzolás (TTI) gyenge 4G hálózaton < 1.2 másodperc. |
| NFR-02: Offline Működés (Service Worker) | Workbox Cache-First stratégia minden statikus assetre és JSON adatra. Repülőgépes üzemmódban 100%-ban játszhatónak kell lennie. |
| NFR-03: Képfrissítés és Memória | Stabil 60 FPS animációk (CSS GPU-gyorsított transform/opacity). Memóriahasználat nem haladhatja meg a 45 MB-ot huzamosabb használat során sem. |
| NFR-04: Akadálymentesség (WCAG 2.1 AA) | Szövegkontraszt arány minimum 4.5:1. Képernyőolvasó (ARIA live-region) támogatás a partner megszólalásakor és az eredményjelzőknél. |

## 14. Fejlesztői GYIK és Határeset (Edge Case) Mátrix

| Fejlesztői Kérdés / Esemény | Rendszer Szabály & Elvárt Viselkedés | Megvalósítási Útmutató |
|---|---|---|
| A játékos kilép vagy frissíti a lapot a kör közepén? | Az utolsó befejezett döntési csomópont állapotát automatikusan menteni kell IndexedDB-be minden kör előtt. | `sessionStorage` vagy `IndexedDB.saveCurrentRun()` azonnali hívása minden állapotváltáskor. |
| A felhasználó túl gyorsan kattint kétszer egymás után? | Debounce / Input lock aktiválása: a kártya kiválasztása után a felület 400 ms-ig tiltja a további érintéseket. | Globális `isTransitioning` flag bevezetése az FSM-ben. |
| Nagyon kicsi képernyő (pl. iPhone SE 375×667)? | A kártyák szövege automatikusan skálázódik `clamp()` segítségével, és vertikális scroll engedélyezett a kártyán belül. | `font-size: clamp(8pt, 2.5vw, 10pt); overflow-y: auto;` szabályok alkalmazása. |
| A telefon lezár, háttérbe kerül az app? | Az időzítőket (ha van stressz-visszaszámláló) azonnal fagyasztani kell a `visibilitychange` eseményre. | `document.addEventListener('visibilitychange', ...)` eseménykezelő implementálása. |

## 15. Átvételi és Jóváhagyási Záradék (Definition of Done)

**Átvételi Kritériumok (DoD):**

1. Minden funkcionális követelmény (FR-01-től FR-05-ig) zölden fut az automatizált E2E (Playwright) tesztekben.
2. Lighthouse PWA Audit pontszám > 95 (Performance, Accessibility, Best Practices, PWA).
3. A JSON forgatókönyv-validátor hiba nélkül ellenőrzi az összes mintaszituációt az integrációs pipeline-ban.
4. Sikeres tesztfutás alacsony kategóriás Android (Chrome) és iOS (Safari) fizikai eszközökön.
