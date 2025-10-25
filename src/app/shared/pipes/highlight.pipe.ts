import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlight',
  standalone: true
})
export class HighlightPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string, searchTerm: string): SafeHtml {
    if (!searchTerm || !value) {
      return value;
    }

    // Escape special regex characters in the search term
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create a regex to find the search term (case-insensitive)
    const regex = new RegExp(escapedTerm, 'gi');
    
    // Replace matches with highlighted span
    const highlighted = value.replace(regex, (match) => {
      return `<mark class="highlight">${match}</mark>`;
    });

    return this.sanitizer.bypassSecurityTrustHtml(highlighted);
  }
}
