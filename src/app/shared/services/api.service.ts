import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { of } from 'rxjs';
import { DebugService } from './debug.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private debugService: DebugService
  ) {}

  /**
   * Get daily statistics
   */
  getDailyData(offset: string, team: string = '-', search?: string, type: string = '', date?: string): Observable<any> {
    let url = `${this.baseUrl}/daily.php?`;
    
    // Use Date parameter for XML type, otherwise use Offset (capitalized)
    if (type === 'xml' && date) {
      url += `Date=${date}&Team=${encodeURIComponent(team)}`;
    } else {
      url += `Offset=${offset}&Team=${encodeURIComponent(team)}`;
    }
    
    // Add type parameter if provided
    if (type) {
      url += `&type=${type}`;
    }
    
    // Add period parameter for consistency with changes.php
    url += '&period=daily';
    
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.debugService.log('ApiService', `Fetching daily data from: ${url}`);
    
    return this.http.get<any>(url).pipe(
      tap(response => {
        this.debugService.log('ApiService', `Daily data response:`, response);
        // Log date range if present
        if (response && (response.current || response.previous)) {
          this.debugService.log('ApiService', `Found daily date range - current: ${response.current}, previous: ${response.previous}`);
        }
      }),
      map(response => {
        // Ensure the response includes date range metadata if available
        return response;
      }),
      catchError((error) => {
        this.debugService.error('ApiService', `Error fetching daily data:`, error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get weekly statistics
   */
  getWeeklyData(offset: string, team: string = '-', search?: string): Observable<any> {
    // Maintain "Offset" capitalization to match API expectations
    let url = `${this.baseUrl}/weekly.php?Offset=${offset}&Team=${encodeURIComponent(team)}`;
    
    // Add period parameter for consistency with changes.php
    url += '&period=weekly';
    
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.debugService.log('ApiService', `Fetching weekly data from: ${url}`);
    
    return this.http.get<any>(url).pipe(
      tap(response => {
        this.debugService.log('ApiService', `Weekly data response:`, response);
        // Log date range if present
        if (response && (response.current || response.previous)) {
          this.debugService.log('ApiService', `Found weekly date range - current: ${response.current}, previous: ${response.previous}`);
        } else {
          this.debugService.warn('ApiService', `No current/previous dates found in weekly response. Available keys:`, Object.keys(response || {}));
        }
      }),
      map(response => {
        // Ensure the complete response including date range is returned
        return response;
      }),
      catchError(this.handleError('getWeeklyData'))
    );
  }
  
  /**
   * Get monthly statistics
   */
  getMonthlyData(offset: string, team: string = '-', search?: string): Observable<any> {
    // Maintain "Offset" capitalization to match API expectations
    let url = `${this.baseUrl}/monthly.php?Offset=${offset}&Team=${encodeURIComponent(team)}`;
    
    // Add period parameter for consistency with changes.php
    url += '&period=monthly';
    
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.debugService.log('ApiService', `Fetching monthly data from: ${url}`);
    
    return this.http.get<any>(url).pipe(
      tap(response => {
        this.debugService.log('ApiService', `Monthly data response:`, response);
        // Log date range if present
        if (response && (response.current || response.previous)) {
          this.debugService.log('ApiService', `Found monthly date range - current: ${response.current}, previous: ${response.previous}`);
        }
      }),
      map(response => {
        // Ensure the response includes date range metadata if available
        return response;
      }),
      catchError(this.handleError('getMonthlyData'))
    );
  }

  /**
   * Get yearly statistics
   */
  getYearlyData(offset: string, team: string = '-', search?: string): Observable<any> {
    // Maintain "Offset" capitalization to match API expectations
    let url = `${this.baseUrl}/yearly.php?Offset=${offset}&Team=${encodeURIComponent(team)}`;
    
    // Add period parameter for consistency with changes.php
    url += '&period=yearly';
    
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.debugService.log('ApiService', `Fetching yearly data from: ${url}`);
    
    return this.http.get<any>(url).pipe(
      tap(response => {
        this.debugService.log('ApiService', `Yearly data response:`, response);
        // Log date range if present
        if (response && (response.current || response.previous)) {
          this.debugService.log('ApiService', `Found yearly date range - current: ${response.current}, previous: ${response.previous}`);
        }
      }),
      map(response => {
        // Ensure the response includes date range metadata if available
        return response;
      }),
      catchError(this.handleError('getYearlyData'))
    );
  }

  /**
   * Get team data
   */
  getTeamData(offset: string = '0', team: string = '-'): Observable<any> {
    this.debugService.log('ApiService', `getTeamData called with offset: "${offset}", team: "${team}"`);
    
    // Build URL with all required parameters
    let url = `${this.baseUrl}/team.php?Offset=${offset}&Team=${team}`;
    
    this.debugService.log('ApiService', `Fetching team data from: ${url}`);
    
    return this.http.get<any>(url)
      .pipe(
        tap(data => {
          this.debugService.log('ApiService', `Team data received, team count: ${Array.isArray(data) ? data.length : 'Not an array'}`);
          if (Array.isArray(data) && data.length > 0) {
            this.debugService.log('ApiService', 'First team:', data[0]);
          }
        }),
        catchError(error => {
          this.debugService.error('ApiService', 'Error fetching team data:', error);
          return of([]);
        })
      );
  }
  
  /**
   * Get changes data with additional filter parameters
   */
  getChangesData(period: string, offset: string, team: string, topnr: string = '0', othernr: string = '0', teamnr: string = '0'): Observable<any> {
    // Maintain "Offset" capitalization to match API expectations
    let url = `${this.baseUrl}/changes.php?Offset=${offset}&Team=${encodeURIComponent(team)}&period=${period}`;
    
    // Add new filtering parameters if not default
    if (topnr !== '0') {
      url += `&topnr=${topnr}`;
    }
    
    if (othernr !== '0') {
      url += `&othernr=${othernr}`;
    }
    
    if (teamnr !== '0') {
      url += `&teamnr=${teamnr}`;
    }
    
    this.debugService.log('ApiService', `Fetching XML changes from: ${url}`);
    
    return this.http.get<any>(url).pipe(
      tap(data => {
        this.debugService.log('ApiService', `XML changes response received:`, data);
        // Log the date range specifically to debug the issue
        if (data && (data.current || data.previous)) {
          this.debugService.log('ApiService', `Found XML date range - current: ${data.current}, previous: ${data.previous}`);
        } else {
          this.debugService.warn('ApiService', `No current/previous dates found in XML response. Available keys:`, Object.keys(data || {}));
        }
        
        // Log the changes structure to preserve all user data
        if (data && data.changes) {
          this.debugService.log('ApiService', `Changes structure found with keys:`, Object.keys(data.changes));
          if (data.changes.added) this.debugService.log('ApiService', `Added users count: ${data.changes.added.length}`);
          if (data.changes.changed) this.debugService.log('ApiService', `Changed users count: ${data.changes.changed.length}`);
          if (data.changes.left) this.debugService.log('ApiService', `Left users count: ${data.changes.left.length}`);
        } else {
          this.debugService.warn('ApiService', `No changes object found in response`);
        }
      }),
      catchError(error => {
        this.debugService.error('ApiService', `Error fetching XML changes for ${period}:`, error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Get graph data - Using proper debug service instead of console
   */
  getGraphData(period: string, offset: string, team: string, search: string = ''): Observable<any> {
    // Change back to uppercase Offset and Team to match API expectations
    let url = `${this.baseUrl}/graph.php?Offset=${offset}&Team=${encodeURIComponent(team)}&period=${period}`;
    
    // Enhanced debugging for the received search parameter
    this.debugService.log('ApiService', `getGraphData called for period: [${period}], team: [${team}], offset: [${offset}]. Received search argument: "${search}" (length: ${search?.trim()?.length || 0})`);

    // Add search parameter if provided and not just whitespace
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search.trim())}`;
      this.debugService.log('ApiService', `Adding search parameter to graph request for period [${period}]: "${search.trim()}"`);
    } else {
      this.debugService.log('ApiService', `No search parameter will be added to graph request for period [${period}] because input search argument is empty or whitespace.`);
    }
    
    // Use debugService instead of console.log for consistency and to avoid duplicates
    this.debugService.log('ApiService', `Making graph request to: ${url}`);
    
    // Add proper error handling for network issues
    return this.http.get(url).pipe(
      tap(response => {
        // Only log detailed responses in debug mode
        if (this.debugService.isDebugEnabled()) {
          this.debugService.log('ApiService', `Received ${period} graph response with ${Array.isArray(response) ? response.length : 'non-array'} data`);
          if (search && search.trim() !== '') {
            this.debugService.log('ApiService', `Graph request included search: "${search}"`);
          }
          console.log(`[DEBUG] Graph API Response for ${period}:`, response); // Direct console for visibility
        }
      }),
      catchError(error => {
        this.debugService.error('ApiService', `Error fetching graph data for ${period}:`, error);
        console.error(`[ERROR] Graph API failed for ${period}:`, error); // Direct console for visibility
        
        // Check for specific network errors
        let errorMsg = 'Unknown error occurred';
        
        if (error.status === 0) {
          errorMsg = 'Network error: API server not reachable';
        } else if (error.status === 404) {
          errorMsg = 'API endpoint not found (404)';
        } else if (error.status === 403) {
          errorMsg = 'Access forbidden to API endpoint (403)';
        } else if (error.status === 500) {
          errorMsg = 'Server error in graph API (500)';
        }
        
        return throwError(() => new Error(errorMsg));
      })
    );
  }

  /**
   * Get overall statistics
   */
  public getOverallData(offset: string = '0', team: string = '-', search: string = ''): Observable<any> {
    // Maintain "Offset" capitalization to match API expectations
    let url = `${this.baseUrl}/overall.php?Offset=${offset}&Team=${team}`;
    
    // Add period parameter for consistency with other methods
    url += '&period=overall';
    
    if (search && search.trim() !== '') {
      // Change Search to lowercase 'search' to maintain consistent parameter naming
      url += `&search=${encodeURIComponent(search)}`;
    }
        
    return this.http.get<any>(url).pipe(
      map(response => {
        // Debug date range in overall response
        if (response?.dateRange) {
          this.debugService.log('ApiService', `Found date range in overall response: ${JSON.stringify(response.dateRange)}`);
        }
        return response;
      }),
      catchError(this.handleError('getOverallData'))
    );
  }

  /**
   * Get XML data
   */
  getXmlData(
    period: string, 
    offset: string, 
    team: string, 
    searchTerm?: string, 
    topnr?: string, 
    othernr?: string, 
    teamnr?: string
  ): Observable<any> {
    // Determine the correct endpoint based on the period
    let endpoint = '';
    switch (period) {
      case 'daily':
        endpoint = `${this.baseUrl}/xmldaily.php`;
        break;
      case 'weekly':
        endpoint = `${this.baseUrl}/xmlweekly.php`;
        break;
      case 'monthly':
        endpoint = `${this.baseUrl}/xmlmonthly.php`;
        break;
      case 'yearly':
        endpoint = `${this.baseUrl}/xmlyearly.php`;
        break;
      default:
        endpoint = `${this.baseUrl}/xmldaily.php`;
    }
    
    // Maintain "Offset" and "Team" capitalization to match API expectations
    let params = `?Offset=${offset}&Team=${team}`;
    
    // Add search parameter if provided
    if (searchTerm) {
      params += `&Search=${encodeURIComponent(searchTerm)}`;
    }
    
    // Add the new filter parameters
    if (topnr && topnr !== '0') {
      params += `&topnr=${topnr}`;
    }
    
    if (othernr && othernr !== '0') {
      params += `&othernr=${othernr}`;
    }
    
    if (teamnr && teamnr !== '0') {
      params += `&teamnr=${teamnr}`;
    }
    
    const url = `${endpoint}${params}`;
    
    this.debugService.log('ApiService', `Getting ${period} XML data: ${url}`);
    
    // Use responseType: 'text' to prevent automatic JSON parsing
    return this.http.get(url, { responseType: 'text' }).pipe(
      map(xmlText => {
        // Return a structured object with the XML content as a string
        return { xml: xmlText };
      }),
      tap(data => this.debugService.log('ApiService', `${period} XML data received, size: ${data?.xml?.length || 0} bytes`)),
      catchError(error => {
        this.debugService.error('ApiService', `Error getting ${period} XML data: ${error.message}`, error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Build URL helper
   */
  private buildUrl(endpoint: string, offset: string = '0', team: string = '-', search?: string): string {
    // Make sure offset is explicitly included as a query parameter
    let url = `${this.baseUrl}/${endpoint}`;
    
    // Add Offset as query parameter (capitalized to match API expectations)
    url += `?Offset=${offset}`;
    
    // Add team parameter if not default (capitalizing "Team" for consistency)
    if (team !== '-') {
      url += `&Team=${team}`;
    }
    
    // Add search parameter if provided
    if (search && search.trim() !== '') {
      url += `&search=${encodeURIComponent(search)}`;
    }
    
    this.debugService.log('ApiService', `Built URL: ${url}`);
    return url;
  }

  /**
   * Error handler
   */
  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      this.debugService.error('ApiService', `${operation} failed:`, error);
      return of(result as T);
    };
  }
}
