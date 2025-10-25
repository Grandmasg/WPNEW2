import { Injectable, Renderer2, RendererFactory2 } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private renderer: Renderer2;
  private _currentTheme = new BehaviorSubject<ThemeMode>(this.detectPreferredTheme());

  // Observable to subscribe to theme changes
  public currentTheme$ = this._currentTheme.asObservable();

  constructor(rendererFactory: RendererFactory2) {
    this.renderer = rendererFactory.createRenderer(null, null);

    // Listen for system preference changes
    this.listenForPreferenceChanges();

    // Initialize theme
    this.initTheme();
  }

  private listenForPreferenceChanges(): void {
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        const newTheme = e.matches ? 'dark' : 'light';
        console.log(`System theme preference changed: ${newTheme}`);

        // Only update if we're using system preference
        if (localStorage.getItem('user-theme-preference') === 'system' || 
            localStorage.getItem('user-theme-preference') === null) {
          this.setTheme(newTheme, false);
        }
      });
    }
  }

  private detectPreferredTheme(): ThemeMode {
    const savedPreference = localStorage.getItem('user-theme-preference');

    if (savedPreference === 'system' || savedPreference === null) {
      return this.getSystemPreference();
    } else if (savedPreference === 'dark' || savedPreference === 'light') {
      return savedPreference as ThemeMode;
    }

    return 'light'; // Default fallback
  }

  private getSystemPreference(): ThemeMode {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light'; // Default fallback
  }

  private initTheme(): void {
    const theme = this._currentTheme.value;
    this.applyTheme(theme);
  }

  toggleTheme(): void {
    const newTheme = this._currentTheme.value === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme, true);
  }

  setTheme(theme: ThemeMode, userInitiated: boolean = false): void {
    if (userInitiated) {
      localStorage.setItem('user-theme-preference', theme);
    }

    this._currentTheme.next(theme);
    this.applyTheme(theme);
  }

  useSystemPreference(): void {
    localStorage.setItem('user-theme-preference', 'system');
    const systemTheme = this.getSystemPreference();
    this._currentTheme.next(systemTheme);
    this.applyTheme(systemTheme);
  }

  /**
   * Dynamisch Bootswatch theme laden via <link id="theme-stylesheet"> in index.html
   * Nu met onload callback zodat componenten pas updaten als het theme geladen is
   */
  private setBootswatchTheme(theme: ThemeMode, onLoaded?: () => void) {
    const themeLink = document.getElementById('theme-stylesheet') as HTMLLinkElement | null;
    if (!themeLink) return;
    let href = '';
    if (theme === 'dark') {
      href = 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/darkly/bootstrap.min.css';
    } else {
      href = 'https://cdn.jsdelivr.net/npm/bootswatch@5.3.3/dist/flatly/bootstrap.min.css';
    }
    if (onLoaded) {
      themeLink.onload = () => {
        themeLink.onload = null;
        onLoaded();
      };
    }
    themeLink.href = href;
  }

  private applyTheme(theme: ThemeMode, onLoaded?: () => void): void {
    const html = document.querySelector('html');
    if (html) {
      if (theme === 'system') {
        const systemTheme = this.getSystemPreference();
        this.renderer.setAttribute(html, 'data-bs-theme', systemTheme);
        this.setBootswatchTheme(systemTheme, onLoaded);
      } else {
        this.renderer.setAttribute(html, 'data-bs-theme', theme);
        this.setBootswatchTheme(theme, onLoaded);
      }
    }
  }

  // Publieke methode om theme te wisselen en te wachten op CSS load
  public setThemeAndWait(theme: ThemeMode, userInitiated: boolean = false): Promise<void> {
    if (userInitiated) {
      localStorage.setItem('user-theme-preference', theme);
    }
    this._currentTheme.next(theme);
    return new Promise(resolve => {
      this.applyTheme(theme, resolve);
    });
  }

  /**
   * Theme wissel + harde reload zodat Highcharts altijd schoon is.
   * Slaat voorkeur op in localStorage.
   */
  public setThemeAndReload(theme: ThemeMode): void {
    localStorage.setItem('user-theme-preference', theme);
    this._currentTheme.next(theme);
    this.applyTheme(theme, () => {
      setTimeout(() => {
        window.location.reload();
      }, 100);
    });
  }
}
