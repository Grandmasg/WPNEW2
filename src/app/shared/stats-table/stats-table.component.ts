import { Component, Input, OnChanges, SimpleChanges, OnInit, AfterViewInit, ViewChild, Output, EventEmitter, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';
import { LocalizationService } from '../services/localization.service';
import { HighlightPipe } from '../pipes/highlight.pipe';
import { StatsService } from '../services/stats.service';
import { MatPaginator } from '@angular/material/paginator';
import { DebugService } from '../services/debug.service';
import { FilterService } from '../services/filter.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslateService } from '../services/translate.service';
import { Subscription } from 'rxjs';
import { PaginationComponent } from '../components/pagination/pagination.component';

export interface StatRecord {
  id: number;
  name: string;
  keys: number;
  clicks: number;
  scrolls: number;
  distance: number;
  download: string;
  upload: string;
  uptime: string;
  pulses: number;
  [key: string]: any;
}

@Component({
  selector: 'app-stats-table',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    NgbPopoverModule,
    HighlightPipe,
    TranslatePipe,
    PaginationComponent
  ],
  providers: [FilterService],
  templateUrl: './stats-table.component.html',
  styleUrls: ['./stats-table.component.scss']
})
export class StatsTableComponent implements OnChanges, OnInit, AfterViewInit, OnDestroy {
  @Input() data: StatRecord[] = [];
  @Input() isLoading = false;
  @Input() hasError = false;
  @Input() viewType: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall' | 'xml' = 'daily';
  @Input() searchTerm = '';
  @Input() currentTheme: 'light' | 'dark' = 'light';
  @Input() xmlData: any[] = [];
  @Input() xmlChanges: any[] = [];

  @Output() pageChange = new EventEmitter<{pageIndex: number, pageSize: number}>();
  @Output() sortChange = new EventEmitter<{active: string, direction: 'asc' | 'desc'}>();

  filteredData: StatRecord[] = [];
  
