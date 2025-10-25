import { Component, Input, OnInit, OnChanges, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslatePipe } from '../pipes/translate.pipe';
import * as Highcharts from 'highcharts';
import { HighchartsChartComponent } from 'highcharts-angular';
import { PaginationComponent } from '../components/pagination/pagination.component';
import { ApiService } from '../services/api.service'; // Use existing ApiService instead of GraphService
import { TranslateService } from '../services/translate.service';
import { Subscription } from 'rxjs';
import { LocalizationService } from '../services/localization.service';
import { DebugService } from '../services/debug.service';

// Define type for chart types
type ChartType = 'column' | 'bar' | 'line' | 'pie' | 'area' | 'spline';

@Component({
  selector: 'app-highcharts-graph',
  standalone: true,
  imports: [CommonModule, HighchartsChartComponent, NgbDropdownModule, TranslatePipe, PaginationComponent, FormsModule],
  templateUrl: './highcharts-graph.component.html',
  styleUrls: ['./highcharts-graph.component.scss']
})
export class HighchartsGraphComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() period: string = 'daily';
  @Input() offset: string = '0';
  @Input() team: string = '-';
  @Input() currentTheme: 'dark' | 'light' = 'dark';
  @Input() tablePageIndex: number = 0;
  @Input() tablePageSize: number = 25;
  @Input() totalItems: number = 0;
  @Input() searchTerm: string = '';
  @Input() skipAutoLoad: boolean = false;
  @Input() defaultMetric: string = '';
  @Input() xmlData: any[] = []; // <-- Added xmlData input property
  @Input() sortInfo: { active: string, direction: 'asc' | 'desc' } = { active: 'keys', direction: 'desc' }; // <-- Added sortInfo input property
  @Input() statsData: any[] = []; // <-- Added statsData input property
  @Input() honorTableMetric: boolean = false; // Allow metric buttons by default; table sort can still influence metric

  private readonly LOCAL_STORAGE_PAGE_SIZE_KEY = 'statsItemsPerPage';
  private translationSubscription?: Subscription;
  private unitSubscription?: Subscription;
  
  // Track previous values to detect real changes
  private previousPeriod?: string;
  private previousOffset?: string;
  private previousTeam?: string;
  private previousSearchTerm?: string;
  
  // Track the last loaded parameters to prevent duplicate requests
  private lastLoadedParams?: string;
  
  private tableMetricListener = (e: Event) => {
    const ce = e as CustomEvent<{ metric: string; direction: 'asc' | 'desc' }>;
    if (!ce?.detail) return;
    if (this.honorTableMetric && ce.detail.metric) {
      this.chartMetric = ce.detail.metric;
      this.safeUpdateChart();
    }
  };
  chartOptions: Highcharts.Options = { chart: { type: 'column' }, title: { text: '' }, series: [], credits: { enabled: false } };
  updateFlag = false;
  chartType: ChartType = 'column';
  chartMetric: string = 'StatsKeys';
  displayMetric: string = 'Keys';
  filteredTotalItems: number = 0; // Track filtered total for pagination
  availableMetrics = [
    { value: 'StatsKeys', label: 'chart.keys' },
    { value: 'StatsClicks', label: 'chart.clicks' },
    { value: 'StatsScrolls', label: 'chart.scrolls' },
    { value: 'StatsDistance', label: 'chart.distance' },
    { value: 'StatsDownloadMB', label: 'chart.download' },
    { value: 'StatsUploadMB', label: 'chart.upload' },
    { value: 'StatsUptimeSeconds', label: 'chart.uptime' },
    { value: 'StatsPulses', label: 'chart.pulses' }
  ];
  chartHeight: number = 400;
  chartHeightOptions: number[] = [400, 600, 800];
  fullData: any[] = [];
  isLoading = false;
  chartTypes = [
    { value: 'column', label: 'chart.column' },
    { value: 'bar', label: 'chart.bar' },
    { value: 'line', label: 'chart.line' }
  ]; // <-- Added chartTypes property

  constructor(
    private apiService: ApiService, 
    private translateService: TranslateService, 
    private localizationService: LocalizationService,
    private debugService: DebugService
  ) {}

  ngOnInit(): void {
    this.setDefaultMetric();
    this.applyThemeToHighcharts();
    this.initEmptyChart();
    
    // Subscribe to language changes to update chart translations
    this.translationSubscription = this.translateService.translationsChanged$.subscribe(() => {

      this.safeUpdateChart();
    });
    // Subscribe to unit system changes so distance axis/tooltip update when switching language/units
    this.unitSubscription = this.localizationService.unitSystem$.subscribe(() => {
      this.safeUpdateChart();
    });
    
    // Synchroniseer pageSize met stats-table
    const savedPageSize = localStorage.getItem(this.LOCAL_STORAGE_PAGE_SIZE_KEY);
    if (savedPageSize && !isNaN(+savedPageSize)) {
      this.tablePageSize = +savedPageSize;
    }
    
    // Use loadGraphData() instead of direct API call to benefit from duplicate prevention
    if (!this.skipAutoLoad) {
      this.debugService.log('HighchartsGraph', 'ngOnInit - calling loadGraphData');
      this.loadGraphData();
    }

    // Listen for external pagination events from stats-table and other components
    document.addEventListener('stats-table-pagination', this.handleExternalPaginationEvent);
    // Listen for one-way metric changes from the stats table
    document.addEventListener('stats-table-metric-change', this.tableMetricListener);
  }

  ngOnChanges(): void {
    this.debugService.log('HighchartsGraph', 'ngOnChanges called', { 
      period: this.period, 
      offset: this.offset, 
      team: this.team,
      skipAutoLoad: this.skipAutoLoad,
      isLoading: this.isLoading 
    });
    
    this.applyThemeToHighcharts();
    
    // Check if data-related parameters actually changed
    const dataParamsChanged = 
      this.previousPeriod !== this.period ||
      this.previousOffset !== this.offset ||
      this.previousTeam !== this.team ||
      this.previousSearchTerm !== this.searchTerm;
    
    this.debugService.log('HighchartsGraph', `Data params changed: ${dataParamsChanged}`, {
      periodChanged: this.previousPeriod !== this.period,
      offsetChanged: this.previousOffset !== this.offset,
      teamChanged: this.previousTeam !== this.team,
      searchChanged: this.previousSearchTerm !== this.searchTerm
    });
    
    // If we're not skipping auto load, make API call when parameters change
    if (!this.skipAutoLoad && dataParamsChanged) {
      // Update tracked values
      this.previousPeriod = this.period;
      this.previousOffset = this.offset;
      this.previousTeam = this.team;
      this.previousSearchTerm = this.searchTerm;
      
      this.loadGraphData();
    } else if (this.skipAutoLoad) {
      // Use statsData from parent if skipAutoLoad is true
      if (this.statsData && this.statsData.length > 0) {
        this.fullData = [...this.statsData];
        this.internalSafeUpdateChart();
      }
    } else if (!dataParamsChanged) {
      this.debugService.log('HighchartsGraph', 'Skipping loadGraphData - no data param changes');
    }

    // If sort info provided from table: set chart metric accordingly and refresh
    if (this.sortInfo) {
      const mapped = this.mapSortColumnToChartMetric(this.sortInfo.active);
      if (mapped) {
        this.chartMetric = mapped;
      }
      // Force update to apply sort in chart
      this.internalSafeUpdateChart();
    }
  }
  
  private loadGraphData(): void {
    // Create a unique key for these parameters
    const paramsKey = `${this.period}|${this.offset}|${this.team}|${this.searchTerm}`;
    
    this.debugService.log('HighchartsGraph', 'loadGraphData called', { 
      isLoading: this.isLoading, 
      offset: this.offset, 
      team: this.team,
      paramsKey,
      lastLoadedParams: this.lastLoadedParams
    });
    
    // Check if we're already loading OR if we've already loaded this exact data
    if (this.isLoading) {
      this.debugService.log('HighchartsGraph', 'Skipping loadGraphData - already loading');
      return;
    }
    
    if (this.lastLoadedParams === paramsKey) {
      this.debugService.log('HighchartsGraph', 'Skipping loadGraphData - already loaded this data');
      return;
    }
    
    this.debugService.log('HighchartsGraph', 'Starting API call to getGraphData');
    this.isLoading = true;
    this.lastLoadedParams = paramsKey;
    
    this.apiService.getGraphData(this.period, this.offset, this.team, this.searchTerm).subscribe({
      next: (data: any) => {
        // API may return an array or an object with a .data property
        if (Array.isArray(data)) {
          this.fullData = data;
        } else if (data && Array.isArray(data.data)) {
          this.fullData = data.data;
        } else {
          this.fullData = [];
        }
        this.isLoading = false;
        this.internalSafeUpdateChart();
      },
      error: () => {
        this.fullData = [];
        this.isLoading = false;
        this.showErrorChart('Error loading graph data');
      }
    });
  }

  /**
   * Public method to allow parent components to trigger chart updates
   */
  public safeUpdateChart(): void {
    this.internalSafeUpdateChart();
  }

  ngAfterViewInit(): void {
    // Mark when the main chart is rendered for realistic load timing
    setTimeout(() => {
      try {
        performance.mark('mainContentRendered');
        if (performance.getEntriesByName('routeStart').length) {
          performance.measure('routeToContent', 'routeStart', 'mainContentRendered');
          const measures = performance.getEntriesByName('routeToContent');
          if (measures.length) {
            // Dispatch a custom event so AppComponent can pick up the realistic load time
            window.dispatchEvent(new CustomEvent('realistic-page-load', {
              detail: { duration: Math.round(measures[0].duration) }
            }));
            performance.clearMarks('mainContentRendered');
            performance.clearMeasures('routeToContent');
          }
        }
      } catch (e) {
        // Ignore errors if marks are missing
      }
    }, 0);
  }

  ngOnDestroy(): void {
    // Clean up subscription to prevent memory leaks
    if (this.translationSubscription) {
      this.translationSubscription.unsubscribe();
    }
    if (this.unitSubscription) {
      this.unitSubscription.unsubscribe();
    }
    document.removeEventListener('stats-table-pagination', this.handleExternalPaginationEvent);
    document.removeEventListener('stats-table-metric-change', this.tableMetricListener);
  }

  setDefaultMetric(): void {
    // Always force 'StatsKeys' as default, regardless of Input
    this.chartMetric = 'StatsKeys';
    this.displayMetric = 'Keys';
  }

  applyThemeToHighcharts(): void {
    const theme = this.currentTheme === 'dark' ? {
      chart: { backgroundColor: 'transparent', style: { fontFamily: 'sans-serif', color: '#f0f0f0' } },
      title: { style: { color: '#fff'} },
      xAxis: { labels: { style: { color: '#f0f0f0' } }, title: { style: { color: '#f0f0f0' } }, gridLineColor: '#444', lineColor: '#444', tickColor: '#444' },
      yAxis: { labels: { style: { color: '#f0f0f0' } }, title: { style: { color: '#f0f0f0' } }, gridLineColor: '#444' },
      plotOptions: { series: { dataLabels: { style: { color: '#f0f0f0' } } } },
      colors: ['#18bc9c', '#3498db', '#f39c12', '#e74c3c', '#2c3e50', '#95a5a6', '#9b59b6', '#1abc9c'],
      credits: { style: { color: '#666' } }
    } : {
      chart: { backgroundColor: 'transparent', style: { fontFamily: 'sans-serif', color: '#212529' } },
      title: { style: { color: '#212529' } },
      xAxis: { labels: { style: { color: '#212529' } }, title: { style: { color: '#212529' } }, gridLineColor: '#e5e5e5', lineColor: '#e5e5e5', tickColor: '#e5e5e5' },
      yAxis: { labels: { style: { color: '#212529' } }, title: { style: { color: '#212529' } }, gridLineColor: '#e5e5e5' },
      plotOptions: { series: { dataLabels: { style: { color: '#212529' } } } },
      colors: ['#18bc9c', '#2c3e50', '#3498db', '#f39c12', '#e74c3c', '#95a5a6', '#9b59b6', '#1abc9c'],
      credits: { style: { color: '#adb5bd' } }
    };
    Highcharts.setOptions(theme);
    
    // Force chart update to apply new colors to existing chart
    if (this.fullData && this.fullData.length > 0) {
      this.internalSafeUpdateChart();
    }
  }



  private internalSafeUpdateChart(): void {
    let data = this.fullData;
    
    // Apply search filter (graph API might not filter properly)
    if (this.searchTerm && this.searchTerm.trim() !== '') {
      const searchLower = this.searchTerm.toLowerCase().trim();
      
      data = data.filter(item => {
        // Simple: only search in Username field, ignore UsernameFull
        // Make sure we handle cases where Username might not be a string
        const rawUsername = item.Username;
        const username = (rawUsername && typeof rawUsername === 'string' ? rawUsername : String(rawUsername || '')).toLowerCase();
        
        // Only search in usernames, NOT in team names
        const matches = username.includes(searchLower);
        
        return matches;
      });
    }
    
    // Apply sorting from table if available (for metric-aligned columns)
    if (this.sortInfo && this.sortInfo.active) {
      const dir = this.sortInfo.direction === 'asc' ? 1 : -1;
      const active = this.sortInfo.active;
      const metricForSort = this.mapSortColumnToChartMetric(active);
      const getVal = (item: any, metricKey: string): number => {
        let v = 0;
        if (item[metricKey] !== undefined) {
          v = Number(item[metricKey]);
        } else if (metricKey.startsWith('Stats')) {
          const withoutStats = metricKey.replace('Stats', '');
          if (item[withoutStats] !== undefined) v = Number(item[withoutStats]);
          else if (item[withoutStats.toLowerCase()] !== undefined) v = Number(item[withoutStats.toLowerCase()]);
          else if (withoutStats === 'Keys' && item['Keys1'] !== undefined) v = Number(item['Keys1']);
          else if (withoutStats === 'DownloadMB' && item['Download'] !== undefined) v = Number(item['Download']);
          else if (withoutStats === 'UploadMB' && item['Upload'] !== undefined) v = Number(item['Upload']);
        }
        // Distance: keep order regardless of unit conversion; factor is constant
        return isNaN(v) ? 0 : v;
      };
      if (metricForSort) {
        data = [...data].sort((a, b) => (getVal(a, metricForSort) - getVal(b, metricForSort)) * dir);
      } else if (active === 'username') {
        data = [...data].sort((a, b) => {
          const ua = String(a.Username || a.UsernameFull || '').toLowerCase();
          const ub = String(b.Username || b.UsernameFull || '').toLowerCase();
          return ua.localeCompare(ub) * dir;
        });
      }
    }

    // Update filtered total for pagination
    this.filteredTotalItems = data.length;
    
    // Reset to first page if current page would be beyond filtered results
    const maxPage = Math.max(0, Math.ceil(this.filteredTotalItems / this.tablePageSize) - 1);
    if (this.tablePageIndex > maxPage) {
      this.tablePageIndex = 0;
    }
    
    // Pas paginering toe op de gefilterde data
    const start = this.tablePageIndex * this.tablePageSize;
    const end = start + this.tablePageSize;
    const pagedData = data.slice(start, end);
    // Toon altijd Username (of UsernameFull) en de gekozen metric
    const categories = pagedData
      .filter(item => item.Username || item.UsernameFull)
      .map(item => {
        let username = item.Username || item.UsernameFull;

        
        // Fix common encoding issues
        if (username) {
          // Fix Kuake -> Kuuke (ü encoding issue)
          username = username.replace(/Kuake/g, 'Kuuke');
          // Fix other common UTF-8 issues
          username = username.replace(/Ã¼/g, 'ü');
          username = username.replace(/Ã¶/g, 'ö');
          username = username.replace(/Ã¤/g, 'ä');
          username = username.replace(/Ã©/g, 'é');
          username = username.replace(/Ã¨/g, 'è');
          
          if (username !== (item.Username || item.UsernameFull)) {

          }
        }
        
        return username;
      });
    // Dynamisch de juiste metric tonen
  const metricKey = this.chartMetric.startsWith('Stats') ? this.chartMetric : 'Stats' + this.chartMetric.charAt(0).toUpperCase() + this.chartMetric.slice(1);
    

    
    const isDistanceMetric = this.chartMetric === 'StatsDistance';
    const values = pagedData
      .filter(item => item.Username || item.UsernameFull)
      .map(item => {
        // Try different field name patterns for graph API data
        let value = 0;
        
        // Try exact metric key first (e.g. "StatsKeys")
        if (item[this.chartMetric] !== undefined) {
          value = item[this.chartMetric];
        }
        // Try without Stats prefix (e.g. "Keys")
        else if (this.chartMetric.startsWith('Stats')) {
          const withoutStats = this.chartMetric.replace('Stats', '');
          if (item[withoutStats] !== undefined) {
            value = item[withoutStats];
          }
          // Try lowercase version (e.g. "keys")
          else if (item[withoutStats.toLowerCase()] !== undefined) {
            value = item[withoutStats.toLowerCase()];
          }
          // Special cases for graph API
          else if (withoutStats === 'Keys' && item['Keys1'] !== undefined) {
            value = item['Keys1'];
          }
          else if (withoutStats === 'DownloadMB' && item['Download'] !== undefined) {
            value = item['Download'];
          }
          else if (withoutStats === 'UploadMB' && item['Upload'] !== undefined) {
            value = item['Upload'];
          }
        }
        // If distance metric, convert raw miles into current unit for plotting
        if (isDistanceMetric) {
          // getRawDistance returns km when metric, mi when imperial
          value = this.localizationService.getRawDistance(Number(value) || 0);
        }
        return { y: Number(value) || 0 };
      });
    const mainColor = '#18bc9c'; // Flatly success color (turquoise) for both themes
    // Haal vertaalde titel op via eigen service
    let chartTitle = this.translateService.translate('chart.' + (this.chartMetric.replace(/^Stats/, '').replace(/MB|Seconds/g, '').toLowerCase()));
    if (!chartTitle || chartTitle === 'chart.' + this.chartMetric) chartTitle = metricKey;
    
    // Determine yAxis title depending on metric and unit
    let yAxisTitle = '';
    if (this.chartMetric === 'StatsDistance') {
      const unit = this.localizationService.getUnitSystem();
      yAxisTitle = unit === 'metric'
        ? (this.translateService.translate('chart.distanceKmAxis') || 'Distance (km)')
        : (this.translateService.translate('chart.distanceMiAxis') || 'Distance (miles)');
    } else {
      // Use the chart title as y-axis label for other metrics
      yAxisTitle = chartTitle;
    }

    // Prepare helper for tooltip formatting without mutating Highcharts namespace
    const self = this;
    const formatValueForTooltip = (value: number): string => {
      if (self.chartMetric === 'StatsDistance') {
        const unit = self.localizationService.getDistanceUnit();
        return `${self.localizationService.formatDecimal(value)} ${unit}`;
      }
      return self.localizationService.formatNumber(value);
    };

    this.chartOptions = {
      accessibility: {
        enabled: false // Disable accessibility warnings - enable when accessibility module is properly configured
      },
      chart: { type: this.chartType, height: this.chartHeight, backgroundColor: this.currentTheme === 'dark' ? '#303030' : '#fff' },
      title: {
        text: chartTitle,
        style: this.currentTheme === 'dark'
          ? { color: '#fff', fontWeight: 'bold' }
          : { color: '#212529' }
      },
      xAxis: { 
        categories,
        labels: {
          style: {
            color: this.currentTheme === 'dark' ? '#ecf0f1' : '#212529'
          }
        }
      },
      yAxis: { 
        min: 0, 
        title: { 
          text: yAxisTitle,
          style: {
            color: this.currentTheme === 'dark' ? '#ecf0f1' : '#212529'
          }
        },
        labels: {
          style: {
            color: this.currentTheme === 'dark' ? '#ecf0f1' : '#212529'
          }
        }
      },
      tooltip: {
        formatter: function() {
          const username = this.key || 'Unknown';
          const raw = typeof this.y === 'number' ? this.y : Number(this.y);
          const formatted = formatValueForTooltip(raw);
          return `<b>${username}</b><br/>${chartTitle}: <b>${formatted}</b>`;
        }
      },
      series: [{ type: this.chartType, name: chartTitle, data: values, color: mainColor, animation: false }],
      credits: { enabled: false },
      legend: { enabled: false }
    };
    this.updateFlag = true;
  }

  onPaginationChange(event: { pageIndex: number, pageSize: number }): void {
    const y = window.scrollY;
    this.tablePageIndex = event.pageIndex;
    this.tablePageSize = event.pageSize;
    // Synchroniseer pageSize met stats-table
    localStorage.setItem(this.LOCAL_STORAGE_PAGE_SIZE_KEY, String(event.pageSize));
    this.safeUpdateChart();

    // Broadcast to sync table pagination
    document.dispatchEvent(new CustomEvent('stats-table-pagination', {
      detail: { pageIndex: this.tablePageIndex, pageSize: this.tablePageSize }
    }));
    // Restore scroll position after change detection
    setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), 0);
  }

  initEmptyChart(): void {
    this.chartOptions = {
      chart: { type: this.chartType, height: this.chartHeight, backgroundColor: this.currentTheme === 'dark' ? '#303030' : '#fff' },
      title: { text: this.translateService.translate('chart.loadingData') || 'Loading chart data...' },
      xAxis: { categories: [] },
      yAxis: { min: 0, title: { text: '' } },
      series: [{ type: this.chartType, name: this.translateService.translate('common.loading') || 'Loading...', data: [], animation: false }],
      credits: { enabled: false }
    };
    this.updateFlag = true;
  }

  // Handle pagination changes coming from the table (or other components)
  private handleExternalPaginationEvent = (event: Event): void => {
    const customEvent = event as CustomEvent;
    if (!customEvent?.detail) return;

    const y = window.scrollY;
    const incomingIndex = Number(customEvent.detail.pageIndex);
    const incomingSize = Number(customEvent.detail.pageSize);

    // Guard to avoid loops: only update if values differ
    if (this.tablePageIndex !== incomingIndex || this.tablePageSize !== incomingSize) {
      this.tablePageIndex = incomingIndex;
      this.tablePageSize = incomingSize;
      localStorage.setItem(this.LOCAL_STORAGE_PAGE_SIZE_KEY, String(this.tablePageSize));
      this.safeUpdateChart();
      // Restore scroll position after sync
      setTimeout(() => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), 0);
    }
  };

  directChangeMetric(metric: string): void {
    this.chartMetric = metric;
    this.displayMetric = metric.charAt(0).toUpperCase() + metric.slice(1);
    this.safeUpdateChart();
  }

  directChangeType(type: string): void {
    this.chartType = type as ChartType;
    this.safeUpdateChart();
  }

  directChangeHeight(height: number): void {
    this.chartHeight = height;
    this.safeUpdateChart();
  }

  /**
   * Updates the chart instance if it exists. (Stub for compatibility)
   */
  public updateChart(): void {
    this.updateFlag = true;
  }

  /**
   * Updates the chart with a new sort configuration (for parent usage)
   */
  public updateChartWithSort(sortConfig: { active: string, direction: 'asc' | 'desc' }): void {
    this.sortInfo = sortConfig;
    const mapped = this.mapSortColumnToChartMetric(sortConfig.active);
    if (mapped) {
      this.chartMetric = mapped;
    }
    this.safeUpdateChart();
  }

  // Minimal error chart: only required fields, no legacy logic
  private showErrorChart(message: string): void {
    this.chartOptions = {
      chart: {
        type: this.chartType,
        height: this.chartHeight,
        backgroundColor: this.currentTheme === 'dark' ? '#303030' : '#ffffff'
      },
      title: {
        text: this.translateService.translate('chart.errorLoading') || 'Error Loading Chart Data'
      },
      subtitle: {
        text: message || this.translateService.translate('chart.tryAgainLater') || 'Please try again later'
      },
      series: [],
      credits: {
        enabled: false
      },
      legend: { enabled: false }
    };
    this.updateFlag = true;
  }

  // Minimal empty data chart: only required fields, no legacy logic
  private showEmptyDataChart(): void {
    this.chartOptions = {
      chart: {
        type: this.chartType,
        height: this.chartHeight,
        backgroundColor: this.currentTheme === 'dark' ? '#303030' : '#ffffff'
      },
      title: {
        text: this.translateService.translate('chart.noDataAvailable') || 'No Data Available'
      },
      subtitle: {
        text: this.translateService.translate('chart.noRecordsFound') || 'No records found for the selected criteria'
      },
      xAxis: {
        categories: [this.translateService.translate('chart.noData') || 'No Data'],
        labels: { enabled: false }
      },
      yAxis: {
        min: 0,
        title: { text: '' },
        labels: { enabled: false }
      },
      series: [],
      credits: {
        enabled: false
      },
      legend: { enabled: false }
    };
    this.updateFlag = true;
  }

  // Map table sort column to chart metric key
  private mapSortColumnToChartMetric(column: string): string | null {
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
}