import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, ChangeDetectorRef, Input } from '@angular/core'; // Added ChangeDetectorRef
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DateInputGroupComponent } from '../../shared/date-input-group/date-input-group.component';
import { StatsTableComponent } from '../../shared/stats-table/stats-table.component';
import { StatsService, StatRecord } from '../../shared/services/stats.service';
import { XmlChangeUser } from '../../shared/services/stats.service';
import { XmlChangesComponent } from '../../shared/xml-changes/xml-changes.component';
import { HighchartsGraphComponent } from '../../shared/highcharts-graph/highcharts-graph.component';
import { DebugService } from '../../shared/services/debug.service';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { TranslateService } from '../../shared/services/translate.service';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';

@Component({
  selector: 'app-yearly',
  standalone: true,
  imports: [
    CommonModule, 
    DateInputGroupComponent, 
    StatsTableComponent,
    XmlChangesComponent,
    HighchartsGraphComponent,
    TranslatePipe
  ],
  templateUrl: './yearly.component.html',
  styleUrls: ['./yearly.component.scss']
})
export class YearlyComponent implements OnInit, OnDestroy, AfterViewInit {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date();
  routeLabel: string = 'Yearly';
  
  stats: StatRecord[] = [];
  isLoading = false;
  hasError = false;
  xmlChanges: any[] = [];
  xmlLoading = false; // Add property to track XML loading state
  
  // Rename these properties to match the template
  startDate: string = '';
  endDate: string = '';
  
  // Add properties to track pagination state for the chart
  currentPageIndex: number = 0;
  currentPageSize: number = 25;
  
  // Add properties to track sort state for the chart
  currentSortColumn: string = 'keys';
  currentSortDirection: 'asc' | 'desc' = 'desc';
  
  // Add reference to the chart component
  @ViewChild('chart') chartComponent?: HighchartsGraphComponent;
  
  // Add subscription property to manage subscriptions
  private subscriptions: Subscription[] = [];

  // Add these properties as class members for event handling
  private handleExplicitSort: (e: Event) => void;
  private handleAngularSort: (e: Event) => void;
  private handleWindowSort: (e: Event) => void;
  private buttonUpdateTimer: any;
  
  // Add property to track in-flight route changes (similar to weekly/daily)
  private pendingRouteChange = false;
  
  // Add xmlDateRange property to match the suggested change
  xmlDateRange: { current?: string, previous?: string } = {};

