import { Component, OnInit, ViewChild, AfterViewInit, ElementRef, OnDestroy, ChangeDetectorRef } from '@angular/core'; // Added ChangeDetectorRef
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DateInputGroupComponent } from '../../shared/date-input-group/date-input-group.component';
import { StatsTableComponent } from '../../shared/stats-table/stats-table.component';
import { StatsService, StatRecord } from '../../shared/services/stats.service';
import { XmlChangesComponent } from '../../shared/xml-changes/xml-changes.component';
import { HighchartsGraphComponent } from '../../shared/highcharts-graph/highcharts-graph.component';
import { DebugService } from '../../shared/services/debug.service';
import { Subscription } from 'rxjs';
import { TranslateService } from '../../shared/services/translate.service'; // Added TranslateService
import { ThemeService, ThemeMode } from '../../shared/services/theme.service';

@Component({
  selector: 'app-overall',
  standalone: true,
  imports: [
    CommonModule, 
    DateInputGroupComponent, 
    StatsTableComponent,
    XmlChangesComponent,
    HighchartsGraphComponent
    // TranslatePipe will be removed from here
  ],
  templateUrl: './overall.component.html',
  styleUrls: ['./overall.component.scss']
})
export class OverallComponent implements OnInit, AfterViewInit, OnDestroy {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date(); // Remains for DateInputGroup, though not directly used for Overall data period
  routeLabel: string = 'Overall'; // Added routeLabel
  startDate: string | null = null;
  endDate: string | null = null;
  
  stats: StatRecord[] = [];
  isLoading = false;
  hasError = false;
  xmlChanges: any[] = [];
  xmlLoading = false;

  // Pagination properties
  currentPageIndex: number = 0;
  currentPageSize: number = 25;
  
  // Sort properties
  currentSortColumn: string = 'keys';
  currentSortDirection: 'asc' | 'desc' = 'desc';

  // Chart component reference
  @ViewChild('chart') chartComponent?: HighchartsGraphComponent;
  @ViewChild('overallContainer') overallContainer?: ElementRef;

  // Subscriptions management
  private subscriptions: Subscription[] = [];

  // Event handlers
  private handleExplicitSort: (e: Event) => void;
  private handleAngularSort: (e: Event) => void;
  private handleWindowSort: (e: Event) => void;
  private buttonUpdateTimer: any;

  // Track pending route changes
  private pendingRouteChange = false;

