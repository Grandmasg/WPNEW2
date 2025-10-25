import { Component, EventEmitter, Input, OnInit, Output, OnChanges, SimpleChanges, ChangeDetectorRef, Injectable, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbDatepickerModule, NgbDateStruct, NgbDatepickerI18n, NgbDatepickerConfig, NgbDateAdapter, NgbDateParserFormatter } from '@ng-bootstrap/ng-bootstrap';
import { LocalizationService } from '../services/localization.service';
import { DebugService } from '../services/debug.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslateService } from '../services/translate.service';
import { Subscription } from 'rxjs';

// Define type for supported languages
type SupportedLanguage = 'nl-NL' | 'en-US' | 'de-DE' | 'fr-FR' | 'es-ES';

// Custom datepicker i18n provider
@Injectable()
export class CustomDatepickerI18n extends NgbDatepickerI18n {
  private currentLang: string = 'en-US';

  constructor(
    private localizationService: LocalizationService,
    private translateService: TranslateService
  ) {
    super();

    // Subscribe to language changes
    this.localizationService.language$.subscribe(lang => {
      this.currentLang = lang;
      // Trigger change detection
      this.getWeekdayLabel(1); // Call any method to notify Angular that things changed
    });
  }

  override getWeekdayLabel(weekday: number): string {
    // Use translate service to get datepicker translations
    const translations = this.translateService.getDatepickerTranslations(this.currentLang);
    return translations.weekdays[weekday - 1];
  }

  override getMonthShortName(month: number): string {
    // Use translate service to get datepicker translations
    const translations = this.translateService.getDatepickerTranslations(this.currentLang);
    return translations.months[month - 1];
  }

  override getMonthFullName(month: number): string {
    return this.getMonthShortName(month);
  }

  override getDayAriaLabel(date: NgbDateStruct): string {
    return `${date.day}-${date.month}-${date.year}`;
  }

  override getWeekLabel(): string {
    // Use translate service to get datepicker translations
    const translations = this.translateService.getDatepickerTranslations(this.currentLang);
    return translations.weekLabel;
  }

  // Helper method to ensure we have a supported language
  private getSupportedLanguage(lang: string): SupportedLanguage {
    switch (lang) {
      case 'nl-NL':
        return 'nl-NL';
      case 'de-DE':
        return 'de-DE';
      case 'fr-FR':
        return 'fr-FR';
      case 'es-ES':
        return 'es-ES';
      default:
        return 'en-US';
    }
  }
}

// Custom date adapter to handle locale-specific formatting
@Injectable()
export class CustomDateAdapter extends NgbDateAdapter<Date> {
  constructor(private localizationService: LocalizationService) {
    super();
  }

  fromModel(date: Date | null): NgbDateStruct | null {
    if (!date) return null;
    
    try {
      // Handle different types of date inputs
      let validDate: Date;
      
      if (date instanceof Date) {
        // If it's already a Date object
        validDate = date;
      } else if (typeof date === 'string') {
        // If it's a string, try to parse it
        validDate = new Date(date);
      } else if (typeof date === 'number') {
        // If it's a timestamp
        validDate = new Date(date);
      } else {
        // Special handling for object that looks like a date struct
        if (typeof date === 'object' && 'year' in date && 'month' in date && 'day' in date) {
          const dateObj = date as any;
          validDate = new Date(dateObj.year, dateObj.month - 1, dateObj.day);
        } else {
          // If it's something else, try to convert
          validDate = new Date(String(date));
        }
      }
      
      // Check if the date is valid
      if (isNaN(validDate.getTime())) {
        // Use safe stringify for logging to avoid circular references
        const safeLog = typeof date === 'object' ? 
          JSON.stringify(date, (key, value) => 
            typeof value === 'object' && value !== null ? 
              Object.keys(value).reduce((acc, k) => {
                if (k !== 'prototype') acc[k] = value[k];
                return acc;
              }, {} as any) : value
          ) : String(date);
        
        console.warn('Invalid date input:', safeLog);
        return null;
      }
      
      return {
        year: validDate.getFullYear(),
        month: validDate.getMonth() + 1,
        day: validDate.getDate()
      };
    } catch (e) {
      // Safe error logging to avoid circular references
      const safeLog = typeof date === 'object' ? 
        JSON.stringify(date, (key, value) => 
          key === 'prototype' ? undefined : value
        ) : String(date);
      
      console.error('Error parsing date in CustomDateAdapter:', e, 'Input was:', safeLog);
      return null;
    }
  }

