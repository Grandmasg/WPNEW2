# TODO - WhatPulse Leaderboard

API base: `https://whatpulse.org/api/v1/`  
OpenAPI spec: `https://shared-files.whatpulse.org/whatpulse-openapi-v1.json`  
App versie: 0.82.1 | Angular 21 | Highcharts 12

---

## Nieuwe features

### Klein / snel

- [x] **`words` kolom** — gedaan
- [x] **Avatar** naast gebruikersnaam — gedaan
- [x] **`is_premium` badge** — DB + frontend ✅
- [x] **Global rank in popovers** — aanwezig als `RankKeysToday` etc. ✅
- [ ] **Subteam tooltip in dropdown** — oprichtingsdatum + volledige naam bij hover

### Middel

- [x] **Gebruiker-detail offcanvas** — volledig:
  - Avatar, naam, premium, lid-sinds, eerste/laatste pulse, computers ✅
  - Subteam, land + vlag, WhatPulse profiellink ✅
  - Wereldrang per metric (goud/zilver/brons) ✅
  - All-time totalen, milestones, 30/90/365-daagse grafiek ✅
  - Pulse-geschiedenis (cache via cron, paginering) ✅
  - distance_system (mi/km per gebruiker) ✅
- [ ] **Dagrecords per gebruiker** — hoogste ooit op één dag, tonen in user-detail
- [ ] **Trend-indicator in tabel** — wie stijgt/daalt over 7 dagen t.o.v. vorige 7 dagen

- [x] **Team/subteam stats kaart** — geïntegreerd in rank-banner:
  - All-time totalen (toetsen/klikken/scrollen/afstand/download/upload/uptime/pulses) ✅
  - Gemiddelde per lid ✅
  - Top performers per metric ✅
  - Oprichtingsdatum (DPC + subteams) ✅
  - Uitklapbaar, staat opgeslagen in localStorage ✅
  - Landen/vlaggen ✅

- [x] **Team global ranking banner** — goud/zilver/brons pills, alle pagina's ✅

### Groter

- [ ] **Subteam-vergelijking** — aparte view met alle subteams naast elkaar (totalen, rangorde)
- [ ] **Notificaties bij rank-wijzigingen** — "aKra is gestegen naar #1" (DB-vergelijking bij cron)
- [ ] **Historische grafiek per gebruiker** — alles vanaf het begin (meerdere jaren)
- [ ] **Subteams via nieuwe API** (optioneel — huidige aanpak werkt)

---

## Inactieve gebruikers

- [x] Altijd onderaan, grijs + 50% opacity, doorgestreept, badge "Verwijderd" ✅

---

## Code / technische schuld

- [x] **Dubbele `StatRecord` interface** — samengevoegd in `stats.service.ts`
- [x] **3 losse `router.events`** — geconsolideerd
- [x] **NG0100 errors** — `detectChanges` → `markForCheck`, `takeUntil` in Highcharts + TeamStats
- [x] **UTF-8 fix** — fix_encoding() in xmlupdate2.php
- [x] **README.md** — actuele stack
- [ ] **`npm audit`** — 4 dev-only vulnerabilities (webpack-dev-server, geen fix upstream)
- [ ] **`*ngIf` → `@if`** — nog aanwezig in weekly/monthly/yearly templates

---

## Package upgrades

- [x] Angular 21 + ng-bootstrap 20, Highcharts 12.6 ✅
- [ ] TypeScript 6 — wachten op Angular 22
- [ ] Node.js v25 → v22 LTS
