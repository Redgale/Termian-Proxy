// crawl.js
const scrape = require('website-scraper');
const HtmlRewritingPlugin = require('website-scraper-html-rewriting-plugin');

const TARGET = 'https://example.com';   // ← Change this to the site you want to proxy
const OUTPUT = 'dist';

scrape({
  urls: [ TARGET ],
  directory: OUTPUT,
  recursive: true,
  maxDepth: 2,                // how deep to follow links
  maxConcurrency: 5,
  plugins: [
    new HtmlRewritingPlugin({
      // rewrite any occurrence of the original hostname to a root-relative path
      rewrites: [
        { 
          pattern: new RegExp(TARGET, 'g'),
          replace: ''
        }
      ]
    })
  ],
  request: {
    headers: {                // optional: disguise scraper as a browser
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  }
}).then(() => {
  console.log('✅ Crawl complete. Files in', OUTPUT);
}).catch(err => {
  console.error('❌ Crawl failed:', err);
});
