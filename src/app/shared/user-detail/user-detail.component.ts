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
  selectedDays: 30 | 90 | 365 = 90;

  rankItems = [
    { key: 'keys',     icon: 'fa-keyboard',      label: 'stats.keys' },
    { key: 'clicks',   icon: 'fa-computer-mouse', label: 'stats.clicks' },
    { key: 'scrolls',  icon: 'fa-scroll',         label: 'stats.scrolls' },
    { key: 'download', icon: 'fa-download',       label: 'stats.download' },
    { key: 'upload',   icon: 'fa-upload',         label: 'stats.upload' },
    { key: 'uptime',   icon: 'fa-clock',          label: 'stats.uptime' },
    { key: 'distance', icon: 'fa-route',          label: 'stats.distance' },
  ];

  milestones: { icon: string; label: string; reached: boolean }[] = [];

  private readonly MILESTONES_BASE: { icon: string; label: string; metric: string; threshold: number }[] = [
    { icon: '⌨️', label: '1M toetsen',    metric: 'keys',           threshold: 1_000_000 },
    { icon: '⌨️', label: '10M toetsen',   metric: 'keys',           threshold: 10_000_000 },
    { icon: '⌨️', label: '50M toetsen',   metric: 'keys',           threshold: 50_000_000 },
    { icon: '⌨️', label: '100M toetsen',  metric: 'keys',           threshold: 100_000_000 },
    { icon: '⌨️', label: '250M toetsen',  metric: 'keys',           threshold: 250_000_000 },
    { icon: '⌨️', label: '500M toetsen',  metric: 'keys',           threshold: 500_000_000 },
    { icon: '⌨️', label: '1B toetsen',    metric: 'keys',           threshold: 1_000_000_000 },
    { icon: '🖱️', label: '1M klikken',    metric: 'clicks',         threshold: 1_000_000 },
    { icon: '🖱️', label: '10M klikken',   metric: 'clicks',         threshold: 10_000_000 },
    { icon: '🖱️', label: '50M klikken',   metric: 'clicks',         threshold: 50_000_000 },
    { icon: '🖱️', label: '100M klikken',  metric: 'clicks',         threshold: 100_000_000 },
    { icon: '🖱️', label: '250M klikken',  metric: 'clicks',         threshold: 250_000_000 },
    { icon: '📜', label: '1M scrollen',   metric: 'scrolls',        threshold: 1_000_000 },
    { icon: '📜', label: '10M scrollen',  metric: 'scrolls',        threshold: 10_000_000 },
    { icon: '📜', label: '50M scrollen',  metric: 'scrolls',        threshold: 50_000_000 },
    { icon: '📜', label: '100M scrollen', metric: 'scrolls',        threshold: 100_000_000 },
    { icon: '⏱️', label: '1 jaar uptime', metric: 'uptime_seconds', threshold: 365 * 24 * 3600 },
    { icon: '⏱️', label: '2 jaar uptime', metric: 'uptime_seconds', threshold: 2 * 365 * 24 * 3600 },
    { icon: '⏱️', label: '3 jaar uptime', metric: 'uptime_seconds', threshold: 3 * 365 * 24 * 3600 },
    { icon: '⏱️', label: '5 jaar uptime', metric: 'uptime_seconds', threshold: 5 * 365 * 24 * 3600 },
    { icon: '⏱️', label: '7 jaar uptime', metric: 'uptime_seconds', threshold: 7 * 365 * 24 * 3600 },
    { icon: '⏱️', label: '10 jaar uptime',metric: 'uptime_seconds', threshold: 10 * 365 * 24 * 3600 },
    { icon: '⚡', label: '100 pulses',    metric: 'pulses',         threshold: 100 },
    { icon: '⚡', label: '500 pulses',    metric: 'pulses',         threshold: 500 },
    { icon: '⚡', label: '1.000 pulses',  metric: 'pulses',         threshold: 1_000 },
    { icon: '⚡', label: '5.000 pulses',  metric: 'pulses',         threshold: 5_000 },
    { icon: '⚡', label: '10.000 pulses', metric: 'pulses',         threshold: 10_000 },
    { icon: '⚡', label: '50.000 pulses', metric: 'pulses',         threshold: 50_000 },
    { icon: '⚡', label: '100.000 pulses',metric: 'pulses',         threshold: 100_000 },
  ];

  readonly Math = Math;
  dayRecords: any = null;
  pulses: any[] = [];
  pulsesPagination: any = null;
  pulsesLoading = false;
  pulsesPage = 1;
  showPulses = false;

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
      history: this.apiService.getUserHistory(this.userId, this.selectedDays).pipe(catchError(() => of({ data: [] }))),
      records: this.apiService.getUserDayRecords(this.userId).pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ detail, history, records }) => {
        this.user = detail;
        this.historyData = history?.data ?? [];
        this.dayRecords = records?.records ?? null;
        if (!detail) { this.hasError = true; this.isLoading = false; this.cdr.markForCheck(); return; }
        this.buildMilestones();
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

  togglePulses(): void {
    this.showPulses = !this.showPulses;
    this.cdr.markForCheck();
    if (this.showPulses && !this.pulses.length) {
      this.loadPulses(1);
    }
  }

  loadPulses(page: number): void {
    this.pulsesLoading = true;
    this.pulsesPage = page;
    this.cdr.markForCheck();
    this.apiService.getUserPulses(this.userId, 15, page).pipe(
      catchError(() => of({ pulses: [], pagination: null }))
    ).subscribe(res => {
      this.pulses = res.pulses ?? [];
      this.pulsesPagination = res.pagination ?? null;
      this.pulsesLoading = false;
      this.cdr.markForCheck();
    });
  }

  formatPulseDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  private buildMilestones(): void {
    const t = this.user?.totals ?? {};
    const metric = this.user?.distance_system === 'metric';
    const distanceVal = metric
      ? (t.distance_miles ?? 0) * 1.60934
      : (t.distance_miles ?? 0);
    const distanceUnit = metric ? 'km' : 'mi';

    const distanceMilestones = [500, 1000, 2500, 5000, 10000, 25000, 50000].map(n => ({
      icon: '🗺️', label: `${n.toLocaleString()} ${distanceUnit}`,
      metric: 'distance', threshold: n
    }));

    const values: Record<string, number> = {
      keys:           t.keys           ?? 0,
      clicks:         t.clicks         ?? 0,
      scrolls:        t.scrolls        ?? 0,
      uptime_seconds: t.uptime_seconds ?? 0,
      pulses:         this.user?.pulses ?? 0,
      distance:       distanceVal,
    };

    const all = [...this.MILESTONES_BASE, ...distanceMilestones];
    this.milestones = all
      .filter(m => values[m.metric] >= m.threshold)
      .map(m => ({ icon: m.icon, label: m.label, reached: true }));
  }

  selectMetric(metric: 'keys' | 'clicks' | 'scrolls'): void {
    this.selectedMetric = metric;
    this.buildChart();
    this.cdr.markForCheck();
  }

  selectDays(days: 30 | 90 | 365): void {
    if (this.selectedDays === days) return;
    this.selectedDays = days;
    this.isLoading = true;
    this.chartOptions = null;
    this.cdr.markForCheck();
    this.apiService.getUserHistory(this.userId, days).pipe(catchError(() => of({ data: [] }))).subscribe(history => {
      this.historyData = history?.data ?? [];
      this.buildChart();
      this.isLoading = false;
      this.cdr.markForCheck();
    });
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
      chart: { type: 'area', height: 220, backgroundColor: bgColor, margin: [10, 10, 45, 55] },
      title: { text: undefined },
      xAxis: {
        categories,
        labels: {
          enabled: true,
          style: { color: textColor, fontSize: '9px' },
          step: Math.ceil(categories.length / 8),
          rotation: -35,
        },
        tickLength: 3,
      },
      yAxis: { title: { text: undefined }, labels: { style: { color: textColor, fontSize: '10px' } }, gridLineColor: isDark ? '#444' : '#e0e0e0' },
      series: [{ type: 'area', name: metricLabels[this.selectedMetric], data: values, color: '#18bc9c', fillOpacity: 0.3, lineWidth: 2, marker: { enabled: false } }],
      legend: { enabled: false },
      tooltip: { formatter: function() { return `<b>${categories[this.x as number]}</b><br>${(this.y as number).toLocaleString()}`; } },
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
