import { Injectable } from '@angular/core';
import packageInfo from '../../../../package.json';

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  // Use package.json version through the packageInfo import
  // This approach works with Angular and is more maintainable
  private readonly appVersion: string = packageInfo.version;
  
  constructor() {}
  
  getVersion(): string {
    return this.appVersion;
  }
  
  getVersionText(): string {
    return `v${this.appVersion}`;
  }
}
