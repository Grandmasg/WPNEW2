# TODO - WhatPulse Leaderboard

API base: `https://whatpulse.org/api/v1/`  
OpenAPI spec: https://shared-files.whatpulse.org/whatpulse-openapi-v1.json  
App versie: 0.82.1 | Angular 20 → 21 | Highcharts 12

---

## Nieuwe API-features

### Klein / snel

- [ ] **`words` kolom** — backend lokaal toegevoegd  
  Frontend nog te doen: `StatRecord` uitbreiden, `normalizeRecord()` mappen, kolom in tabel  
  Geldt voor: daily, weekly, monthly, yearly, overall

- [ ] **Avatar** weergeven naast gebruikersnaam — backend lokaal toegevoegd  
  Frontend nog te doen: klein (24×24px) vóór de naam in de username-kolom

- [ ] **`is_premium` badge** — zit in `GET /users/{id}`, scope is voldoende  
  Backend: veld opslaan. Frontend: icoontje achter naam

- [ ] **Global rank** tonen in popovers  
  → `GET /users/{id}` → `ranks.*`  
  Nu staat alleen teaminterne rank in de popovers; wereldrang ernaast zetten

### Middel

- [ ] **Gebruiker-detail popup verrijken**  
  → Bij klik op gebruikersnaam: avatar + naam + lid-sinds (`date_joined`) + totalen  
  - global ranks + computers (`GET /users/{id}/computers`) + laatste pulse  
  Nu toont `userPopover` alleen username, lastPulse, team

- [ ] **Team global ranking banner**  
  → `GET /teams/1295` → `ranks.*`  
  Mondiale rangpositie van het team bovenaan de pagina tonen  
  Scope is voldoende, geen extra backend nodig

### Groter

- [ ] **Pulse-geschiedenis per gebruiker**  
  → `GET /users/{id}/pulses?date_from=&date_to=`  
  Klikbaar vanuit gebruiker-detail

- [ ] **Subteams via nieuwe API** (optioneel — huidige aanpak werkt)  
  → `GET /teams/1295/subteams` geeft officiële subteams  
  Huidige manual mappings in `xmlupdate2.php` werken, nieuwe endpoint is een alternatief

---

## Nieuwe features

- [ ] **Inactieve users (`is_active = 0`) anders weergeven**
  - Altijd onderaan de ranking plaatsen (ongeacht sortering)
  - Rij grijs weergeven
  - Badge "Verwijderd account" tonen
  - Backend geeft `is_active` al terug
  - Aanpassen in: `stats.service.ts` (sortering), `stats-table.component.html` (styling + badge)

---

## Code — bugs / technische schuld

- [ ] **Dubbele `StatRecord` interface**  
  In `stats-table.component.ts:16` én `stats.service.ts:8`  
  Tabel-variant mist expliciet `username` veld  
  → Samenvoegen in één gedeelde interface (bijv. `models/stat-record.ts`)

- [ ] **`words` veld niet gemapped**  
  `normalizeRecord()` in `stats.service.ts:419` — `words` ontbreekt  
  → Toevoegen na backend-stap: `words: this.parseNumberField(item.words || item.Words || 0)`

- [ ] **Globale console-override verwijderen**  
  `app.component.ts:239-259` overschrijft `console.warn` én `console.log` globaal  
  → Filter PageTransitionEvent in de event handler zelf, niet globaal

- [ ] **3 losse `router.events` subscriptions consolideren**  
  `app.component.ts:132`, `:188`, `:284` — drie aparte pipes op hetzelfde stream

- [ ] **Hardcoded "Loading data..." vertalen**  
  `stats-table.component.html:8` — niet via translate pipe  
  → `{{ 'common.loading' | translate }}`

- [ ] **Copyright jaar hardcoded**  
  `app.component.html:119` — `&copy; 2025 Grandmasg.nl`  
  → `{{ currentYear }}` via `new Date().getFullYear()`

- [ ] **`MatPaginator` import controleren**  
  `stats-table.component.ts` importeert `MatPaginator` maar gebruikt `PaginationComponent`  
  → Waarschijnlijk ongebruikte import, verwijderen

---

## Documentatie

- [ ] **README.md bijwerken**  
  Vermeldt nog `ngx-charts` en `ngx-translate` — app gebruikt Highcharts + eigen translate service

---

## Package upgrades

Volgorde is belangrijk — niet alles tegelijk.

### Stap 1 — Angular 21 (eerst)

```bash
npx ng update @angular/core@21 @angular/cli@21
npx ng update @angular/cdk@21 @angular/material@21
```

### Stap 2 — ng-bootstrap (vereist Angular 21)

```bash
npm install @ng-bootstrap/ng-bootstrap@20
```

### Stap 3 — zone.js (samen met Angular)

```bash
npm install zone.js@0.16
```

### Stap 4 — TypeScript (SKIP — nog niet)

> Angular 21 ondersteunt officieel alleen TypeScript 5.7–5.9. TypeScript 6 nog niet upgraden.

### Stap 5 — Overige (veilig, altijd mogelijk)

```bash
npm install highcharts@12.6 highcharts-angular@5.4
npm install @fortawesome/fontawesome-free@7.2
npm install --save-dev @types/node@24 @types/jasmine@6 jasmine-core@6 karma-jasmine-html-reporter@2.2
```

### Stap 6 — Build controleren

```bash
ng build --configuration production
```

---

## Bevestigd / geen actie nodig

- [x] **API scope** — `user-public-api` is voldoende voor alles
- [x] **Rate limit** — 5 keys × 1000 = 5.000 req/uur, rotatie via `X-RateLimit-Remaining`, geen caching nodig
- [x] **Subteams** — werkt via manual mappings (15 subteams), geen wijziging nodig