  page = 1;
  pageSize = 25;
  filteredTotalItems = 0;
  onPaginationChange(event: { pageIndex: number, pageSize: number }): void {
    this.page = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.filteredTotalItems = this.filteredData ? this.filteredData.length : 0;
    this.debugService.log('StatsTable', `Pagination changed - page: ${event.pageIndex}, size: ${event.pageSize}`);
    this.pageChange.emit({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }
  
  sortColumn: string = 'keys';
  sortDirection: 'asc' | 'desc' = 'desc';
  sortDescending: boolean = true;
  
  Math = Math;
  
  totalKeys: number = 0;
  totalClicks: number = 0;
  totalScrolls: number = 0;
  totalDistance: number = 0;
  totalDownload: number = 0;
  totalUpload: number = 0;
  totalUptime: number = 0;
  totalPulses: number = 0;
  
  columnInfo = {
    username: {
      title: 'Username',
      description: 'User account name',
      lastPulse: null as string | null
    },
    pulses: {
      lastPulse: null as string | null
    }
  };

  unitSystem: 'metric' | 'imperial' = 'metric';

  private translationSubscription: Subscription | null = null;

  private readonly LOCAL_STORAGE_PAGE_SIZE_KEY = 'statsItemsPerPage';
  private readonly LOCAL_STORAGE_SORT_COLUMN_KEY = 'statsSortColumn';
  private readonly LOCAL_STORAGE_SORT_DIRECTION_KEY = 'statsSortDirection';
  private readonly LOCAL_STORAGE_SEARCH_TERM_KEY = 'statsSearchTerm';
  private readonly LOCAL_STORAGE_VIEW_TYPE_KEY = 'statsViewType';

  constructor(
    private localizationService: LocalizationService,
    private statsService: StatsService,
    private debugService: DebugService,
    private filterService: FilterService,
    private translateService: TranslateService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Restore pageSize from localStorage if available
    const savedPageSize = localStorage.getItem(this.LOCAL_STORAGE_PAGE_SIZE_KEY);
    if (savedPageSize && !isNaN(+savedPageSize)) {
      this.pageSize = +savedPageSize;
    }
    // Restore sort column
    const savedSortColumn = localStorage.getItem(this.LOCAL_STORAGE_SORT_COLUMN_KEY);
    if (savedSortColumn) {
      this.sortColumn = savedSortColumn;
    }
    // Restore sort direction
    const savedSortDirection = localStorage.getItem(this.LOCAL_STORAGE_SORT_DIRECTION_KEY);
    if (savedSortDirection === 'asc' || savedSortDirection === 'desc') {
      this.sortDirection = savedSortDirection;
      this.sortDescending = this.sortDirection === 'desc';
    }
    // Restore search term
    const savedSearchTerm = localStorage.getItem(this.LOCAL_STORAGE_SEARCH_TERM_KEY);
    if (savedSearchTerm !== null) {
      this.searchTerm = savedSearchTerm;
    }
    // Restore view type
    const savedViewType = localStorage.getItem(this.LOCAL_STORAGE_VIEW_TYPE_KEY);
    if (savedViewType) {
      this.viewType = savedViewType as any;
    }

    this.debugService.log('StatsTable', 'Component initialized', {
      viewType: this.viewType,
      dataRows: this.data?.length
    });

    this.localizationService.unitSystem$.subscribe(system => {
      this.unitSystem = system;
      this.updateFormattedValues();
    });
    
    this.sortColumn = 'keys';
    this.sortDirection = 'desc';
    this.sortDescending = true;

    this.translationSubscription = this.translateService.translationsChanged$.subscribe(() => {
      this.debugService.log('StatsTable', 'Language changed, updating translations');
      this.updateColumnTranslations();
      setTimeout(() => {
        this.updatePopoverTranslations();
      }, 0);
    });

    this.updateColumnTranslations();
  }

  ngOnDestroy(): void {
    if (this.translationSubscription) {
      this.translationSubscription.unsubscribe();
    }

    // Remove the event listener when the component is destroyed
    document.removeEventListener('stats-table-pagination', this.handleExternalPaginationEvent.bind(this));
  }

  ngOnChanges(changes: SimpleChanges) {
    let needsReFilter = false;
    let needsResort = false;

    if (changes['data']) {
      this.debugService.log('StatsTable', `Data changed - ${this.data?.length || 0} items received, current searchTerm: "${this.searchTerm}"`);
      this.normalizeDataProperties(); // Normalize new data
      needsReFilter = true;
      
      // Reset sort if data changes and current sort is not the default 'keys'
      // This was the original logic, keeping it specific to data changes.
      if (this.sortColumn !== 'keys') {
        this.debugService.log('StatsTable', `Data changed, resetting sort to keys/desc.`);
        this.sortColumn = 'keys';
        this.sortDirection = 'desc';
        this.sortDescending = true;
        // No need to set needsResort = true here, as applySorting will be called if needsReFilter is true.
      }
    }

    if (changes['searchTerm']) {
      // This block executes if searchTerm changes, even if data doesn't.
      // Or if both change, this is also true.
      this.debugService.log('StatsTable', `SearchTerm changed to: "${this.searchTerm}", current data length: ${this.data?.length || 0}`);
      needsReFilter = true;
    }

    if (needsReFilter) {
      this.debugService.log('StatsTable', `Re-filtering data. Full data length: ${this.data?.length || 0}, searchTerm: "${this.searchTerm}"`);
      // this.data here is the @Input() data, which should be the full dataset from the parent.
      this.filteredData = this.applyFilter(this.data, this.searchTerm);
      this.debugService.log('StatsTable', `Filtered data length: ${this.filteredData?.length || 0}`);
      needsResort = true; 
    }
    
    // Apply sorting if data was re-filtered or if sort parameters changed (handled by sort() method)
    if (needsResort) { 
      this.debugService.log('StatsTable', `Applying sorting. Current sort: ${this.sortColumn} ${this.sortDirection}`);
      this.applySorting(); // Sorts this.filteredData
    }
    
    // Always recalculate totals if data or search term changed, affecting filteredData
    if (needsReFilter) { // If filteredData changed, totals need recalculation
      this.debugService.log('StatsTable', `Recalculating totals.`);
      this.calculateTotals(); // Calculates totals from this.filteredData
      this.filteredTotalItems = this.filteredData ? this.filteredData.length : 0;
    }

    if (changes['currentTheme']) {
      this.debugService.log('StatsTable', `Theme changed to ${this.currentTheme}`);
    }
  }

  normalizeDataProperties(): void {
    if (!this.data || !Array.isArray(this.data) || this.data.length === 0) {
      return;
    }
    
    this.data.forEach(row => {
      if (row['StatsKeys'] !== undefined) {
        row.keys = row['StatsKeys'];
      }
      
      if (row['StatsClicks'] !== undefined) {
        row.clicks = row['StatsClicks'];
      }
      
      if (row['StatsScrolls'] !== undefined) {
        row.scrolls = row['StatsScrolls'];
      }
      
      if (row['StatsDistance'] !== undefined) {
        row.distance = row['StatsDistance'];
      }
      
      if (row['StatsPulses'] !== undefined) {
        row.pulses = Number(row['StatsPulses']);
      } else {
        row.pulses = 0;
      }
      
      if (row['StatsDownloadMB'] !== undefined) {
        row.download = row['StatsDownloadMB'];
      }
      
      if (row['StatsUploadMB'] !== undefined) {
        row.upload = row['StatsUploadMB'];
      }
      
      if (row['StatsUptimeSeconds'] !== undefined) {
        row.uptime = row['StatsUptimeSeconds'];
      }
      
      if (row['LastPulse'] !== undefined) {
        row['lastPulse'] = row['LastPulse'];
      }
      
      if (row['Team'] !== undefined) {
        row['team'] = row['Team'];
      }
      
      // Username normalisatie: alleen 'Username' gebruiken, geen fallback naar UsernameFull
      if (row['Username'] !== undefined && row['Username'] !== null && String(row['Username']).trim() !== '') {
        row['username'] = String(row['Username']);
      } else if (row['username'] === undefined) {
        row['username'] = '';
      }
    });
  }

  updateFormattedValues(): void {
    this.calculateTotals();
  }

  formatNumber(value: number): string {
    return this.localizationService.formatNumber(value);
  }
  
  formatDecimal(value: number): string {
    return this.localizationService.formatDecimal(value);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
  }

  formatTime(seconds: string | number): string {
    const secondsNum = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    
    const hrs = Math.floor(secondsNum / 3600);
    const mins = Math.floor((secondsNum % 3600) / 60);
    const secs = Math.floor(secondsNum % 60);

    return [hrs, mins, secs]
      .map(val => val.toString().padStart(2, '0'))
      .join(':');
  }
  
  formatDistance(value: number): string {
    return this.localizationService.formatTableDistance(value);
  }
  
  getRawDistance(miles: number): number {
    return this.localizationService.getRawDistance(miles);
  }
  
  get totalItems(): number {
    return this.filteredData.length;
  }
  
  get paginatedData(): StatRecord[] {
    const startItem = (this.page - 1) * this.pageSize;
    const endItem = this.page * this.pageSize;
    return this.filteredData.slice(startItem, endItem);
  }

  sort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortDirection = 'desc';
      this.sortColumn = column;
    }
    
    this.sortDescending = this.sortDirection === 'desc';
    
    this.updateSortIndicators();
    
    this.applySorting();
    
    const sortEvent = {
      active: column,
      direction: this.sortDirection
    };
    
    this.sortChange.emit(sortEvent);
    
    this.dispatchEnhancedSortEvent(sortEvent);
    
    document.dispatchEvent(new CustomEvent('stats-table-sort-change', {
      detail: sortEvent,
      bubbles: true
    }));

    // Also broadcast a metric change so chart can follow table metric one-way
    const metric = this.mapSortColumnToMetric(column);
    if (metric) {
      document.dispatchEvent(new CustomEvent('stats-table-metric-change', {
        detail: { metric, direction: this.sortDirection },
        bubbles: true
      }));
    }

    this.debugService.log('StatsTable', `Sort triggered on column: ${column}, direction: ${this.sortDirection}`);
    
    try {
      sessionStorage.setItem('lastSortEvent', JSON.stringify({
        column: column,
        direction: this.sortDirection,
        timestamp: Date.now(),
        source: 'stats-table-header-click'
      }));
    } catch (e) {
    }

    // Save sort column and direction to localStorage when sorting
    localStorage.setItem(this.LOCAL_STORAGE_SORT_COLUMN_KEY, this.sortColumn);
    localStorage.setItem(this.LOCAL_STORAGE_SORT_DIRECTION_KEY, this.sortDirection);
  }