  // Remove @Input() property for currentTheme
  currentTheme: 'dark' | 'light' = 'light';
  private themeSubscription: any;

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    private translateService: TranslateService,
    private debugService: DebugService,
    private cdr: ChangeDetectorRef, // Injected ChangeDetectorRef
    private themeService: ThemeService // Injected ThemeService
  ) {
    // Initialize the event handler properties in the constructor
    this.handleExplicitSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Yearly', 'Caught explicit sort DOM event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleAngularSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Yearly', 'Caught Angular custom event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleWindowSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Yearly', 'Caught window event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
  }
  
  ngOnInit(): void {
    this.debugService.log('YearlyComponent', 'Initializing component');
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
      this.debugService.log('YearlyComponent', `ngOnInit - searchText updated from route to: "${this.searchText}"`);

      // Direct data load, no setTimeouts
      this.loadData();
      this.loadXmlChanges();
    });
    
    // Subscribe to theme changes
    this.themeSubscription = this.themeService.currentTheme$.subscribe((theme: ThemeMode) => {
      this.currentTheme = theme === 'dark' ? 'dark' : 'light';
    });
  }

  ngAfterViewInit() {
    this.debugService.log('Yearly', 'Setting up event listeners');
    
    // Clean up any existing event listeners first to prevent duplicates
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Add the event listeners with correct typing
    document.addEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.addEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.addEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Sync chart search term after view init (similar to WeeklyComponent)
    setTimeout(() => {
      if (this.chartComponent) {
        this.debugService.log('Yearly', `ngAfterViewInit - Initializing chart with search term: "${this.searchText}"`);
        this.ensureChartSearchTermSync();
      } else {
        this.debugService.warn('Yearly', 'ngAfterViewInit - Chart component reference not available - will retry');
        setTimeout(() => {
          if (this.chartComponent) {
            this.debugService.log('Yearly', `ngAfterViewInit (Retry) - Initializing chart with search term: "${this.searchText}"`);
            this.ensureChartSearchTermSync();
          } else {
            this.debugService.error('Yearly', 'ngAfterViewInit - Chart component reference still not available after retry');
          }
        }, 1000);
      }
    }, 500); // Delay to ensure components are initialized

    // Check sessionStorage for stored sort events
    try {
      const storedEvent = sessionStorage.getItem('lastSortEvent');
      if (storedEvent) {
        const event = JSON.parse(storedEvent);
        this.debugService.log('Yearly', 'Found sort event in sessionStorage:', event);
        
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
      this.debugService.error('Yearly', 'Error checking sessionStorage:', e);
    }
  }

  ngOnDestroy(): void {
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
    
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
  
  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('Yearly', `Offset changed to: ${offset}`);
    this.updateSelectedDate(offset); // update datum direct
    if (offset !== this.offset) {
      // Navigate with updated offset, preserving team and search
      if (this.searchText) {
        this.router.navigate(['/s/yearly', offset, this.teamname, this.searchText]);
      } else {
        this.router.navigate(['/s/yearly', offset, this.teamname]);
      }
    }
  }

  updateSelectedDate(offsetOverride?: string): void {
    const offsetValue = parseInt(offsetOverride ?? this.offset, 10) || 0;
    const date = new Date();
    date.setFullYear(date.getFullYear() + offsetValue);
    this.selectedDate = date;
  }
  
  // Method to load data based on current parameters
  loadData(): void {
    if (this.isLoading) {
      this.debugService.log('YearlyComponent', 'Skipping data load, already in progress');
      return;
    }
    this.isLoading = true;
    this.hasError = false;
    this.debugService.log('YearlyComponent', `Loading stats with offset: ${this.offset}, team: ${this.teamname}`);
    this.statsService.getYearlyStats(this.offset, this.teamname)
      .subscribe({
        next: (data) => {
          this.stats = data;
          this.debugService.log('Yearly', 'Full response structure:', data);

          // Altijd eerst proberen current/previous te gebruiken als ze bestaan
          if ((data as any).current && (data as any).previous) {
            this.startDate = this.parseDateString((data as any).previous);
            this.endDate = this.parseDateString((data as any).current);
            this.xmlDateRange = {
              current: (data as any).current,
              previous: (data as any).previous
            };
            this.debugService.log('Yearly', `Set startDate/endDate from API current/previous: ${this.startDate} - ${this.endDate}`);
          } else if ((data as any).year) {
            this.startDate = (data as any).year.start;
            this.endDate = (data as any).year.end;
            this.debugService.log('Yearly', `Found year object in API response: ${(data as any).year.start} - ${(data as any).year.end}`);
          } else if ((data as any).__dateRange) {
            this.startDate = (data as any).__dateRange.start;
            this.endDate = (data as any).__dateRange.end;
            this.debugService.log('Yearly', `Using __dateRange property: ${(data as any).__dateRange.start} - ${(data as any).__dateRange.end}`);
          } else {
            // Fallback: bereken jaar uit offset
            const year = parseInt(new Date().getFullYear().toString()) + parseInt(this.offset);
            this.startDate = `01-01-${year}`;
            this.endDate = `31-12-${year}`;
            this.debugService.log('Yearly', `No date range found in API response, created from offset: ${this.startDate} - ${this.endDate}`);
          }

          this.isLoading = false;
          this.checkAndMarkContentLoaded();
          this.debugService.log('Yearly', `loadData - Main stats loaded. Chart should update via @Input binding for searchTerm: "${this.searchText}"`);
        },
        error: (error) => {
          this.debugService.error('Yearly', 'Error loading yearly stats:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
  }

  loadXmlChanges(): void {
    if (this.xmlLoading) {
      this.debugService.log('Yearly', 'Skipping XML load - already in progress');
      return;
    }
    this.debugService.log('Yearly', `Loading XML changes - offset: ${this.offset}, team: ${this.teamname}`);
    this.xmlLoading = true;
    this.statsService.getChanges(this.offset, this.teamname, 'yearly')
      .subscribe({
        next: (data) => {
          this.debugService.log('Yearly', 'XML changes received from API');

          // Extract date range from XML only if both current and previous are present
          if (data && data.current && data.previous) {
            this.xmlDateRange = {
              current: data.current,
              previous: data.previous
            };
            this.startDate = data.previous;
            this.endDate = data.current;
            this.debugService.log('Yearly', `Set xmlDateRange from XML: ${data.previous} - ${data.current}`);
          }

          // Set the changes received from the API
          if (data && data.changes) {
            // Process the changes data with explicit typing for the map callbacks
            const addedUsers = Array.isArray(data.changes.added) 
              ? data.changes.added.map((u: any) => ({...u, category: 'added', isNew: true})) 
              : [];
            const changedUsers = Array.isArray(data.changes.changed) 
              ? data.changes.changed.map((u: any) => ({...u, category: 'changed', wasChanged: true})) 
              : [];
            const leftUsers = Array.isArray(data.changes.left) 
              ? data.changes.left.map((u: any) => ({...u, category: 'left', wasInYesterday: true})) 
              : [];
            
            // Combine all users into one array for the XML component
            this.xmlChanges = [...addedUsers, ...changedUsers, ...leftUsers];
            
            this.debugService.log('Yearly', `Processed ${this.xmlChanges.length} XML changes (${addedUsers.length} added, ${changedUsers.length} changed, ${leftUsers.length} left)`);
          }
          
          this.xmlLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Yearly', 'Error loading XML changes:', error);
          this.xmlChanges = [];
          this.xmlLoading = false;
        }
      });
  }

  // Add a method to handle page change events from the stats table
  onTablePageChange(event: any): void {
    this.debugService.log('Yearly', 'Table pagination changed:', event);
    this.currentPageIndex = event.pageIndex;
    this.currentPageSize = event.pageSize;
  }

  // Update method to remove service reference
  onSortChange(event: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Yearly', 'Table sort changed:', event);
    
    this.currentSortColumn = event.active;
    this.currentSortDirection = event.direction;
    
    // Update the chart with the unified method
    this.updateChartAndButtons(event);
  }

  // Add helper method to process all sort events
  private handleSortEvent(sortData: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Yearly', 'Processing sort event:', sortData);
      
    // Always update internal state
    this.currentSortColumn = sortData.active;
    this.currentSortDirection = sortData.direction;
    
    // Force chart to update by using a direct reference
    if (this.chartComponent) {
      this.debugService.log('Yearly', `handleSortEvent - Ensuring chart searchTerm is "${this.searchText}" before updating with sort.`);
      this.chartComponent.searchTerm = this.searchText; // Explicitly set searchTerm
      
      this.debugService.log('Yearly', 'Updating chart component with sort info:', sortData);
      
      // Use the public methods exposed by the chart component
      this.chartComponent.updateChartWithSort(sortData);
    } else {
      this.debugService.warn('Yearly', 'Chart component reference not available for sort event.');
    }
  }

  // Add a unified method for chart updates
  private updateChartAndButtons(sortInfo: {active: string, direction: 'asc' | 'desc'}) {
    this.debugService.log('Yearly', 'updateChartAndButtons called with:', sortInfo);
    
    // Always update component state
    this.currentSortColumn = sortInfo.active;
    this.currentSortDirection = sortInfo.direction;
    
    if (!this.chartComponent) {
      this.debugService.error('Yearly', 'Chart component not available');
      return;
    }
    
    // Use the public method to update the chart
    this.chartComponent.updateChartWithSort(sortInfo);
  }

  // Add new method to ensure chart searchTerm is synchronized (from WeeklyComponent)
  ensureChartSearchTermSync(): void {
    if (!this.chartComponent) {
      this.debugService.warn('Yearly', 'Chart component not available for search term sync');
      return;
    }
    
    this.safeUpdateChart('ensureChartSearchTermSync (property set only)', () => { 
      this.debugService.log('Yearly', `ensureChartSearchTermSync - Synchronizing chart searchTerm property to: "${this.searchText}"`);
      this.chartComponent!.searchTerm = this.searchText; 
      // We do not call loadGraphData or refreshChart from here.
      // The chart should react to its @Input() searchTerm changing,
      // or its loadGraphData is called by other primary data loading flows (like loadData).
    });
  }

  // Add a utility method to handle errors more gracefully when updating the chart (from WeeklyComponent)
  private safeUpdateChart(action: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.debugService.error('Yearly', `Error during ${action}:`, error);
    }
  }
  
  getFormattedDate(): string {
    if (!this.selectedDate) return '';
    
    try {
      // If we have start and end dates from XML, format them as a range
      if (this.startDate && this.endDate) {
        const toText = this.translateService.translate('common.to');
        return `${this.formatDateString(this.startDate)} ${toText} ${this.formatDateString(this.endDate)}`;
      }
      
      // If no XML dates available, calculate year from offset and create range
      if (!this.startDate || !this.endDate) {
        const year = parseInt(new Date().getFullYear().toString()) + parseInt(this.offset);
        const startOfYear = `01-01-${year}`;
        const endOfYear = `31-12-${year}`;
        const toText = this.translateService.translate('common.to');
        return `${this.formatDateString(startOfYear)} ${toText} ${this.formatDateString(endOfYear)}`;
      }
      
      // Last fallback: use the selectedDate
      const currentLang = this.translateService.getCurrentLanguage();
      const options: Intl.DateTimeFormatOptions = { year: 'numeric' };
      
      return this.selectedDate.toLocaleDateString(currentLang, options);
    } catch (error) {
      this.debugService.error('Yearly', 'Error formatting date:', error);
      // Final fallback with offset calculation
      const year = parseInt(new Date().getFullYear().toString()) + parseInt(this.offset);
      const startOfYear = `01-01-${year}`;
      const endOfYear = `31-12-${year}`;
      const toText = this.translateService.translate('common.to');
      return `${this.formatDateString(startOfYear)} ${toText} ${this.formatDateString(endOfYear)}`;
    }
  }

  /**
   * Returns a formatted changes object for the XML changes component
   * to avoid complex binding expressions in the template
   */
  getFormattedChanges(): any {
    // Return the actual changes data structure without sample data
    return {
      changes: {
        added: this.xmlChanges.filter(u => u.category === 'added'),
        changed: this.xmlChanges.filter(u => u.category === 'changed'),
        left: this.xmlChanges.filter(u => u.category === 'left')
      }
    };
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
      this.debugService.error('Yearly', 'Error parsing date string:', error);
      return dateString; // Return original if any error occurs
    }
  }

  /**
   * Parse date string in dd-MM-yyyy or yyyy-MM-dd to yyyy-MM-dd for Date()
   */
  parseDateString(date: string): string {
    if (!date) return '';
    // If already yyyy-MM-dd, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    // If dd-MM-yyyy, convert to yyyy-MM-dd
    if (/^\d{2}-\d{2}-\d{4}$/.test(date)) {
      const [day, month, year] = date.split('-');
      return `${year}-${month}-${day}`;
    }
    return date;
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
