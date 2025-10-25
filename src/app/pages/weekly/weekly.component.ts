import { Component, OnInit, ViewChild, AfterViewInit, ElementRef, OnDestroy, ChangeDetectorRef, Input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DateInputGroupComponent } from '../../shared/date-input-group/date-input-group.component';
import { StatsTableComponent } from '../../shared/stats-table/stats-table.component';
import { StatsService, StatRecord } from '../../shared/services/stats.service';
import { XmlChangesComponent } from '../../shared/xml-changes/xml-changes.component';
import { HighchartsGraphComponent } from '../../shared/highcharts-graph/highcharts-graph.component';
import { DebugService } from '../../shared/services/debug.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { TranslateService } from '../../shared/services/translate.service';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-weekly',
  standalone: true,
  imports: [
    CommonModule, 
    DateInputGroupComponent, 
    StatsTableComponent,
    XmlChangesComponent,
    HighchartsGraphComponent,
    TranslatePipe
  ],
  templateUrl: './weekly.component.html',
  styleUrls: ['./weekly.component.scss']
})
export class WeeklyComponent implements OnInit, AfterViewInit, OnDestroy {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date();
  routeLabel: string = 'Weekly'; // Corrected from 'Daily'
  
  stats: StatRecord[] = [];
  isLoading = false;
  hasError = false;
  xmlChanges: any[] = [];
  start: string | null = null; // Renamed from startDate for weekly context
  end: string | null = null;   // Renamed from endDate for weekly context

  // Update pagination property to match the default in stats-table (25)
  currentPageIndex: number = 0;
  currentPageSize: number = 25;
  
  // Use a component property instead of a local variable to track XML loading state
  xmlLoading = false;

  // Add properties for sort state
  currentSortColumn: string = 'keys';
  currentSortDirection: 'asc' | 'desc' = 'desc';

  // Add reference to the chart component
  @ViewChild('chart') chartComponent?: HighchartsGraphComponent;

  // Add reference to the native element - changed from dailyContainer to weeklyContainer
  @ViewChild('weeklyContainer') weeklyContainer?: ElementRef;

  // Add subscription property to manage subscriptions
  private subscriptions: Subscription[] = [];

  // Add these properties as class members
  private handleExplicitSort: (e: Event) => void;
  private handleAngularSort: (e: Event) => void;
  private handleWindowSort: (e: Event) => void;
  private buttonUpdateTimer: any;

  // Add property to track in-flight route changes
  private pendingRouteChange = false;
  
  // Add properties to store XML date range
  xmlDateRange: { current: string, previous: string } | null = null;