  // Current theme
  currentTheme: 'dark' | 'light' = 'light';
  private themeSubscription: any;

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    public debugService: DebugService,
    private cdr: ChangeDetectorRef, // Injected ChangeDetectorRef
    private translateService: TranslateService, // Injected TranslateService
    private themeService: ThemeService
  ) {
    // Initialize event handlers
    this.handleExplicitSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Overall', 'Caught explicit sort DOM event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleAngularSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Overall', 'Caught Angular custom event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleWindowSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Overall', 'Caught window event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
  }
  
  ngOnInit(): void {
    this.debugService.log('OverallComponent', 'Initializing component');

    // Set default sort values
    this.currentSortColumn = 'keys';
    this.currentSortDirection = 'desc';

    // Subscribe to route parameter changes
    this.subscriptions.push(
      this.route.params.subscribe(params => {
        const newOffset = params['offset'] || '0';
        const newTeamname = params['team'] || '-';
        const newSearchText = params['search'] || '';

        this.offset = newOffset;
        this.teamname = newTeamname;
        this.searchText = newSearchText;
        this.debugService.log('OverallComponent', `Route params updated: offset=${newOffset}, team=${newTeamname}, searchText="${newSearchText}"`);

        // Direct data load, no setTimeouts
        this.loadData();
        this.loadXmlChanges();
      })
    );

    // Subscribe to language changes for consistency
    const langSubscription = this.translateService.translationsChanged$.subscribe(() => {
      this.cdr.detectChanges();
    });
    this.subscriptions.push(langSubscription);

    // Subscribe to theme changes
    this.themeSubscription = this.themeService.currentTheme$.subscribe((theme: ThemeMode) => {
      this.currentTheme = theme === 'dark' ? 'dark' : 'light';
      this.cdr.detectChanges();
      // No more showChart remount or retrySyncChartComponent
    });
  }

  ngAfterViewInit() {
    this.debugService.log('Overall', 'Setting up event listeners');
    
    // Clean up any existing event listeners
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Add event listeners
    document.addEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.addEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.addEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    // Sync chart search term after view init (similar to Weekly/YearlyComponent)
    setTimeout(() => {
      if (this.chartComponent) {
        this.debugService.log('Overall', `ngAfterViewInit - Initializing chart with search term: "${this.searchText}"`);
        this.ensureChartSearchTermSync();
      } else {
        this.debugService.warn('Overall', 'ngAfterViewInit - Chart component reference not available - will retry');
        setTimeout(() => {
          if (this.chartComponent) {
            this.debugService.log('Overall', `ngAfterViewInit (Retry) - Initializing chart with search term: "${this.searchText}"`);
            this.ensureChartSearchTermSync();
          } else {
            this.debugService.error('Overall', 'ngAfterViewInit - Chart component reference still not available after retry');
          }
        }, 1000);
      }
    }, 500); // Delay to ensure components are initialized

    // Check sessionStorage for stored sort events
    try {
      const storedEvent = sessionStorage.getItem('lastSortEvent');
      if (storedEvent) {
        const event = JSON.parse(storedEvent);
        this.debugService.log('Overall', 'Found sort event in sessionStorage:', event);
        
        if (Date.now() - event.timestamp < 10000) {
          this.handleSortEvent({
            active: event.column,
            direction: event.direction
          });
          
          sessionStorage.removeItem('lastSortEvent');
        }
      }
    } catch (e) {
      this.debugService.error('Overall', 'Error checking sessionStorage:', e);
    }
  }

  ngOnDestroy() {
    // Clean up event listeners
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    if (this.buttonUpdateTimer) {
      clearTimeout(this.buttonUpdateTimer);
    }
    
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
    
    // Unsubscribe from all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('Overall', `Offset changed to: ${offset}`);
    
    if (offset !== this.offset) {
      // Navigate with updated offset, preserving team and search
      if (this.searchText) {
        this.router.navigate(['/o/overall', offset, this.teamname, this.searchText]);
      } else {
        this.router.navigate(['/o/overall', offset, this.teamname]);
      }
    }
  }
  
  onTeamChange(team: string): void {
    this.debugService.log('Overall', `Team changed to: ${team}`);
    
    if (team !== this.teamname) {
      if (this.searchText) {
        this.router.navigate(['/o/overall', this.offset, team, this.searchText]);
      } else {
        this.router.navigate(['/o/overall', this.offset, team]);
      }
    }
  }

  // Update method to handle search text changes from the StatsTable
  onSearchChange(event: any): void {
    // Check if event is a string or an event object with searchTerm property
    const searchValue = typeof event === 'string' ? event : 
                      (event && event.searchTerm !== undefined ? event.searchTerm : ''); // Ensure searchTerm property exists
    
    this.debugService.log('Overall', `Search changed to: "${searchValue}"`);
    
    if (searchValue !== this.searchText) {
      // Update searchText immediately for consistency, navigation will trigger reload via ngOnInit
      this.searchText = searchValue; 
      
      // Navigate with the updated search parameter
      this.router.navigate(['/o/overall', this.offset, this.teamname, searchValue]);
    }
  }
  
  // Load overall stats data (totals, not differences)
  loadData(): void {
    if (this.isLoading) {
      this.debugService.log('OverallComponent', 'Skipping data load, already in progress');
      return;
    }
    this.isLoading = true;
    this.hasError = false;
    this.debugService.log('OverallComponent', `Loading stats with offset: ${this.offset}, team: ${this.teamname}`);
    this.statsService.getOverallStats(this.offset, this.teamname)
      .subscribe({
        next: (data) => {
          this.stats = data;
          this.debugService.log('OverallComponent', `Stats loaded with ${data.length} records (unfiltered by search from API).`);
          
          // Check for date range metadata
          if ((data as any).__dateRange) {
            this.startDate = (data as any).__dateRange.start;
            this.endDate = (data as any).__dateRange.end;
            this.debugService.log('Overall', `Found date range: ${this.startDate} - ${this.endDate}`);
          }
          
          this.isLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Overall', 'Error loading overall stats:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
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

  loadXmlChanges(): void {
    if (this.xmlLoading) {
      this.debugService.log('Overall', 'Skipping XML load - already in progress');
      return;
    }
    this.debugService.log('Overall', `Loading XML changes - offset: ${this.offset}, team: ${this.teamname}`);
    this.xmlLoading = true;
    this.statsService.getChanges(this.offset, this.teamname, 'overall')
      .subscribe({
        next: (data) => {
          this.debugService.log('Overall', 'XML changes received from API');
          
          if (data && data.changes) {
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
            
            this.xmlChanges = [...addedUsers, ...changedUsers, ...leftUsers];
            
            this.debugService.log('Overall', `Processed ${this.xmlChanges.length} XML changes (${addedUsers.length} added, ${changedUsers.length} changed, ${leftUsers.length} left)`);
          } else {
            this.debugService.warn('Overall', 'No changes object found in data:', data);
            this.xmlChanges = [];
          }
          
          this.xmlLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Overall', 'Error loading XML changes:', error);
          this.xmlChanges = [];
          this.xmlLoading = false;
        }
      });
  }

  onTablePageChange(event: any): void {
    this.debugService.log('Overall', 'Table pagination changed:', event);
    this.currentPageIndex = event.pageIndex;
    this.currentPageSize = event.pageSize;
  }

  onSortChange(event: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Overall', 'Table sort changed:', event);
    
    this.currentSortColumn = event.active;
    this.currentSortDirection = event.direction;
    
    this.updateChartAndButtons(event);
  }

  private updateChartAndButtons(sortInfo: {active: string, direction: 'asc' | 'desc'}) {
    this.debugService.log('Overall', 'updateChartAndButtons called with:', sortInfo);
    
    this.currentSortColumn = sortInfo.active;
    this.currentSortDirection = sortInfo.direction;
    
    if (!this.chartComponent) {
      this.debugService.error('Overall', 'Chart component not available');
      return;
    }
    
    this.chartComponent.updateChartWithSort(sortInfo);
  }

  private handleSortEvent(sortData: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Overall', 'Processing sort event:', sortData);
      
    this.currentSortColumn = sortData.active;
    this.currentSortDirection = sortData.direction;
    
    if (this.chartComponent) {
      this.debugService.log('Overall', `handleSortEvent - Ensuring chart searchTerm is "${this.searchText}" before updating with sort.`);
      this.chartComponent.searchTerm = this.searchText; // Explicitly set searchTerm

      this.debugService.log('Overall', 'Updating chart component with sort info:', sortData);
      this.chartComponent.updateChartWithSort(sortData);
    } else {
      this.debugService.warn('Overall', 'Chart component reference not available for sort event.');
    }
  }

  // Add new method to ensure chart searchTerm is synchronized (from WeeklyComponent)
  ensureChartSearchTermSync(): void {
    if (!this.chartComponent) {
      this.debugService.warn('Overall', 'Chart component not available for search term sync');
      return;
    }
    
    this.safeUpdateChart('ensureChartSearchTermSync (property set only)', () => { 
      this.debugService.log('Overall', `ensureChartSearchTermSync - Synchronizing chart searchTerm property to: "${this.searchText}"`);
      this.chartComponent!.searchTerm = this.searchText; 
      // We do not call loadGraphData or refreshChart from here.
      // The chart should react to its @Input() searchTerm changing,
      // or its loadGraphData is called by other primary data loading flows.
    });
  }

  // Add a utility method to handle errors more gracefully when updating the chart (from WeeklyComponent)
  private safeUpdateChart(action: string, callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.debugService.error('Overall', `Error during ${action}:`, error);
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
}
