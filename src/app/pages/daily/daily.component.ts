import { Component, OnInit, ViewChild, AfterViewInit, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core';
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
import { Subscription } from 'rxjs';
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';

@Component({
  selector: 'app-daily',
  standalone: true,
  imports: [
    CommonModule, 
    DateInputGroupComponent, 
    StatsTableComponent,
    XmlChangesComponent,
    HighchartsGraphComponent,
    TranslatePipe
  ],
  templateUrl: './daily.component.html',
  styleUrls: ['./daily.component.scss']
})
export class DailyComponent implements OnInit, AfterViewInit, OnDestroy {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date();
  routeLabel: string = 'Daily';
  
  stats: StatRecord[] = [];
  isLoading = false;
  hasError = false;
  xmlChanges: any[] = [];
  startDate: string | null = null;
  endDate: string | null = null;

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

  // Add reference to the native element
  @ViewChild('dailyContainer') dailyContainer?: ElementRef;

  // Add subscription property to manage subscriptions
  private subscriptions: Subscription[] = [];

  // Add these properties as class members
  private handleExplicitSort: (e: Event) => void;
  private handleAngularSort: (e: Event) => void;
  private handleWindowSort: (e: Event) => void;
  private buttonUpdateTimer: any;

  // Add property to track in-flight route changes
  private pendingRouteChange = false;

  // Add property for currentTheme
  currentTheme: 'dark' | 'light' = 'light';
  private themeSubscription: any;

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    private translateService: TranslateService,
    public debugService: DebugService,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService
  ) {
    // Initialize the event handler properties in the constructor
    this.handleExplicitSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Daily', 'Caught explicit sort DOM event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleAngularSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Daily', 'Caught Angular custom event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleWindowSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Daily', 'Caught window event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
  }
  
  ngOnInit(): void {
    this.debugService.log('DailyComponent', 'Initializing component');

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
      this.debugService.log('DailyComponent', `ngOnInit - searchText updated from route to: "${this.searchText}"`);

      // Calculate the selected date based on offset
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
    this.themeSubscription = this.themeService.currentTheme$.subscribe((theme: ThemeMode) => {
      this.currentTheme = theme === 'dark' ? 'dark' : 'light';
    });
    this.subscriptions.push(this.themeSubscription);
  }

  ngAfterViewInit() {
    this.debugService.log('Daily', 'Setting up event listeners');
    
    // Clean up any existing event listeners first to prevent duplicates
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Add the event listeners with correct typing
    document.addEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.addEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.addEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Check sessionStorage once on init
    try {
      const storedEvent = sessionStorage.getItem('lastSortEvent');
      if (storedEvent) {
        const event = JSON.parse(storedEvent);
        this.debugService.log('Daily', 'Found sort event in sessionStorage:', event);
        
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
      this.debugService.error('Daily', 'Error checking sessionStorage:', e);
    }
  }

  ngOnDestroy() {
    // Clean up existing event listeners
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }
  
  updateSelectedDate(): void {
    const offsetValue = parseInt(this.offset, 10) || 0;
    const date = new Date();
    date.setDate(date.getDate() + offsetValue);
    this.selectedDate = date;
  }
  
  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('Daily', `Offset changed to: ${offset}`);
    
    if (offset !== this.offset) {
      // Navigate with updated offset, preserving team and search
      if (this.searchText) {
        this.router.navigate(['/s/daily', offset, this.teamname, this.searchText]);
      } else {
        this.router.navigate(['/s/daily', offset, this.teamname]);
      }
    }
  }
  
  // Method to handle team changes (can be called from parent)
  onTeamChange(team: string): void {
    this.debugService.log('Daily', `Team changed to: ${team}`);
    
    if (team !== this.teamname) {
      // Navigate with new team, preserving offset and search
      if (this.searchText) {
        this.router.navigate(['/s/daily', this.offset, team, this.searchText]);
      } else {
        this.router.navigate(['/s/daily', this.offset, team]);
      }
    }
  }
  
  // Update method to handle search changes
  onSearchChange(searchText: any): void {
    // Handle both string or event object with searchTerm property
    const searchValue = typeof searchText === 'string' ? searchText : 
                    (searchText && searchText.searchTerm ? searchText.searchTerm : '');

    this.debugService.log('Daily', `Search changed to: "${searchValue}"`);
    
    if (searchValue !== this.searchText) {
      this.searchText = searchValue;
      
      // Navigate with the updated search parameter
      this.router.navigate(['/s/daily', this.offset, this.teamname, searchValue]);
    }
  }
  
  // Method to load data based on current parameters
  loadData(): void {
    if (this.isLoading) {
      this.debugService.log('DailyComponent', 'Skipping data load, already in progress');
      return;
    }

    this.isLoading = true;
    this.hasError = false;

    this.debugService.log('DailyComponent', `Loading stats with offset: ${this.offset}, team: ${this.teamname}, search: "${this.searchText}"`);
    
    this.statsService.getDailyStats(this.offset, this.teamname)
      .subscribe({
        next: (data) => {
          this.stats = data;
          
          // Debug full response to look for date range
          this.debugService.log('Daily', `Stats response received, count: ${data.length}`);
          
          // The date range isn't directly in the data array, so we need to check
          // if it was added to the data object by the service
          if ((data as any).__dateRange) {
            this.startDate = (data as any).__dateRange.start;
            this.endDate = (data as any).__dateRange.end;
            this.debugService.log('Daily', `Found date range in __dateRange property: ${this.startDate} - ${this.endDate}`);
          }
          
          // Chart component will load its own data via graph API
          this.debugService.log('Daily', `Stats loaded, chart will use its own graph API for visualization`);
          
          this.isLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Daily', 'Error loading daily stats:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
  }

  loadXmlChanges(): void {
    // Skip if already loading
    if (this.xmlLoading) {
      this.debugService.log('Daily', 'Skipping XML load - already in progress');
      return;
    }
    
    this.debugService.log('Daily', `Loading XML changes - offset: ${this.offset}, team: ${this.teamname}`);
    
    this.xmlLoading = true;
    
    this.statsService.getChanges(this.offset, this.teamname, 'daily')
      .subscribe({
        next: (data) => {
          this.debugService.log('Daily', 'XML changes received from API:', data);
          
          // Set the changes received from the API
          if (data && data.changes) {
            // Process the changes data with explicit typing for the map callbacks
            const addedUsers = Array.isArray(data.changes.added) 
              ? data.changes.added.map((u: any) => ({
                  ...u, 
                  category: 'added', 
                  isNew: true,
                  username: u.Username || u.UsernameFull, // Map Username to username for consistency
                  StatsKeys: u.Keys1, // Map Keys1 to StatsKeys
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
                  username: u.NewUsername || u.OldUsername // Use available username
                })) 
              : [];
            const leftUsers = Array.isArray(data.changes.left) 
              ? data.changes.left.map((u: any) => ({
                  ...u, 
                  category: 'left', 
                  wasInYesterday: true,
                  username: u.Username || u.UsernameFull, // Map Username to username
                  StatsKeys: u.Keys1, // Map Keys1 to StatsKeys
                  StatsClicks: u.Clicks,
                  StatsDownloadMB: u.Download,
                  StatsUploadMB: u.Upload
                })) 
              : [];
            
            // Combine all users into one array for the XML component
            this.xmlChanges = [...addedUsers, ...changedUsers, ...leftUsers];
            
            this.debugService.log('Daily', `Processed ${this.xmlChanges.length} XML changes (${addedUsers.length} added, ${changedUsers.length} changed, ${leftUsers.length} left)`);
          } else {
            this.debugService.warn('Daily', 'No changes object found in data:', data);
            this.xmlChanges = [];
          }
          
          this.xmlLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Daily', 'Error loading XML changes:', error);
          this.xmlChanges = [];
          this.xmlLoading = false;
        }
      });
  }

  // Add method to handle page change events from the stats table
  onTablePageChange(event: any): void {
    this.debugService.log('Daily', 'Table pagination changed:', event);
    
    // Set the current pagination values for the highcharts component
    this.currentPageIndex = event.pageIndex;
    this.currentPageSize = event.pageSize;
    
    // Force update of child components
    setTimeout(() => {
      this.debugService.log('Daily', 'Updated pagination state to:', 
        { pageIndex: this.currentPageIndex, pageSize: this.currentPageSize });
    }, 0);
  }

  onSortChange(event: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Daily', 'Table sort changed:', event);
    
    // Update internal state
    this.currentSortColumn = event.active;
    this.currentSortDirection = event.direction;
    
    // Always handle sort changes through the unified handler
    this.updateChartAndButtons(event);
  }

  // Improved unified method for chart updates with stable behavior
  private updateChartAndButtons(sortInfo: {active: string, direction: 'asc' | 'desc'}) {
    this.debugService.log('Daily', 'updateChartAndButtons called with:', sortInfo);
    
    // Always update component state
    this.currentSortColumn = sortInfo.active;
    this.currentSortDirection = sortInfo.direction;
    
    if (!this.chartComponent) {
      this.debugService.error('Daily', 'Chart component not available');
      return;
    }
    
    // Use the public method to update the chart
    this.chartComponent.updateChartWithSort(sortInfo);
    
    // Debug output to verify chart state
    this.debugService.log('Daily', 'Chart component sort state after update:', 
      this.chartComponent.sortInfo);
  }

  // Add this helper method to process all sort events
  private handleSortEvent(sortData: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Daily', 'Processing sort event:', sortData);
      
    // Always update internal state, even if it seems like a duplicate
    this.currentSortColumn = sortData.active;
    this.currentSortDirection = sortData.direction;
    
    // Force chart to update by using a direct reference
    if (this.chartComponent) {
      this.debugService.log('Daily', `handleSortEvent - Ensuring chart searchTerm is "${this.searchText}" before updating with sort.`);
      
      // Force synchronization of all critical properties
      this.chartComponent.searchTerm = this.searchText;
      this.chartComponent.statsData = this.stats; // Ensure fresh data
      this.chartComponent.period = 'daily';
      this.chartComponent.offset = this.offset;
      this.chartComponent.team = this.teamname;

      this.debugService.log('Daily', 'Updating chart component directly with sort info:', sortData);
      
      // Use the public methods exposed by the chart component
      this.chartComponent.updateChartWithSort(sortData);
    } else {
      this.debugService.warn('Daily', 'Chart component reference not available for sort event.');
    }
  }

  /**
   * Format a date according to the current locale
   */
  getFormattedDate(date: Date): string {
    if (!date) return '';
    
    try {
      // Get current language from translate service
      const currentLang = this.translateService.getCurrentLanguage();
      
      // Create localized date format options
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      };
      
      // Use the browser's built-in formatting
      return date.toLocaleDateString(currentLang, options);
    } catch (error) {
      this.debugService.error('Daily', 'Error formatting date:', error);
      return date.toDateString(); // Fallback format
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
      // Wait for Angular to finish rendering
      setTimeout(() => this.markMainContentRendered(), 0);
    }
  }
}
