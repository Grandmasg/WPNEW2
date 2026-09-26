# WPNEW2 — WhatPulse Statistics Dashboard

Statistieken-dashboard voor het team **Dutch Power Cows** op WhatPulse. Visualiseert dagelijkse, wekelijkse, maandelijkse en jaarlijkse data uit een lokale MySQL-database die elk uur wordt bijgewerkt via de WhatPulse API.

---

## Stack

| Laag | Technologie |
| --- | --- |
| Frontend | Angular 21 (standalone components) |
| Grafieken | Highcharts 12 + highcharts-angular |
| UI | Bootstrap 5.3 + Bootswatch themes + ng-bootstrap 20 |
| Iconen | Font Awesome 6 + flag-icons |
| Backend | PHP 8.3 + MySQL (Laragon) |
| API | WhatPulse API v1 |

---

## Features

- Dagelijkse / wekelijkse / maandelijkse / jaarlijkse ranglijsten
- Interactieve Highcharts grafieken per periode
- Gebruiker-detail offcanvas: rang, totalen, land/vlag, milestones, 30/90/365-daagse grafiek
- Subteam-filtering
- Licht/donker thema (Bootswatch Flatly / Darkly)
- Meertaligheid via `assets/i18n/` (eigen translate service)
- Inactieve gebruikers visueel onderscheiden
- Premium badge, avatar, wereldrang per metric

---

## Lokaal draaien

### Vereisten

- Node.js 22 LTS
- PHP 8.3 + MySQL (bijv. via Laragon)
- Angular CLI 21

### Frontend

```bash
npm install
ng serve
```

Open `http://localhost:4200/`

### Backend (API)

Zet de PHP-bestanden in `C:\laragon\www\API\` en pas `connect.php` aan met je database-gegevens. Voeg je WhatPulse API-keys toe aan `$WHATPULSE_API_KEYS` in `connect.php`.

De data wordt bijgewerkt door `xmlupdate2.php` periodiek aan te roepen (bijv. via Windows Task Scheduler elk uur).

---

## Build

```bash
ng build
```

Output staat in `dist/`. Deploy de inhoud naar je webserver.

---

## Acknowledgements

- [Angular](https://angular.io/)
- [Highcharts](https://www.highcharts.com/)
- [Bootstrap](https://getbootstrap.com/) + [Bootswatch](https://bootswatch.com/)
- [WhatPulse](https://whatpulse.org/)
- [Angular CLI](https://github.com/angular/angular-cli)
