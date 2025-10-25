import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/s/daily/0/-', pathMatch: 'full' },
  { 
    path: 's/daily/:offset/:team', 
    loadComponent: () => import('./pages/daily/daily.component').then(m => m.DailyComponent)
  },
  { 
    path: 's/daily/:offset/:team/:search', 
    loadComponent: () => import('./pages/daily/daily.component').then(m => m.DailyComponent)
  },
  { 
    path: 's/weekly/:offset/:team', 
    loadComponent: () => import('./pages/weekly/weekly.component').then(m => m.WeeklyComponent)
  },
  { 
    path: 's/weekly/:offset/:team/:search', 
    loadComponent: () => import('./pages/weekly/weekly.component').then(m => m.WeeklyComponent)
  },
  { 
    path: 's/monthly/:offset/:team', 
    loadComponent: () => import('./pages/monthly/monthly.component').then(m => m.MonthlyComponent)
  },
  { 
    path: 's/monthly/:offset/:team/:search', 
    loadComponent: () => import('./pages/monthly/monthly.component').then(m => m.MonthlyComponent)
  },
  { 
    path: 's/yearly/:offset/:team', 
    loadComponent: () => import('./pages/yearly/yearly.component').then(m => m.YearlyComponent)
  },
  { 
    path: 's/yearly/:offset/:team/:search', 
    loadComponent: () => import('./pages/yearly/yearly.component').then(m => m.YearlyComponent)
  },
  { 
    path: 'o/overall/:offset/:team', 
    loadComponent: () => import('./pages/overall/overall.component').then(m => m.OverallComponent)
  },
  { 
    path: 'o/overall/:offset/:team/:search', 
    loadComponent: () => import('./pages/overall/overall.component').then(m => m.OverallComponent)
  },
  { 
    path: 'x/xml/:offset/:team', 
    loadComponent: () => import('./pages/xml/xml.component').then(m => m.XmlComponent)
  },
  { 
    path: 'x/xml/:offset/:team/:search', 
    loadComponent: () => import('./pages/xml/xml.component').then(m => m.XmlComponent)
  },
  { path: '**', redirectTo: '/s/daily/0/-' }
];
