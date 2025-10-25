import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DebugService } from './debug.service';

@Injectable({
  providedIn: 'root',
})
export class LocalizationService {
  // Define available languages before they're used
  public availableLanguages = [
    { code: 'en-US', name: 'English', flag: 'us' },
    { code: 'nl-NL', name: 'Nederlands', flag: 'nl' },
    { code: 'de-DE', name: 'Deutsch', flag: 'de' },
    { code: 'fr-FR', name: 'Français', flag: 'fr' },
    { code: 'es-ES', name: 'Español', flag: 'es' }
  ];
  
  private languageSubject = new BehaviorSubject<string>('en-US');
  public language$ = this.languageSubject.asObservable();
  
  // Unit system (metric or imperial)
  private unitSystemSubject = new BehaviorSubject<'metric' | 'imperial'>('metric');
  public unitSystem$ = this.unitSystemSubject.asObservable();

  // Add the missing currentLanguage property
  private currentLanguage: string = 'en-US';

  // Session marker constants
  private static readonly LANGUAGE_KEY = 'language';
  private static readonly SESSION_KEY = 'wpnew2_session_active';
  private static readonly REFRESH_TYPE_KEY = 'wpnew2_refresh_type';
  private static readonly HARD_REFRESH_MARKER = 'last_language_before_refresh';
  
  constructor(private debugService: DebugService) {
    this.debugService.log('LocalizationService', '🔄 Service initialized');
    
    // Set up direct key event listener to detect Ctrl+F5 and F5 presses
    this.setupKeyboardEventListeners();
    
    // Then use our existing approach as fallback
    this.detectRefreshTypeAndInitialize();
    
    // Set up listener for page visibility changes
    document.addEventListener('visibilitychange', () => {
      // When page becomes visible again after being hidden
      if (document.visibilityState === 'visible') {
        // Check if this might be a back-forward navigation
        const backForwardTimestamp = sessionStorage.getItem('backForwardDetection');
        
        if (backForwardTimestamp && (Date.now() - parseInt(backForwardTimestamp)) < 5000) {
          this.debugService.log('LocalizationService', 'Back-forward navigation detected');
          // No need to change language on back/forward navigation
        }
        
        // Set timestamp for future back-forward detection
        sessionStorage.setItem('backForwardDetection', Date.now().toString());
      }
    });
    
    // Enhanced beforeunload listener
    window.addEventListener('beforeunload', () => {
      try {
        // Store all state needed to detect refresh type on next load
        const currentLang = this.languageSubject.getValue();
        
        // 1. Timestamp for the unload event
        const unloadTime = Date.now();
        localStorage.setItem('unload_timestamp', unloadTime.toString());
        
        // 2. Current language and navigation state
        localStorage.setItem('pre_refresh_language', currentLang);
        localStorage.setItem('pre_refresh_url', window.location.href);
        
        // 3. Special markers for refresh detection
        // Use a cookie that will persist through F5 but be cleared on browser restart
        document.cookie = `refreshMarker=${unloadTime};path=/`;
        
        // 4. Persisting markers using both localStorage and sessionStorage
        sessionStorage.setItem('f5_refresh_marker', unloadTime.toString());
        
        this.debugService.log('LocalizationService', '📊 State saved before unload:', {
          language: currentLang,
          timestamp: unloadTime,
          url: window.location.href
        });
      } catch (e) {
        this.debugService.error('LocalizationService', 'Error in beforeunload handler:', e);
      }
    });
  }

  /**
   * Set up global keyboard listeners to detect actual Ctrl+F5 vs F5 presses
   * This will help us distinguish between different refresh types directly
   */
  private setupKeyboardEventListeners(): void {
    // Create a flag in localStorage to track Ctrl+F5 presses
    // We use localStorage because it persists through refreshes
    document.addEventListener('keydown', (event) => {
      // Check for F5 key (code 116)
      if (event.key === 'F5' || event.keyCode === 116) {
        const isCtrlPressed = event.ctrlKey;
        const timestamp = Date.now();
        
        // Store the exact key combination right before refresh
        localStorage.setItem('lastKeyRefresh', isCtrlPressed ? 'ctrl_f5' : 'f5');
        localStorage.setItem('lastKeyRefreshTime', timestamp.toString());
        
        this.debugService.log('LocalizationService', 
          `🔑 Detected ${isCtrlPressed ? 'Ctrl+F5' : 'F5'} keypress`);
        
        // We don't preventDefault() because we want the browser to actually refresh
      }
    }, { capture: true }); // Use capture to get event before browser handles it
  }

