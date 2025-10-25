import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslateService } from '../services/translate.service';
import { DebugService } from '../services/debug.service';
import { Router } from '@angular/router';

// Define interfaces for improved type safety - use property names directly from API
interface XmlBaseUser {
  category?: string;
  Username?: string; 
  UserID?: number;
  Team?: string;
  datum?: string;
  Keys1?: number;
  Clicks?: number;
  UptimeSeconds?: number;
  Download?: number;
  Upload?: number;
  Pulses?: number;
  Scrolls?: number;
  Distance?: number;
  OldUsername?: string;
  NewUsername?: string;
}

interface XmlAddedUser extends XmlBaseUser {
  isNew?: boolean;
}

interface XmlChangedUser extends XmlBaseUser {
  wasChanged?: boolean;
}

interface XmlLeftUser extends XmlBaseUser {
  wasInYesterday?: boolean;
}

// Define union type for XmlUser
type XmlUser = XmlAddedUser | XmlChangedUser | XmlLeftUser;

interface XmlChangesData {
  added?: XmlAddedUser[];
  left?: XmlLeftUser[];
  changed?: XmlChangedUser[];
}

@Component({
  selector: 'app-xml-changes',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe
  ],
  templateUrl: './xml-changes.component.html',
  styleUrls: ['./xml-changes.component.scss']
})
export class XmlChangesComponent implements OnInit, OnChanges {
  @Input() xmlChanges: XmlUser[] = [];
  @Input() isLoading: boolean = false;
  @Input() hasError: boolean = false;
  @Input() section: string = 'changes';
  
  // Add missing Input properties that are being bound from parent components
  @Input() date: Date | null = null;
  @Input() team: string = '-';
  @Input() currentTheme: 'dark' | 'light' = 'dark';
  @Input() offset: string = '0';
  @Input() showSummary: boolean = false;
  @Input() xmlData: any[] = [];
  @Input() skipAutoLoad: boolean = false;
  @Input() parentLoaded: boolean = false;
  @Input() set changes(value: any) {
    if (!value) {
      this.debugService.warn('XmlChanges', 'Received null or undefined changes value');
      return;
    }
    
    if (value.changes) {
      this.processChangesObject(value.changes);
    } else if (Array.isArray(value)) {
      this.xmlChanges = value;
      this.processChanges();
    }
  }
  
  // Explicitly set showDetails to false
  showDetails: boolean = true;
  private detailsStateKey: string = '';
  
  addedUsers: XmlAddedUser[] = [];
  changedUsers: XmlChangedUser[] = [];
  leftUsers: XmlLeftUser[] = [];

  // Add periodType Input property
  @Input() periodType: string = '';

