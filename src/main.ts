// Import polyfills first - use the correct path
import './polyfills';

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Set initial theme based on system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-bs-theme', prefersDark ? 'dark' : 'light');

// Use the environment check to handle SSR scenarios
if (document.readyState === 'complete') {
  bootstrapApplication(AppComponent, appConfig)
    .catch((err) => console.error('Bootstrap error:', err));
} else {
  document.addEventListener('DOMContentLoaded', () => {
    bootstrapApplication(AppComponent, appConfig)
      .catch((err) => console.error('Bootstrap error:', err));
  });
}