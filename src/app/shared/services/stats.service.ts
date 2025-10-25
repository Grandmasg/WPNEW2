import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { DebugService } from './debug.service';

export interface StatRecord {
  id: number;
  name: string;
  username: string; // Make sure this is explicitly defined
  keys: number;
  clicks: number;
  scrolls: number;
  distance: number;
  download: string;
  upload: string;
  uptime: string;
  pulses: number;
  [key: string]: any; // Allow additional fields
}

export interface StatsResponse {
  data: StatRecord[] | any[];
  [key: string]: any;
}

export interface XmlChangeUser {
  UserID: number;
  Username: string;
  Keys1: number;
  Clicks: number;
  Download: number;
  Upload: number;
  UptimeSeconds: number;
  Pulses: number;
  Team: string;
  datum: string;
  wasInYesterday?: boolean; // Add this optional property
}

export interface XmlChangeSummary {
  date: string;
  startDate?: string; // Add start date
  endDate?: string;   // Add end date
  added: number;
  left: number;
  changed: number;
  summary?: string; // Make summary optional
}

export interface XmlChangeResponse {
  changes: {
    added: XmlChangeUser[];
    left: XmlChangeUser[];
    changed: XmlChangeUser[];
  };
  changeSummary: XmlChangeSummary[];
  day?: { 
    start: string;
    end: string;
  };
  week?: {
    start: string;
    end: string;
  };
  month?: {
    start: string;
    end: string;
  };
  metadata?: {
    period?: string;
    offset?: string;
    date?: string;
    team?: string;
  };
}

export interface DateRange {
  start: string;
  end: string;
}

@Injectable({
  providedIn: 'root'
})
export class StatsService {
  constructor(
    private http: HttpClient,
    private apiService: ApiService, 
    private debugService: DebugService
  ) {}

  getDailyStats(offset: string = '0', teamname: string = '-', search: string = ''): Observable<StatRecord[]> {
    const params = new HttpParams()
      .set('offset', offset)
      .set('teamname', teamname)
      .set('search', search || '');
    
    this.debugService.log('StatsService', `Fetching daily stats - offset: ${offset}, team: ${teamname}, search: ${search || 'none'}`);
    return this.apiService.getDailyData(offset, teamname, search).pipe(
      map(data => this.processStatsResponse(data, 'daily'))
    );
  }

  /**
   * Get weekly statistics
   */
  public getWeeklyStats(offset: string = '0', team: string = '-', search?: string): Observable<StatRecord[]> {
    this.debugService.log('StatsService', `getWeeklyStats called - offset: ${offset}, team: ${team}, search: "${search}"`);
    
    return this.apiService.getWeeklyData(offset, team, search).pipe(
      map(response => {
        this.debugService.log('StatsService', 'Raw weekly API response:', response);
        
        // Process the stats data with the required period parameter
        const processedStats = this.processStatsResponse(response, 'weekly');
        
        // IMPORTANT: Preserve the XML date range from the API response
        if (response && (response.current || response.previous)) {
          (processedStats as any).current = response.current;
          (processedStats as any).previous = response.previous;
          this.debugService.log('StatsService', `Preserving XML dates in weekly stats: current=${response.current}, previous=${response.previous}`);
        }
        
        return processedStats;
      }),
      catchError(this.handleError<StatRecord[]>('getWeeklyStats', []))
    );
  }

  getMonthlyStats(offset: string, team: string = '-', search: string = ''): Observable<StatRecord[]> {
    this.debugService.log('StatsService', `Getting monthly stats - offset: ${offset}, team: ${team}, search: ${search ? search : 'none'}`);
    return this.apiService.getMonthlyData(offset, team, search).pipe(
      map(response => {
        // Check for month data structure in response
        let dataArray: StatRecord[];
        if (response && typeof response === 'object' && response.month) {
          this.debugService.log('StatsService', `Found month date range: ${JSON.stringify(response.month)}`);
          dataArray = this.extractDataFromResponse(response);
          Object.defineProperty(dataArray, 'month', {
            value: response.month,
            enumerable: false,
            configurable: true
          });
          this.debugService.log('StatsService', `Added month date range to results array`);
        } else {
          dataArray = this.processStatsResponse(response, 'monthly');
        }
        // Preserve XML dates in monthly stats if present
        if (response && (response.current || response.previous)) {
          (dataArray as any).current = response.current;
          (dataArray as any).previous = response.previous;
          this.debugService.log('StatsService', `Preserving XML dates in monthly stats: current=${response.current}, previous=${response.previous}`);
        }
        return dataArray;
      }),
      catchError(this.handleError<StatRecord[]>('getMonthlyStats', []))
    );
  }

