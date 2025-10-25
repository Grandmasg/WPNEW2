import { Component, OnInit, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../pipes/translate.pipe';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-page-loading-time',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  template: `
    <div class="page-loading-time">
      <small class="text-muted">{{ 'common.pageLoadedIn' | translate }}: {{ displayTime }}ms</small>
    </div>
  `,
  styles: [`
    .page-loading-time {
      text-align: center;
      padding: 2px 0;
      font-size: 0.8rem;
      opacity: 0.7;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
  `]
})
export class PageLoadingTimeComponent implements OnInit, OnDestroy {
  @Input() pageName: string = '';
  loadTimeMs: number = 0;
  displayTime: number = 0;
  private subscription: Subscription = new Subscription();
  private pageInitTime: number = Date.now();
  
  constructor(private router: Router) {
    // When component is constructed, start the timer
    this.pageInitTime = Date.now();
  }

  ngOnInit(): void {
    // Set initial load time based on simple timing
    this.measureLoadTime();
    
    // Listen for further navigations to reset the timer
    this.subscription.add(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        // Get and display load time for page navigation
        this.measureLoadTime();
      })
    );
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
  
  private measureLoadTime(): void {
    // Calculate time since component initialized
    const now = Date.now();
    this.loadTimeMs = now - this.pageInitTime;
    
    // For first page load, try to use more accurate Navigation Timing API if available
    if (window.performance && window.performance.timing) {
      const navTiming = window.performance.timing;
      
      // If initial page load is complete
      if (navTiming.loadEventEnd > 0) {
        const loadTime = navTiming.loadEventEnd - navTiming.navigationStart;
        
        // Only use this value if it seems reasonable
        if (loadTime > 0 && loadTime < 60000) {
          this.loadTimeMs = loadTime;
        }
      }
    }
    
    // Apply a small minimum time to avoid 0ms display
    this.displayTime = Math.max(this.loadTimeMs, 10);
    
    // Reset timer for next navigation
    this.pageInitTime = now;
  }
}
