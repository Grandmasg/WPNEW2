import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules, withHashLocation } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';
import { ClipboardModule } from 'ngx-clipboard';
import { provideHighcharts } from 'highcharts-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withPreloading(PreloadAllModules), withHashLocation()),
    provideHttpClient(),
    importProvidersFrom(ClipboardModule),
    provideHighcharts()
  ]
};