  getYearlyStats(offset: string, team: string = '-', search: string = ''): Observable<StatRecord[]> {
    this.debugService.log('StatsService', `Getting yearly stats - offset: ${offset}, team: ${team}, search: ${search ? search : 'none'}`);
    return this.apiService.getYearlyData(offset, team, search).pipe(
      map(response => {
        // Check for year data structure in response, similar to how monthly stats handles it
        if (response && typeof response === 'object') {
          if (response.year) {
            this.debugService.log('StatsService', `Found year date range: ${JSON.stringify(response.year)}`);
            
            // Extract the data array if it exists
            const dataArray = this.extractDataFromResponse(response);
            
            // Add the year object as a non-enumerable property
            Object.defineProperty(dataArray, 'year', {
              value: response.year,
              enumerable: false,
              configurable: true
            });
            
            this.debugService.log('StatsService', `Added year date range to results array`);
            
            // Preserve XML dates in yearly stats if present
            if (response.current || response.previous) {
              (dataArray as any).current = response.current;
              (dataArray as any).previous = response.previous;
              this.debugService.log('StatsService', `Preserving XML dates in yearly stats: current=${response.current}, previous=${response.previous}`);
            }
            
            return dataArray;
          }
        }
        
        // If no year object found, process it normally
        const processedStats = this.processStatsResponse(response, 'yearly');
        
        // Preserve XML dates in yearly stats if present
        if (response && (response.current || response.previous)) {
          (processedStats as any).current = response.current;
          (processedStats as any).previous = response.previous;
          this.debugService.log('StatsService', `Preserving XML dates in yearly stats: current=${response.current}, previous=${response.previous}`);
        }
        
        return processedStats;
      }),
      catchError(this.handleError<StatRecord[]>('getYearlyStats', []))
    );
  }

  /**
   * Get XML changes data for various periods
   */
  getChanges(offset: string, team: string = '-', period: string = 'daily'): Observable<any> {
    // Add debug logging to track the API call
    this.debugService.log('StatsService', `Getting ${period} changes with offset: ${offset}, team: ${team}`);
    
    // Make sure the period is a valid value (daily, weekly, monthly, yearly, overall)
    const validPeriod = ['daily', 'weekly', 'monthly', 'yearly', 'overall'].includes(period) 
      ? period 
      : 'daily';
    
    // Call the API service with the correct period parameter
    return this.apiService.getChangesData(validPeriod, offset, team).pipe(
      tap(data => {
        this.debugService.log('StatsService', `Received ${period} changes data:`, data);
        
        // Log a more detailed summary of changes data structure
        if (data && data.changes) {
          const addedCount = Array.isArray(data.changes.added) ? data.changes.added.length : 0;
          const changedCount = Array.isArray(data.changes.changed) ? data.changes.changed.length : 0;
          const leftCount = Array.isArray(data.changes.left) ? data.changes.left.length : 0;
          
          this.debugService.log('StatsService', 
            `${period} changes summary: added=${addedCount}, changed=${changedCount}, left=${leftCount}`);
        } else {
          this.debugService.warn('StatsService', 
            `Missing or invalid changes structure for ${period}:`, data);
        }
      }),
      catchError(error => {
        this.debugService.error('StatsService', `Error fetching ${period} changes:`, error);
        // Return a properly structured empty response
        return of({
          changes: {
            added: [],
            changed: [],
            left: []
          }
        });
      })
    );
  }

  public getOverallStats(offset: string, team: string = '-', search: string = ''): Observable<StatRecord[]> {
    this.debugService.log('StatsService', `Getting overall stats - offset: ${offset}, team: ${team}, search: ${search ? search : 'none'}`);
    return this.apiService.getOverallData(offset, team, search).pipe(
      map(data => this.processStatsResponse(data, 'overall'))
    );
  }

  /**
   * Get XML data for various periods
   */
  getXmlDaily(offset: string, team: string, search: string = '', topnr: string = '0', othernr: string = '0', teamnr: string = '0'): Observable<any> {
    return this.apiService.getXmlData('daily', offset, team, search, topnr, othernr, teamnr);
  }