  toModel(date: NgbDateStruct | null): Date | null {
    if (!date) return null;
    
    try {
      return new Date(date.year, date.month - 1, date.day);
    } catch (e) {
      console.error('Error converting NgbDateStruct to Date:', e);
      return null;
    }
  }
}

// Custom date formatter to handle locale-specific parsing and formatting
@Injectable()
export class CustomDateParserFormatter extends NgbDateParserFormatter {
  private currentLocale: string = 'en-US';
  
  constructor(private localizationService: LocalizationService) {
    super();
    
    this.localizationService.language$.subscribe(lang => {
      this.currentLocale = lang;
    });
  }

  parse(value: string): NgbDateStruct | null {
    if (!value) return null;
    
    try {
      // Try to parse the date based on locale
      const parsedDate = new Date(value);
      if (isNaN(parsedDate.getTime())) return null;
      
      return {
        year: parsedDate.getFullYear(),
        month: parsedDate.getMonth() + 1,
        day: parsedDate.getDate()
      };
    } catch (e) {
      return null;
    }
  }

  format(date: NgbDateStruct | null): string {
    if (!date) return '';
    
    try {
      const jsDate = new Date(date.year, date.month - 1, date.day);
      return jsDate.toLocaleDateString(this.currentLocale);
    } catch (e) {
      return '';
    }
  }
}

export type ViewType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'overall' | 'xml';