  /**
   * More reliable refresh type detection with multiple heuristics
   * Now with direct keyboard event detection
   */
  private detectRefreshTypeAndInitialize(): void {
    try {
      // First, check if we have direct keyboard event info
      const lastKeyRefresh = localStorage.getItem('lastKeyRefresh');
      const lastKeyRefreshTime = parseInt(localStorage.getItem('lastKeyRefreshTime') || '0');
      const currentTime = Date.now();
      
      // If we detected a keypress within the last 3 seconds, use that information
      if (lastKeyRefresh && (currentTime - lastKeyRefreshTime) < 3000) {
        const isCtrlF5 = lastKeyRefresh === 'ctrl_f5';
        
        this.debugService.log('LocalizationService', 
          `🔍 Keyboard detection: ${isCtrlF5 ? 'Ctrl+F5' : 'F5'} (${(currentTime - lastKeyRefreshTime)}ms ago)`);
        
        if (isCtrlF5) {
          this.debugService.log('LocalizationService', '🔄 HARD REFRESH (Ctrl+F5) detected via keyboard event!');
          // Clear the flag so it's only used once
          localStorage.removeItem('lastKeyRefresh');
          localStorage.removeItem('lastKeyRefreshTime');
          
          // Force browser language on Ctrl+F5
          this.useBrowserLanguageOnHardRefresh();
          return;
        }
      }
      
      // Otherwise, proceed with our existing detection methods as backup
      // Get load timestamp immediately
      const loadTime = Date.now();
      
      // 1. Check for F5 refresh marker in sessionStorage
      const f5Marker = sessionStorage.getItem('f5_refresh_marker');
      
      // 2. Check unload timestamp from localStorage
      const unloadTimestamp = parseInt(localStorage.getItem('unload_timestamp') || '0');
      
      // 3. Check if the refresh was very quick (less than 1000ms between unload and load)
      // F5 refresh is typically much faster than Ctrl+F5 which bypasses the cache
      const isQuickRefresh = (loadTime - unloadTimestamp) < 1000;
      
      // 4. Check for performance navigation data
      const navEntry = this.getNavigationPerformanceEntry();
      const navType = navEntry?.type || this.getLegacyNavigationType();
      
      // 5. Look for the refresh marker cookie
      const refreshCookie = this.getCookie('refreshMarker');

      // Use proper type checking for navEntry properties that could be undefined
      const hasCacheControl = navEntry && 
                             navEntry.nextHopProtocol === 'http/1.1' && 
                             typeof navEntry.transferSize === 'number' && 
                             typeof navEntry.decodedBodySize === 'number' && 
                             navEntry.transferSize > 0 && 
                             navEntry.decodedBodySize > 0;

      // Log all detection data
      this.debugService.log('LocalizationService', '🔍 Refresh detection data:', {
        f5Marker: f5Marker ? 'Present' : 'Missing',
        timeBetweenUnloadAndLoad: loadTime - unloadTimestamp + 'ms',
        isQuickRefresh,
        navigationType: navType,
        refreshCookie: refreshCookie || 'None',
        hasCacheControl
      });
      
      // Combine all heuristics to make a final decision
      const isHardRefresh = !f5Marker && (
        !isQuickRefresh || 
        !refreshCookie || 
        (navType === 'reload' && navEntry && typeof navEntry.transferSize === 'number' && navEntry.transferSize > 0)
      );
      
      // Apply the appropriate language based on refresh type
      if (isHardRefresh) {
        this.debugService.log('LocalizationService', '🔄 HARD REFRESH (Ctrl+F5) detected!');
        this.useBrowserLanguageOnHardRefresh();
      } else {
        this.debugService.log('LocalizationService', '🔄 NORMAL REFRESH (F5) or navigation detected');
        this.initializeLanguage();
      }
      
      // Clear old markers and set new ones
      sessionStorage.setItem('f5_refresh_marker', loadTime.toString());
      localStorage.setItem('last_load_timestamp', loadTime.toString());
      
    } catch (e) {
      this.debugService.error('LocalizationService', 'Error during refresh detection:', e);
      // Fall back to basic initialization
      this.initializeLanguage();
    }
  }
  
