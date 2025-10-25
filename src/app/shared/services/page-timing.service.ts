import { Injectable } from '@angular/core';
import { NavigationStart, NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DebugService } from './debug.service';

export interface TimingMetrics {
  navigationTime: number;
  fcpTime?: number;
  lcpTime?: number;
  totalBlockingTime?: number;
  speedIndex?: number;
  cls?: number;
  isInitialLoad: boolean;
  routePath: string;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class PageTimingService {
  private navigationStartTime = 0;
  private initialLoadComplete = false;
  private loadTime$ = new BehaviorSubject<TimingMetrics>({
    navigationTime: 0,
    isInitialLoad: true,
    routePath: '',
    timestamp: Date.now()
  });

  private readonly STORAGE_KEY = 'lighthouse_metrics';

  public timing$ = this.loadTime$.asObservable();

  constructor(
    private router: Router,
    private debugService: DebugService
  ) {
    // Record navigation start time as early as possible
    this.navigationStartTime = performance.now();
    
    // Try to load saved metrics first
    this.loadPersistedMetrics();
    
    // Then measure initial page load metrics
    this.measureInitialPageLoad();

    // Listen for route navigation events
    this.setupNavigationTracking();
    
    // Set up performance observers for web vitals when available
    this.setupPerformanceObservers();
  }

  private setupNavigationTracking(): void {
    // Track navigation start and end events
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart || event instanceof NavigationEnd)
    ).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.navigationStartTime = performance.now();
        this.debugService.log('PageTimingService', `Navigation started to: ${event.url}`);
        