  private dispatchEnhancedSortEvent(sortEvent: {active: string, direction: 'asc' | 'desc'}): void {
    try {
      const sessionData = {
        column: sortEvent.active,
        direction: sortEvent.direction,
        timestamp: Date.now(),
        source: 'stats-table-header-click'
      };
      
      sessionStorage.setItem('lastSortEvent', JSON.stringify(sessionData));
      
      document.dispatchEvent(new CustomEvent('stats-table-explicit-sort', {
        bubbles: true,
        detail: sortEvent
      }));
      
      setTimeout(() => {
        const headers = document.querySelectorAll('th.sortable');
        headers.forEach(header => {
          header.setAttribute('data-sort-active', 
            header.getAttribute('data-column') === sortEvent.active ? 'true' : 'false');
          
          if (header.getAttribute('data-column') === sortEvent.active) {
            header.setAttribute('data-sort-direction', sortEvent.direction);
          }
        });
        
        const table = document.querySelector('table.stats-table');
        if (table) {
          table.setAttribute('data-sort-column', sortEvent.active);
          table.setAttribute('data-sort-direction', sortEvent.direction);
        }
      }, 0);
    } catch (e) {
      console.error('[SORT DEBUG] Error in dispatchEnhancedSortEvent:', e);
    }
  }

