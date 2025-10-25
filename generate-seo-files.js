const fs = require('fs');
const path = require('path');

// Read environment configuration
const isProd = process.argv.includes('--prod');
const baseUrl = isProd ? 'https://www.grandmasg.nl' : 'http://localhost:8080';

// Generate robots.txt
const robotsTxt = `# robots.txt for WhatPulse Statistics Dashboard
User-agent: *
Allow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay for polite crawling
Crawl-delay: 1
`;

// Generate sitemap.xml
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Main pages -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Daily stats -->
  <url>
    <loc>${baseUrl}/s/daily/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Weekly stats -->
  <url>
    <loc>${baseUrl}/s/weekly/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Monthly stats -->
  <url>
    <loc>${baseUrl}/s/monthly/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- Yearly stats -->
  <url>
    <loc>${baseUrl}/s/yearly/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- Overall stats -->
  <url>
    <loc>${baseUrl}/s/overall/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- XML changes -->
  <url>
    <loc>${baseUrl}/s/xml/0/-</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>
`;

// Write files to public directory
const publicDir = path.join(__dirname, 'public');

// Create public directory if it doesn't exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt);
fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap);

console.log(`✅ Generated robots.txt and sitemap.xml for ${isProd ? 'PRODUCTION' : 'DEVELOPMENT'}`);
console.log(`   Base URL: ${baseUrl}`);
