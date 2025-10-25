import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private meta = inject(Meta);
  private title = inject(Title);

  updateMetaTags(config?: {
    title?: string;
    description?: string;
    url?: string;
  }) {
    const pageTitle = config?.title || environment.seo.siteName;
    const description = config?.description || environment.seo.description;
    const url = config?.url || environment.seo.baseUrl;

    // Update title
    this.title.setTitle(pageTitle);

    // Update meta tags
    this.meta.updateTag({ name: 'description', content: description });
    
    // Update Open Graph tags
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    
    // Update canonical link
    this.updateCanonicalUrl(url);
  }

  private updateCanonicalUrl(url: string) {
    // Remove existing canonical link if exists
    const existingLink = document.querySelector('link[rel="canonical"]');
    if (existingLink) {
      existingLink.setAttribute('href', url);
    } else {
      // Create new canonical link
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', url);
      document.head.appendChild(link);
    }
  }

  setRouteMetaTags(route: string, title?: string) {
    const url = `${environment.seo.baseUrl}${route}`;
    const pageTitle = title ? `${title} - ${environment.seo.siteName}` : environment.seo.siteName;
    
    this.updateMetaTags({
      title: pageTitle,
      url: url
    });
  }
}
