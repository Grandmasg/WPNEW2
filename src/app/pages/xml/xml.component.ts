import { Component, OnInit, OnDestroy, ViewChild, AfterViewInit, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Add FormsModule for ngModel
import { DateInputGroupComponent } from '../../shared/date-input-group/date-input-group.component';
import { StatsService } from '../../shared/services/stats.service';
import { ThemeService } from '../../shared/services/theme.service';
import { DebugService } from '../../shared/services/debug.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { TranslateService } from '../../shared/services/translate.service';
import { ClipboardModule } from 'ngx-clipboard';
import { Subscription } from 'rxjs';
import { trigger, state, style, animate, transition } from '@angular/animations';

// Define the available XML view types
type XmlViewType = 'daily' | 'weekly' | 'monthly' | 'yearly';

@Component({
  selector: 'app-xml',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, // Add FormsModule for ngModel
    DateInputGroupComponent,
    TranslatePipe,
    ClipboardModule
  ],
  templateUrl: './xml.component.html',
  styleUrls: ['./xml.component.scss'],
  animations: [
    trigger('CopyVisible', [
      state('hidden', style({
        opacity: 0,
        transform: 'translateY(10px)'
      })),
      state('visible', style({
        opacity: 1,
        transform: 'translateY(0)'
      })),
      transition('hidden => visible', animate('200ms ease-in')),
      transition('visible => hidden', animate('200ms ease-out'))
    ])
  ]
})
export class XmlComponent implements OnInit, OnDestroy, AfterViewInit {
  offset: string = '0';
  teamname: string = '-';
  searchText: string = '';
  selectedDate: Date = new Date();
  currentTheme: 'dark' | 'light' = 'dark';
  
  // XML data and loading state
  isLoading: boolean = false;
  hasError: boolean = false;
  
  // Date range info for display
  startDate: string | null = null;
  endDate: string | null = null;
  
  // Subscription management
  private subscriptions: Subscription[] = [];
  
  // XML content properties
  xml: string = '';
  splitPart1: string = '';
  splitPart2: string = '';
  isSplit: boolean = false;
  copy: string = '';
  copyPart1: string = '';
  copyPart2: string = '';
  currentState: string = 'hidden';
  currentStatePart1: string = 'hidden';
  currentStatePart2: string = 'hidden';

  // XML content byte size properties
  originalXmlByteSize: number = 0;
  originalSplitPart1ByteSize: number = 0;
  originalSplitPart2ByteSize: number = 0;
  
  // Maximum XML size before splitting (characters)
  private readonly MAX_XML_SIZE = 50000;

  // Add constant for XML split size limit
  private readonly XML_SPLIT_THRESHOLD = 65131; // bytes

  // Add view type for XML switching
  xmlViewType: XmlViewType = 'daily';
  
  // Add label to show current XML type
  xmlViewLabel: string = 'Daily';
  
  // Add loading indicators for different XML types
  isLoadingDaily = false;
  isLoadingWeekly = false;
  isLoadingMonthly = false;
  isLoadingYearly = false;
  
  // Add storage for different XML content types
  xmlDaily: string = '';
  xmlWeekly: string = '';
  xmlMonthly: string = '';
  xmlYearly: string = '';

  // Add properties for height management
  textareaHeight: string = '400px';  // Default height, will be calculated dynamically
  
  @ViewChild('xmlContainer') xmlContainer!: ElementRef;
  private resizeObserver: ResizeObserver | null = null;

  // Add new parameters
  topnr: string = '25';  // Changed default from '0' to '25'
  othernr: string = '15'; // Changed default from '0' to '15'
  teamnr: string = '12'; // Changed default from '0' to '12'

