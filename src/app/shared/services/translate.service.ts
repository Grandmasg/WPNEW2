import { Injectable } from '@angular/core';
import { LocalizationService } from './localization.service';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs/operators';

// Interface for translations by language
export interface TranslationSet {
  [key: string]: string;
}

// Interface for all available translations
export interface Translations {
  [language: string]: TranslationSet;
}

@Injectable({
  providedIn: 'root'
})
export class TranslateService {
  // Default language is English
  private currentLanguage: string = 'en-US';
  
  // Store translations for different languages - initially empty
  private translations: Translations = {
    'en-US': {}  // Start with an empty object for each language
  };

  // Observable to notify components of language changes
  private translationsChanged = new BehaviorSubject<TranslationSet>({});
  public translationsChanged$ = this.translationsChanged.asObservable();

  // Add property to store timestamp
  private lastLanguageChangeTimestamp: number = 0;
  
  // Track which languages are currently loading or loaded
  private loadingLanguages = new Set<string>();
  private loadedLanguages = new Set<string>();

  constructor(
    private localizationService: LocalizationService,
    private http: HttpClient
  ) {
    // Initialize with current language from localStorage or default
    const savedLanguage = localStorage.getItem('language');
    this.currentLanguage = savedLanguage || 'en-US';
    
    // Set initial timestamp to 0 to allow browser caching on first load
    this.lastLanguageChangeTimestamp = 0;
    
    // Listen for the language-changed event with timestamp
    document.addEventListener('language-changed', (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent?.detail?.timestamp) {
        // Store the timestamp for cache busting
        this.lastLanguageChangeTimestamp = customEvent.detail.timestamp;
      }
    });
    
    // Subscribe to language changes from the localization service
    // This will trigger when language actually changes, not on init
    this.localizationService.language$.subscribe(language => {
      this.setLanguage(language);
    });

