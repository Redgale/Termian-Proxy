# Static Proxy on Netlify

## Usage
1. Set `TARGET` in `crawl.js` to the site you want to mirror.
2. `npm install`
3. `npm run build` — downloads & rewrites into `dist/`.
4. Push to GitHub and connect this repo in Netlify.
5. Netlify will build & deploy your static proxy on its global CDN.

## Notes
- **Caching**: Netlify/CDN caches assets globally; files update on each build.
- **Limitations**: No JS execution or forms; purely static.
