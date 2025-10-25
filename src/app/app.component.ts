import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbDropdownModule, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { filter, map, mergeMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { ThemeService, ThemeMode } from './shared/services/theme.service';
import { HttpClient } from '@angular/common/http';
import { TeamService, Team } from './shared/services/team.service';
import { LocalizationService } from './shared/services/localization.service';
import { DebugService } from './shared/services/debug.service';
import { VersionService } from './shared/services/version.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';
import { TranslateService } from './shared/services/translate.service';
import { LocalStorageInfoComponent } from './shared/local-storage-info/local-storage-info.component';
import { PageTimingService } from './shared/services/page-timing.service';
import { SeoService } from './shared/services/seo.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet, 
    RouterLink,
    RouterLinkActive,
    CommonModule,
    FormsModule,
    NgbDropdownModule,
    NgbDatepickerModule,
    TranslatePipe, // Add TranslatePipe to imports
    LocalStorageInfoComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  public title = 'WPNEW2';
  option: string = 'daily'; // Default option
  filterText: string = '';
  teamname: string = '-';
  offset: string = '0';
  currentTheme: ThemeMode = 'light';
  
  teams: Team[] = [];
  isLoading = false;
  loadError = false;

  availableLanguages: { code: string, name: string, flag: string }[] = [];
  currentLanguage: string = 'en-US';

  navItems = [
    { value: 'nav.daily', label: 'Daily', link: ['/s/daily', this.offset, this.teamname] },
    { value: 'nav.weekly', label: 'Weekly', link: ['/s/weekly', this.offset, this.teamname] },
    { value: 'nav.monthly', label: 'Monthly', link: ['/s/monthly', this.offset, this.teamname] },
    { value: 'nav.yearly', label: 'Yearly', link: ['/s/yearly', this.offset, this.teamname] },
    { value: 'nav.overall', label: 'Overall', link: ['/o/overall', this.offset, this.teamname] },
    { value: 'nav.xml', label: 'Xml', link: ['/x/xml', this.offset, this.teamname] },
  ];

  isMetric: boolean = true;
  unitSystemLabel: string = 'Metric';
  appVersion: string = '';

  pageLoadTime: number = 0;
  fcpTime?: number;
  lcpTime?: number;
  totalBlockingTime?: number;
  cls?: number;
  showDetailedMetrics: boolean = false;
  
  constructor(
    public router: Router,
    private activatedRoute: ActivatedRoute,
    private themeService: ThemeService,
    private teamService: TeamService,
    private localizationService: LocalizationService,
    private versionService: VersionService,
    private translateService: TranslateService, // Add TranslateService
    private http: HttpClient, // Add HttpClient
    public debugService: DebugService,
    private pageTimingService: PageTimingService,
    private seoService: SeoService
  ) {}

  ngOnInit() {
    // Navigation timing is now handled by PageTimingService
    // Remove duplicate performance measurement code

    // Initialize SEO meta tags
    this.seoService.updateMetaTags();

    // Initialize debug state from localStorage first
    this.debugService.initDebugState();

    // ThemeService regelt nu de initialisatie, dus niet zelf forceren:
    // const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    // const defaultTheme = prefersDark ? 'dark' : 'light';
    // this.themeService.setTheme(defaultTheme, false);
    // document.documentElement.setAttribute('data-bs-theme', defaultTheme); // Apply the default theme

    // Listen for theme changes
    this.themeService.currentTheme$.subscribe(theme => {
      this.currentTheme = (theme === 'system' ? 'light' : theme);
      document.documentElement.setAttribute('data-bs-theme', this.currentTheme); // Dynamically update the theme
    });
    
    // Check for debug parameter in the URL - handle both 'true' and 'yes'
    this.activatedRoute.queryParams.subscribe(params => {
      if (params['debug'] === 'true' || params['debug'] === 'yes') {
        this.debugService.enableDebug();
        this.debugService.log('AppComponent', 'Debug mode enabled via URL parameter');
      } else if (params['debug'] === 'false' || params['debug'] === 'no') {
        this.debugService.disableDebug();
        this.debugService.log('AppComponent', 'Debug mode disabled via URL parameter');
        
        // Remove the debug parameter from URL when disabling
        const urlWithoutDebug = this.router.url.split('?')[0];
        this.router.navigateByUrl(urlWithoutDebug, { replaceUrl: true });
      }
    });

    // Debug app initialization
    this.debugService.log('AppComponent', 'Application initialized', {
      currentTheme: this.currentTheme,
      offset: this.offset,
      team: this.teamname
    });

    // Listen to route changes to preserve debug parameter if it's enabled
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      // Update SEO meta tags on route change
      const routePath = event.urlAfterRedirects || event.url;
      this.seoService.setRouteMetaTags(routePath);

      // Check if debug is enabled but not in URL
      const isDebugEnabled = this.debugService.isDebugEnabled();
      const currentUrl = event.url;
      
      if (isDebugEnabled && !currentUrl.includes('debug=')) {
        // Preserve debug parameter when navigating to new URLs
        const separator = currentUrl.includes('?') ? '&' : '?';
        const debugParam = localStorage.getItem('preferredDebugParam') || 'true';
        const newUrl = `${currentUrl}${separator}debug=${debugParam}`;
        
        // Navigate to the same route but with debug parameter
        this.router.navigateByUrl(newUrl, { replaceUrl: true, skipLocationChange: false });
      }
      
      // Update page title with version when route changes
      this.updatePageTitle();
    });

    // Get app version and update page title on init
    this.appVersion = this.versionService.getVersionText();
    this.updatePageTitle();

    // Helper function to update from route params
    const updateFromRouteParams = (params: any) => {
      const offset = params.get('offset') || '0';
      const team = params.get('team') || '-';
      const search = params.get('search') || '';
      
      this.debugService.log('AppComponent', `Processing route params - offset: "${offset}", team: "${team}", search: "${search}"`);
      
      // Only update if values changed
      if (offset !== this.offset || team !== this.teamname || 
          (search && this.filterText !== search)) {
        // Update component properties
        this.offset = offset;
        this.teamname = team;
        
        // Update filter text if it came from the route
        if (search && this.filterText !== search) {
          this.filterText = search;
        }
        
        // Update navigation links and reload teams
        this.updateNavigationLinksOnly(offset, team);
        this.loadTeams();
      }
    };

    // Listen to route changes to update navigation links
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) route = route.firstChild;
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      mergeMap(route => route.paramMap)
    ).subscribe(params => {
      updateFromRouteParams(params);
    });

    // Process initial route params
    let initialRoute = this.activatedRoute;
    while (initialRoute.firstChild) initialRoute = initialRoute.firstChild;
    this.debugService.log('AppComponent', `[INIT] Reading params from initial route, URL: ${this.router.url}`);
    updateFromRouteParams(initialRoute.snapshot.paramMap);

    // Get available languages
    this.availableLanguages = this.localizationService.availableLanguages;
    
    // Subscribe to language changes
    this.localizationService.language$.subscribe(lang => {
      this.currentLanguage = lang;
    });

    // Subscribe to unit system changes
    this.localizationService.unitSystem$.subscribe(system => {
      this.isMetric = system === 'metric';
      this.unitSystemLabel = this.localizationService.getUnitSystemLabel();
    });

    // Get app version
    this.appVersion = this.versionService.getVersionText();

    // Add error tracking diagnostics
    if (this.debugService.isDebugEnabled() && (window as any).errorTracker) {
      setInterval(() => {
        const errorSources = (window as any).errorTracker.sources;
        if (Object.keys(errorSources).length > 0) {
          this.debugService.log('AppComponent', 'Error sources detected:', errorSources);
        }
      }, 10000); // Check every 10 seconds
    }

    // Add page transition event handler - improved version
    window.addEventListener('pageshow', this.handlePageShow.bind(this));
    
    // Override default console.warn to suppress PageTransitionEvent logs
    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
      // More thorough filtering for PageTransitionEvent warnings
      if (this.shouldFilterWarning(args)) {
        return; // Don't output anything for these events
      }
      
      // Pass other warnings through to the original console.warn
      originalConsoleWarn.apply(console, args);
    };

    // Also override console.log to catch PageTransitionEvent logs there
    const originalConsoleLog = console.log;
    console.log = (...args) => {
      // Filter PageTransitionEvent logs
      if (this.shouldFilterWarning(args)) {
        return; // Don't output anything for these events
      }
      
      // Pass other logs through
      originalConsoleLog.apply(console, args);
    };

    // Subscribe to page timing updates with enhanced metrics
    this.pageTimingService.timing$.subscribe(metrics => {
      // Use the metrics directly from the timing service
      // The service now handles the logic for realistic timing
      this.pageLoadTime = metrics.navigationTime;
      this.fcpTime = metrics.fcpTime;
      this.lcpTime = metrics.lcpTime;
      this.totalBlockingTime = metrics.totalBlockingTime;
      this.cls = metrics.cls;
      
      // Show detailed metrics in debug mode
      this.showDetailedMetrics = this.debugService.isDebugEnabled();
      
      const loadType = metrics.isInitialLoad ? 'Initial page load' : 'SPA navigation';
      this.debugService.log('AppComponent', `${loadType} metrics updated: ${JSON.stringify(metrics)}`);
    });
    
    // Show detailed metrics when in debug mode - update with proper typing
    this.debugService.debug$.subscribe((isDebug: boolean) => {
      this.showDetailedMetrics = isDebug;
    });
    
    // Find the router.events subscription and modify the debug logging
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      // Capture current URL and see if it has search parameters
      const url = event.urlAfterRedirects;
      const hasSearchParam = url.split('/').length > 4;
      
      // Only log search parameters for debugging if explicitly enabled
      if (hasSearchParam && this.debugService.isVerboseLoggingEnabled()) {
        const searchParam = url.split('/')[4] || '';
        this.debugService.log('AppComponent', `Added search param to route: ${url}`);
      }
      
      // Always update the title (keep this functionality)
      this.updateTitle(url);
    });

    // Listen for realistic page load event from main content
    window.addEventListener('realistic-page-load', (event: any) => {
      if (event && event.detail && typeof event.detail.duration === 'number') {
        this.pageLoadTime = event.detail.duration;
        this.debugService.log('AppComponent', `Realistic page load event received: ${event.detail.duration}ms`);
      }
    });
    
    // Listen for content loaded events to get more accurate timing for SPA navigations
    window.addEventListener('route-content-loaded', (event: any) => {
      if (event && event.detail && typeof event.detail.duration === 'number') {
        // Only update if this is a SPA navigation (not initial load)
        if (!event.detail.isInitialLoad) {
          this.pageLoadTime = event.detail.duration;
          this.debugService.log('AppComponent', `Route content loaded: ${event.detail.duration}ms`);
        }
      }
    });
  }

  /**
   * Updates the document title to include version number
   */
  private updatePageTitle(): void {
    // Get the current route path
    const path = this.router.url.split('/')[2] || 'daily'; // Default to daily if path not found
    
    // Capitalize the first letter of the path
    const pageName = path.charAt(0).toUpperCase() + path.slice(1);
    
    // Get the version without the 'v' prefix
    const versionText = this.appVersion.replace(/^v/, '');
    
    // Set the document title with the page name and version
    document.title = `${pageName} Stats - Grandmasg v${versionText}`;
  }

  /**
   * Updates the page title based on the URL
   * @param url The current URL
   */
  private updateTitle(url: string): void {
    // Extract the route path from URL
    const segments = url.split('/').filter(Boolean);
    if (segments.length < 2) return;
    
    // Get the view type (daily, weekly, etc.)
    const viewType = segments[1];
    
    // Capitalize the first letter
    const pageName = viewType.charAt(0).toUpperCase() + viewType.slice(1);
    
    // Get version without 'v' prefix
    const versionText = this.appVersion.replace(/^v/, '');
    
    // Set document title
    document.title = `${pageName} Stats - Grandmasg v${versionText}`;
  }

  /**
   * Handle pageshow events cleanly
   */
  private handlePageShow(event: PageTransitionEvent): void {
    // Prevent this event from being logged in the console
    event.stopPropagation();
    
    // Only act when the page is being restored from cache (not on first load)
    if (event.persisted) {
      this.debugService.log('AppComponent', 'Page restored from back/forward cache');
      // Refresh current state if needed
      this.loadTeams();
    }
  }

  /**
   * Helper method to determine if a console warning/log should be filtered
   */
  private shouldFilterWarning(args: any[]): boolean {
    // Check if this is a PageTransitionEvent
    if (args.length > 0) {
      const firstArg = args[0];
      
      // Check for PageTransitionEvent object
      if (typeof firstArg === 'object' && firstArg instanceof Event && firstArg.type === 'pageshow') {
        return true;
      }
      
      // Check for string containing 'pageshow' which might be from inject.js
      if (typeof firstArg === 'string' && 
          (firstArg.includes('PageTransitionEvent') || 
           firstArg.includes('pageshow'))) {
        return true;
      }
      
      // Check for pageshow dump that includes isTrusted
      if (typeof firstArg === 'string' && 
          args.some(arg => typeof arg === 'object' && arg && 'isTrusted' in arg && 'type' in arg && arg.type === 'pageshow')) {
        return true;
      }
    }
    
    return false;
  }

  loadTeams() {
    // Avoid duplicate requests
    if (this.isLoading) {
      this.debugService.log('AppComponent', 'Skipping team load as another request is in progress');
      return;
    }
    
    this.isLoading = true;
    this.loadError = false;
    
    // Use this.offset directly - it's already synchronized with the route
    this.debugService.log('AppComponent', `Loading teams with offset: "${this.offset}", team: "${this.teamname}"`);
    this.debugService.log('AppComponent', `Current route URL: ${this.router.url}`);
    
    // Use this.offset which is already set from route params
    this.teamService.getTeams(this.offset, this.teamname)
      .subscribe({
        next: (data) => {
          this.teams = data;
          this.debugService.log('AppComponent', `Teams loaded successfully, count: ${this.teams.length}`);
          this.debugService.log('AppComponent', 'First few teams:', this.teams.slice(0, 3));
          this.isLoading = false;
        },
        error: (error) => {
          this.debugService.error('AppComponent', 'Error loading teams:', error);
          this.loadError = true;
          this.isLoading = false;
          this.teams = [
            // Fallback team data
            { teamname: 'Team A', team: 'Team A', aantal: 5 },
            { teamname: 'Team B', team: 'Team B', aantal: 3 },
          ];
        }
      });
  }

  /**
   * Get the current offset from the route parameters
   * Handle cases where route parameters are not available
   */
  getCurrentRouteOffset(): string {
    try {
      if (!this.activatedRoute || !this.activatedRoute.firstChild) {
        return '0'; // Default offset when route structure is not as expected
      }
      
      // Get the paramMap from the first child route
      const params = this.activatedRoute.firstChild.snapshot.paramMap;
      
      // Check if params exists before trying to access the offset
      if (!params) {
        return '0';
      }
      
      // Return the offset parameter or default to '0' if not found
      return params.get('offset') || '0';
    } catch (error) {
      console.error('Error getting route offset:', error);
      return '0'; // Return default if any error occurs
    }
  }

  // Create a separate method to update navigation links and set nav start time
  updateNavigationLinksOnly(offset: string, teamname: string): void {
    // Remove localStorage set here (now handled globally on route change)
    this.offset = offset;
    this.teamname = teamname;
    // Update navigation items with new offset and team but keep translation keys
    this.navItems = [
      { value: 'nav.daily', label: 'Daily', link: ['/s/daily', offset, teamname] },
      { value: 'nav.weekly', label: 'Weekly', link: ['/s/weekly', offset, teamname] },
      { value: 'nav.monthly', label: 'Monthly', link: ['/s/monthly', offset, teamname] },
      { value: 'nav.yearly', label: 'Yearly', link: ['/s/yearly', offset, teamname] },
      { value: 'nav.overall', label: 'Overall', link: ['/o/overall', offset, teamname] },
      { value: 'nav.xml', label: 'Xml', link: ['/x/xml', offset, teamname] },
    ];
  }

  // Modify the existing updateNavigationLinks to use the new method
  updateNavigationLinks(offset: string, teamname: string): void {
    // Remove localStorage set here (now handled globally on route change)
    this.updateNavigationLinksOnly(offset, teamname);
    
    // Refresh teams when the team is explicitly changed by the user
    this.loadTeams();
  }

  onSelectTeam(teamname: string): void {
    if (this.teamname === teamname) return; // Avoid unnecessary updates
    
    // Get the current offset from the route
    const currentOffset = this.getCurrentRouteOffset();
    
    this.debugService.log('AppComponent', `Team selected: ${teamname}, current offset from route: ${currentOffset}`);
    this.teamname = teamname;
    
    // Update navigation links with new team and the current offset from route
    this.updateNavigationLinks(currentOffset, teamname);
    
    // Dispatch an event so charts know to update when team changes
    document.dispatchEvent(new CustomEvent('team-selection-changed', {
      detail: { team: teamname },
      bubbles: true
    }));
    
    // Navigate to the current route but with the new team
    const currentUrl = this.router.url;
    const segments = currentUrl.split('/');
    
    if (segments.length >= 4) {
      // Get the current route type (s, o, x) and view (daily, weekly, etc.)
      const routeType = segments[1]; // s, o, or x
      const viewType = segments[2]; // daily, weekly, etc.
      
      // Navigate with or without search parameter
      const routeParams = [
        `/${routeType}/${viewType}`, 
        currentOffset, // Ensure currentOffset has the correct value
        teamname
      ];
      
      this.debugService.log('AppComponent', `Navigating with params: ${JSON.stringify(routeParams)}`);
      
      if (this.filterText && this.filterText.trim() !== '') {
        routeParams.push(this.filterText);
      }
      
      this.router.navigate(routeParams);
    }
  }

  /**
   * Apply a filter term to the current route
   * Handle the case where route information isn't fully available
   */
  applyFilter(term: string): void {
    try {
      // Always update the local filterText state
      this.filterText = term;
      
      // If no current route is available, use a default route
      if (!this.router.url || !this.activatedRoute || !this.activatedRoute.firstChild) {
        if (term) {
          this.router.navigate(['/s/daily', '0', '-', term]);
        } else {
          this.router.navigate(['/s/daily', '0', '-']);
        }
        return;
      }
      
      // Try to get current route parameters safely
      const offset = this.getCurrentRouteOffset();
      const team = this.teamname || '-';
      
      // Navigate to the same route type with search parameter if provided
      const routeSegments = this.router.url.split('/').filter(Boolean);
      const routeType = routeSegments.length > 0 ? routeSegments[0] : 's';
      const routePath = routeSegments.length > 1 ? routeSegments[1] : 'daily';
      
      // Always navigate, even when term is empty
      // This ensures the URL is updated when clearing the search
      if (term && term.trim() !== '') {
        this.router.navigate([`/${routeType}/${routePath}`, offset, team, term]);
      } else {
        this.router.navigate([`/${routeType}/${routePath}`, offset, team]);
      }
      
      // Dispatch a custom event to notify other components of the filter change
      document.dispatchEvent(new CustomEvent('filter-text-changed', {
        detail: { searchTerm: term },
        bubbles: true
      }));
    } catch (error) {
      console.error('Error applying filter:', error);
      // Fallback to a safe default route
      if (term) {
        this.router.navigate(['/s/daily', '0', '-', term]);
      } else {
        this.router.navigate(['/s/daily', '0', '-']);
      }
    }
  }

  // Update the method to correctly construct router links with search parameters
  getRouteWithSearch(baseRoute: string[]): string[] {
    try {
      // Make a copy to avoid modifying the original array
      const routeWithParams = [...baseRoute];
      
      // Only add search parameter if it actually exists
      if (this.filterText && this.filterText.trim() !== '') {
        // Only add search if it hasn't been already added
        if (routeWithParams.length === 3) {
          routeWithParams.push(this.filterText);
        } else if (routeWithParams.length > 3) {
          // Replace the last parameter with the current search text
          routeWithParams[3] = this.filterText;
        }
        
        // Only log this in verbose debug mode to prevent spam
        if (this.debugService.isVerboseLoggingEnabled()) {
          this.debugService.log('AppComponent', `Added search param to route: ${routeWithParams.join('/')}`);
        }
      }
      
      return routeWithParams;
    } catch (error) {
      this.debugService.error('AppComponent', 'Error creating route with search:', error);
      return baseRoute;
    }
  }

  // Add this method to handle keyup events in the search field
  handleSearchKeyUp(event: KeyboardEvent): void {
    // Handle Escape key to clear search
    if (event.key === 'Escape') {
      this.clearSearch();
    }
  }

  // Create a dedicated method to clear search
  clearSearch(): void {
    if (!this.filterText) return; // Don't process if already empty
    
    this.filterText = '';
    this.debugService.log('AppComponent', 'Search cleared');
    
    // Get current route parts
    const routeSegments = this.router.url.split('/').filter(Boolean);
    if (routeSegments.length < 2) return;
    
    const routeType = routeSegments[0]; // 's', 'o', or 'x'
    const viewType = routeSegments[1]; // 'daily', 'weekly', etc.
    const offset = this.getCurrentRouteOffset();
    const team = this.teamname || '-';
    
    // Navigate without the search parameter
    this.router.navigate([`/${routeType}/${viewType}`, offset, team]);
    
    // Dispatch event for other components
    document.dispatchEvent(new CustomEvent('filter-text-changed', {
      detail: { searchTerm: '' },
      bubbles: true
    }));
  }

  toggleTheme(): void {
    if (this.currentTheme === 'light') {
      this.themeService.setThemeAndReload('dark');
    } else {
      this.themeService.setThemeAndReload('light');
    }
  }
  
  useSystemTheme(): void {
    this.themeService.useSystemPreference();
  }

  // Helper method to check if a route is active
  isRouteActive(path: string[]): boolean {
    const fullPath = path.join('/');
    return this.router.isActive(fullPath, {
      paths: 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    });
  }

  // Add language change method that uses both services
  changeLanguage(languageCode: string): void {
    this.translateService.setLanguage(languageCode);
    this.localizationService.setLanguage(languageCode);
    this.currentLanguage = languageCode;
    
    this.debugService.log('AppComponent', `Language changed to: ${languageCode}`);
  }
  
  // Get current language flag
  getCurrentLanguageFlag(): string {
    return this.localizationService.getCurrentLanguageFlag();
  }

  // Add method to toggle unit system
  toggleUnitSystem(): void {
    this.localizationService.toggleUnitSystem();
  }

  // Update toggleDebugMode to ensure URL is properly updated when disabling
  toggleDebugMode(): void {
    if (this.debugService.isDebugEnabled()) {
      this.debugService.log('AppComponent', 'Disabling debug mode via button click');
      this.debugService.disableDebug();
      
      // Clean up the URL by removing debug parameter
      const urlParts = this.router.url.split('?');
      if (urlParts.length > 1) {
        const baseUrl = urlParts[0];
        const params = new URLSearchParams(urlParts[1]);
        params.delete('debug');
        
        const newUrl = params.toString() ? `${baseUrl}?${params}` : baseUrl;
        this.router.navigateByUrl(newUrl, { replaceUrl: true });
      }
    } else {
      this.debugService.enableDebug();
      this.debugService.log('AppComponent', 'Enabling debug mode via button click');
      
      // Add debug parameter to URL
      const currentUrl = this.router.url;
      const separator = currentUrl.includes('?') ? '&' : '?';
      const newUrl = `${currentUrl}${separator}debug=true`;
      this.router.navigateByUrl(newUrl, { replaceUrl: true });
    }
  }

  // Add a debug method to show error sources in the console
  showErrorSources(): void {
    if ((window as any).logErrorSources) {
      this.debugService.log('AppComponent', 'Error sources:', (window as any).logErrorSources());
    } else {
      this.debugService.warn('AppComponent', 'Error tracking not available');
    }
  }

  // Add method to check if debug mode is active
  isDebugActive(): boolean {
    return this.debugService.isDebugEnabled();
  }
}