  // Add property for currentTheme
  currentTheme: 'dark' | 'light' = 'light';

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    private translateService: TranslateService,
    public debugService: DebugService, // Made public to be accessible in template if needed, like daily
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService
  ) {
    // Initialize the event handler properties in the constructor
    this.handleExplicitSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Weekly', 'Caught explicit sort DOM event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleAngularSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Weekly', 'Caught Angular custom event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleWindowSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Weekly', 'Caught window event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
  }
  
  ngOnInit(): void {
    this.debugService.log('WeeklyComponent', 'Initializing component');

    // Set default sort values
    this.currentSortColumn = 'keys';
    this.currentSortDirection = 'desc';

    // Subscribe to route parameter changes
    this.route.params.subscribe(params => {
      const newOffset = params['offset'] || '0';
      const newTeamname = params['team'] || '-';
      const newSearchText = params['search'] || '';

      this.offset = newOffset;
      this.teamname = newTeamname;
      this.searchText = newSearchText;
      this.debugService.log('WeeklyComponent', `ngOnInit - searchText updated from route to: "${this.searchText}"`);

      this.updateSelectedDate();

      // Direct data load, no setTimeouts
      this.loadData();
      this.loadXmlChanges();
    });

    // Subscribe to language changes to update date formats
    const langSubscription = this.translateService.translationsChanged$.subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.push(langSubscription);

    // Subscribe to theme changes
    this.subscriptions.push(
      this.themeService.currentTheme$.subscribe((theme: ThemeMode) => {
        this.currentTheme = theme === 'dark' ? 'dark' : 'light';
      })
    );
  }
  
  ngAfterViewInit() {
    this.debugService.log('Weekly', 'Setting up event listeners');
    
    // Clean up any existing event listeners first to prevent duplicates
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Add the event listeners with correct typing
    document.addEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.addEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.addEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Make sure search term is synced at initialization and after view init
    // Add a longer delay to ensure all components are properly initialized
    setTimeout(() => {
      if (this.chartComponent) {
        this.debugService.log('Weekly', `Initializing chart with search term: "${this.searchText}"`);
        this.ensureChartSearchTermSync();
      } else {
        this.debugService.warn('Weekly', 'Chart component reference not available - will retry');
        // Try again with a longer delay if chart component isn't available yet
        setTimeout(() => {
          if (this.chartComponent) {
            this.debugService.log('Weekly', `Retry: Initializing chart with search term: "${this.searchText}"`);
            this.ensureChartSearchTermSync();
          } else {
            this.debugService.error('Weekly', 'Chart component reference still not available after retry');
          }
        }, 1000);
      }
    }, 500); // Increased from 200 to 500ms
    
    // Check sessionStorage for stored sort events
    try {
      const storedEvent = sessionStorage.getItem('lastSortEvent');
      if (storedEvent) {
        const event = JSON.parse(storedEvent);
        this.debugService.log('Weekly', 'Found sort event in sessionStorage:', event);
        
        // Only process if it's recent (within the last 10 seconds)
        if (Date.now() - event.timestamp < 10000) {
          this.handleSortEvent({
            active: event.column,
            direction: event.direction
          });
          
          // Clear the event so we don't process it again
          sessionStorage.removeItem('lastSortEvent');
        }
      }
    } catch (e) {
      this.debugService.error('Weekly', 'Error checking sessionStorage:', e);
    }
  }

  ngOnDestroy() {
    // Clean up existing event listeners
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Clean up timer
    if (this.buttonUpdateTimer) {
      clearTimeout(this.buttonUpdateTimer);
    }
    
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  updateSelectedDate(): void {
    const offsetValue = parseInt(this.offset, 10) || 0;
    const date = new Date();
    date.setDate(date.getDate() + offsetValue); // Remove the multiplication by 7
    this.selectedDate = date;
  }
  
  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('Weekly', `Offset changed to: ${offset}`);
    
    if (offset !== this.offset) {
      // Navigate with updated offset, preserving team and search
      if (this.searchText) {
        this.router.navigate(['/s/weekly', offset, this.teamname, this.searchText]);
      } else {
        this.router.navigate(['/s/weekly', offset, this.teamname]);
      }
    }
  }
  
  // Method to handle team changes (can be called from parent)
  onTeamChange(team: string): void {
    this.debugService.log('Weekly', `Team changed to: ${team}`);
    
    if (team !== this.teamname) {
      // Navigate with new team, preserving offset and search
      if (this.searchText) {
        this.router.navigate(['/s/weekly', this.offset, team, this.searchText]);
      } else {
        this.router.navigate(['/s/weekly', this.offset, team]);
      }
    }
  }
  
  // Update method to handle search changes - navigate first
  onSearchChange(searchText: any): void {
    // Handle both string and event object with searchTerm property
    const searchValue = typeof searchText === 'string' ? searchText : 
                    (searchText && searchText.searchTerm ? searchText.searchTerm : '');

    this.debugService.log('Weekly', `Search changed to: "${searchValue}"`);
    
    if (searchValue !== this.searchText) {
      // Update searchText immediately for consistency, navigation will trigger reload
      this.searchText = searchValue; 
      
      // Navigate with the updated search parameter, letting ngOnInit's subscription handle data reload
      this.router.navigate(['/s/weekly', this.offset, this.teamname, searchValue]);
    }
  }

  /**
   * Check if the current offset corresponds to a Sunday
   * @returns true if the current offset day is Sunday
   */
  isSundayOffset(): boolean {
    const offsetDate = this.getOffsetDate();
    
    // Sunday is 0 in JavaScript's getDay()
    return offsetDate.getDay() === 0;
  }

  /**
   * Calculate the week number of the current offset date
   * @returns The ISO week number
   */
  getWeekNumber(): number {
    const offsetDate = this.getOffsetDate();
    
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    const targetDate = new Date(offsetDate);
    const dayNum = offsetDate.getDay() || 7;
    targetDate.setDate(offsetDate.getDate() + 4 - dayNum);
    
    // Get first day of the year
    const firstDayOfYear = new Date(targetDate.getFullYear(), 0, 1);
    
    // Return week number
    return Math.ceil((((targetDate.getTime() - firstDayOfYear.getTime()) / 86400000) + 1) / 7);
  }

  /**
   * Format a date range in a localized format - prioritize XML dates over calculated dates
   */
  getFormattedDateRange(): string {
    // PRIORITY 1: Use XML date range if available
    if (this.xmlDateRange && this.xmlDateRange.previous && this.xmlDateRange.current) {
      try {
        const startStr = this.formatDateString(this.xmlDateRange.previous);
        const endStr = this.formatDateString(this.xmlDateRange.current);
        this.debugService.log('Weekly', `Using XML date range for display: ${startStr} - ${endStr}`);
        return `${startStr} - ${endStr}`;
      } catch (error) {
        this.debugService.error('Weekly', 'Error formatting XML date range:', error);
        // Fall through to calculated dates
      }
    }
    
    // PRIORITY 2: Use API week dates if available
    if (this.start && this.end) {
      try {
        const startStr = this.formatDateString(this.start);
        const endStr = this.formatDateString(this.end);
        this.debugService.log('Weekly', `Using API week dates for display: ${startStr} - ${endStr}`);
        return `${startStr} - ${endStr}`;
      } catch (error) {
        this.debugService.error('Weekly', 'Error formatting API week dates:', error);
        // Fall through to calculated dates
      }
    }
    
    // PRIORITY 3: Calculate week range from selected date (fallback)
    if (!this.selectedDate) return '';
    
    try {
      // Calculate start and end of week based on selected date
      const weekStart = new Date(this.selectedDate);
      const day = weekStart.getDay();
      const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      weekStart.setDate(diff); // Start of week (Monday)
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6); // End of week (Sunday)
      
      // Get current language from translate service
      const currentLang = this.translateService.getCurrentLanguage();
      
      // Create options for date formatting
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };
      
      // Format start and end dates
      const startStr = weekStart.toLocaleDateString(currentLang, options);
      const endStr = weekEnd.toLocaleDateString(currentLang, options);
      
      this.debugService.log('Weekly', `Using calculated week dates for display: ${startStr} - ${endStr}`);
      return `${startStr} - ${endStr}`;
    } catch (error) {
      this.debugService.error('Weekly', 'Error formatting calculated date range:', error);
      return this.selectedDate.toDateString(); // Fallback
    }
  }

  /**
   * Get a message indicating which specific day within the week is being shown
   * @returns A string indicating the specific day of the week
   */
  getSpecificDayMessage(): string {
    const offsetDate = this.getOffsetDate();
    
    // Format date to show only the day name and date
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long', 
      day: 'numeric'
    };
    
    // Get current language from translate service
    const currentLang = this.translateService.getCurrentLanguage();
    const dayString = offsetDate.toLocaleDateString(currentLang, options);
    
    return dayString;
  }

  /**
   * Get the current date with offset applied
   * @returns Date object with the offset applied
   */
  private getOffsetDate(): Date {
    const offsetValue = parseInt(this.offset, 10) || 0;
    const today = new Date();
    const offsetDate = new Date(today);
    offsetDate.setDate(today.getDate() + offsetValue);
    
    return offsetDate;
  }

  /**
   * Get the formatted date for the current day (with offset applied)
   */
  getCurrentDayDate(): string {
    const currentDate = this.getOffsetDate();
    const currentLang = this.translateService.getCurrentLanguage();
    
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      weekday: 'long'
    };
    
    return currentDate.toLocaleDateString(currentLang, options);
  }

  /**
   * Format a date string from API format (DD-MM-YYYY) to localized format
   */
  formatDateString(dateString: string | null): string {
    if (!dateString) return '';
    
    try {
      // Parse the date assuming DD-MM-YYYY format
      const parts = dateString.split('-');
      if (parts.length !== 3) {
        return dateString; // Return original if parsing fails
      }
      
      // Create a date object with parts in the correct order
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed in JavaScript
      const year = parseInt(parts[2], 10);
      
      const date = new Date(year, month, day);
      
      // Format the date according to the current locale
      const currentLang = this.translateService.getCurrentLanguage();
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      };
      
      return date.toLocaleDateString(currentLang, options);
    } catch (error) {
      this.debugService.error('Weekly', 'Error parsing date string:', error);
      return dateString; // Return original if any error occurs
    }
  }

  // Method to load data based on current parameters
  loadData(): void {
    if (this.isLoading) {
      this.debugService.log('WeeklyComponent', 'Skipping data load, already in progress');
      return;
    }
    this.isLoading = true;
    this.hasError = false;
    this.debugService.log('WeeklyComponent', `Loading stats with offset: ${this.offset}, team: ${this.teamname}`);
    this.statsService.getWeeklyStats(this.offset, this.teamname)
      .subscribe({
        next: (data) => {
          this.stats = data;
          
          // MAIN PRIORITY: Check if the weekly stats response includes XML date range (current/previous)
          if (data && (data as any).current && (data as any).previous) {
            this.xmlDateRange = {
              current: (data as any).current,
              previous: (data as any).previous
            };
            this.debugService.log('Weekly', `Found XML date range in main weekly stats response: ${this.xmlDateRange.previous} to ${this.xmlDateRange.current}`);
          }
          
          // FALLBACK: Only extract week dates if NO XML date range exists at all
          if (!this.xmlDateRange) {
            if (Object.getOwnPropertyDescriptor(data, 'week')) {
              const week = (data as any).week;
              this.start = week.start;
              this.end = week.end;
              this.debugService.log('Weekly', `No XML dates - using week object directly on response: ${this.start} - ${this.end}`);
            } 
            // Check for direct week object in response (for API responses with {week: {...}, data: [...]})
            else if ((data as any).week) {
              this.start = (data as any).week.start;
              this.end = (data as any).week.end;
              this.debugService.log('Weekly', `No XML dates - using week object in API response: ${this.start} - ${this.end}`);
            } 
            // Check for __dateRange property added by processStatsResponse (consistent with daily)
            else if ((data as any).__dateRange) {
              this.start = (data as any).__dateRange.start;
              this.end = (data as any).__dateRange.end;
              this.debugService.log('Weekly', `No XML dates - using __dateRange property: ${this.start} - ${this.end}`);
            }
          } else {
            this.debugService.log('Weekly', `Skipping fallback week dates because XML date range already exists: ${this.xmlDateRange.previous} to ${this.xmlDateRange.current}`);
            // Clear any previously set fallback dates since we have XML dates
            this.start = null;
            this.end = null;
          }
          
          // Chart component will load its own data via graph API
          this.debugService.log('Weekly', `Stats loaded, chart will use its own graph API for visualization`);
          
          this.isLoading = false;
          this.checkAndMarkContentLoaded();
          this.debugService.log('Weekly', `loadData - Main stats loaded. Chart should update via @Input binding for searchTerm: "${this.searchText}"`);

        },
        error: (error) => {
          this.debugService.error('Weekly', 'Error loading weekly stats:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
  }

  loadXmlChanges(): void {
    if (this.xmlLoading) {
      this.debugService.log('Weekly', 'Skipping XML load - already in progress');
      return;
    }
    this.debugService.log('Weekly', `Loading XML changes - offset: ${this.offset}, team: ${this.teamname}`);
    this.xmlLoading = true;
    this.statsService.getChanges(this.offset, this.teamname, 'weekly')
      .subscribe({
        next: (data) => {
          this.debugService.log('Weekly', 'XML changes received from API:', data);
          
          // DO NOT try to extract date range from changes API - it doesn't have current/previous
          // The main stats API (loadData) is responsible for the date range
          
          if (data && data.changes) {
            // Process all three categories of users: added, changed, and left
            const addedUsers = Array.isArray(data.changes.added) 
              ? data.changes.added.map((u: any) => ({
                  ...u, 
                  category: 'added', 
                  isNew: true,
                  username: u.Username || u.UsernameFull,
                  StatsKeys: u.Keys1,
                  StatsClicks: u.Clicks,
                  StatsDownloadMB: u.Download,
                  StatsUploadMB: u.Upload
                })) 
              : [];
            const changedUsers = Array.isArray(data.changes.changed) 
              ? data.changes.changed.map((u: any) => ({
                  ...u, 
                  category: 'changed', 
                  wasChanged: true,
                  username: u.NewUsername || u.OldUsername
                })) 
              : [];
            const leftUsers = Array.isArray(data.changes.left) 
              ? data.changes.left.map((u: any) => ({
                  ...u, 
                  category: 'left', 
                  wasInYesterday: true,
                  username: u.Username || u.UsernameFull,
                  StatsKeys: u.Keys1,
                  StatsClicks: u.Clicks,
                  StatsDownloadMB: u.Download,
                  StatsUploadMB: u.Upload
                })) 
              : [];
            
            // Combine ALL user categories into the xmlChanges array
            this.xmlChanges = [...addedUsers, ...changedUsers, ...leftUsers];
            
            this.debugService.log('Weekly', `Processed ${this.xmlChanges.length} XML changes (${addedUsers.length} added, ${changedUsers.length} changed, ${leftUsers.length} left)`);
          } else {
            this.debugService.warn('Weekly', 'API response missing changes structure or no changes:', data);
            this.xmlChanges = [];
          }
          
          this.xmlLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Weekly', 'Error loading XML changes:', error);
          this.xmlChanges = [];
          this.xmlLoading = false;
        }
      });
  }

  /**
   * Returns a formatted changes object for the XML changes component
   * to avoid complex binding expressions in the template - add this function to match daily
   */
  getFormattedChanges(): any {
    // Return the actual changes data structure with date range
    return {
      current: this.xmlDateRange?.current,
      previous: this.xmlDateRange?.previous,
      changes: {
        added: this.xmlChanges.filter(u => u.category === 'added'),
        changed: this.xmlChanges.filter(u => u.category === 'changed'),
        left: this.xmlChanges.filter(u => u.category === 'left')
      }
    };
  }

  // Add helper method to get XML date range for template
  getXmlDateRange(): { current: string, previous: string } | null {
    return this.xmlDateRange;
  }

  // Add a method to handle page change events from the stats table (align with daily)
  onTablePageChange(event: any): void {
    this.debugService.log('Weekly', 'Table pagination changed:', event);
    this.currentPageIndex = event.pageIndex;
    this.currentPageSize = event.pageSize;

    // Force update of child components (from daily)
    setTimeout(() => {
      this.debugService.log('Weekly', 'Updated pagination state to:', 
        { pageIndex: this.currentPageIndex, pageSize: this.currentPageSize });
      // If chart needs explicit refresh on pagination for some reason:
      // if (this.chartComponent) this.chartComponent.refreshChart(); 
    }, 0);
  }
  
  // Update method to remove service reference
  onSortChange(event: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Weekly', 'Table sort changed:', event);
    
    this.currentSortColumn = event.active;
    this.currentSortDirection = event.direction;
    
    // Use the unified chart update method
    this.updateChartAndButtons(event);
  }

  // Add helper method to process all sort events
  private handleSortEvent(sortData: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Weekly', 'Processing sort event:', sortData);
      
    // Always update internal state
    this.currentSortColumn = sortData.active;
    this.currentSortDirection = sortData.direction;
    
    // Force chart to update by using a direct reference
    if (this.chartComponent) {
      this.debugService.log('Weekly', `handleSortEvent - Ensuring chart searchTerm is "${this.searchText}" before updating with sort.`);
      
      // Force synchronization of all critical properties
      this.chartComponent.searchTerm = this.searchText;
      this.chartComponent.statsData = this.stats; // Ensure fresh data
      this.chartComponent.period = 'weekly';
      this.chartComponent.offset = this.offset;
      this.chartComponent.team = this.teamname;
      
      this.debugService.log('Weekly', 'Updating chart component with sort info:', sortData);
      
      // Use the public methods exposed by the chart component
      this.chartComponent.updateChartWithSort(sortData);
    } else {
      this.debugService.warn('Weekly', 'Chart component reference not available for sort event.');
    }
  }

  // Add a unified method for chart updates (align with daily)
  private updateChartAndButtons(sortInfo: {active: string, direction: 'asc' | 'desc'}) {
    this.debugService.log('Weekly', 'updateChartAndButtons called with:', sortInfo);
    
    // Always update component state
    this.currentSortColumn = sortInfo.active;
    this.currentSortDirection = sortInfo.direction;
    
    if (!this.chartComponent) {
      this.debugService.error('Weekly', 'Chart component not available');
      return;
    }
    
    // Use the public method to update the chart
    this.chartComponent.updateChartWithSort(sortInfo);

    // Debug output to verify chart state (from daily)
    this.debugService.log('Weekly', 'Chart component sort state after update:', 
      this.chartComponent.sortInfo);
  }

  // Add new method to ensure chart searchTerm is synchronized
  ensureChartSearchTermSync(): void {
    if (!this.chartComponent) {
      this.debugService.warn('Weekly', 'Chart component not available for search term sync');
      return;
    }
    
    this.safeUpdateChart('ensureChartSearchTermSync (property set only)', () => { 
      this.debugService.log('Weekly', `ensureChartSearchTermSync - Synchronizing chart searchTerm property to: "${this.searchText}"`);
      this.chartComponent!.searchTerm = this.searchText; 
      // We no longer call loadGraphData or refreshChart from here.
      // The loadData() method is responsible for triggering the chart's data load
      // after the main page data is available and searchText is confirmed.
      // This method now primarily ensures the chart component's searchTerm property
      // is aligned with the parent's state, for instance, if other interactions
      // not involving a full data reload might depend on it.
    });
  }

  // Add a utility method to handle errors more gracefully when updating the chart (from daily, if not already present)
  private safeUpdateChart(action: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.debugService.error('Weekly', `Error during ${action}:`, error);
    }
  }

  // Helper to check if all main content is loaded
  private isMainContentLoaded(): boolean {
    return !this.isLoading && !this.xmlLoading && !this.hasError && this.stats.length > 0;
  }

  // Call this after all main content is loaded and rendered
  private markMainContentRendered(): void {
    try {
      performance.mark('mainContentRendered');
      if (performance.getEntriesByName('routeStart').length) {
        performance.measure('routeToContent', 'routeStart', 'mainContentRendered');
        const measures = performance.getEntriesByName('routeToContent');
        if (measures.length) {
          window.dispatchEvent(new CustomEvent('realistic-page-load', {
            detail: { duration: Math.round(measures[0].duration) }
          }));
          performance.clearMarks('mainContentRendered');
          performance.clearMeasures('routeToContent');
        }
      }
    } catch (e) {}
  }

  // In both loadData and loadXmlChanges, after both are done, check and mark
  private checkAndMarkContentLoaded(): void {
    if (this.isMainContentLoaded()) {
      setTimeout(() => this.markMainContentRendered(), 0);
    }
  }
}