  constructor(
    private translateService: TranslateService,
    private debugService: DebugService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Add debug logging to show the section value
    this.debugService.log('XmlChanges', `Component initialized with section: "${this.section}"`);
    // Build a unique key for this changes block (period+offset+team)
    this.detailsStateKey = this.buildDetailsStateKey();
    // Restore details state from localStorage
    const saved = localStorage.getItem(this.detailsStateKey);
    if (saved !== null) {
      this.showDetails = saved === 'true';
    }
    // If we have changes data passed directly, process it immediately
    if (this.xmlChanges && this.xmlChanges.length > 0) {
      this.debugService.log('XmlChanges', `Processing ${this.xmlChanges.length} entries from xmlChanges input`);
      this.processChanges();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Add debug logging for section changes
    if (changes['section']) {
      const oldValue = changes['section'].previousValue;
      const newValue = changes['section'].currentValue;
      this.debugService.log('XmlChanges', `Section changed: "${oldValue}" -> "${newValue}"`);
    }

    // Rebuild detailsStateKey and restore state on offset/section/team change
    if (changes['offset'] || changes['section'] || changes['team']) {
      this.detailsStateKey = this.buildDetailsStateKey();
      const saved = localStorage.getItem(this.detailsStateKey);
      if (saved !== null) {
        this.showDetails = saved === 'true';
      } else {
        this.showDetails = true;
      }
    }
    // Only log significant events, not every change
    if (changes['xmlChanges'] && changes['xmlChanges'].currentValue) {
      this.processChanges();
    }
    if (changes['changes'] && changes['changes'].currentValue) {
      const changesObj = changes['changes'].currentValue;
      if (changesObj.changes) {
        this.processChangesObject(changesObj.changes);
      } else {
        this.debugService.warn('XmlChanges', 'Received changes object without changes property');
      }
    }
  }

  /**
   * Check if there are any changes to display
   */
  hasChanges(): boolean {
    const hasAddedUsers = this.addedUsers && this.addedUsers.length > 0;
    const hasChangedUsers = this.changedUsers && this.changedUsers.length > 0;
    const hasLeftUsers = this.leftUsers && this.leftUsers.length > 0;
    
    return hasAddedUsers || hasChangedUsers || hasLeftUsers;
  }

  // Update the method to not automatically show details
  processChanges(): void {
    // Reset arrays
    this.addedUsers = [];
    this.changedUsers = [];
    this.leftUsers = [];
    
    if (!this.xmlChanges || this.xmlChanges.length === 0) {
      this.debugService.log('XmlChanges', 'No XML changes to process');
      return;
    }

    // Log the first item to see its structure
    this.debugService.log('XmlChanges', 'Sample XML change:', this.xmlChanges[0]);
    
    // Process each user and categorize them
    this.xmlChanges.forEach(user => {
      // Check if the user has a category property
      if (user.category) {
        switch (user.category.toLowerCase()) {
          case 'added':
            this.addedUsers.push(user as XmlAddedUser);
            break;
          case 'changed':
            this.changedUsers.push(user as XmlChangedUser);
            break;
          case 'left':
            this.leftUsers.push(user as XmlLeftUser);
            break;
          default:
            this.debugService.warn('XmlChanges', `Unknown category: ${user.category}`);
        }
      } 
      // If no category property, try to infer from other properties using proper type checking
      else {
        // Check for added users (with isNew property)
        if ('isNew' in user || 'StatsKeys' in user || 'Keys1' in user) {
          this.addedUsers.push(user as XmlAddedUser);
        }
        // Check for changed users (with username change properties)
        else if ('OldUsername' in user || 'NewUsername' in user || 'oldUsername' in user || 'newUsername' in user) {
          this.changedUsers.push(user as XmlChangedUser);
        }
        // Check for left users
        else if ('wasInYesterday' in user) {
          this.leftUsers.push(user as XmlLeftUser);
        }
        // Default to added users if can't determine
        else {
          this.addedUsers.push(user as XmlAddedUser);
        }
      }
    });
    
    this.debugService.log('XmlChanges', `Processed XML changes: ${this.addedUsers.length} added, ${this.changedUsers.length} changed, ${this.leftUsers.length} left`);
  }

  // New method to process changes object with added/changed/left structure
  processChangesObject(changesObj: XmlChangesData): void {
    // Reset arrays
    this.addedUsers = [];
    this.changedUsers = [];
    this.leftUsers = [];

    // Process added users - preserve original properties from API
    if (changesObj.added && Array.isArray(changesObj.added)) {
      this.addedUsers = changesObj.added.map((user: XmlBaseUser) => ({
        ...user,
        category: 'added',
        isNew: true
      }) as XmlAddedUser);
    }

    // Process changed users - preserve original properties from API
    if (changesObj.changed && Array.isArray(changesObj.changed)) {
      this.changedUsers = changesObj.changed.map((user: XmlBaseUser) => ({
        ...user,
        category: 'changed',
        wasChanged: true
      }) as XmlChangedUser);
    }

    // Process left users - preserve original properties from API
    if (changesObj.left && Array.isArray(changesObj.left)) {
      this.leftUsers = changesObj.left.map((user: XmlBaseUser) => ({
        ...user,
        category: 'left',
        wasInYesterday: true
      }) as XmlLeftUser);
    }
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
    // Save state to localStorage
    localStorage.setItem(this.detailsStateKey, this.showDetails ? 'true' : 'false');
  }

  private buildDetailsStateKey(): string {
    // Use period, offset, team for uniqueness
    return `xmlChangesDetails_${this.section}_${this.offset}_${this.team}`;
  }

  formatNumber(value: any): string {
    if (typeof value !== 'number' || isNaN(value)) {
      return '-';
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  // Move this method up for better visibility
  downloadCsv(): void {
    // Prepare CSV data
    const csvData = this.prepareCsvData();
    if (!csvData || csvData.length === 0) {
      this.debugService.warn('XmlChanges', 'No data available for CSV download');
      return;
    }

    // Generate CSV content
    const csvContent = this.generateCsvContent(csvData);
    if (!csvContent) {
      this.debugService.warn('XmlChanges', 'Failed to generate CSV content');
      return;
    }

    // Create a blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('href', url);
    a.setAttribute('download', `xml_changes_${this.formatDate(new Date())}.csv`);
    a.style.visibility = 'hidden';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.debugService.log('XmlChanges', 'CSV download triggered');
  }

  private prepareCsvData(): any[] {
    // Combine all users into one array for CSV export
    return [
      ...this.addedUsers.map(user => ({ ...user, category: 'added' })),
      ...this.changedUsers.map(user => ({ ...user, category: 'changed' })),
      ...this.leftUsers.map(user => ({ ...user, category: 'left' }))
    ];
  }

  private generateCsvContent(data: any[]): string {
    if (!data || data.length === 0) {
      return '';
    }

    // Extract headers
    const headers = Object.keys(data[0]);
    const csvRows = [];

    // Add header row
    csvRows.push(headers.join(','));

    // Add data rows
    for (const row of data) {
      const values = headers.map(header => {
        const escaped = (row[header] !== null && row[header] !== undefined) ? row[header].toString() : '';
        return `"${escaped.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  private formatDate(date: Date): string {
    const pad = (num: number) => num.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  getHeaderText(): string {
    // Toon nette headertekst op basis van periodType
    let periodLabel = '';
    switch (this.periodType) {
      case 'daily':
        periodLabel = this.translateService.translate('xml.dailyChanges');
        break;
      case 'weekly':
        periodLabel = this.translateService.translate('xml.weeklyChanges');
        break;
      case 'monthly':
        periodLabel = this.translateService.translate('xml.monthlyChanges');
        break;
      case 'yearly':
        periodLabel = this.translateService.translate('xml.yearlyChanges');
        break;
      default:
        periodLabel = this.translateService.translate('xml.changes');
    }
    return periodLabel;
  }

  formatUptime(seconds: number | undefined | null): string {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds === null) return '-';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}u ${m}m`;
    } else if (m > 0) {
      return `${m}m ${s}s`;
    } else {
      return `${s}s`;
    }
  }
}
