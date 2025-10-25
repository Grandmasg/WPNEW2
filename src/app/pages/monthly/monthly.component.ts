import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
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
  selector: 'app-monthly',
  standalone: true,
  imports: [
    CommonModule, 
    DateInputGroupComponent, 
    StatsTableComponent,
    XmlChangesComponent,
    HighchartsGraphComponent,
    TranslatePipe
  ],
  templateUrl: './monthly.component.html',
  styleUrls: ['./monthly.component.scss']
})
export class MonthlyComponent implements OnInit, OnDestroy, AfterViewInit {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date();
  routeLabel: string = 'Monthly';
  
  stats: StatRecord[] = [];
  isLoading = false;
  hasError = false;
  xmlChanges: any[] = [];
  startDate: string | null = null;
  endDate: string | null = null;

  current: string | null = null;
  previous: string | null = null;

  currentPageIndex: number = 0;
  currentPageSize: number = 25;
  xmlLoading = false;

  currentSortColumn: string = 'keys';
  currentSortDirection: 'asc' | 'desc' = 'desc';

  @ViewChild('chart') chartComponent?: HighchartsGraphComponent;

  private subscriptions: Subscription[] = [];
  private handleExplicitSort: (e: Event) => void;
  private handleAngularSort: (e: Event) => void;
  private handleWindowSort: (e: Event) => void;
  private buttonUpdateTimer: any;

