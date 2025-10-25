import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../pipes/translate.pipe';

interface StorageItem {
  key: string;
  size: number;
  type: string;
  value: string;
  tooltip: string; // Add tooltip property for full value
}

@Component({
  selector: 'app-local-storage-info',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="local-storage-container">
      <button type="button" class="storage-info-toggle" (click)="toggleExpand()" aria-label="Toggle local storage information">
        <small>
          <i class="fa-solid fa-database me-1" aria-hidden="true"></i>
          {{ totalSize | number }} B ({{ items.length }})
        </small>
      </button>
      <div class="storage-info-panel" *ngIf="isExpanded" [style.height.px]="panelHeight">
        <div class="panel-header">
          <h6 class="mb-0">{{ 'common.localStorageInfo' | translate }}</h6>
          <button type="button" class="btn-close btn-sm" aria-label="Close" (click)="toggleExpand()"></button>
        </div>
        <div class="panel-content">
          <table class="table table-sm table-borderless mb-0">
            <thead>
              <tr>
                <th>{{ 'common.key' | translate }}</th>
                <th>{{ 'common.type' | translate }}</th>
                <th>{{ 'common.size' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of items" [title]="item.tooltip">
                <td class="key-column">{{ item.key }}</td>
                <td>{{ item.type }}</td>
                <td>{{ item.size | number }} B</td>
              </tr>
              <tr *ngIf="items.length === 0">
                <td colspan="3" class="text-center">{{ 'common.noData' | translate }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel-footer" style="padding:8px 12px; border-top:1px solid var(--bs-border-color); text-align:right;">
          <button type="button" class="btn btn-sm btn-danger" (click)="resetLocalStorage()">
            <i class="fa-solid fa-trash"></i> {{ 'common.clearLocalStorage' | translate }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .local-storage-container {
      position: relative;
    }
    
    .storage-info-toggle {
      color: inherit;
      text-decoration: none;
      padding: 0.25rem 0.5rem;
      display: inline-flex;
      align-items: center;
      white-space: nowrap;
      background: none;
      border: none;
      cursor: pointer;
    }
    
    .storage-info-toggle:hover {
      background-color: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    
    .storage-info-panel {
      position: absolute;
      bottom: 100%;
      right: 0;
      width: 400px;
      max-width: 90vw;
      max-height: 400px;
      background-color: var(--bs-body-bg);
      border: 1px solid var(--bs-border-color);
      border-radius: 4px;
      box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    
    .panel-header {
      padding: 8px 12px;
      background-color: var(--bs-tertiary-bg);
      border-bottom: 1px solid var(--bs-border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .panel-content {
      overflow: auto;
      font-size: 0.8rem;
      flex: 1;
    }
    
    .key-column {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    table {
      color: var(--bs-body-color);
    }
    
    th {
      font-size: 0.75rem;
      position: sticky;
      top: 0;
      background-color: var(--bs-body-bg);
      font-weight: 500;
    }
  `]
})
export class LocalStorageInfoComponent implements OnInit, OnDestroy {
  items: StorageItem[] = [];
  totalSize: number = 0;
  isExpanded: boolean = false;
  panelHeight: number = 300;

  ngOnInit(): void {
    this.loadLocalStorageInfo();
    this.calculatePanelHeight();
    window.addEventListener('resize', () => this.calculatePanelHeight());
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', () => this.calculatePanelHeight());
  }

  calculatePanelHeight(): void {
    // Limit panel height to about 70% of viewport height
    this.panelHeight = Math.min(300, window.innerHeight * 0.7);
  }

  loadLocalStorageInfo(): void {
    this.items = [];
    this.totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        const size = new TextEncoder().encode(value).length;
        let type = 'string';
        try {
          const parsedValue = JSON.parse(value);
          type = typeof parsedValue === 'object' ? (Array.isArray(parsedValue) ? 'array' : 'object') : typeof parsedValue;
        } catch (e) {}
        // Show value, but truncate for table, keep full for tooltip
        let displayValue = value;
        let tooltipValue = value;
        if (displayValue.length > 80) {
          displayValue = displayValue.slice(0, 80) + '...';
        }
        this.items.push({ key, size, type, value: displayValue, tooltip: tooltipValue });
        this.totalSize += size;
      }
    }
    this.items.sort((a, b) => b.size - a.size);
  }

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    if (this.isExpanded) {
      this.loadLocalStorageInfo();
      this.calculatePanelHeight();
    }
  }

  resetLocalStorage(): void {
    if (confirm('Weet je zeker dat je alle lokale opslag wilt wissen?')) {
      localStorage.clear();
      this.loadLocalStorageInfo();
    }
  }
}