  getXmlWeekly(offset: string, team: string, search: string = '', topnr: string = '0', othernr: string = '0', teamnr: string = '0'): Observable<any> {
    return this.apiService.getXmlData('weekly', offset, team, search, topnr, othernr, teamnr);
  }

  getXmlMonthly(offset: string, team: string, search: string = '', topnr: string = '0', othernr: string = '0', teamnr: string = '0'): Observable<any> {
    return this.apiService.getXmlData('monthly', offset, team, search, topnr, othernr, teamnr);
  }

  getXmlYearly(offset: string, team: string, search: string = '', topnr: string = '0', othernr: string = '0', teamnr: string = '0'): Observable<any> {
    return this.apiService.getXmlData('yearly', offset, team, search, topnr, othernr, teamnr);
  }

  private countChangesDetails(data: any): number {
    if (!data || !data.changes) return 0;
    const added = data.changes.added?.length || 0;
    const changed = data.changes.changed?.length || 0;
    const left = data.changes.left?.length || 0;
    return added + changed + left;
  }

  private processStatsResponse(response: any, period: string): StatRecord[] {
    this.debugService.log('StatsService', `Processing ${period} response:`, response);
    
    // Look for date range in the response
    if (response?.[period]) {
      this.debugService.log('StatsService', `Found ${period} date range: ${JSON.stringify(response[period])}`);
      
      // Extract stats data from the response
      const result = this.extractDataFromResponse(response);
      
      // Add date range as a non-enumerable property to avoid interfering with array methods
      Object.defineProperty(result, '__dateRange', {
        value: response[period],
        enumerable: false,
        configurable: true
      });
      
      this.debugService.log('StatsService', `Added date range to result object: ${JSON.stringify(response[period])}`);
      return result;
    }
    
    // Extract stats data from the response
    const data = this.extractDataFromResponse(response);
    this.debugService.log('StatsService', `Extracted ${data.length} ${period} stats records`);
    return data;
  }

  // Method to extract XML change data from response
  private extractXmlChangeData(response: XmlChangeResponse | any, formattedDate: string): XmlChangeSummary[] {
    // Extract date ranges
    let startDate = null;
    let endDate = null;
    
    if (response?.dateRange) {
      startDate = response.dateRange.start;
      endDate = response.dateRange.end;
    } else if (response?.day) {
      startDate = response.day.start;
      endDate = response.day.end;
    } else if (response?.week) {
      startDate = response.week.start;
      endDate = response.week.end;
    } else if (response?.month) {
      startDate = response.month.start;
      endDate = response.month.end;
    }

    if (response?.changeSummary && Array.isArray(response.changeSummary)) {
      return response.changeSummary.map((item: XmlChangeSummary) => ({
        ...item,
        date: formattedDate || item.date,
        startDate: startDate || item.startDate,
        endDate: endDate || item.endDate,
        summary: item.summary || 'XML changes detected'
      }));
    } else if (response?.changes) {
      try {
        if (response.changeSummary?.[0]) {
          return [{
            date: formattedDate,
            startDate: startDate,
            endDate: endDate,
            added: response.changeSummary[0].added || 0,
            left: response.changeSummary[0].left || 0,
            changed: response.changeSummary[0].changed || 0,
            summary: 'XML changes detected'
          }];
        } else {
          return [{
            date: formattedDate,
            startDate: startDate,
            endDate: endDate,
            added: response.changes.added?.length || 0,
            left: response.changes.left?.length || 0,
            changed: response.changes.changed?.length || 0,
            summary: 'XML changes detected'
          }];
        }
      } catch (error) {
        this.debugService.error('StatsService', 'Error extracting XML changes:', error);
        return [{
          date: formattedDate,
          startDate: startDate,
          endDate: endDate,
          added: Array.isArray(response.changes.added) ? response.changes.added.length : 0,
          left: Array.isArray(response.changes.left) ? response.changes.left.length : 0,
          changed: Array.isArray(response.changes.changed) ? response.changes.changed.length : 0,
          summary: 'XML changes detected'
        }];
      }
    } else {
      return [];
    }
  }
  
