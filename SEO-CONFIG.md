# SEO Configuration

## Environment-based SEO Files

This project uses **environment-based configuration** to generate SEO files (robots.txt, sitemap.xml) and meta tags dynamically for development and production environments.

### How It Works

1. **Environment Configuration** (`src/environments/`)
   - `environment.ts` - Development settings (<http://localhost:8080>)
   - `environment.prod.ts` - Production settings (update with your domain!)

2. **Dynamic SEO Files** (`generate-seo-files.js`)
   - Automatically generates `robots.txt` and `sitemap.xml` before each build
   - Uses environment-specific base URLs
   - Updates lastmod dates automatically

3. **SeoService** (`src/app/shared/services/seo.service.ts`)
   - Updates meta tags dynamically on route changes
   - Sets canonical URLs, Open Graph tags, and descriptions
   - Integrated into `app.component.ts` router events

### Build Commands

```bash
# Development build (uses http://localhost:8080)
npm run build

# Production build (uses your production domain)
npm run build:prod
```

### ⚠️ IMPORTANT: Update Production Domain

Before deploying to production, update the `baseUrl` in `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'api',
  seo: {
    baseUrl: 'https://your-actual-domain.com',  // ← CHANGE THIS!
    siteName: 'Grandmasg - WhatPulse Statistics Dashboard',
    description: 'Track and visualize your WhatPulse statistics with interactive charts and detailed analytics'
  }
};
```

### What Gets Generated

**robots.txt:**

- Allows all crawlers
- References sitemap with environment-based URL
- Sets crawl delay to 1 second

**sitemap.xml:**

- All main routes (daily, weekly, monthly, yearly, overall, xml)
- Priority levels (1.0 for home, 0.6-0.9 for other pages)
- Change frequency hints for search engines
- Auto-updated lastmod dates

**Meta Tags (Dynamic):**

- Page titles with route-specific information
- Meta descriptions
- Canonical URLs
- Open Graph tags for social media sharing

### Files Modified

- ✅ `src/environments/environment.prod.ts` - Production SEO config
- ✅ `src/environments/environment.ts` - Development SEO config  
- ✅ `src/app/shared/services/seo.service.ts` - SEO service (NEW)
- ✅ `src/app/app.component.ts` - Integrated SeoService into router events
- ✅ `generate-seo-files.js` - Build-time SEO file generator (NEW)
- ✅ `package.json` - Added prebuild and build:prod scripts
- ✅ `angular.json` - Configured to copy public/ folder to output

### Testing

**Development:**

```bash
npm start
# Check http://localhost:4200/robots.txt
# Check http://localhost:4200/sitemap.xml
```

**Production Build:**

```bash
npm run build:prod
# Check dist/wpnew2/browser/robots.txt
# Check dist/wpnew2/browser/sitemap.xml
```

### SEO Best Practices Implemented

✅ **Robots.txt** - Proper crawler instructions  
✅ **Sitemap.xml** - All routes with priorities  
✅ **Canonical URLs** - Prevent duplicate content  
✅ **Meta Descriptions** - SEO-friendly page descriptions  
✅ **Open Graph Tags** - Social media preview cards  
✅ **Dynamic Updates** - Meta tags update on route changes  
✅ **Environment Separation** - Different URLs for dev/prod  

### Lighthouse Scores (Current)

- **Performance:** 82/100
- **Accessibility:** 92/100 ⭐ (+8% from previous 85%)
- **Best Practices:** 100/100 ⭐
- **SEO:** 82/100 (will improve after production deployment)

### Next Steps for Production

1. Update `environment.prod.ts` with actual production domain
2. Run `npm run build:prod` to generate production files
3. Deploy `dist/wpnew2/browser/` folder to your web server
4. Verify robots.txt and sitemap.xml are accessible
5. Submit sitemap to Google Search Console
6. Test meta tags with Facebook Debugger and Twitter Card Validator
