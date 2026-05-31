import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgbActiveOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { ApiService } from '../services/api.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { LocalizationService } from '../services/localization.service';

@Component({
  selector: 'app-user-detail',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
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

  rankItems = [
    { key: 'keys',     icon: 'fa-keyboard',      label: 'stats.keys' },
    { key: 'clicks',   icon: 'fa-computer-mouse', label: 'stats.clicks' },
    { key: 'scrolls',  icon: 'fa-scroll',         label: 'stats.scrolls' },
    { key: 'download', icon: 'fa-download',       label: 'stats.download' },
    { key: 'upload',   icon: 'fa-upload',         label: 'stats.upload' },
    { key: 'uptime',   icon: 'fa-clock',          label: 'stats.uptime' },
    { key: 'distance', icon: 'fa-route',          label: 'stats.distance' },
  ];

  constructor(
    public activeOffcanvas: NgbActiveOffcanvas,
    private apiService: ApiService,
    private cdr: ChangeDetectorRef,
    private localizationService: LocalizationService
  ) {}

  ngOnInit(): void {
    this.apiService.getUserDetail(this.userId).subscribe({
      next: (data) => {
        this.user = data;
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

  formatUptime(seconds: number): string {
    if (!seconds) return '0:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