  // Helper method for formatting dates
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private extractDataFromResponse(response: StatsResponse | any): StatRecord[] {
    let records: StatRecord[] = [];
    
    if (response && response.data && Array.isArray(response.data)) {
      // Standard format - extract and normalize fields
      records = response.data.map((item: any, index: number) => this.normalizeRecord(item, index));
    } else if (response && Array.isArray(response)) {
      // Direct array format
      records = response.map((item: any, index: number) => this.normalizeRecord(item, index));
    } else if (response && typeof response === 'object') {
      // Might be in a different format, try to extract data
      const possibleData = Object.values(response).find(val => 
        Array.isArray(val) || (typeof val === 'object' && val !== null)
      );
      
      if (Array.isArray(possibleData)) {
        records = possibleData.map((item: any, index: number) => this.normalizeRecord(item, index));
      } else {
        this.debugService.error('StatsService', 'Unexpected response format:', response);
      }
    } else {
      this.debugService.error('StatsService', 'Unexpected response format:', response);
    }
    
    return records;
  }
  
  // Normalize record fields to handle different naming conventions
  private normalizeRecord(item: any, index: number): StatRecord {
    // Handle potential null or undefined items
    if (!item) {
      return this.createEmptyRecord(index);
    }
    
    // Fix priority for pulses field - check StatsPulses first, then PulsesToday
    const pulsesValue = this.parseNumberField(
      item.StatsPulses !== undefined ? item.StatsPulses : 
      (item.PulsesToday !== undefined ? item.PulsesToday : 
       (item.Pulses !== undefined ? item.Pulses : 0))
    );
    
    return {
      id: item.id || item.UserID || index + 1,
      name: item.name || item.Name || item.UsernameFull || '',
      username: item.username || item.Username || item.UserName || '', 
      // Handle different field names
      keys: this.parseNumberField(item.Keys1 || item.StatsKeys),
      clicks: this.parseNumberField(item.Clicks || item.StatsClicks),
      scrolls: this.parseNumberField(item.Scrolls || item.StatsScrolls),
      distance: this.parseNumberField(item.DistanceInMiles || item.StatsDistance),
      download: item.DownloadMB || item.StatsDownloadMB || '0',
      upload: item.UploadMB || item.StatsUploadMB || '0',
      uptime: item.UptimeSeconds || item.StatsUptimeSeconds || '0',
      pulses: pulsesValue,
      
      // Make sure we capture all possible rank fields for both Today and Yesterday
      RankKeysToday: item.RankKeysToday,
      RankKeysYesterday: item.RankKeysYesterday,
      StatsRankKeys: item.StatsRankKeys,
      RankClicksToday: item.RankClicksToday,
      RankClicksYesterday: item.RankClicksYesterday,
      StatsRankClicks: item.StatsRankClicks,
      RankScrollsToday: item.RankScrollsToday,
      RankScrollsYesterday: item.RankScrollsYesterday,
      StatsRankScrolls: item.StatsRankScrolls,
      RankDistanceToday: item.RankDistanceToday,
      RankDistanceYesterday: item.RankDistanceYesterday,
      StatsRankDistance: item.StatsRankDistance,
      RankDownloadToday: item.RankDownloadToday,
      RankDownloadYesterday: item.RankDownloadYesterday,
      StatsRankDownload: item.StatsRankDownload,
      RankUploadToday: item.RankUploadToday,
      RankUploadYesterday: item.RankUploadYesterday,
      StatsRankUpload: item.StatsRankUpload,
      RankUptimeToday: item.RankUptimeToday, 
      RankUptimeYesterday: item.RankUptimeYesterday,
      StatsRankUptime: item.StatsRankUptime,
      PulsesToday: item.PulsesToday,
      PulsesYesterday: item.PulsesYesterday,
      StatsPulses: item.StatsPulses,
      Pulses: item.Pulses,
      
      // XML Key fields for displaying data from API
      Keys1: item.Keys1,
      Clicks: item.Clicks,
      Scrolls: item.Scrolls,
      DistanceInMiles: item.DistanceInMiles,
      DownloadMB: item.DownloadMB,
      UploadMB: item.UploadMB,
      UptimeSeconds: item.UptimeSeconds,
      
      // Preserve XML flag fields
      today: item.today,
      yesterday: item.yesterday,
      
      // Additional metadata
      Team: item.Team,
      LastPulse: item.LastPulse,
      UsernameFull: item.UsernameFull
    };
  }
  
  private parseNumberField(value: any): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
  
  private createEmptyRecord(index: number): StatRecord {
    return {
      id: index + 1,
      name: `Unknown ${index + 1}`,
      username: '',
      keys: 0,
      clicks: 0,
      scrolls: 0,
      distance: 0,
      download: '0',
      upload: '0',
      uptime: '0',
      pulses: 0
    };
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      this.debugService.error('StatsService', `${operation} failed:`, error);
      return of(result as T);
    };
  }
}