  // Map table column to a simple metric id the chart understands
  private mapSortColumnToMetric(column: string): string | null {
    switch ((column || '').toLowerCase()) {
      case 'keys': return 'StatsKeys';
      case 'clicks': return 'StatsClicks';
      case 'scrolls': return 'StatsScrolls';
      case 'distance': return 'StatsDistance';
      case 'download': return 'StatsDownloadMB';
      case 'upload': return 'StatsUploadMB';
      case 'uptime': return 'StatsUptimeSeconds';
      case 'pulses': return 'StatsPulses';
      default: return null;
    }
  }

  private sortData(sortColumn?: string): void {
    const column = sortColumn || this.sortColumn;
    
    if (!column || !this.data || !Array.isArray(this.data)) {
      return;
    }
    
    this.debugService.log('StatsTable', `Sorting data by column: ${column}, direction: ${this.sortDirection}`);
    
    this.data.sort((a, b) => {
      const valueA = this.getSortValue(a, column);
      const valueB = this.getSortValue(b, column);
      
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const result = valueA.localeCompare(valueB);
        return this.sortDirection === 'asc' ? result : -result;
      }
      
      return this.sortDirection === 'asc' 
        ? (valueA as number) - (valueB as number)
        : (valueB as number) - (valueA as number);
    });
  }

  private getSortValue(item: any, column: string): any {
    if (!item) return null;
    
    switch (column) {
      case 'username':
        return (item.username || item.Username || item.UsernameFull || '').toLowerCase();
      case 'rank':
        return Number(item.rank || item.Rank || 0);
      case 'keys':
        return Number(item.keys || item.StatsKeys || item.Keys1 || 0);
      case 'clicks':
        return Number(item.clicks || item.StatsClicks || item.Clicks || 0);
      case 'scrolls':
        return Number(item.scrolls || item.StatsScrolls || item.Scrolls || 0);
      case 'distance':
        return Number(item.distance || item.StatsDistance || item.Distance || 0);
      case 'download':
        return Number(item.download || item.StatsDownloadMB || item.DownloadMB || 0);
      case 'upload':
        return Number(item.upload || item.StatsUploadMB || item.UploadMB || 0);
      case 'uptime':
        return Number(item.uptime || item.StatsUptimeSeconds || item.UptimeSeconds || 0);
      case 'pulses':
        return Number(item.pulses || item.StatsPulses || item.Pulses || 0);
      default:
        return item[column] || 0;
    }
  }

  applySorting(): void {
    if (!this.sortColumn) return;
    
    this.filteredData = [...this.filteredData].sort((a, b) => {
      let valueA, valueB;
      
      if (this.viewType === 'xml' || this.viewType === 'daily') {
        switch (this.sortColumn) {
          case 'keys':
            valueA = a['StatsKeys'] !== undefined ? a['StatsKeys'] : a.keys;
            valueB = b['StatsKeys'] !== undefined ? b['StatsKeys'] : b.keys;
            break;
          case 'clicks':
            valueA = a['StatsClicks'] !== undefined ? a['StatsClicks'] : a.clicks;
            valueB = b['StatsClicks'] !== undefined ? b['StatsClicks'] : b.clicks;
            break;
          case 'scrolls':
            valueA = a['StatsScrolls'] !== undefined ? a['StatsScrolls'] : a.scrolls;
            valueB = b['StatsScrolls'] !== undefined ? b['StatsScrolls'] : b.scrolls;
            break;
          case 'distance':
            valueA = a['StatsDistance'] !== undefined ? a['StatsDistance'] : a.distance;
            valueB = b['StatsDistance'] !== undefined ? b['StatsDistance'] : b.distance;
            break;
          case 'download':
            valueA = a['StatsDownloadMB'] !== undefined ? a['StatsDownloadMB'] : a.download;
            valueB = b['StatsDownloadMB'] !== undefined ? b['StatsDownloadMB'] : b.download;
            break;
          case 'upload':
            valueA = a['StatsUploadMB'] !== undefined ? a['StatsUploadMB'] : a.upload;
            valueB = b['StatsUploadMB'] !== undefined ? b['StatsUploadMB'] : b.upload;
            break;
          case 'uptime':
            valueA = a['StatsUptimeSeconds'] !== undefined ? a['StatsUptimeSeconds'] : a.uptime;
            valueB = b['StatsUptimeSeconds'] !== undefined ? b['StatsUptimeSeconds'] : b.uptime;
            break;
          case 'pulses':
            valueA = a['StatsPulses'] !== undefined ? Number(a['StatsPulses']) : 0;
            valueB = b['StatsPulses'] !== undefined ? Number(b['StatsPulses']) : 0;
            break;
          default:
            valueA = a[this.sortColumn];
            valueB = b[this.sortColumn];
        }
      }
      else {
        valueA = a[this.sortColumn];
        valueB = b[this.sortColumn];
      }
      
      if (typeof valueA === 'string') {
        valueA = valueA.toLowerCase();
      }
      if (typeof valueB === 'string') {
        valueB = valueB.toLowerCase();
      }
      
      if (valueA === null || valueA === undefined) return this.sortDescending ? -1 : 1;
      if (valueB === null || valueB === undefined) return this.sortDescending ? 1 : -1;
      
      if (valueA < valueB) return this.sortDescending ? 1 : -1;
      if (valueA > valueB) return this.sortDescending ? -1 : 1;
      return 0;
    });
    
    this.debugService.log('StatsTable', `Applied sorting - column: ${this.sortColumn}, direction: ${this.sortDirection}`);
    
    this.updatePagination();
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
  }

  private applyFilter(data: any[], searchTerm: string): any[] {
    if (!data || !Array.isArray(data)) {
      return [];
    }
    
    if (!searchTerm || searchTerm.trim() === '') {
      return data;
    }
    
    // Simple direct filtering like in chart component
    const searchLower = searchTerm.toLowerCase().trim();
    
    const filtered = data.filter(item => {
      const username = (item['Username'] || item.username || '');
      const usernameStr = (typeof username === 'string' ? username : String(username)).toLowerCase();
      return usernameStr.includes(searchLower);
    });
    
    if (searchTerm) {
      const filterEvent = new CustomEvent('filter-text-changed', {
        detail: { searchTerm: searchTerm }
      });
      document.dispatchEvent(filterEvent);
    }
    
    return filtered;
  }
  
  private calculateTotals(): void {
    this.totalKeys = 0;
    this.totalClicks = 0;
    this.totalScrolls = 0;
    this.totalDistance = 0;
    this.totalDownload = 0;
    this.totalUpload = 0;
    this.totalUptime = 0;
    this.totalPulses = 0;

    this.filteredData.forEach(row => {
      this.totalKeys += +row.keys || 0;
      this.totalClicks += +row.clicks || 0;
      this.totalScrolls += +row.scrolls || 0;
      this.totalDistance += +row.distance || 0;
      
      this.totalDownload += (+row.download || 0) * 1024 * 1024;
      this.totalUpload += (+row.upload || 0) * 1024 * 1024;
      
      this.totalUptime += +row.uptime || 0;
      this.totalPulses += +row.pulses || 0;
    });
  }

  updateComparisonData(yesterdayData: StatRecord[]): void {
    if (!yesterdayData || !this.data) return;
    
    const yesterdayMap = new Map<string, StatRecord>();
    yesterdayData.forEach(record => {
      yesterdayMap.set(record['username'], record);
    });
    
    this.data.forEach(record => {
      if (record['lastPulse']) {
        this.columnInfo.username.lastPulse = new Date(record['lastPulse']).toLocaleString();
        this.columnInfo.pulses.lastPulse = new Date(record['lastPulse']).toLocaleString();
      }
    });
  }

  getYesterdayValue(username: string, field: string): number | null {
    const yesterdayData = this.getYesterdayDataForUser(username);
    return yesterdayData ? yesterdayData[field] : null;
  }

  getYesterdayDataForUser(username: string): StatRecord | null {
    return null;
  }

  getRankForValue(row: StatRecord, field: string): number {
    const sortedData = [...this.filteredData].sort((a, b) => b[field] - a[field]);
    
    const index = sortedData.findIndex(item => item['username'] === row['username']);
    return index !== -1 ? index + 1 : 0;
  }

  updatePagination(): void {
    const totalPages = Math.ceil(this.filteredData.length / this.pageSize);
    const oldPage = this.page;
    this.page = Math.min(this.page, totalPages || 1);
    
    if (oldPage !== this.page) {
      this.pageChange.emit({
        pageIndex: this.page - 1,
        pageSize: this.pageSize
      });
    }
  }

  usernamePopover: string = '';

  getTimePeriodLabels(): {current: string, previous: string} {
    switch(this.viewType) {
      case 'daily':
        return { 
          current: this.translateService.translate('period.today'), 
          previous: this.translateService.translate('period.yesterday') 
        };
      case 'weekly':
        return { 
          current: this.translateService.translate('period.thisWeek'), 
          previous: this.translateService.translate('period.lastWeek') 
        };
      case 'monthly':
        return { 
          current: this.translateService.translate('period.thisMonth'), 
          previous: this.translateService.translate('period.lastMonth') 
        };
      case 'yearly':
        return { 
          current: this.translateService.translate('period.thisYear'), 
          previous: this.translateService.translate('period.lastYear') 
        };
      default:
        return { 
          current: this.translateService.translate('period.current'), 
          previous: this.translateService.translate('period.previous') 
        };
    }
  }

  getUsernamePopover(row: any): string {
    const labels = this.getTimePeriodLabels();
    return `
      <div>
        <p>${this.translateService.translate('popovers.userDetails')}</p>
        <p><strong>${this.translateService.translate('stats.username')}:</strong> ${row.username || this.translateService.translate('common.notAvailable')}</p>
        ${row.lastPulse ? `<p><strong>${this.translateService.translate('popovers.lastActivity')}:</strong> ${new Date(row.lastPulse).toLocaleString()}</p>` : ''}
        ${row.team ? `<p><strong>${this.translateService.translate('common.team')}:</strong> ${row.team}</p>` : ''}
        <p><strong>${this.translateService.translate('common.period')}:</strong> ${labels.current}</p>
      </div>
    `;
  }

  getDownloadPopover(row: any): string {
    const yesterday = this.getYesterdayValue(row.username, 'download');
    const labels = this.getTimePeriodLabels();
    
    const html = `
      <div>
        <p>${this.translateService.translate('popovers.downloadVolume')}</p>
        <p class="mb-0"><strong>${labels.current}:</strong> ${this.formatBytes(row.download)}</p>
        ${yesterday !== null && this.viewType !== 'xml' ? `<p class="mb-0"><strong>${labels.previous}:</strong> ${this.formatBytes(yesterday)}</p>` : ''}
        <p><strong>${this.translateService.translate('stats.rank')}:</strong> #${this.getRankForValue(row, 'download')}</p>
      </div>
    `;
    return html;
  }

  getUploadPopover(row: any): string {
    const yesterday = this.getYesterdayValue(row.username, 'upload');
    const labels = this.getTimePeriodLabels();
    
    const html = `
      <div>
        <p>${this.translateService.translate('popovers.uploadVolume')}</p>
        <p class="mb-0"><strong>${labels.current}:</strong> ${this.formatBytes(row.upload)}</p>
        ${yesterday !== null && this.viewType !== 'xml' ? `<p class="mb-0"><strong>${labels.previous}:</strong> ${this.formatBytes(yesterday)}</p>` : ''}
        <p><strong>${this.translateService.translate('stats.rank')}:</strong> #${this.getRankForValue(row, 'upload')}</p>
      </div>
    `;
    return html;
  }

  getUptimePopover(row: any): string {
    const yesterday = this.getYesterdayValue(row.username, 'uptime');
    const labels = this.getTimePeriodLabels();
    
    const html = `
      <div>
        <p>${this.translateService.translate('popovers.uptime')}</p>
        <p class="mb-0"><strong>${labels.current}:</strong> ${this.formatTime(row.uptime)}</p>
        ${yesterday !== null && this.viewType !== 'xml' ? `<p class="mb-0"><strong>${labels.previous}:</strong> ${this.formatTime(yesterday)}</p>` : ''}
        <p><strong>${this.translateService.translate('stats.rank')}:</strong> #${this.getRankForValue(row, 'uptime')}</p>
      </div>
    `;
    return html;
  }

  getPulsesPopover(row: any): string {
    const yesterday = this.getYesterdayValue(row.username, 'pulses');
    const change = yesterday !== null ? row.pulses - yesterday : null;
    const labels = this.getTimePeriodLabels();
    
    const html = `
      <div>
        <p>${this.translateService.translate('popovers.pulses')}</p>
        <p class="mb-0"><strong>${labels.current}:</strong> ${this.formatNumber(row.pulses)}</p>
        ${yesterday !== null && this.viewType !== 'xml' ? `<p class="mb-0"><strong>${labels.previous}:</strong> ${this.formatNumber(yesterday)}</p>` : ''}
        ${change !== null && this.viewType !== 'xml' ? `<p class="${change > 0 ? 'text-success' : change < 0 ? 'text-danger' : ''}">
          <strong>${this.translateService.translate('popovers.change')}:</strong> ${change > 0 ? '+' : ''}${this.formatNumber(change)}
        </p>` : ''}
        ${row.lastPulse ? `<p><strong>${this.translateService.translate('popovers.lastPulse')}:</strong> ${new Date(row.lastPulse).toLocaleString()}</p>` : ''}
        <p><strong>${this.translateService.translate('stats.rank')}:</strong> #${this.getRankForValue(row, 'pulses')}</p>
      </div>
    `;
    return html;
  }

  isRecentlyActive(row: any): boolean {
    if (!row.LastPulse && !row.lastPulse) return false;
    
    const pulseTime = new Date(row.LastPulse || row.lastPulse).getTime();
    const now = new Date().getTime();
    
    return now - pulseTime < 300000;
  }

  onUsernameClick(user: any): void {
    const userId = user.UserID || user.id;
    const profileUrl = userId ? `https://whatpulse.org/stats/users/${userId}/` : null;
    
    if (profileUrl) {
      // Open WhatPulse profile directly in a popup window
      const popup = window.open(
        profileUrl,
        'whatpulse_profile',
        'width=1200,height=800,scrollbars=yes,resizable=yes,toolbar=yes,location=yes,menubar=no,status=yes'
      );
      
      if (popup) {
        popup.focus();
        this.debugService.log('StatsTable', `Opened profile popup for user: ${user.username || 'Unknown'}`);
      } else {
        // Popup was blocked - show fallback message
        this.showPopupBlockedMessage(profileUrl, user.username || 'Unknown');
      }
    } else {
      // No user ID available
      this.debugService.warn('StatsTable', `No user ID available for: ${user.username || 'Unknown'}`);
      alert(`Profile not available for user: ${user.username || 'Unknown'}`);
    }
  }

  private showPopupBlockedMessage(profileUrl: string, username: string): void {
    const message = `
Popup was blocked by your browser.

To view ${username}'s profile, you can:
1. Allow popups for this site and try again
2. Copy this URL and open it manually: ${profileUrl}

Would you like to copy the URL to your clipboard?`;

    if (confirm(message)) {
      // Copy URL to clipboard
      navigator.clipboard.writeText(profileUrl).then(() => {
        alert('Profile URL copied to clipboard!');
      }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = profileUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Profile URL copied to clipboard!');
      });
    }
  }

  @ViewChild(MatPaginator) public paginator!: MatPaginator;

  ngAfterViewInit(): void {
    if (this.paginator) {
      this.paginator.page.subscribe(event => {
        this.page = event.pageIndex + 1;
        this.pageSize = event.pageSize;
        this.updatePagination();

        this.debugService.log('StatsTable', `Pagination changed - page: ${event.pageIndex}, size: ${event.pageSize}`);
        this.debugService.log('StatsTable', 'Emitting pageChange event');
        
        this.pageChange.emit({
          pageIndex: event.pageIndex,
          pageSize: event.pageSize
        });
      });
    }

    // Add an event listener to listen for pagination events from other components
    document.addEventListener('stats-table-pagination', this.handleExternalPaginationEvent.bind(this));
  }

  private logPaginationChange(pageIndex: number, pageSize: number): void {
    this.debugService.log('StatsTable', `Pagination changed - page: ${pageIndex}, size: ${pageSize}`);
    this.debugService.log('StatsTable', `Emitting pageChange event`);
  }

  onPageChange(page: number): void {
    const y = window.scrollY;
    this.page = page;
    this.updatePagination();
    // Restore scroll after change detection
    setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), 0);

    const pageIndex = page - 1;
    
    this.logPaginationChange(pageIndex, this.pageSize);
    
    const pageEvent = {
      pageIndex: pageIndex,
      pageSize: this.pageSize
    };
    
    this.pageChange.emit(pageEvent);
    
    document.dispatchEvent(new CustomEvent('stats-table-pagination', {
      detail: pageEvent
    }));
  }

  setPagination(pageIndex: number, pageSize: number): void {
    if (this.page !== pageIndex + 1 || this.pageSize !== pageSize) {
      const oldPage = this.page;
      const oldSize = this.pageSize;
      
      this.page = pageIndex + 1;
      this.pageSize = pageSize;
      this.updatePagination();
      
      this.debugService.log('StatsTable', `setPagination called - changed from page ${oldPage} size ${oldSize} to page ${this.page} size ${this.pageSize}`);
      this.logPaginationChange(pageIndex, pageSize);
      
      setTimeout(() => {
        const event = new CustomEvent('paginationChange', { 
          detail: { pageIndex, pageSize } 
        });
        document.dispatchEvent(event);
      }, 0);
    } else {
      this.debugService.log('StatsTable', `setPagination called but no change needed - already at page ${this.page} size ${this.pageSize}`);
    }
  }

  onPageSizeChange(pageSize: number): void {
    this.debugService.log('StatsTable', `Page size changed from ${this.pageSize} to ${pageSize}`);
    const y = window.scrollY;
    const oldPageSize = this.pageSize;
    
    this.pageSize = pageSize;
    
    const firstItemIndex = (this.page - 1) * oldPageSize;
    this.page = Math.floor(firstItemIndex / pageSize) + 1;
    
    this.updatePagination();
    // Restore scroll after change detection
    setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), 0);
    
    // Save new pageSize to localStorage
    localStorage.setItem(this.LOCAL_STORAGE_PAGE_SIZE_KEY, String(pageSize));
    
    const pageEvent = {
      pageIndex: this.page - 1,
      pageSize: this.pageSize
    };
    
    this.pageChange.emit(pageEvent);
    
    document.dispatchEvent(new CustomEvent('stats-table-pagination', {
      detail: pageEvent
    }));
  }

  private updateSortIndicators(): void {
    setTimeout(() => {
      try {
        const headers = document.querySelectorAll('th.sortable');
        headers.forEach(header => {
          const icons = header.querySelectorAll('i.fa-solid');
          icons.forEach(icon => {
            const iconElement = icon as HTMLElement;
            iconElement.classList.remove('fa-sort-up', 'fa-sort-down');
            iconElement.classList.add('fa-sort');
          });
        });
        
        const activeHeader = document.querySelector(`th[data-column="${this.sortColumn}"]`);
        if (activeHeader) {
          const icon = activeHeader.querySelector('i.fa-solid');
          if (icon) {
            icon.classList.remove('fa-sort');
            if (this.sortDirection === 'asc') {
              icon.classList.add('fa-sort-up');
            } else {
              icon.classList.add('fa-sort-down');
            }
          }
        }
      } catch (err) {
        console.warn('Error updating sort indicators:', err);
      }
    }, 10);
  }

  getColumnLabel(column: string): string {
    const translationKey = `stats.${column}`;
    return this.translateService.translate(translationKey);
  }

  private updateColumnTranslations(): void {
    this.columnInfo = {
      username: {
        title: this.translateService.translate('stats.username'),
        description: this.translateService.translate('stats.usernameDescription'),
        lastPulse: this.columnInfo.username.lastPulse
      },
      pulses: {
        lastPulse: this.columnInfo.pulses.lastPulse
      }
    };
  }

  private updatePopoverTranslations(): void {
  }

  // Add a handler for external pagination events
  private handleExternalPaginationEvent(event: Event): void {
    const customEvent = event as CustomEvent;
    if (customEvent?.detail) {
      const y = window.scrollY;
      const newPageIndex = customEvent.detail.pageIndex;
      const newPageSize = customEvent.detail.pageSize;
      
      // Only update if different from current state to avoid loops
      if (this.page !== newPageIndex + 1 || this.pageSize !== newPageSize) {
        this.debugService.log('StatsTable', `External pagination event received: pageIndex=${newPageIndex}, pageSize=${newPageSize}`);
        
        // Update pagination component
        this.page = newPageIndex + 1;
        this.pageSize = newPageSize;
        
        // Update the paginator if it exists
        if (this.paginator) {
          this.paginator.pageIndex = newPageIndex;
          this.paginator.pageSize = newPageSize;
        }
        
        // Apply new pagination
        this.updatePagination();
        
        // Trigger change detection
        this.changeDetectorRef.detectChanges();

        // Restore scroll after sync
        setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), 0);
      }
    }
  }

  fullData: StatRecord[] = [];

  tablePageIndex: number = 0;

  private _badgeDebugLogged = false;
  private addedUserIds: Set<number> = new Set();

  /**
   * Determines the badge type for a user based on xmlChanges
   * Shows badges for users in "Toegevoegde gebruikers" section (added category only, NOT changed)
   * @param row The user data row
   * @returns 'new-member' for new team members (no team badge yet)
   *          'new-pulse' for existing members joining team (has team badge)
   *          null if not in added users list
   */
  getBadgeType(row: any): 'new-member' | 'new-pulse' | null {
    // Build added users ID set from xmlChanges on first call
    if (!this._badgeDebugLogged && this.xmlChanges && this.xmlChanges.length > 0) {
      // Only look at 'added' category - these are shown in "Toegevoegde gebruikers" section
      const addedUsers = this.xmlChanges.filter((change: any) => change.category === 'added');
      
      addedUsers.forEach((user: any) => {
        if (user.UserID) {
          this.addedUserIds.add(Number(user.UserID));
        }
      });
      
      this.debugService.log('BadgeType', `Found ${this.addedUserIds.size} added user IDs:`, Array.from(this.addedUserIds));
      this.debugService.log('BadgeType', 'All xmlChanges categories:', this.xmlChanges.map(c => ({ id: c.UserID, cat: c.category, name: c.Username || c.username })));
      this._badgeDebugLogged = true;
    }
    
    // Check if this user's ID is in the added users list
    const userId = row['UserID'] || row['userid'] || row['id'];
    if (!userId || !this.addedUserIds.has(Number(userId))) {
      return null; // Not in added users list
    }
    
    // User is in added users - check if they have a team badge
    const hasTeam = (row['team'] || row['Team']) !== undefined && 
                    (row['team'] || row['Team']) !== null && 
                    String(row['team'] || row['Team']).trim() !== '' &&
                    String(row['team'] || row['Team']).trim() !== '-';
    
    this.debugService.log('BadgeType', `User ${row['username']} (ID: ${userId}): hasTeam=${hasTeam}, team="${row['team'] || row['Team']}"`);
    
    if (hasTeam) {
      return 'new-pulse'; // Existing member with new pulse (blue badge)
    } else {
      return 'new-member'; // New team member (green badge)
    }
  }
}