@Component({
  selector: 'app-date-input-group',
  standalone: true,
  imports: [CommonModule, FormsModule, NgbDatepickerModule, TranslatePipe],
  templateUrl: './date-input-group.component.html',
  styleUrls: ['./date-input-group.component.scss'],
  providers: [
    { provide: NgbDatepickerI18n, useClass: CustomDatepickerI18n },
    { provide: NgbDateAdapter, useClass: CustomDateAdapter },
    { provide: NgbDateParserFormatter, useClass: CustomDateParserFormatter }
  ]
})
export class DateInputGroupComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() selectedDate: Date = new Date();
  @Input() offset: string | number = '0';
  @Input() viewType: ViewType = 'daily';
  @Output() dateChange = new EventEmitter<Date>();
  @Output() offsetChange = new EventEmitter<string>();

  isYesterday: boolean = false;
  isToday: boolean = true;
  isPreviousPeriod: boolean = false;
  isCurrentPeriod: boolean = true;
  isMetric: boolean = true;

  // For NgbDatepicker
  dateModel!: NgbDateStruct;

  // Set reasonable min/max dates
  minDate: NgbDateStruct = { year: 2000, month: 1, day: 1 };
  maxDate: NgbDateStruct = { year: 2100, month: 12, day: 31 };

  // Change from getter to property
  unitSystemLabel: string = '';

  private currentLang: string = 'en-US';

  // Add missing properties
  weekStartDate: Date = new Date();
  weekEndDate: Date = new Date();
  showUnitToggle: boolean = true;

  private subscriptions: Subscription[] = [];

  constructor(
    private cdr: ChangeDetectorRef,
    private localizationService: LocalizationService,
    private config: NgbDatepickerConfig,
    private debugService: DebugService,
    private translateService: TranslateService
  ) {
    // Configure datepicker options
    config.firstDayOfWeek = 1; // Start week on Monday

    // Subscribe to language changes
    this.localizationService.language$.subscribe(lang => {
      this.currentLang = lang;
      // Update first day of week based on language
      config.firstDayOfWeek = lang === 'nl-NL' ? 1 : 0; // Monday for Dutch, Sunday for English
    });

    this.calculateWeekDates();
  }

  ngOnInit(): void {
    this.debugService.log('DateInputGroup', `Component initialized - viewType: ${this.viewType}, offset: ${this.offset}`);
    this.initializeDate();
    
    // Get initial unit system value from the service
    this.localizationService.unitSystem$.subscribe(system => {
      this.isMetric = system === 'metric';
    }).unsubscribe(); // Immediate unsubscribe as we're just getting the initial value
    
    this.unitSystemLabel = this.localizationService.getUnitSystemLabel();
    
    // Listen for language changes
    const languageSubscription = this.localizationService.language$.subscribe(lang => {
      this.debugService.log('DateInputGroup', `Language changed to: ${lang}, refreshing UI`);
      this.currentLang = lang;
      
      // Immediately update date format when language changes
      this.refreshDateFormat();
      
      // Re-check metric status
      this.localizationService.unitSystem$.subscribe(system => {
        this.isMetric = system === 'metric';
      }).unsubscribe();
      
      this.unitSystemLabel = this.localizationService.getUnitSystemLabel();
      
      // Force UI update
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    });
    
    // Listen for direct date format change events
    const dateFormatListener = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && customEvent.detail.language) {
        this.debugService.log('DateInputGroup', 'Date format change event received:', customEvent.detail);
        this.refreshDateFormat();
        this.cdr.detectChanges();
      }
    };
    
    // Add event listener for date format changes
    document.addEventListener('language-date-format-changed', dateFormatListener);
    
    // Store subscriptions for cleanup
    this.subscriptions.push(languageSubscription);
    
    // Add cleanup function for event listener
    this.subscriptions.push({
      unsubscribe: () => {
        document.removeEventListener('language-date-format-changed', dateFormatListener);
      }
    } as Subscription);
    
    // IMPORTANT: Force a unit system update on language change
    const unitSystemSubscription = this.localizationService.unitSystem$.subscribe(system => {
      this.debugService.log('DateInputGroup', `Unit system changed to: ${system}`);
      this.isMetric = system === 'metric';
      this.unitSystemLabel = this.localizationService.getUnitSystemLabel();
      this.cdr.detectChanges();
    });
    
    this.subscriptions.push(unitSystemSubscription);
    
    // Force initial format refresh
    this.refreshDateFormat();
    this.calculateWeekDates();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['offset']) {
      // When offset changes, immediately update the selected date
      this.initializeDate();
      // Make sure UI is updated
      this.cdr.detectChanges();

      // Emit the new date so parent components are aware
      this.dateChange.emit(this.selectedDate);
    }
  }

  ngAfterViewInit(): void {
    // Force date display update
    setTimeout(() => {
      const dateInputEl = document.querySelector('.date-input') as HTMLInputElement;
      if (dateInputEl) {
        dateInputEl.value = this.getFormattedDate();
      }
    }, 0);
  }

  initializeDate(): void {
    // Handle initial date based on offset
    if (this.offset !== undefined && this.offset !== null) {
      try {
        if (typeof this.offset === 'string' && this.offset.includes('-') && this.offset.split('-').length > 2) {
          // If offset is a date string in format YYYY-MM-DD
          this.selectedDate = new Date(this.offset);
          // Validate the date is valid
          if (isNaN(this.selectedDate.getTime())) {
            throw new Error('Invalid date from string offset');
          }
        } else {
          // If offset is a number (days from current date)
          const offsetValue = parseInt(this.offset.toString(), 10);
          // Create a new date object based on today
          const today = new Date();
          const date = new Date(today);
          // Add the offset to today's date (works with both positive and negative values)
          date.setDate(today.getDate() + offsetValue);

          this.selectedDate = date;
        }
      } catch (error) {
        this.debugService.error('DateInputGroup', 'Error parsing date or offset:', error);
        this.selectedDate = new Date(); // Fallback to today
      }
    }
    // Set the date model for NgbDatepicker
    this.updateDateModel();

    // Check if the date is today or yesterday
    this.updateDayFlags();

    // Recalculate week dates
    this.calculateWeekDates();
  }

  updateDateModel(): void {
    if (!this.selectedDate) {
      this.selectedDate = new Date(); // Default to today if not set
    }
    
    this.dateModel = {
      year: this.selectedDate.getFullYear(),
      month: this.selectedDate.getMonth() + 1, // JavaScript months are 0-based
      day: this.selectedDate.getDate()
    };
    
    // Force UI update with setTimeout
    setTimeout(() => {
      const dateInputEl = document.querySelector('.date-input') as HTMLInputElement;
      if (dateInputEl) {
        dateInputEl.value = this.getFormattedDate();
      }
    }, 0);
    
    this.debugService.log('DateInputGroup', 
      `Date model updated to: ${this.dateModel.year}-${this.dateModel.month}-${this.dateModel.day}`);
  }

  updateDayFlags(): void {
    // For daily view
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    this.isToday = this.isSameDay(this.selectedDate, today);
    this.isYesterday = this.isSameDay(this.selectedDate, yesterday);

    // For other views
    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    this.isCurrentPeriod = currentOffset === 0;
    this.isPreviousPeriod = currentOffset === -1;
  }

  goToPreviousDay(): void {
    if (this.viewType === 'daily') {
      let newOffset = parseInt(this.offset.toString(), 10) - 1;
      this.offset = newOffset.toString();
      this.offsetChange.emit(this.offset);
    }
  }

  goToNextDay(): void {
    if (this.viewType === 'daily') {
      let newOffset = parseInt(this.offset.toString(), 10) + 1;
      this.offset = newOffset.toString();
      this.offsetChange.emit(this.offset);
    }
  }

  goToToday(): void {
    this.debugService.log('DateInputGroup', 'Navigating to today (offset 0)');
    this.offsetChange.emit('0');
  }

  goToYesterday(): void {
    // Go to previous period based on view
    let offset = '-1';
    if (this.viewType === 'weekly') offset = '-1';
    else if (this.viewType === 'monthly') offset = '-1';
    else if (this.viewType === 'yearly') offset = '-1';
    this.debugService.log('DateInputGroup', `Going to previous ${this.viewType} period, offset: ${offset}`);
    this.offsetChange.emit(offset);
  }

  goToPreviousWeek(): void {
    let offsetChange = 0;

    switch (this.viewType) {
      case 'daily':
        offsetChange = -7; // Move back 7 days for daily view
        break;
      case 'weekly':
        offsetChange = -1; // Move back 1 week for weekly view
        break;
      case 'monthly':
        offsetChange = -4; // Approximate 4 weeks for monthly view
        break;
      case 'yearly':
        offsetChange = -12; // Approximate 12 months for yearly view
        break;
      default:
        offsetChange = -7; // Default to 7 days for other views
    }

    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    const newOffset = currentOffset + offsetChange;

    this.debugService.log('DateInputGroup', `Going to previous ${this.viewType} period, offset change: ${offsetChange}, new offset: ${newOffset}`);
    this.offset = newOffset.toString();
    this.offsetChange.emit(this.offset);
  }

  goToNextWeek(): void {
    let offsetChange = 0;

    switch (this.viewType) {
      case 'daily':
        offsetChange = 7; // Move forward 7 days for daily view
        break;
      case 'weekly':
        offsetChange = 1; // Move forward 1 week for weekly view
        break;
      case 'monthly':
        offsetChange = 4; // Approximate 4 weeks for monthly view
        break;
      case 'yearly':
        offsetChange = 12; // Approximate 12 months for yearly view
        break;
      default:
        offsetChange = 7; // Default to 7 days for other views
    }

    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    const newOffset = currentOffset + offsetChange;

    this.debugService.log('DateInputGroup', `Going to next ${this.viewType} period, offset change: ${offsetChange}, new offset: ${newOffset}`);
    this.offset = newOffset.toString();
    this.offsetChange.emit(this.offset);
  }

  onDateSelect(date: NgbDateStruct): void {
    this.debugService.log('DateInputGroup', 'Date selected:', date);
    
    // Convert NgbDateStruct to JavaScript Date object
    const jsDate = new Date(date.year, date.month - 1, date.day);
    
    // Set selectedDate to the actual chosen date
    this.selectedDate = jsDate;
    
    // Calculate offset based on selected date
    const offsetValue = this.calculateOffset(jsDate);
    
    // Update component state and emit events
    this.updateDate(jsDate, offsetValue.toString());
  }

  onDateChange(event: any): void {
    const newDate = event?.target?.value ? new Date(event.target.value) : new Date();
    this.debugService.log('DateInputGroup', `Date changed manually to ${newDate.toISOString()}`);

    this.selectedDate = newDate;
    this.dateChange.emit(newDate);

    // Calculate new offset based on selected date
    this.calculateOffset(newDate);
  }

  calculateOffset(date: Date): number {
    const today = new Date();
    // Reset time portion for accurate day difference calculation
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    // Calculate the difference in days
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    this.debugService.log('DateInputGroup', `Calculated offset: ${diffDays} for date: ${date.toISOString().split('T')[0]}`);
    return diffDays;
  }

  private updateDate(date: Date, offsetValue: string): void {
    this.debugService.log('DateInputGroup', `Updating date to: ${date.toISOString().split('T')[0]}, offset: ${offsetValue}`);

    // Ensure we have a new date instance
    this.selectedDate = new Date(date.getTime());
    this.offset = offsetValue;
    this.updateDateModel();
    this.updateDayFlags();
    // Emit events to notify parent components
    this.dateChange.emit(this.selectedDate);
    this.offsetChange.emit(this.offset);

    // Recalculate week dates
    this.calculateWeekDates();
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getDate() === date2.getDate() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getFullYear() === date2.getFullYear();
  }

  private getLabelForCurrentPeriod(): string {
    switch(this.viewType) {
      case 'weekly': return 'This Week';
      case 'monthly': return 'This Month';
      case 'yearly': return 'This Year';
      default: return 'Today';
    }
  }

  private getLabelForPreviousPeriod(): string {
    switch(this.viewType) {
      case 'weekly': return 'Last Week';
      case 'monthly': return 'Last Month';
      case 'yearly': return 'Last Year';
      default: return 'Yesterday';
    }
  }

  get currentPeriodLabel(): string {
    return this.getLabelForCurrentPeriod();
  }

  get previousPeriodLabel(): string {
    return this.getLabelForPreviousPeriod();
  }

  toggleUnits(): void {
    this.debugService.log('DateInputGroup', `Toggling unit system from ${this.isMetric ? 'metric' : 'imperial'}`);
    this.localizationService.toggleUnitSystem();
    // Force immediate UI update without waiting for subscription
    setTimeout(() => {
      // Get the current unit system from the service
      this.localizationService.unitSystem$.subscribe(system => {
        this.isMetric = system === 'metric';
      }).unsubscribe();
      this.unitSystemLabel = this.localizationService.getUnitSystemLabel();
      this.cdr.detectChanges();
    }, 0);
  }

  toggleUnitSystem(): void {
    if (typeof this.toggleUnits === 'function') {
      this.toggleUnits();
    }
  }

  goToPreviousPeriod(): void {
    const newOffset = this.parseOffset() - this.getOffsetStep();
    this.debugService.log('DateInputGroup', `Navigating to previous period, new offset: ${newOffset}`);
    this.emitOffsetChange(newOffset.toString());
  }

  onPreviousClick(): void {
    const newOffset = this.parseOffset() - this.getOffsetStep();
    this.debugService.log('DateInputGroup', `Navigating to previous period, new offset: ${newOffset}`);
    this.emitOffsetChange(newOffset.toString());
  }

  onNextClick(): void {
    const newOffset = this.parseOffset() + this.getOffsetStep();
    this.debugService.log('DateInputGroup', `Navigating to next period, new offset: ${newOffset}`);
    this.emitOffsetChange(newOffset.toString());
  }

  parseOffset(): number {
    return parseInt(this.offset.toString(), 10) || 0;
  }

  getOffsetStep(): number {
    switch (this.viewType) {
      case 'daily': return 1;
      case 'weekly': return 1;
      case 'monthly': return 1;
      case 'yearly': return 1;
      default: return 1;
    }
  }

  emitOffsetChange(newOffset: string): void {
    this.offset = newOffset;
    this.offsetChange.emit(newOffset);
  }

  goToPreviousMonth(): void {
    // Logic for navigating to the previous month
    this.debugService.log('DateInputGroup', 'Navigating to the previous month');
    // Emit offset change or update dateModel as needed
  }

  goToNextMonth(): void {
    // Logic for navigating to the next month
    this.debugService.log('DateInputGroup', 'Navigating to the next month');
    // Emit offset change or update dateModel as needed
  }

  goToPreviousYear(): void {
    // Logic for navigating to the previous year
    this.debugService.log('DateInputGroup', 'Navigating to the previous year');
    // Emit offset change or update dateModel as needed
  }

  goToNextYear(): void {
    // Logic for navigating to the next year
    this.debugService.log('DateInputGroup', 'Navigating to the next year');
    // Emit offset change or update dateModel as needed
  }

  goToFirstButton(): void {
    let offsetChange = 0;

    switch (this.viewType) {
      case 'daily':
        offsetChange = -7; // Move back 7 days
        break;
      case 'weekly':
        offsetChange = -1; // Move back 1 week
        break;
      case 'monthly':
        offsetChange = -1; // Move back 1 month
        break;
      case 'yearly':
        offsetChange = -1; // Move back 1 year
        break;
    }

    this.updateOffset(offsetChange);
  }

  goToSecondButton(): void {
    // Always move back 1 day, bypassing viewType logic
    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    const newOffset = currentOffset - 1; // Subtract 1 day
    this.debugService.log('DateInputGroup', `Second button clicked: Moving back 1 day. New offset = ${newOffset}`);
    this.offset = newOffset.toString();
    this.offsetChange.emit(this.offset);
  }

  goToThirdButton(): void {
    // Always move forward 1 day, bypassing viewType logic
    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    const newOffset = currentOffset + 1; // Add 1 day
    this.debugService.log('DateInputGroup', `Third button clicked: Moving forward 1 day. New offset = ${newOffset}`);
    this.offset = newOffset.toString();
    this.offsetChange.emit(this.offset);
  }

  goToFourthButton(): void {
    let offsetChange = 0;

    switch (this.viewType) {
      case 'daily':
        offsetChange = 7; // Move forward 7 days
        break;
      case 'weekly':
        offsetChange = 1; // Move forward 1 week
        break;
      case 'monthly':
        offsetChange = 1; // Move forward 1 month
        break;
      case 'yearly':
        offsetChange = 1; // Move forward 1 year
        break;
    }

    this.updateOffset(offsetChange);
  }

  private updateOffset(offsetChange: number): void {
    const currentOffset = parseInt(this.offset.toString(), 10) || 0;
    let newOffset = currentOffset;

    switch (this.viewType) {
      case 'daily':
        newOffset = currentOffset + offsetChange; // Offset is in days
        break;
      case 'weekly':
        newOffset = currentOffset + offsetChange * 7; // Offset is in weeks (7 days per week)
        break;
      case 'monthly':
        newOffset = currentOffset + offsetChange * 30; // Approximate 30 days per month
        break;
      case 'yearly':
        newOffset = currentOffset + offsetChange * 365; // Approximate 365 days per year
        break;
      default:
        newOffset = currentOffset + offsetChange; // Default to daily behavior
    }

    this.debugService.log('DateInputGroup', `Updating offset for ${this.viewType}: current offset = ${currentOffset}, change = ${offsetChange}, new offset = ${newOffset}`);
    this.offset = newOffset.toString();
    this.offsetChange.emit(this.offset);
  }

  changeOffset(offset: string | number): void {
    // Convert string to number if needed
    const numericOffset = typeof offset === 'string' ? parseInt(offset, 10) : offset;

    // Calculate the new offset
    const current = parseInt(this.offset.toString(), 10);
    const updated = current + numericOffset;

    // Create the offset string
    const offsetString = updated.toString();

    // Log the change
    this.debugService.log('DateInputGroup', `Changing offset from ${this.offset} to ${offsetString}`);

    // Dispatch an event that other components can listen for
    const offsetChangeEvent = new CustomEvent('date-offset-changed', {
      bubbles: true,
      detail: {
        period: this.viewType,
        offset: offsetString,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(offsetChangeEvent);

    // Emit the change for parent components
    this.offsetChange.emit(offsetString);

    // Recalculate week dates when offset changes
    this.calculateWeekDates();
  }

  onOffsetChange(newOffset: string): void {
    this.offsetChange.emit(newOffset);
    
    // Dispatch an event for the chart component to listen to
    document.dispatchEvent(new CustomEvent('offset-changed', {
      detail: { offset: newOffset },
      bubbles: true
    }));
  }

  formatDate(date: Date): string {
    if (!date) return '';
    return this.localizationService.formatDate(date, this.viewType === 'yearly' ? 'yearly' : 
                                             (this.viewType === 'monthly' ? 'long' : 'medium'));
  }

  getLocalizedDateFormat(): string {
    // Return the date format placeholder from localization service
    // This is always the same regardless of view type
    return this.localizationService.getDateFormatPlaceholder();
  }

  getFormattedInputDate(): string {
    if (!this.selectedDate) return '';
    
    const locale = this.currentLang || 'en-US';
    return this.selectedDate.toLocaleDateString(locale);
  }

  getFormattedDate(): string {
    // Return consistently formatted date based on current locale
    // regardless of view type (daily, weekly, monthly, yearly)
    if (!this.selectedDate) return '';
    
    try {
      const locale = this.currentLang || 'en-US';
      
      // Use consistent date format options across all view types
      const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      };
      
      return this.selectedDate.toLocaleDateString(locale, options);
    } catch (error) {
      return this.selectedDate.toLocaleDateString();
    }
  }
  
  getDisplayFormattedDate(): string {
    if (!this.selectedDate) return '';
    
    try {
      const locale = this.currentLang || 'en-US';
      let options: Intl.DateTimeFormatOptions;
      
      // Format display differently based on viewType
      switch (this.viewType) {
        case 'monthly':
          options = { year: 'numeric', month: 'long' };
          break;
        case 'yearly':
          options = { year: 'numeric' };
          break;
        case 'weekly':
          // For weekly view, show range of dates
          const weekStart = new Date(this.weekStartDate);
          const weekEnd = new Date(this.weekEndDate);
          const startStr = weekStart.toLocaleDateString(locale, {
            month: 'short', day: 'numeric'
          });
          const endStr = weekEnd.toLocaleDateString(locale, {
            month: 'short', day: 'numeric', year: 'numeric'
          });
          return `${startStr} - ${endStr}`;
        default:
          // For daily view, show full date
          options = { 
            weekday: 'long',
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          };
      }
      
      return this.selectedDate.toLocaleDateString(locale, options);
    } catch (error) {
      this.debugService.error('DateInputGroup', 'Error formatting display date:', error);
      return this.selectedDate.toLocaleDateString();
    }
  }

  calculateWeekDates(): void {
    if (!this.selectedDate) return;

    const date = new Date(this.selectedDate);
    const day = date.getDay();
    const diff = date.getDate() - day;

    this.weekStartDate = new Date(date);
    this.weekStartDate.setDate(diff);

    this.weekEndDate = new Date(this.weekStartDate);
    this.weekEndDate.setDate(this.weekStartDate.getDate() + 6);
  }

  private refreshDateFormat(): void {
    // Get current language from localStorage directly to avoid getDefaultLanguage() issues
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
      this.currentLang = savedLanguage;
    } else {
      // Fallback to navigator language if not in localStorage
      this.currentLang = navigator.language || 'en-US';
    }
    
    this.debugService.log('DateInputGroup', `Refreshing date format with language: ${this.currentLang}`);
    
    // Update date model with current date to force format refresh
    if (this.selectedDate) {
      this.updateDateModel();
      
      // Update input field directly to ensure consistent format
      setTimeout(() => {
        const dateInput = document.querySelector('.date-input') as HTMLInputElement;
        if (dateInput) {
          // Always use the standardized format regardless of view type
          dateInput.value = this.getFormattedDate();
          dateInput.placeholder = this.getLocalizedDateFormat();
        }
      }, 0);
    }
  }
}
