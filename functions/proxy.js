// functions/proxy.js
const axios = require('axios');
const { JSDOM } = require('jsdom');

exports.handler = async (event) => {
  try {
    const { url } = event.queryStringParameters || {};
    if (!url || !/^https?:\/\//.test(url)) {
      return { statusCode: 400, body: '🔗 Invalid URL: include the full URL, e.g. https://example.com' };
    }

    const targetUrl = decodeURIComponent(url);
    const baseUrl = new URL(targetUrl);

    // Fetch everything as arraybuffer so we can forward binary assets too
    const resp = await axios.get(targetUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    // Handle HTTP redirect status (3xx)
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      const location = new URL(resp.headers.location, baseUrl).href;
      return {
        statusCode: 302,
        headers: {
          'Location': `/proxy?url=${encodeURIComponent(location)}`,
          'Access-Control-Allow-Origin': '*',
        },
        body: ''
      };
    }

    const contentType = resp.headers['content-type'] || '';

    // If not HTML, just stream it back
    if (!contentType.includes('text/html')) {
      return {
        statusCode: resp.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        },
        body: Buffer.from(resp.data, 'binary').toString('base64'),
        isBase64Encoded: true
      };
    }

    // === HTML case: parse & rewrite ===
    const html = resp.data.toString('utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const rewriteAttr = (el, attr) => {
      const val = el.getAttribute(attr);
      if (!val) return;
      // build absolute URL then map it back through our proxy
      let abs = new URL(val, baseUrl).href;
      el.setAttribute(attr, `/proxy?url=${encodeURIComponent(abs)}`);
    };

    // Rewrite href/src/action on all elements
    doc.querySelectorAll('[href]').forEach(el => rewriteAttr(el, 'href'));
    doc.querySelectorAll('[src]').forEach(el => rewriteAttr(el, 'src'));
    doc.querySelectorAll('form[action]').forEach(el => rewriteAttr(el, 'action'));

    // Optional: rewrite CSS @import or url(...) inside <style> tags and inline style attributes
    doc.querySelectorAll('style').forEach(styleTag => {
      styleTag.textContent = styleTag.textContent.replace(
        /(url\(['"]?)([^'")]+)(['"]?\))/g,
        (_, pre, urlRef, post) => {
          const abs = new URL(urlRef, baseUrl).href;
          return `${pre}/proxy?url=${encodeURIComponent(abs)}${post}`;
        }
      );
    });
    doc.querySelectorAll('[style]').forEach(el => {
      el.setAttribute('style', el.getAttribute('style').replace(
        /(url\(['"]?)([^'")]+)(['"]?\))/g,
        (_, pre, urlRef, post) => {
          const abs = new URL(urlRef, baseUrl).href;
          return `${pre}/proxy?url=${encodeURIComponent(abs)}${post}`;
        }
      ));
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      },
      body: dom.serialize(),
    };

  } catch (err) {
    console.error('Proxy error:', err);
    return { statusCode: 500, body: '❌ Proxy fetch failed' };
  }
};
