# WPNEW2 - WhatPulse Statistics Dashboard

WPNEW2 is een Angular-applicatie voor het bijhouden en visualiseren van WhatPulse-statistieken. De app biedt interactieve grafieken, uitgebreide analyses en dynamische SEO-bestanden voor optimale vindbaarheid.

---

## Features

- **Realtime WhatPulse statistieken (cron elk uur)**
- **Interactieve grafieken en tabellen**
- **Dynamische SEO-bestanden** (`robots.txt`, `sitemap.xml`)
- **Automatische meta-tags en Open Graph ondersteuning**
- **Meertaligheid via `assets/i18n/`**
- **Hash-based routing voor eenvoudige hosting**

---

## Installatie

1. **Clone de repository:**
   ```bash
   git clone <repository-url>
   cd WPNEW2
   ```
2. **Installeer de afhankelijkheden:**
   ```bash
   npm install
   ```
3. **Start de ontwikkelserver:**
   ```bash
   ng serve
   ```
   Open je browser en ga naar `http://localhost:4200/`. De applicatie wordt automatisch herladen bij wijzigingen in de bronbestanden.

---

## Ontwikkeling

Deze sectie biedt technische details over de ontwikkeling van de WPNEW2-applicatie.

### Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

### Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

### Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

### Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

---

## Bijdragen

Bijdragen aan WPNEW2 zijn welkom! Volg deze stappen om bij te dragen:

1. Fork de repository.
2. Maak een nieuwe branch voor je functie of bugfix:
   ```bash
   git checkout -b mijn-functie
   ```
3. Voer je wijzigingen door en commit ze:
   ```bash
   git commit -m "Voeg mijn functie toe"
   ```
4. Push naar je fork:
   ```bash
   git push origin mijn-functie
   ```
5. Maak een pull request naar de hoofdrepository.

---

## Licentie

Dit project is gelicentieerd onder de MIT-licentie - zie het [LICENSE](LICENSE) bestand voor details.

---

## Acknowledgements

- [Angular](https://angular.io/) - Het webframework
- [WhatPulse](https://whatpulse.org/) - Voor de statistieken
- [ngx-charts](https://swisspol.github.io/ngx-charts/) - Voor de grafieken
- [ngx-translate](https://github.com/ngx-translate/core) - Voor meertaligheid
- [Angular CLI](https://github.com/angular/angular-cli) - Voor projectstructuur en tooling