  // Update predefined filter options and defaults
  topnrOptions: string[] = ['25', '50'];
  othernrOptions: string[] = ['10', '15', '20', '25'];
  teamnrOptions: string[] = ['6', '8', '10', '12', '14', '16', '18'];

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private statsService: StatsService,
    private themeService: ThemeService,
    private translateService: TranslateService,
    private debugService: DebugService
  ) {}
  
  ngOnInit(): void {
    // Subscribe to route parameter changes
    const routeSub = this.route.params.subscribe(params => {
      const newOffset = params['offset'] || '0';
      const newTeamname = params['team'] || '-';
      const newSearchText = params['search'] || '';

      if (newOffset !== this.offset || newTeamname !== this.teamname || newSearchText !== this.searchText) {
        this.offset = newOffset;
        this.teamname = newTeamname;
        this.searchText = newSearchText;

        // Calculate selected date based on offset
        this.updateSelectedDate();
        
        // Check for query parameters
        this.route.queryParams.subscribe(queryParams => {
          this.topnr = queryParams['topnr'] || '25';  // Default to 25 instead of 0
          this.othernr = queryParams['othernr'] || '15';  // Default to 15 instead of 0
          this.teamnr = queryParams['teamnr'] || '12';  // Default to 12 instead of 0
        });

        // Load XML data
        this.loadXmlData();
      } else {
        this.debugService.log('XML', 'Parameters unchanged, skipping data reload.');
      }
    });
    this.subscriptions.push(routeSub);

    // Load the saved theme from localStorage or default to dark
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
    this.currentTheme = savedTheme || 'dark';
    this.applyTheme();

    // Subscribe to theme changes
    const themeSub = this.themeService.currentTheme$.subscribe(theme => {
      this.currentTheme = theme === 'system' ? 'light' : theme;
      this.applyTheme();
    });
    this.subscriptions.push(themeSub);

    // Initial calculation of textarea height
    setTimeout(() => this.calculateTextareaHeight(), 0);
    
    // Set up resize listener
    window.addEventListener('resize', this.onResize.bind(this));
  }
  
  ngAfterViewInit(): void {
    // Set up ResizeObserver to monitor container size changes
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.calculateTextareaHeight();
      });
      
      if (this.xmlContainer && this.xmlContainer.nativeElement) {
        this.resizeObserver.observe(this.xmlContainer.nativeElement);
      }
    }
    
    // Calculate height after view is initialized
    this.calculateTextareaHeight();
  }

  ngOnDestroy(): void {
    // Clean up all subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Clean up resize listener
    window.removeEventListener('resize', this.onResize.bind(this));
    
    // Clean up ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }
  
  private onResize(): void {
    this.calculateTextareaHeight();
  }
  
  /**
   * Calculate the available height for the textarea
   */
  private calculateTextareaHeight(): void {
    if (!this.xmlContainer) return;
    
    // Get viewport height
    const viewportHeight = window.innerHeight;
    
    // Calculate height of fixed elements
    const topNavbarHeight = 56; // Standard Bootstrap navbar height
    const bottomNavbarHeight = 56; // Bottom navbar height
    const containerOffset = this.getOffsetTop(this.xmlContainer.nativeElement);
    const dateInputHeight = 100; // Approximate height of the date input group
    const cardHeaderHeight = 56; // Approximate height of the card header
    const alertHeight = 60; // Approximate height of the alert
    const buttonMargin = 30; // Space for the copy button and margin
    
    // Calculate available space
    let availableHeight = viewportHeight - topNavbarHeight - bottomNavbarHeight - 
                         containerOffset - dateInputHeight - cardHeaderHeight - 
                         alertHeight - buttonMargin;
    
    // Minimum height to prevent too small textareas
    availableHeight = Math.max(availableHeight, 200);
    
    // If using split view, divide the height
    if (this.isSplit) {
      // Account for the extra heading and button space between textareas
      const splitExtraSpace = 70; // Space for h4 heading and margins
      availableHeight = Math.max(Math.floor((availableHeight - splitExtraSpace) / 2), 150);
      this.textareaHeight = `${availableHeight}px`;
    } else {
      // Use full available height for single textarea
      this.textareaHeight = `${availableHeight}px`;
    }
    
    this.debugService.log('XML', `Calculated textarea height: ${this.textareaHeight}`);
  }
  
  /**
   * Helper method to get the offset top position of an element
   */
  private getOffsetTop(element: HTMLElement): number {
    let offsetTop = 0;
    while(element) {
      offsetTop += element.offsetTop;
      element = element.offsetParent as HTMLElement;
    }
    return offsetTop;
  }

  updateSelectedDate(): void {
    const offsetValue = parseInt(this.offset, 10) || 0;
    const date = new Date();
    date.setDate(date.getDate() + offsetValue);
    this.selectedDate = date;
  }
  
  onDateChange(date: Date): void {
    this.selectedDate = date;
  }
  
  onOffsetChange(offset: string): void {
    this.debugService.log('XML', `Offset changed to: ${offset}`);
    
    if (offset !== this.offset) {
      // Navigate with updated offset, preserving team and search
      this.router.navigate(['/x/xml', offset, this.teamname], {
        queryParams: {
          topnr: this.topnr !== '0' ? this.topnr : null,
          othernr: this.othernr !== '0' ? this.othernr : null,
          teamnr: this.teamnr !== '0' ? this.teamnr : null
        },
        queryParamsHandling: 'merge'
      });
    }
  }

  loadXmlData(): void {
    this.isLoading = true;
    this.hasError = false;
    
    this.debugService.log('XML', `Loading XML data - type: ${this.xmlViewType}, offset: ${this.offset}, team: ${this.teamname}, search: ${this.searchText}, filters: topnr=${this.topnr}, othernr=${this.othernr}, teamnr=${this.teamnr}`);
    
    // Load based on current view type
    switch(this.xmlViewType) {
      case 'daily':
        this.loadDailyXml();
        break;
      case 'weekly':
        this.loadWeeklyXml();
        break;
      case 'monthly':
        this.loadMonthlyXml();
        break;
      case 'yearly':
        this.loadYearlyXml();
        break;
    }
  }
  
  // Helper methods for loading specific XML types
  loadDailyXml(): void {
    if (this.isLoadingDaily) return;
    
    this.isLoadingDaily = true;
    
    this.statsService.getXmlDaily(this.offset, this.teamname, this.searchText, this.topnr, this.othernr, this.teamnr)
      .subscribe({
        next: (data) => {
          if (data && data.xml) {
            this.xmlDaily = data.xml;
            this.xml = this.xmlDaily;
            
            // Process XML content and handle splitting if needed
            this.processXmlContent(this.xml);
            
            if (data.__dateRange) {
              this.startDate = data.__dateRange.start;
              this.endDate = data.__dateRange.end;
            }
          } else {
            this.xmlDaily = '';
            this.xml = '';
            this.splitPart1 = '';
            this.splitPart2 = '';
            this.isSplit = false;
          }
          
          this.isLoadingDaily = false;
          this.isLoading = false;
          this.xmlViewLabel = 'Daily';
        },
        error: (error) => {
          this.debugService.error('XML', 'Error loading daily XML data:', error);
          this.hasError = true;
          this.isLoadingDaily = false;
          this.isLoading = false;
          this.xml = '';
        }
      });
  }
  
  loadWeeklyXml(): void {
    if (this.isLoadingWeekly) return;
    
    this.isLoadingWeekly = true;
    
    this.statsService.getXmlWeekly(this.offset, this.teamname, this.searchText, this.topnr, this.othernr, this.teamnr)
      .subscribe({
        next: (data) => {
          if (data && data.xml) {
            this.xmlWeekly = data.xml;
            this.xml = this.xmlWeekly;
            
            // Process XML content and handle splitting if needed
            this.processXmlContent(this.xml);
            
            if (data.__dateRange) {
              this.startDate = data.__dateRange.start;
              this.endDate = data.__dateRange.end;
            }
          } else {
            this.xmlWeekly = '';
            this.xml = '';
            this.splitPart1 = '';
            this.splitPart2 = '';
            this.isSplit = false;
          }
          
          this.isLoadingWeekly = false;
          this.isLoading = false;
          this.xmlViewLabel = 'Weekly';
        },
        error: (error) => {
          this.debugService.error('XML', 'Error loading weekly XML data:', error);
          this.hasError = true;
          this.isLoadingWeekly = false;
          this.isLoading = false;
          this.xml = '';
        }
      });
  }
  
  loadMonthlyXml(): void {
    if (this.isLoadingMonthly) return;
    
    this.isLoadingMonthly = true;
    
    this.statsService.getXmlMonthly(this.offset, this.teamname, this.searchText, this.topnr, this.othernr, this.teamnr)
      .subscribe({
        next: (data) => {
          if (data && data.xml) {
            this.xmlMonthly = data.xml;
            this.xml = this.xmlMonthly;
            
            // Process XML content and handle splitting if needed
            this.processXmlContent(this.xml);
            
            if (data.__dateRange) {
              this.startDate = data.__dateRange.start;
              this.endDate = data.__dateRange.end;
            }
          } else {
            this.xmlMonthly = '';
            this.xml = '';
            this.splitPart1 = '';
            this.splitPart2 = '';
            this.isSplit = false;
          }
          
          this.isLoadingMonthly = false;
          this.isLoading = false;
          this.xmlViewLabel = 'Monthly';
        },
        error: (error) => {
          this.debugService.error('XML', 'Error loading monthly XML data:', error);
          this.hasError = true;
          this.isLoadingMonthly = false;
          this.isLoading = false;
          this.xml = '';
        }
      });
  }
  
  loadYearlyXml(): void {
    if (this.isLoadingYearly) return;
    
    this.isLoadingYearly = true;
    
    this.statsService.getXmlYearly(this.offset, this.teamname, this.searchText, this.topnr, this.othernr, this.teamnr)
      .subscribe({
        next: (data) => {
          if (data && data.xml) {
            this.xmlYearly = data.xml;
            this.xml = this.xmlYearly;
            
            // Process XML content and handle splitting if needed
            this.processXmlContent(this.xml);
            
            if (data.__dateRange) {
              this.startDate = data.__dateRange.start;
              this.endDate = data.__dateRange.end;
            }
          } else {
            this.xmlYearly = '';
            this.xml = '';
            this.splitPart1 = '';
            this.splitPart2 = '';
            this.isSplit = false;
          }
          
          this.isLoadingYearly = false;
          this.isLoading = false;
          this.xmlViewLabel = 'Yearly';
        },
        error: (error) => {
          this.debugService.error('XML', 'Error loading yearly XML data:', error);
          this.hasError = true;
          this.isLoadingYearly = false;
          this.isLoading = false;
          this.xml = '';
        }
      });
  }
  
  // Method to switch XML view type - renamed from switchXmlType to setXmlViewType to match HTML
  setXmlViewType(type: XmlViewType): void {
    if (this.xmlViewType === type) return;
    
    this.xmlViewType = type;
    
    // Use cached XML if available, otherwise load it
    switch(type) {
      case 'daily':
        if (this.xmlDaily) {
          this.xml = this.xmlDaily;
          this.processXmlContent(this.xml);
          this.xmlViewLabel = 'Daily';
        } else {
          this.loadDailyXml();
        }
        break;
      case 'weekly':
        if (this.xmlWeekly) {
          this.xml = this.xmlWeekly;
          this.processXmlContent(this.xml);
          this.xmlViewLabel = 'Weekly';
        } else {
          this.loadWeeklyXml();
        }
        break;
      case 'monthly':
        if (this.xmlMonthly) {
          this.xml = this.xmlMonthly;
          this.processXmlContent(this.xml);
          this.xmlViewLabel = 'Monthly';
        } else {
          this.loadMonthlyXml();
        }
        break;
      case 'yearly':
        if (this.xmlYearly) {
          this.xml = this.xmlYearly;
          this.processXmlContent(this.xml);
          this.xmlViewLabel = 'Yearly';
        } else {
          this.loadYearlyXml();
        }
        break;
    }
  }

  // Process XML content and determine if it needs to be split
  private processXmlContent(xmlContent: string): void {
    if (!xmlContent) {
      this.xml = '';
      this.splitPart1 = '';
      this.splitPart2 = '';
      this.isSplit = false;
      this.originalXmlByteSize = 0;
      this.originalSplitPart1ByteSize = 0;
      this.originalSplitPart2ByteSize = 0;
      return;
    }
    
    // Calculate the byte size of the original XML content
    this.originalXmlByteSize = this.getByteSize(xmlContent);
    this.debugService.log('XML', `Original XML content size: ${this.originalXmlByteSize} bytes`);
    
    // Always check for split point marker first, regardless of size
    const splitPointMarker = "<!-- SPLIT POINT -->";
    const splitPointIndex = xmlContent.indexOf(splitPointMarker);
    
    if (splitPointIndex !== -1) {
      // Found the custom split point marker
      this.debugService.log('XML', `Found custom split point marker at index ${splitPointIndex}`);
      
      // Split at the marker, removing the marker entirely
      const rawPart1 = xmlContent.substring(0, splitPointIndex);
      const rawPart2 = xmlContent.substring(splitPointIndex + splitPointMarker.length);
      
      // Store the original byte sizes before any replacements
      this.originalSplitPart1ByteSize = this.getByteSize(rawPart1);
      this.originalSplitPart2ByteSize = this.getByteSize(rawPart2);
      
      // Replace HTML entities in each part separately after splitting
      this.splitPart1 = rawPart1.replace(/&#093;/g, ']');
      this.splitPart2 = rawPart2.replace(/&#093;/g, ']');
      
      this.isSplit = true;
      
      this.debugService.log('XML', `Split at custom marker: 
        Part 1: ${this.splitPart1.length} chars (${this.originalSplitPart1ByteSize} bytes), 
        Part 2: ${this.splitPart2.length} chars (${this.originalSplitPart2ByteSize} bytes)`);
    } 
    // Only use size threshold if no explicit split marker is found
    else if (this.getByteSize(xmlContent) > this.XML_SPLIT_THRESHOLD) {
      this.debugService.log('XML', `XML content exceeds threshold (${this.XML_SPLIT_THRESHOLD} bytes), using default split`);
      
      // Split content into two parts at approximately half the size
      const splitIndex = Math.floor(xmlContent.length / 2);
      
      // Try to find a clean split point at a newline near the halfway point
      let cleanSplitIndex = xmlContent.indexOf('\n', splitIndex);
      
      // If no newline found after the midpoint, try to find one before
      if (cleanSplitIndex === -1) {
        cleanSplitIndex = xmlContent.lastIndexOf('\n', splitIndex);
      }
      
      // Use the clean split index if found, otherwise use the exact midpoint
      const finalSplitIndex = cleanSplitIndex !== -1 ? cleanSplitIndex : splitIndex;
      
      // Split the content
      const rawPart1 = xmlContent.substring(0, finalSplitIndex);
      const rawPart2 = xmlContent.substring(finalSplitIndex);
      
      // Calculate original byte sizes before entity replacement
      this.originalSplitPart1ByteSize = this.getByteSize(rawPart1);
      this.originalSplitPart2ByteSize = this.getByteSize(rawPart2);
      
      // Replace HTML entities in each part separately after splitting
      this.splitPart1 = rawPart1.replace(/&#093;/g, ']');
      this.splitPart2 = rawPart2.replace(/&#093;/g, ']');
      
      this.isSplit = true;
      
      this.debugService.log('XML', `Standard split at index ${finalSplitIndex}: 
        Part 1: ${this.splitPart1.length} chars (${this.originalSplitPart1ByteSize} bytes)
        Part 2: ${this.splitPart2.length} chars (${this.originalSplitPart2ByteSize} bytes)`);
    } else {
      // No need to split, but still replace HTML entities
      this.xml = xmlContent.replace(/&#093;/g, ']');
      this.splitPart1 = '';
      this.splitPart2 = '';
      this.isSplit = false;
      this.originalSplitPart1ByteSize = 0;
      this.originalSplitPart2ByteSize = 0;
    }
    
    // Recalculate textarea height after processing content
    setTimeout(() => this.calculateTextareaHeight(), 0);
  }

  // Add this method to calculate byte size of a string
  getByteSize(text: string): number {
    if (!text) return 0;
    return new TextEncoder().encode(text).length;
  }
  
  // Add a method to format byte size for display
  formatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    else if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)} KB`;
    else return `${(bytes / 1048576).toFixed(2)} MB`;
  }

  // Add a method to get the original XML byte size
  getOriginalXmlByteSize(): number {
    return this.originalXmlByteSize;
  }

  // Handle copy for full XML
  click(): void {
    this.copy = 'Copied!';
    this.currentState = 'visible';
    
    setTimeout(() => {
      this.currentState = 'hidden';
      setTimeout(() => {
        this.copy = '';
      }, 200);
    }, 2000);
  }
  
  // Handle copy for XML parts
  clickPart(part: number): void {
    if (part === 1) {
      this.copyPart1 = 'Copied!';
      this.currentStatePart1 = 'visible';
      
      setTimeout(() => {
        this.currentStatePart1 = 'hidden';
        setTimeout(() => {
          this.copyPart1 = '';
        }, 200);
      }, 2000);
    } else {
      this.copyPart2 = 'Copied!';
      this.currentStatePart2 = 'visible';
      
      setTimeout(() => {
        this.currentStatePart2 = 'hidden';
        setTimeout(() => {
          this.copyPart2 = '';
        }, 200);
      }, 2000);
    }
  }

  // Add copyToClipboard method to match HTML template references
  copyToClipboard(content: string): void {
    try {
      navigator.clipboard.writeText(content)
        .then(() => {
          // Show success notification based on which part is being copied
          if (content === this.xml) {
            this.click();
          } else if (content === this.splitPart1) {
            this.clickPart(1);
          } else if (content === this.splitPart2) {
            this.clickPart(2);
          }
        })
        .catch(err => {
          this.debugService.error('XML', 'Error copying to clipboard:', err);
          // Fallback copy mechanism
          const textarea = document.createElement('textarea');
          textarea.value = content;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
          
          // Still show the notification
          if (content === this.xml) {
            this.click();
          } else if (content === this.splitPart1) {
            this.clickPart(1);
          } else if (content === this.splitPart2) {
            this.clickPart(2);
          }
        });
    } catch (error) {
      this.debugService.error('XML', 'Error in copyToClipboard:', error);
    }
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-bs-theme', this.currentTheme);
    this.debugService.log('XML', `Theme applied: ${this.currentTheme}`);
  }

  // Fix method signature to match what's expected (accept 0 or 1 parameters)
  getFormattedDate(date: Date = this.selectedDate): string {
    if (!date) return '';
    
    try {
      // Get current language from translate service
      const currentLang = this.translateService.getCurrentLanguage();
      
      // Create localized date format options
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        weekday: 'long'
      };
      
      // Use the browser's built-in formatting
      return date.toLocaleDateString(currentLang, options);
    } catch (error) {
      this.debugService.error('XML', 'Error formatting date:', error);
      return date.toDateString(); // Fallback format
    }
  }

  // Add method to apply filters
  applyFilters(): void {
    // Navigate to the same route but with query parameters
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        topnr: this.topnr,
        othernr: this.othernr,
        teamnr: this.teamnr
      },
      queryParamsHandling: 'merge'
    });
    
    // Load XML data again with the new filters
    this.loadXmlData();
  }
}