    // Load default translations from JSON files
    this.loadAllTranslations();
  }

  /**
   * Load translations only for the current language
   * Other languages will be loaded on-demand when user switches
   */
  private loadAllTranslations(): void {
    // Only load translations for the current language
    // This improves initial page load performance
    this.loadTranslationsFromFiles(this.currentLanguage);
  }

  /**
   * Sets the current language and updates translations
   */
  public setLanguage(language: string): void {
    if (this.currentLanguage !== language) {
      this.currentLanguage = language;
      
      // Load translations for the new language if not already loading/loaded
      if (!this.loadingLanguages.has(language) && !this.loadedLanguages.has(language)) {
        this.loadTranslationsFromFiles(language);
      } else if (this.loadedLanguages.has(language)) {
        // Language already loaded, just notify subscribers
        this.translationsChanged.next(this.getTranslationsForCurrentLanguage());
      }
      
      // Save preference to localStorage
      localStorage.setItem('language', language);
    }
  }

  /**
   * Gets the current language code
   */
  public getCurrentLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Translates a key into the current language
   */
  public translate(key: string): string {
    const translations = this.getTranslationsForCurrentLanguage();
    return translations[key] || key;
  }

  /**
   * Gets all translations for the current language
   */
  private getTranslationsForCurrentLanguage(): TranslationSet {
    // Use the current language, or fall back to en-US if not found
    return this.translations[this.currentLanguage] || this.translations['en-US'] || {};
  }

  /**
   * Adds translations for a specific language
   */
  public addTranslations(language: string, translations: TranslationSet): void {
    if (!this.translations[language]) {
      this.translations[language] = {};
    }
    
    this.translations[language] = {
      ...this.translations[language],
      ...translations
    };
    
    // If this is the current language, update the observable
    if (language === this.currentLanguage) {
      this.translationsChanged.next(this.getTranslationsForCurrentLanguage());
    }
  }

  /**
   * Adds a new translation entry directly to the translation dictionary
   * @param key The translation key to add
   * @param value The translation value
   * @param language Optional language code (defaults to current language)
   */
  addTranslationEntry(key: string, value: string, language?: string): void {
    const targetLanguage = language || this.currentLanguage;
    
    if (!this.translations) {
      this.translations = {};
    }
    
    // Ensure the language entry exists
    if (!this.translations[targetLanguage]) {
      this.translations[targetLanguage] = {};
    }
    
    // Add the translation directly to the language dictionary
    this.translations[targetLanguage][key] = value;
    
    // If this is the current language, notify subscribers about the change
    if (targetLanguage === this.currentLanguage) {
      this.translationsChanged.next(this.getTranslationsForCurrentLanguage());
    }
  }

  /**
   * Gets the translations observable for use with async pipe
   */
  public getTranslations(): Observable<TranslationSet> {
    return this.translationsChanged$;
  }

  /**
   * Gets datepicker translations for a specific language
   * @param lang Language code
   * @returns Object with weekdays, months and weekLabel for datepicker
   */
  public getDatepickerTranslations(lang: string): { weekdays: string[], months: string[], weekLabel: string } {
    const translations = this.translations[lang] || this.translations['en-US'];
    
    return {
      weekdays: translations['datepicker.weekdays']?.split(',') || ['Mo','Tu','We','Th','Fr','Sa','Su'],
      months: translations['datepicker.months']?.split(',') || 
              ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      weekLabel: translations['datepicker.weekLabel'] || 'Week'
    };
  }

  /**
   * Method to get cache-busting URL parameter
   * Only use cache-busting when language actually changed
   */
  public getCacheBustingParam(): string {
    // Only add cache-buster if this is a fresh language change
    // Otherwise let browser cache work
    const now = Date.now();
    const timeSinceChange = now - this.lastLanguageChangeTimestamp;
    
    // If language changed within last 5 seconds, use cache-buster
    // Otherwise rely on browser cache for better performance
    if (timeSinceChange < 5000) {
      return `_=${this.lastLanguageChangeTimestamp}`;
    }
    return '';
  }

  /**
   * Loads translations from JSON files for the given language
   * @param language Language code to load translations for
   */
  private loadTranslationsFromFiles(language: string): void {
    // Prevent duplicate loading
    if (this.loadingLanguages.has(language)) {
      console.log(`Already loading translations for ${language}, skipping duplicate request`);
      return;
    }
    
    this.loadingLanguages.add(language);
    
    // Construct the file path for the language
    const filePath = `assets/i18n/${language}.json`;
    const cacheBuster = this.getCacheBustingParam();
    const url = cacheBuster ? `${filePath}?${cacheBuster}` : filePath;
    
    console.log(`Attempting to load translations from: ${url}`);
    
    // Use cache-buster only when needed for better performance
    this.http.get<TranslationSet>(url).pipe(
      catchError((error) => {
        console.error(`Error loading translations for ${language} from ${filePath}:`, error);
        
        // If file not found, fall back to English
        if (language !== 'en-US') {
          console.warn(`Falling back to en-US translations`);
          const fallbackUrl = cacheBuster ? `assets/i18n/en-US.json?${cacheBuster}` : 'assets/i18n/en-US.json';
          return this.http.get<TranslationSet>(fallbackUrl).pipe(
            catchError(fallbackError => {
              console.error(`Error loading fallback translations from en-US:`, fallbackError);
              console.warn(`Using hardcoded translations as last resort`);
              return of(this.getHardcodedTranslations(language));
            })
          );
        }
        
        console.warn(`Using hardcoded translations for ${language}`);
        return of(this.getHardcodedTranslations(language));
      })
    ).subscribe(translations => {
      console.log(`Loaded translations for ${language}, entries: ${Object.keys(translations).length}`);
      
      // Mark as loaded and remove from loading set
      this.loadingLanguages.delete(language);
      this.loadedLanguages.add(language);
      
      // Initialize language if not exists
      if (!this.translations[language]) {
        this.translations[language] = {};
      }
      
      // Merge with existing translations or replace entirely
      this.translations[language] = {
        ...this.translations[language],
        ...this.flattenTranslations(translations)
      };
      
      // Update translations observable if this is the current language
      if (language === this.currentLanguage) {
        this.translationsChanged.next(this.getTranslationsForCurrentLanguage());
      }
    });
  }

  /**
   * Get hardcoded translations as a fallback if JSON loading fails
   */
  private getHardcodedTranslations(language: string): TranslationSet {
    // Return the hardcoded translation set for the specified language
    // Use this only as last resort when JSON files cannot be loaded
    if (language === 'en-US') {
      return {
        'nav.daily': 'Daily',
        'nav.weekly': 'Weekly',
        'nav.monthly': 'Monthly',
        'nav.yearly': 'Yearly',
        'nav.overall': 'Overall',
        'nav.xml': 'XML',
        'nav.team': 'Subteam',
        'nav.all': 'All',
        'common.loading': 'Loading...',
        'common.error': 'Error',
        'common.search': 'Search',
        'common.team': 'Team',
        'common.none': 'None'
        // Minimum required translations for basic UI functionality
      };
    }
    // Return empty set for other languages, will fall back to English keys
    return {};
  }

  /**
   * Flattens a nested translations object into a flat key-value structure
   * @param obj The nested translations object
   * @param prefix Optional prefix for keys in flattened result
   * @returns Flattened translations object
   */
  private flattenTranslations(obj: any, prefix: string = ''): TranslationSet {
    const result: TranslationSet = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Recursively flatten nested objects
          const flattenedChild = this.flattenTranslations(value, newKey);
          Object.assign(result, flattenedChild);
        } else {
          // Add leaf value to result
          result[newKey] = value;
        }
      }
    }
    
    return result;
  }
}
