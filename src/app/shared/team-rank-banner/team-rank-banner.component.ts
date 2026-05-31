import { Component, OnInit, Input, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/api.service';
import { TranslatePipe } from '../pipes/translate.pipe';

interface TeamRank {
  name: string;
  members: number;
  ranks: {
    keys?: number;
    clicks?: number;
    download?: number;
    upload?: number;
    uptime?: number;
    scrolls?: number;
    distance?: number;
  };
}

@Component({
  selector: 'app-team-rank-banner',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './team-rank-banner.component.html',
  styleUrl: './team-rank-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TeamRankBannerComponent implements OnInit {
  @Input() currentTheme: 'light' | 'dark' = 'light';

  teamRank: TeamRank | null = null;
  isLoading = true;
  hasError = false;

  rankItems = [
    { key: 'keys',     icon: 'fa-keyboard',       label: 'stats.keys' },
    { key: 'clicks',   icon: 'fa-computer-mouse',  label: 'stats.clicks' },
    { key: 'scrolls',  icon: 'fa-scroll',          label: 'stats.scrolls' },
    { key: 'download', icon: 'fa-download',        label: 'stats.download' },
    { key: 'upload',   icon: 'fa-upload',          label: 'stats.upload' },
    { key: 'uptime',   icon: 'fa-clock',           label: 'stats.uptime' },
    { key: 'distance', icon: 'fa-route',           label: 'stats.distance' },
  ];

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.apiService.getTeamRank().subscribe({
      next: (data) => {
        this.teamRank = data;
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
    return this.teamRank?.ranks?.[key as keyof TeamRank['ranks']] ?? null;
  }

  rankClass(rank: number | null): string {
    if (rank === null) return '';
    if (rank <= 3)  return 'rank-gold';
    if (rank <= 10) return 'rank-silver';
    if (rank <= 25) return 'rank-bronze';
    return '';
  }
}
