import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { HighchartsChartComponent } from 'highcharts-angular';
import type * as Highcharts from 'highcharts';
import { ApiService } from '../services/api.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocalizationService } from '../services/localization.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe, HighchartsChartComponent],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailComponent implements OnInit {
  @Input() userId!: number;
  @Input() username!: string;
  @Input() currentTheme: 'light' | 'dark' = 'light';

  user: any = null;
  isLoading = true;
  hasError = false;

  chartOptions: Highcharts.Options | null = null;
  selectedMetric: 'keys' | 'clicks' | 'scrolls' = 'keys';

  rankItems = [
    { key: 'keys',     icon: 'fa-keyboard',      label: 'stats.keys' },
    { key: 'clicks',   icon: 'fa-computer-mouse', label: 'stats.clicks' },
    { key: 'scrolls',  icon: 'fa-scroll',         label: 'stats.scrolls' },
    { key: 'download', icon: 'fa-download',       label: 'stats.download' },
    { key: 'upload',   icon: 'fa-upload',         label: 'stats.upload' },
    { key: 'uptime',   icon: 'fa-clock',          label: 'stats.uptime' },
    { key: 'distance', icon: 'fa-route',          label: 'stats.distance' },
  ];

  private historyData: any[] = [];

  constructor(
    public activeOffcanvas: NgbActiveOffcanvas,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private localizationService: LocalizationService
  ) {}

  ngOnInit(): void {
    forkJoin({
      detail:  this.apiService.getUserDetail(this.userId).pipe(catchError(() => of(null))),
      history: this.apiService.getUserHistory(this.userId, 30).pipe(catchError(() => of({ data: [] })))
    }).subscribe({
      next: ({ detail, history }) => {
        this.user = detail;
        this.historyData = history?.data ?? [];
        if (!detail) { this.hasError = true; this.isLoading = false; this.cdr.markForCheck(); return; }
        this.buildChart();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.hasError = true;
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  selectMetric(metric: 'keys' | 'clicks' | 'scrolls'): void {
    this.selectedMetric = metric;
    this.buildChart();
    this.cdr.markForCheck();
  }

  private buildChart(): void {
    if (!this.historyData.length) return;

    const isDark = this.currentTheme === 'dark';
    const textColor = isDark ? '#ecf0f1' : '#2c3e50';
    const bgColor   = isDark ? '#2c3e50' : '#ffffff';

    const categories = this.historyData.map(d => d.datum);
    const values     = this.historyData.map(d => +d[this.selectedMetric] || 0);

    const metricLabels: Record<string, string> = {
      keys: 'Toetsen', clicks: 'Klikken', scrolls: 'Scrollen'
    };

    this.chartOptions = {
      chart: { type: 'area', height: 160, backgroundColor: bgColor, margin: [10, 10, 30, 50] },
      title: { text: undefined },
      xAxis: { categories, labels: { enabled: false }, tickLength: 0 },
      yAxis: { title: { text: undefined }, labels: { style: { color: textColor, fontSize: '10px' } }, gridLineColor: isDark ? '#444' : '#e0e0e0' },
      series: [{ type: 'area', name: metricLabels[this.selectedMetric], data: values, color: '#18bc9c', fillOpacity: 0.3, lineWidth: 2, marker: { enabled: false } }],
      legend: { enabled: false },
      tooltip: { formatter: function() { return `<b>${this.x}</b><br>${(this.y as number).toLocaleString()}`; } },
      credits: { enabled: false }
    };
  }

  getRank(key: string): number | null {
    return this.user?.ranks?.[key] ?? null;
  }

  rankClass(rank: number | null): string {
    if (rank === null) return '';
    if (rank <= 3)  return 'rank-gold';
    if (rank <= 10) return 'rank-silver';
    if (rank <= 25) return 'rank-bronze';
    return '';
  }

  formatNumber(value: number): string {
    return this.localizationService.formatNumber(value);
  }

  formatBytes(mb: number): string {
    if (!mb) return '0 B';
    const bytes = mb * 1024 * 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
  }

  osIcon(os: string): string {
    switch (os?.toLowerCase()) {
      case 'windows': return 'fa-windows fab';
      case 'macos':   return 'fa-apple fab';
      case 'linux':   return 'fa-linux fab';
      default:        return 'fa-desktop fas';
    }
  }
}