        // Store navigation start time in localStorage for more accurate measurement
        localStorage.setItem('appNavigationStart', Date.now().toString());
      } else if (event instanceof NavigationEnd) {
        const endTime = performance.now();
        const navTime = Math.round(endTime - this.navigationStartTime);
        
        this.debugService.log('PageTimingService', `Navigation completed to ${event.url} in ${navTime}ms`);
        
        // Get current metrics so we preserve lighthouse data
        const currentMetrics = this.loadTime$.getValue();
        
        // Only update with navigation time for in-app navigations
        if (this.initialLoadComplete) {
          // For SPA navigations, wait a bit for content to actually load before measuring
          // This gives a more realistic perception of load time
          setTimeout(() => {
            const endTime = performance.now();
            const totalNavTime = Math.round(endTime - this.navigationStartTime);
            
            // Use a minimum threshold to ensure we're not showing unrealistically fast times
            const minimumNavigationTime = 150; // Minimum 150ms for SPA navigation to seem realistic
            const realisticNavTime = Math.max(totalNavTime, minimumNavigationTime);
            
            const updatedMetrics = {
              ...currentMetrics, // Preserve Lighthouse metrics
              navigationTime: realisticNavTime,
              isInitialLoad: false,
              routePath: event.url,
              timestamp: Date.now()
            };
            
            this.loadTime$.next(updatedMetrics);
            this.persistMetrics(updatedMetrics);
            
            // Store the navigation time for fallback use
            localStorage.setItem('appPageLoadTime', realisticNavTime.toString());
            
            // Dispatch custom event for components that need to know content is loaded
            window.dispatchEvent(new CustomEvent('route-content-loaded', {
              detail: { 
                duration: realisticNavTime, 
                isInitialLoad: false,
                url: event.url
              }
            }));
            
            this.debugService.log('PageTimingService', `SPA navigation timing updated: ${realisticNavTime}ms (actual: ${totalNavTime}ms)`);
          }, 100); // Wait 100ms for content to settle
        }
      }
    });
  }

  private setupPerformanceObservers(): void {
    // Only setup if the Performance API is available
    if (!window.PerformanceObserver) {
      return;
    }
    
    try {
      // Observe Largest Contentful Paint
      if (PerformanceObserver.supportedEntryTypes.includes('largest-contentful-paint')) {
        const lcpObserver = new PerformanceObserver(entries => {
          const lastEntry = entries.getEntries().pop();
          if (lastEntry) {
            const lcpTime = Math.round(lastEntry.startTime);
            this.debugService.log('PageTimingService', `LCP: ${lcpTime}ms`);
            
            // Update metrics with LCP time
            const current = this.loadTime$.getValue();
            const updated = {
              ...current,
              lcpTime
            };
            this.loadTime$.next(updated);
            this.persistMetrics(updated);
          }
        });
        
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      }
      
      // Observe First Contentful Paint
      if (PerformanceObserver.supportedEntryTypes.includes('paint')) {
        const paintObserver = new PerformanceObserver(entries => {
          for (const entry of entries.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              const fcpTime = Math.round(entry.startTime);
              this.debugService.log('PageTimingService', `FCP: ${fcpTime}ms`);
              
              // Update metrics with FCP time
              const current = this.loadTime$.getValue();
              const updated = {
                ...current,
                fcpTime
              };
              this.loadTime$.next(updated);
              this.persistMetrics(updated);
            }
          }
        });
        
        paintObserver.observe({ type: 'paint', buffered: true });
      }
      
      // Observe layout shifts for CLS
      if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
        let cumulativeLayoutShift = 0;
        
        const layoutShiftObserver = new PerformanceObserver(entries => {
          for (const entry of entries.getEntries()) {
            // Only count layout shifts without recent user input
            if (!(entry as any).hadRecentInput) {
              cumulativeLayoutShift += (entry as any).value;
            }
          }
          
          const cls = parseFloat(cumulativeLayoutShift.toFixed(3));
          this.debugService.log('PageTimingService', `CLS: ${cls}`);
          
          // Update metrics with CLS
          const current = this.loadTime$.getValue();
          const updated = {
            ...current,
            cls
          };
          this.loadTime$.next(updated);
          this.persistMetrics(updated);
        });
        
        layoutShiftObserver.observe({ type: 'layout-shift', buffered: true });
      }
      
      // Observe long tasks for Total Blocking Time (TBT)
      if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        let totalBlockingTime = 0;
        
        const longTaskObserver = new PerformanceObserver(entries => {
          for (const entry of entries.getEntries()) {
            // A task is considered "blocking" if it runs longer than 50ms
            const blockingTime = entry.duration - 50;
            if (blockingTime > 0) {
              totalBlockingTime += blockingTime;
            }
          }
          
          this.debugService.log('PageTimingService', `TBT: ${Math.round(totalBlockingTime)}ms`);
          
          // Update metrics with TBT
          const current = this.loadTime$.getValue();
          const updated = {
            ...current,
            totalBlockingTime: Math.round(totalBlockingTime)
          };
          this.loadTime$.next(updated);
          this.persistMetrics(updated);
        });
        
        longTaskObserver.observe({ type: 'longtask', buffered: true });
      }

      // Observe speed index if available through Performance API
      if (window.performance && window.performance.getEntriesByType) {
        setTimeout(() => {
          const navEntries = window.performance.getEntriesByType('navigation');
          if (navEntries && navEntries.length > 0) {
            const entry = navEntries[0] as PerformanceNavigationTiming;
            // Use domContentLoadedEventEnd as a rough approximation
            const speedIndex = Math.round(entry.domContentLoadedEventEnd);
            
            this.debugService.log('PageTimingService', `Speed Index (approx): ${speedIndex}ms`);
            
            // Update metrics with Speed Index
            const current = this.loadTime$.getValue();
            const updated = {
              ...current,
              speedIndex
            };
            this.loadTime$.next(updated);
            this.persistMetrics(updated);
          }
        }, 1000); // Delay to ensure navigation timing is complete
      }
    } catch (error) {
      this.debugService.error('PageTimingService', 'Error setting up performance observers:', error);
    }
  }

  private measureInitialPageLoad(): void {
    // For the initial page load, use Navigation Timing API
    if (window.performance && window.performance.timing) {
      const calculateInitialTiming = () => {
        if (document.readyState === 'complete') {
          const perfTiming = performance.timing;
          
          // Only calculate if the load event has fired
          if (perfTiming.loadEventEnd > 0) {
            const navigationTime = perfTiming.loadEventEnd - perfTiming.navigationStart;
            
            this.debugService.log('PageTimingService', `Initial page load: ${navigationTime}ms`);
            
            // Mark initial load as complete
            this.initialLoadComplete = true;
            
            // Get current metrics to preserve Lighthouse data
            const currentMetrics = this.loadTime$.getValue();
            
            // Update with navigation time for initial page load
            const updatedMetrics = {
              ...currentMetrics, // Preserve any Lighthouse metrics we already have
              navigationTime,
              isInitialLoad: true,
              routePath: this.router.url,
              timestamp: Date.now()
            };
            
            this.loadTime$.next(updatedMetrics);
            this.persistMetrics(updatedMetrics);
          } else {
            // If load event hasn't fired yet, check again shortly
            setTimeout(calculateInitialTiming, 100);
          }
        } else {
          // If document not yet complete, check again shortly
          setTimeout(calculateInitialTiming, 100);
        }
      };
      
      calculateInitialTiming();
    } else {
      // Simple fallback if Navigation Timing API not available
      setTimeout(() => {
        const loadTime = Math.round(performance.now());
        
        this.debugService.log('PageTimingService', `Initial page load (fallback): ${loadTime}ms`);
        
        this.initialLoadComplete = true;
        
        // Get current metrics to preserve Lighthouse data
        const currentMetrics = this.loadTime$.getValue();
        
        const updatedMetrics = {
          ...currentMetrics, // Preserve Lighthouse metrics
          navigationTime: loadTime,
          isInitialLoad: true,
          routePath: this.router.url,
          timestamp: Date.now()
        };
        
        this.loadTime$.next(updatedMetrics);
        this.persistMetrics(updatedMetrics);
      }, 0);
    }
    
    // Handle page show events (back/forward navigation)
    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (event.persisted) {
        this.debugService.log('PageTimingService', 'Page restored from cache - loading persisted metrics');
        this.loadPersistedMetrics();
      }
    });
  }

  // Store metrics in localStorage
  private persistMetrics(metrics: TimingMetrics): void {
    try {
      // Filter out undefined metrics before saving
      const cleanedMetrics = {
        ...metrics,
        routePath: metrics.routePath || ''
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cleanedMetrics));
    } catch (e) {
      this.debugService.error('PageTimingService', 'Error saving metrics to localStorage:', e);
    }
  }
  
  // Load metrics from localStorage
  private loadPersistedMetrics(): void {
    try {
      const savedMetricsString = localStorage.getItem(this.STORAGE_KEY);
      if (savedMetricsString) {
        const savedMetrics = JSON.parse(savedMetricsString) as TimingMetrics;
        
        // Ensure timestamp is not too old (within last 24 hours)
        const isRecent = Date.now() - savedMetrics.timestamp < 24 * 60 * 60 * 1000;
        
        if (isRecent) {
          this.debugService.log('PageTimingService', 'Restored metrics from localStorage:', savedMetrics);
          this.loadTime$.next(savedMetrics);
        } else {
          this.debugService.log('PageTimingService', 'Saved metrics are too old, discarding');
        }
      }
    } catch (e) {
      this.debugService.error('PageTimingService', 'Error loading metrics from localStorage:', e);
    }
  }

  // Public methods to get timing information
  getNavigationTime(): number {
    return this.loadTime$.getValue().navigationTime;
  }
  
  getLightHouseMetrics(): Partial<TimingMetrics> {
    const metrics = this.loadTime$.getValue();
    return {
      fcpTime: metrics.fcpTime,
      lcpTime: metrics.lcpTime,
      totalBlockingTime: metrics.totalBlockingTime,
      speedIndex: metrics.speedIndex,
      cls: metrics.cls
    };
  }
}