  currentTheme: 'dark' | 'light' = 'light';
  private themeSubscription: any;

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    private translateService: TranslateService,
    private debugService: DebugService,
    private themeService: ThemeService
  ) {
    this.handleExplicitSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Monthly', 'Caught explicit sort DOM event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleAngularSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Monthly', 'Caught Angular custom event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
    
    this.handleWindowSort = (e: Event) => {
      const customEvent = e as CustomEvent;
      this.debugService.log('Monthly', 'Caught window event:', customEvent?.detail);
      if (customEvent?.detail) this.handleSortEvent(customEvent.detail);
    };
  }
  
  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const newOffset = params['offset'] || '0';
      const newTeamname = params['team'] || '-';
      const newSearchText = params['search'] || '';

      if (newOffset !== this.offset || newTeamname !== this.teamname || newSearchText !== this.searchText) {
        this.offset = newOffset;
        this.teamname = newTeamname;
        this.searchText = newSearchText;

        this.updateSelectedDate();
        this.loadData();
        this.loadXmlChanges();
      } else {
        this.debugService.log('Monthly', 'Parameters unchanged, skipping data reload.');
      }
    });

    this.themeSubscription = this.themeService.currentTheme$.subscribe((theme: ThemeMode) => {
      this.currentTheme = theme === 'dark' ? 'dark' : 'light';
    });

    // Set default sort values
    this.currentSortColumn = 'keys';
    this.currentSortDirection = 'desc';
  }
  
  ngAfterViewInit() {
    this.debugService.log('Monthly', 'Setting up event listeners');
    
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    document.addEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.addEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.addEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    try {
      const storedEvent = sessionStorage.getItem('lastSortEvent');
      if (storedEvent) {
        const event = JSON.parse(storedEvent);
        this.debugService.log('Monthly', 'Found sort event in sessionStorage:', event);
        
        if (Date.now() - event.timestamp < 10000) {
          this.handleSortEvent({
            active: event.column,
            direction: event.direction
          });
          sessionStorage.removeItem('lastSortEvent');
        }
      }
    } catch (e) {
      this.debugService.error('Monthly', 'Error checking sessionStorage:', e);
    }
  }

  ngOnDestroy() {
    document.removeEventListener('stats-table-explicit-sort', this.handleExplicitSort as EventListener);
    document.removeEventListener('angular-stats-table-sort', this.handleAngularSort as EventListener);
    window.removeEventListener('global-stats-sort-change', this.handleWindowSort as EventListener);
    
    if (this.buttonUpdateTimer) {
      clearTimeout(this.buttonUpdateTimer);
    }
    
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }

  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('Monthly', `Offset changed to: ${offset}`);
    this.updateSelectedDate(offset); // update datum direct
    if (offset !== this.offset) {
      if (this.searchText) {
        this.router.navigate(['/s/monthly', offset, this.teamname, this.searchText]);
      } else {
        this.router.navigate(['/s/monthly', offset, this.teamname]);
      }
    }
  }
  
  onTeamChange(team: string): void {
    this.debugService.log('Monthly', `Team changed to: ${team}`);
    
    if (team !== this.teamname) {
      if (this.searchText) {
        this.router.navigate(['/s/monthly', this.offset, team, this.searchText]);
      } else {
        this.router.navigate(['/s/monthly', this.offset, team]);
      }
    }
  }
  
  updateSelectedDate(offsetOverride?: string): void {
    const offsetValue = parseInt(offsetOverride ?? this.offset, 10) || 0;
    const date = new Date();
    date.setMonth(date.getMonth() + offsetValue);
    this.selectedDate = date;
  }
  
  loadData(): void {
    if (this.isLoading) {
      return;
    }
    this.isLoading = true;
    this.hasError = false;

    this.debugService.log('Monthly', `Loading stats with offset: ${this.offset}, team: ${this.teamname}`);
    this.statsService.getMonthlyStats(this.offset, this.teamname)
      .subscribe({
        next: (response) => {
          this.stats = response;

          // Reset date range fields
          this.current = null;
          this.previous = null;

          // Check if the response has a month property (non-enumerable)
          // Only overwrite current/previous if beide aanwezig zijn (zoals yearly)
          if ((response as any).current && (response as any).previous) {
            this.previous = this.parseDateString((response as any).previous);
            this.current = this.parseDateString((response as any).current);
            this.startDate = this.previous;
            this.endDate = this.current;
            this.debugService.log('Monthly', `Using XML date range: ${this.startDate} - ${this.endDate}`);
          } else if ((response as any).current && !(response as any).previous) {
            this.current = this.parseDateString((response as any).current);
            this.startDate = this.current;
            this.endDate = null;
            this.debugService.log('Monthly', `Using single XML date: ${this.startDate}`);
          } else if (Object.getOwnPropertyDescriptor(response, 'month')) {
            const month = (response as any).month;
            this.startDate = month.start;
            this.endDate = month.end;
            this.debugService.log('Monthly', `Found month object directly on response: ${this.startDate} - ${this.endDate}`);
          } else if ((response as any).month) {
            this.startDate = (response as any).month.start;
            this.endDate = (response as any).month.end;
            this.debugService.log('Monthly', `Found month object in API response: ${this.startDate} - ${this.endDate}`);
          } else if ((response as any).__dateRange) {
            this.startDate = (response as any).__dateRange.start;
            this.endDate = (response as any).__dateRange.end;
            this.debugService.log('Monthly', `Using __dateRange property: ${this.startDate} - ${this.endDate}`);
          } else {
            this.startDate = null;
            this.endDate = null;
          }

          this.isLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Monthly', 'Error loading monthly stats:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
  }

  loadXmlChanges(): void {
    this.debugService.log('Monthly', `Loading XML changes - offset: ${this.offset}, team: ${this.teamname}`);
    
    this.xmlLoading = true;
    
    this.statsService.getChanges(this.offset, this.teamname, 'monthly')
      .subscribe({
        next: (data) => {
          this.debugService.log('Monthly', 'XML changes received from API');
          
          if (data && data.changes) {
            const addedUsers = Array.isArray(data.changes.added) 
              ? data.changes.added.map((u: any) => ({...u, category: 'added', isNew: true})) 
              : [];
            const changedUsers = Array.isArray(data.changes.changed) 
              ? data.changes.changed.map((u: any) => ({...u, category: 'changed', wasChanged: true})) 
              : [];
            const leftUsers = Array.isArray(data.changes.left) 
              ? data.changes.left.map((u: any) => ({...u, category: 'left', wasInYesterday: true})) 
              : [];
            
            this.xmlChanges = [...addedUsers, ...changedUsers, ...leftUsers];
            
            this.debugService.log('Monthly', `Processed ${this.xmlChanges.length} XML changes (${addedUsers.length} added, ${changedUsers.length} changed, ${leftUsers.length} left)`);
          }
          
          this.xmlLoading = false;
          this.checkAndMarkContentLoaded();
        },
        error: (error) => {
          this.debugService.error('Monthly', 'Error loading XML changes:', error);
          this.xmlChanges = [];
          this.xmlLoading = false;
        }
      });
  }

  onTablePageChange(event: any): void {
    this.debugService.log('Monthly', 'Table pagination changed:', event);
    this.currentPageIndex = event.pageIndex;
    this.currentPageSize = event.pageSize;
  }

  onSortChange(event: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Monthly', 'Table sort changed:', event);
    
    this.currentSortColumn = event.active;
    this.currentSortDirection = event.direction;
    
    this.updateChartAndButtons(event);
  }

  private handleSortEvent(sortData: {active: string, direction: 'asc' | 'desc'}): void {
    this.debugService.log('Monthly', 'Processing sort event:', sortData);
      
    this.currentSortColumn = sortData.active;
    this.currentSortDirection = sortData.direction;
    
    if (this.chartComponent) {
      this.debugService.log('Monthly', 'Updating chart component with sort info:', sortData);
      this.chartComponent.updateChartWithSort(sortData);
    } else {
      this.debugService.warn('Monthly', 'Chart component reference not available');
    }
  }

  private updateChartAndButtons(sortInfo: {active: string, direction: 'asc' | 'desc'}) {
    this.debugService.log('Monthly', 'updateChartAndButtons called with:', sortInfo);
    
    this.currentSortColumn = sortInfo.active;
    this.currentSortDirection = sortInfo.direction;
    
    if (!this.chartComponent) {
      this.debugService.error('Monthly', 'Chart component not available');
      return;
    }
    
    this.chartComponent.updateChartWithSort(sortInfo);
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

  formatDateString(date: string | null): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
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