  /**
   * Get the navigation performance entry with modern API
   */
  private getNavigationPerformanceEntry(): PerformanceNavigationTiming | null {
    try {
      if (window.performance && performance.getEntriesByType) {
        const navEntries = performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length > 0) {
          return navEntries[0] as PerformanceNavigationTiming;
        }
      }
    } catch (e) {
      this.debugService.error('LocalizationService', 'Error getting performance entry:', e);
    }
    return null;
  }
  
  /**
   * Get navigation type using legacy performance API
   */
  private getLegacyNavigationType(): string {
    try {
      if (window.performance && 'navigation' in performance) {
        const navType = (performance as any).navigation.type;
        switch (navType) {
          case 0: return 'navigate';
          case 1: return 'reload';
          case 2: return 'back_forward';
          default: return 'unknown';
        }
      }
    } catch (e) {
      this.debugService.error('LocalizationService', 'Error getting legacy navigation type:', e);
    }
    return 'unknown';
  }
  
  /**
   * Get cookie by name
   */
  private getCookie(name: string): string | null {
    try {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? match[2] : null;
    } catch (e) {
      this.debugService.error('LocalizationService', 'Error reading cookie:', e);
      return null;
    }
  }

  /**
   * Special handler for hard refresh that forces using browser language
   */
  private useBrowserLanguageOnHardRefresh(): void {
    // Get browser language
    const browserLang = navigator.language;
    const language = this.findClosestSupportedLanguage(browserLang);
    
    this.debugService.log('LocalizationService', `🌐 Using browser language after hard refresh: ${browserLang} -> ${language}`);
    
    // Set the language without saving to localStorage
    this.currentLanguage = language;
    
    // Clear stored language to prevent it being used
    localStorage.removeItem(LocalizationService.LANGUAGE_KEY);
    
    // For debugging - save previous value temporarily
    const prevLang = localStorage.getItem(LocalizationService.HARD_REFRESH_MARKER);
    this.debugService.log('LocalizationService', `🔄 Previous language before refresh was: ${prevLang}`);
    localStorage.removeItem(LocalizationService.HARD_REFRESH_MARKER);
    
    // Update the UI
    document.documentElement.setAttribute('lang', language);
    this.languageSubject.next(language);
    
    // Initialize unit system based on language
    const unitSystem = language === 'en-US' ? 'imperial' : 'metric';
    this.unitSystemSubject.next(unitSystem);
  }

  /**
   * Initialize language settings for normal page loads and F5 refreshes
   */
  private initializeLanguage(): void {
    // First check localStorage for saved language preference
    const storedLanguage = localStorage.getItem(LocalizationService.LANGUAGE_KEY);
    
    // Log debug info
    this.debugService.log('LocalizationService', 'Initializing language');
    this.debugService.log('LocalizationService', `Stored language: ${storedLanguage || 'none'}`);
    this.debugService.log('LocalizationService', `Refresh type: ${sessionStorage.getItem(LocalizationService.REFRESH_TYPE_KEY) || 'unknown'}`);
    
    if (storedLanguage && this.isValidLanguage(storedLanguage)) {
      // Use the stored language preference
      this.currentLanguage = storedLanguage;
      this.debugService.log('LocalizationService', `Using stored language: ${storedLanguage}`);
    } else {
      // No stored preference, use browser language
      this.useBrowserLanguage();
      this.debugService.log('LocalizationService', `No valid stored preference, using browser language: ${this.currentLanguage}`);
      
      // Save this language as the new preference
      localStorage.setItem(LocalizationService.LANGUAGE_KEY, this.currentLanguage);
    }
    
    // Set the language on the document
    document.documentElement.setAttribute('lang', this.currentLanguage);
    
    // Update the subject
    this.languageSubject.next(this.currentLanguage);
    
    // Initialize unit system based on language or stored preference
    this.initializeUnitSystem();
  }

  /**
   * Initialize unit system based on language or stored preference
   */
  private initializeUnitSystem(): void {
    // First check if there's a stored unit system preference
    const storedUnitSystem = localStorage.getItem('unitSystem') as 'metric' | 'imperial';
    
    if (storedUnitSystem && (storedUnitSystem === 'metric' || storedUnitSystem === 'imperial')) {
      // Use stored preference
      this.unitSystemSubject.next(storedUnitSystem);
    } else {
      // Default based on language
      const unitSystem = this.currentLanguage === 'en-US' ? 'imperial' : 'metric';
      this.unitSystemSubject.next(unitSystem);
      localStorage.setItem('unitSystem', unitSystem);
    }
  }

  /**
   * Helper to use browser language
   */
  private useBrowserLanguage(): void {
    const browserLang = navigator.language;
    const language = this.findClosestSupportedLanguage(browserLang);
    this.currentLanguage = language;
    this.debugService.log('LocalizationService', `Using browser language: ${browserLang} -> ${language}`);
  }

  /**
   * Check if a language code is supported
   */
  private isValidLanguage(langCode: string): boolean {
    return this.availableLanguages.some(lang => lang.code === langCode);
  }

  /**
   * Find the closest supported language to the provided language code
   * For example, 'en' would match with 'en-US'
   */
  private findClosestSupportedLanguage(langCode: string): string {
    // Check for exact match first
    if (this.availableLanguages.some(l => l.code === langCode)) {
      return langCode;
    }
    
    // Check for language match (ignoring region)
    const baseLang = langCode.split('-')[0].toLowerCase();
    const match = this.availableLanguages.find(l => 
      l.code.toLowerCase().startsWith(baseLang + '-')
    );
    
    if (match) {
      return match.code;
    }
    
    // Default to en-US if no match found
    return 'en-US';
  }

  /**
   * Changes the current language
   * @param language Language code to set
   */
  public setLanguage(language: string): void {
    if (this.currentLanguage !== language) {
      this.currentLanguage = language;
      
      // Add timestamp for cache busting
      const timestamp = Date.now();
      
      // Save preference to localStorage
      localStorage.setItem('language', language);
      
      // Emit language change event with timestamp
      this.languageSubject.next(language);
      
      // Update document attributes
      document.documentElement.setAttribute('lang', language);
      
      // Also update unit system based on selected language
      // en-US -> imperial, others -> metric (keeps behavior predictable on language switch)
      try {
        const newUnitSystem: 'metric' | 'imperial' = language === 'en-US' ? 'imperial' : 'metric';
        this.setUnitSystem(newUnitSystem);
      } catch (e) {
        this.debugService.error('LocalizationService', 'Error setting unit system on language change:', e);
      }

      // Update HTML base href with timestamp for cache busting if needed
      this.updateCacheBustingParameters(timestamp);
    }
  }

  /**
   * Updates URLs with cache busting timestamp
   * @param timestamp Current timestamp
   */
  private updateCacheBustingParameters(timestamp: number): void {
    // Only update i18n resource URLs, not all stylesheets/scripts
    // This prevents unnecessary page reloads when changing language
    
    // Notify app components about language change with timestamp
    // Components can handle their own resource updates if needed
    const event = new CustomEvent('language-changed', { 
      detail: { 
        language: this.currentLanguage,
        timestamp: timestamp
      } 
    });
    document.dispatchEvent(event);
  }
  
  getCurrentLanguageFlag(): string {
    const currentLang = this.languageSubject.getValue();
    const language = this.availableLanguages.find(l => l.code === currentLang);
    return language ? language.flag : 'us';
  }
  
  setUnitSystem(system: 'metric' | 'imperial'): void {
    this.debugService.log('LocalizationService', `Setting unit system to: ${system}`);
    this.unitSystemSubject.next(system);
    localStorage.setItem('unitSystem', system);
  }
  
  toggleUnitSystem(): void {
    const current = this.unitSystemSubject.getValue();
    const newSystem = current === 'metric' ? 'imperial' : 'metric';
    this.setUnitSystem(newSystem);
  }
  
  getUnitSystem(): 'metric' | 'imperial' {
    return this.unitSystemSubject.getValue();
  }
  
  getUnitSystemLabel(): string {
    return this.unitSystemSubject.getValue() === 'metric' ? 'Metric' : 'Imperial';
  }
  
  // Updated to handle StatsDistance in miles by default
  formatChartDistance(value: number): string {
    // Assume value is in miles for StatsDistance
    const isMetric = this.unitSystemSubject.getValue() === 'metric';
    
    if (isMetric) {
      // Convert miles to kilometers for metric display
      const km = value * 1.60934;
      if (km >= 1) {
        return `${km.toFixed(2)} km`;
      } else {
        return `${(km * 1000).toFixed(0)} m`;
      }
    } else {
      // Already in miles, just format
      if (value >= 1) {
        return `${value.toFixed(2)} mi`;
      } else {
        // Convert to feet for small distances
        const feet = value * 5280;
        return `${Math.round(feet)} ft`;
      }
    }
  }
  
  getRawDistance(value: number): number {
    // Assume value is in miles for StatsDistance
    const isMetric = this.unitSystemSubject.getValue() === 'metric';
    if (isMetric) {
      return value * 1.60934; // convert miles to kilometers
    } else {
      return value; // already in miles
    }
  }
  
  getDistanceUnit(): string {
    // Return the appropriate unit label
    const isMetric = this.unitSystemSubject.getValue() === 'metric';
    return isMetric ? 'km' : 'mi';
  }
  
  // Updated to handle StatsDistance in miles by default
  formatTableDistance(value: number): string {
    // Assume value is in miles for StatsDistance
    const isMetric = this.unitSystemSubject.getValue() === 'metric';
    
    if (isMetric) {
      // Convert miles to kilometers
      const km = value * 1.60934;
      return `${this.formatDecimal(km)} km`;
    } else {
      // Already in miles
      return `${this.formatDecimal(value)} mi`;
    }
  }
  
  // Add formatNumber method used in stats-table component
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    if (value === undefined || value === null) {
      return '';
    }
    
    const currentLang = this.languageSubject.getValue();
    const defaultOptions: Intl.NumberFormatOptions = {
      maximumFractionDigits: 2
    };
    
    const finalOptions = options ? {...defaultOptions, ...options} : defaultOptions;
    
    try {
      return new Intl.NumberFormat(currentLang, finalOptions).format(value);
    } catch (error) {
      this.debugService.error('LocalizationService', `Error formatting number ${value}:`, error);
      return value.toString();
    }
  }
  
  // Add formatDecimal method for stats-table component
  formatDecimal(value: number, decimals: number = 2): string {
    if (value === undefined || value === null) {
      return '';
    }
    
    const currentLang = this.languageSubject.getValue();
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    };
    
    try {
      return new Intl.NumberFormat(currentLang, options).format(value);
    } catch (error) {
      this.debugService.error('LocalizationService', `Error formatting decimal ${value}:`, error);
      return value.toFixed(decimals);
    }
  }
  
  // Add formatDataSize method for stats-table component
  formatDataSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals));
    return `${this.formatDecimal(value)} ${sizes[i]}`;
  }

  // Add formatDistance method
  formatDistance(value: number): string {
    const isMetric = this.unitSystemSubject.getValue() === 'metric';
    const rawDistance = this.getRawDistance(value);
    
    if (isMetric) {
      return `${this.formatDecimal(rawDistance)} km`;
    } else {
      return `${this.formatDecimal(rawDistance)} mi`;
    }
  }

  // Get date format pattern for current language
  public getDateFormatPattern(): string {
    const lang = this.languageSubject.getValue();
    
    switch (lang) {
      case 'nl-NL': return 'dd-MM-yyyy';
      case 'de-DE': return 'dd.MM.yyyy';
      case 'fr-FR': return 'dd/MM/yyyy';
      case 'es-ES': return 'dd/MM/yyyy';
      default: return 'MM/dd/yyyy'; // en-US format
    }
  }

  // Get date format placeholder for current language
  public getDateFormatPlaceholder(): string {
    const lang = this.languageSubject.getValue();
    
    switch (lang) {
      case 'nl-NL': return 'dd-mm-jjjj';
      case 'de-DE': return 'tt.mm.jjjj';
      case 'fr-FR': return 'jj/mm/aaaa';
      case 'es-ES': return 'dd/mm/aaaa';
      default: return 'mm/dd/yyyy'; // en-US format
    }
  }

  // Format a date according to the current locale
  public formatDate(date: Date, format?: string): string {
    if (!date) return '';
    
    try {
      const locale = this.languageSubject.getValue();
      
      if (format === 'short') {
        return date.toLocaleDateString(locale, { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
      } else if (format === 'medium') {
        return date.toLocaleDateString(locale, { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        });
      } else if (format === 'long') {
        return date.toLocaleDateString(locale, { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      } else {
        // Default format
        return date.toLocaleDateString(locale);
      }
    } catch (error) {
      this.debugService.error('LocalizationService', 'Error formatting date:', error);
      return date.toLocaleDateString(); // Fallback to browser default
    }
  }
  
  // Emit an event when language changes for components to react
  private notifyDateFormatChanged(lang: string): void {
    // Create a custom event that date-input components can listen for
    const event = new CustomEvent('language-date-format-changed', {
      bubbles: true,
      detail: {
        language: lang,
        dateFormatPattern: this.getDateFormatPattern(),
        dateFormatPlaceholder: this.getDateFormatPlaceholder()
      }
    });
    document.dispatchEvent(event);
    this.debugService.log('LocalizationService', `Date format change event dispatched for language: ${lang}`);
  }

  // Simple logger that checks sessionStorage directly instead of using DebugService
  private logDebug(message: string): void {
    this.debugService.log('LocalizationService', message);
  }
}
