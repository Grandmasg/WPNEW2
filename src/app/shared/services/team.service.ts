import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { ApiService } from './api.service';
import { DebugService } from './debug.service';

export interface Team {
  teamname: string;
  team: string;
  aantal: number;
}

@Injectable({
  providedIn: 'root'
})
export class TeamService {
  constructor(
    private apiService: ApiService,
    private debugService: DebugService
  ) {}

  getTeams(offset: string = '0', team: string = '-'): Observable<Team[]> {
    this.debugService.log('TeamService', `Fetching teams with offset: ${offset}, team: ${team}`);
    
    return this.apiService.getTeamData(offset, team).pipe(
      tap(response => this.debugService.log('TeamService', 'Raw team response:', response)),
      map(response => {
        // Extract teams from response
        if (response && Array.isArray(response)) {
          return response;
        } else if (response && response.data && Array.isArray(response.data)) {
          return response.data;
        } else {
          this.debugService.error('TeamService', 'Unexpected team response format:', response);
          return [];
        }
      }),
      tap(teams => this.debugService.log('TeamService', `Processed ${teams.length} teams`)),
      catchError(error => {
        this.debugService.error('TeamService', 'Error fetching teams:', error);
        return of([]);
      })
    );
  }
}
