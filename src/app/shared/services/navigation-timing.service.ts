import { Injectable } from '@angular/core';
import { NavigationStart, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NavigationTimingService {
  private navigationStartTime = 0;
  private lastLoadTime = 0;
  private readonly loadTimeSubject = new BehaviorSubject<number>(0);
  
  public loadTime$ = this.loadTimeSubject.asObservable();

  constructor(private router: Router) {
    // Track navigation start
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart)
    ).subscribe(() => {
      this.navigationStartTime = performance.now();
    });
    
    // Calculate time on navigation end
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      // Get navigation end time and calculate duration
      const endTime = performance.now();
      this.lastLoadTime = Math.round(endTime - this.navigationStartTime);
      
      // Use a small timeout to let page components finish rendering
      setTimeout(() => {
        this.loadTimeSubject.next(this.lastLoadTime);
      }, 50);
    });
    
    // Initialize with performance API data if available
    this.initFromPerformanceAPI();
  }
  
  private initFromPerformanceAPI(): void {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      // Try to get more accurate initial page load time
      if (timing.loadEventEnd > 0 && timing.navigationStart > 0) {
        const initialLoadTime = timing.loadEventEnd - timing.navigationStart;
        if (initialLoadTime > 0 && initialLoadTime < 60000) { // Sanity check
          this.lastLoadTime = initialLoadTime;
          this.loadTimeSubject.next(this.lastLoadTime);
        }
      }
    }
  }
  
  // Get the last recorded load time
  getLastLoadTime(): number {
    return this.lastLoadTime > 0 ? this.lastLoadTime : 100; // Default to 100ms if not set
  }
  
  // Manually record load time (for non-navigation events)
  recordLoadTime(time: number): void {
    if (time > 0) {
      this.lastLoadTime = Math.round(time);
      this.loadTimeSubject.next(this.lastLoadTime);
    }
  }
}
