import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

interface LogMessage {
  component: string;
  message: string;
  data?: any;
  timestamp: Date;
  level: 'log' | 'warn' | 'error';
}

@Injectable({
  providedIn: 'root'
})
export class DebugService {
  private isDebugMode = false;
  private debugSubject = new BehaviorSubject<boolean>(false);
  
  // Add public Observable for debug state changes
  public debug$: Observable<boolean> = this.debugSubject.asObservable();
  
  // Add property to store the last log message
  public lastLogMessage: LogMessage | null = null;
  
  // Optional: Add a BehaviorSubject for last log message to enable subscribing to it
  private logMessageSubject = new BehaviorSubject<LogMessage | null>(null);
  public lastLogMessage$ = this.logMessageSubject.asObservable();

  constructor() {
    this.initDebugState();
  }

  private checkDebugStatus(): void {
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    
    // Check localStorage only - remove sessionStorage check to avoid activation from other sources
    const localStorageDebug = localStorage.getItem('debug_enabled'); // Changed from 'debug' to 'debug_enabled' for consistency
    
    // Only enable debug if explicitly set to true in URL or localStorage
    if (debugParam === 'true' || localStorageDebug === 'true') {
      this.enableDebug(true); // Pass true to indicate this is initial setup
    } else {
      // Ensure debug is disabled if neither condition is met
      this.isDebugMode = false;
    }
  }

  enableDebug(isInitialSetup: boolean = false): void {
    // Prevent enabling debug mode multiple times
    if (this.isDebugMode && !isInitialSetup) {
      return;
    }
    
    this.isDebugMode = true;
    localStorage.setItem('debug_enabled', 'true'); // Store in localStorage
    this.debugSubject.next(true);
    
    // Always show debug enabled message, regardless of initial setup
    console.warn('🐞 Debug mode enabled');
  }

  disableDebug(): void {
    this.isDebugMode = false;
    // Make sure to remove both potential keys to avoid confusion
    localStorage.removeItem('debug_enabled');
    localStorage.removeItem('debug'); 
    this.debugSubject.next(false);
    console.warn('Debug mode disabled');
  }

  isDebugEnabled(): boolean {
    return this.isDebugMode;
  }

  log(component: string, message: string, data?: any): void {
    if (this.isDebugMode) {
      console.log(`[${component}]`, message, data ?? '');
      
      // Store the last log message
      this.lastLogMessage = {
        component,
        message,
        data,
        timestamp: new Date(),
        level: 'log'
      };
      
      // Notify subscribers
      this.logMessageSubject.next(this.lastLogMessage);
    }
  }

  warn(component: string, message: string, data?: any): void {
    if (this.isDebugMode) {
      console.warn(`[${component}]`, message, data ?? '');
      
      // Store the last log message
      this.lastLogMessage = {
        component,
        message,
        data,
        timestamp: new Date(),
        level: 'warn'
      };
      
      // Notify subscribers
      this.logMessageSubject.next(this.lastLogMessage);
    }
  }

  error(component: string, message: string, data?: any): void {
    console.error(`[${component}]`, message, data ?? '');
    
    // Store the last log message (errors are always logged)
    this.lastLogMessage = {
      component,
      message,
      data,
      timestamp: new Date(),
      level: 'error'
    };
    
    // Notify subscribers
    this.logMessageSubject.next(this.lastLogMessage);
  }

  // Add a test method that can be called to verify the service is working
  testDebugService(): void {
    console.log('Testing debug service directly');
    this.log('TEST', 'Debug log test');
    this.warn('TEST', 'Debug warning test');
    this.error('TEST', 'Debug error test');
  }

  // Add initialization method that loads from localStorage on startup
  public initDebugState(): void {
    // Only check the specific debug_enabled flag
    const debugState = localStorage.getItem('debug_enabled');
    
    if (debugState === 'true') {
      this.isDebugMode = true;
      console.log('Debug mode initialized from localStorage');
      // Update the BehaviorSubject to match the current state
      this.debugSubject.next(true);
    } else {
      this.isDebugMode = false;
      // Ensure we clean up any stray debug flags
      localStorage.removeItem('debug_enabled');
      localStorage.removeItem('debug');
      // Update the BehaviorSubject to match the current state
      this.debugSubject.next(false);
    }
  }

  /**
   * Checks if verbose logging is enabled
   * This is used to control especially verbose log messages
   */
  public isVerboseLoggingEnabled(): boolean {
    // Only show verbose logs if debug is enabled AND verbose flag is set in localStorage
    return this.isDebugEnabled() && localStorage.getItem('verboseDebug') === 'true';
  }
}
