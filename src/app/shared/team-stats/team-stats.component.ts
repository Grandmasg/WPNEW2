import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api.service';
import { LocalizationService } from '../services/localization.service';
import { catchError, takeUntil } from 'rxjs/operators';
import { of, Subject } from 'rxjs';

@Component({
  selector: 'app-team-stats',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './team-stats.component.html',
  styleUrl: './team-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TeamStatsComponent implements OnChanges, OnDestroy {
  private destroy$ = new Subject<void>();
  @Input() team: string = '-';
  @Input() offset: string = '0';
  @Input() currentTheme: 'light' | 'dark' = 'light';
  @Input() collapsed = false;
  @Input() teamDateFormed: string | null = null;

  data: any = null;
  isLoading = false;
  readonly Math = Math;

  readonly TOP_METRICS = [
    { key: 'keys',    icon: 'fa-keyboard',       label: 'Toetsen' },
    { key: 'clicks',  icon: 'fa-computer-mouse', label: 'Klikken' },
    { key: 'scrolls', icon: 'fa-scroll',         label: 'Scrollen' },
    { key: 'uptime',  icon: 'fa-clock',          label: 'Uptime' },
    { key: 'pulses',  icon: 'fa-bolt',           label: 'Pulses' },
  ];

  private readonly COUNTRY_MAP: Record<number, { name: string; iso: string }> = {
    8:{'name':'Australia','iso':'au'},9:{'name':'Austria','iso':'at'},16:{'name':'Belgium','iso':'be'},
    23:{'name':'Brazil','iso':'br'},32:{'name':'Canada','iso':'ca'},37:{'name':'Colombia','iso':'co'},
    44:{'name':'Czech Republic','iso':'cz'},50:{'name':'Egypt','iso':'eg'},57:{'name':'Finland','iso':'fi'},
    64:{'name':'Germany','iso':'de'},75:{'name':'Hungary','iso':'hu'},77:{'name':'India','iso':'in'},
    78:{'name':'Indonesia','iso':'id'},80:{'name':'Israel','iso':'il'},81:{'name':'Italy','iso':'it'},
    91:{'name':'Latvia','iso':'lv'},95:{'name':'Lithuania','iso':'lt'},119:{'name':'Netherlands','iso':'nl'},
    121:{'name':'New Zealand','iso':'nz'},125:{'name':'Norway','iso':'no'},135:{'name':'Poland','iso':'pl'},
    136:{'name':'Portugal','iso':'pt'},139:{'name':'Romania','iso':'ro'},146:{'name':'Saudi Arabia','iso':'sa'},
    150:{'name':'Singapore','iso':'sg'},154:{'name':'South Africa','iso':'za'},155:{'name':'Spain','iso':'es'},
    160:{'name':'Sweden','iso':'se'},161:{'name':'Switzerland','iso':'ch'},163:{'name':'Taiwan','iso':'tw'},
    175:{'name':'United Arab Emirates','iso':'ae'},176:{'name':'United Kingdom','iso':'gb'},
    177:{'name':'United States','iso':'us'},182:{'name':'Vietnam','iso':'vn'},307:{'name':'Kyrgyzstan','iso':'kg'},
  };

  constructor(
    private apiService: ApiService,
    private localizationService: LocalizationService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['team'] || changes['offset']) {
      this.load();
    }
  }

  private load(): void {
    this.isLoading = true;
    this.data = null;
    this.cdr.markForCheck();
    this.apiService.getTeamStats(this.team, this.offset).pipe(
      catchError(() => of(null)),
      takeUntil(this.destroy$)
    ).subscribe(res => {
      Promise.resolve().then(() => {
        this.data = res;
        this.isLoading = false;
        this.cdr.markForCheck();
      });
    });
  }

  get teamLabel(): string {
    if (this.team === '-') return 'Dutch Power Cows';
    return this.data?.meta?.name || this.team;
  }

  get dateFormed(): string | null {
    return this.data?.meta?.date_formed ?? this.teamDateFormed ?? null;
  }

  get countries(): { iso: string; name: string }[] {
    const ids: number[] = this.data?.stats?.country_ids ?? [];
    return ids
      .map(id => this.COUNTRY_MAP[id])
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  formatNumber(v: number): string {
    return this.localizationService.formatNumber(v ?? 0);
  }

  formatBytes(mb: number): string {
    if (!mb) return '0 B';
    const bytes = mb * 1024 * 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d.toLocaleString()} days, ${h}h`;
  }

  formatDistance(miles: number): string {
    if (!miles) return '0';
    const isMetric = this.localizationService.unitSystem === 'metric';
    const val = isMetric ? miles * 1.60934 : miles;
    return this.localizationService.formatNumber(Math.round(val)) + (isMetric ? ' km' : ' mi');
  }
}
