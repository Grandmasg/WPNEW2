import { Injectable } from '@angular/core';
import { DebugService } from './debug.service';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FilterService {
  // Track current filter state
  private filterStateSubject = new BehaviorSubject<{
    searchTerm: string,
    filteredIds: Set<string>,
    filteredUsernames: Set<string>
  }>({
    searchTerm: '',
    filteredIds: new Set<string>(),
    filteredUsernames: new Set<string>()
  });
  
  // Expose as observable for components to subscribe to
  public filterState$ = this.filterStateSubject.asObservable();

  constructor(private debugService: DebugService) {}

  /**
   * Apply a search term to a dataset and return filtered results
   * This provides consistent filtering logic across the application
   */
  public applyFilter(data: any[], searchTerm: string, xmlData: any[] = []): any[] {
    if (!data || !Array.isArray(data) || data.length === 0) {
      // Don't process empty data, just return empty array
      // This prevents overwriting valid filter state with empty results
      return [];
    }
    
    if (!searchTerm || searchTerm.trim() === '') {
      // Clear filter state when no search term
      this.filterStateSubject.next({
        searchTerm: '',
        filteredIds: new Set<string>(),
        filteredUsernames: new Set<string>()
      });
      return data;
    }
    
    // Always make a copy to avoid modifying the source data
    const searchLower = searchTerm.trim().toLowerCase();
    
    // Store matched IDs and usernames for consistent filtering
    const matchedUserIds = new Set<string>();
    const matchedUsernames = new Set<string>();
    
    // Debug info to track match reasons
    const matchReasons: Record<string, string[]> = {};
    
    // First pass: collect all matching IDs and usernames from both datasets
    [...data, ...xmlData].forEach((item, index) => {
      const userId = item['id'] || item['UserID'] || item['userid'] || item['userId'] || item['user_id'];
      const username = item['Username'] || item.username || '';  // Check Username (capital U) first
      const teamName = item['Team'] || item['team'] || '';  // Check Team (capital T) first
      
      const itemIdentifier = username || userId || 'unknown';
      matchReasons[itemIdentifier] = [];
      
      // ONLY exact ID matches
      if (userId && String(userId).toLowerCase() === searchLower) {
        matchedUserIds.add(String(userId).toLowerCase());
        matchReasons[itemIdentifier].push(`Exact UserID match: ${userId}`);
      }
      
      // Username matching - ONLY search in username field as requested
      if (username) {
        // Make sure username is a string before calling toLowerCase()
        const usernameLower = (typeof username === 'string' ? username : String(username)).toLowerCase();
        
        // Match if the username contains the search term
        if (usernameLower.includes(searchLower)) {
          if (userId) {
            matchedUserIds.add(String(userId).toLowerCase());
          }
          matchedUsernames.add(usernameLower);
          matchReasons[itemIdentifier].push(`Username contains: ${username}`);
        }
      }
      
      // REMOVED team name matching to be consistent with chart filtering
      // We only search in usernames now, not team names
    });
    
    // Remove empty match reasons
    Object.keys(matchReasons).forEach(key => {
      if (matchReasons[key].length === 0) {
        delete matchReasons[key];
      }
    });
    
    // Log match reasons for debugging
    if (Object.keys(matchReasons).length > 0) {
      this.debugService.log('FilterService', 'Match reasons for search term: ' + searchLower, matchReasons);
    }
    
    // Update the filter state for other components to use
    this.filterStateSubject.next({
      searchTerm: searchLower,
      filteredIds: matchedUserIds,
      filteredUsernames: matchedUsernames
    });
    
    // Apply the filter to the data
    const filteredData = data.filter(item => {
      const userId = item['id'] || item['UserID'] || item['userid'] || item['userId'] || item['user_id'];
      const username = (item['Username'] || item.username || '').toLowerCase();  // Check Username (capital U) first
      
      // Match by ID
      if (userId && matchedUserIds.has(String(userId).toLowerCase())) {
        return true;
      }
      
      // Match by username
      if (matchedUsernames.has(username)) {
        return true;
      }
      
      return false;
    });
    
    this.debugService.log('FilterService', 
      `Filtered ${data.length} items to ${filteredData.length} items with "${searchLower}"`);
    

      
    return filteredData;
  }

  /**
   * Get the current filter state
   */
  public getCurrentFilterState(): {searchTerm: string, filteredIds: Set<string>, filteredUsernames: Set<string>} {
    return this.filterStateSubject.value;
  }

  /**
   * Helper method to check if an item matches the current filter
   */
  public itemMatchesFilter(item: any): boolean {
    const state = this.filterStateSubject.value;
    
    if (!state.searchTerm) {
      return true; // No filter active
    }
    
    const userId = item['id'] || item['UserID'] || item['userid'] || item['userId'] || item['user_id'];
    const username = (item['Username'] || item.username || '').toLowerCase();  // Check Username (capital U) first
    
    // Check ID match
    if (userId && state.filteredIds.has(String(userId).toLowerCase())) {
      return true;
    }
    
    // Check username match - ONLY username, not usernameFull
    if (state.filteredUsernames.has(username.toLowerCase())) {
      return true;
    }
    
    // REMOVED team match - only search in usernames now
    
    return false;
  }
}
