// functions/proxy.js
const axios = require('axios');
const { JSDOM } = require('jsdom');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Utility to build a proxied URL
const wrap = url => `/proxy?url=${encodeURIComponent(url)}`;

exports.handler = async (event) => {
  // 1) Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS,
      body: '',
    };
  }

  try {
    const raw = event.queryStringParameters && event.queryStringParameters.url;
    if (!raw || !/^https?:\/\//.test(raw)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: '🔗 Invalid URL. Include full URL, e.g. https://example.com',
      };
    }

    const target = decodeURIComponent(raw);
    const base = new URL(target);

    // 2) Fetch everything as binary so we can proxy images/CSS/JS/fonts/etc.
    const resp = await axios.get(target, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    // 3) Redirects: re‑route them through our proxy
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      const loc = new URL(resp.headers.location, base).href;
      return {
        statusCode: 302,
        headers: {
          ...CORS_HEADERS,
          Location: wrap(loc),
        },
        body: '',
      };
    }

    const type = resp.headers['content-type'] || '';

    // 4) Non-HTML: stream back base64 so images/CSS/JS/fonts work
    if (!type.includes('text/html')) {
      return {
        statusCode: resp.status,
        isBase64Encoded: true,
        headers: {
          'Content-Type': type,
          ...CORS_HEADERS,
        },
        body: Buffer.from(resp.data, 'binary').toString('base64'),
      };
    }

    // 5) HTML: parse & rewrite
    const html = resp.data.toString('utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Rewrite any absolute URL in href/src/action/style(url())
    const rewriteAttr = (el, attr) => {
      const val = el.getAttribute(attr);
      if (!val) return;
      // Only rewrite absolute http(s) URLs
      if (/^https?:\/\//.test(val)) {
        el.setAttribute(attr, wrap(val));
      } else if (val.startsWith('/')) {
        // handle root‑relative URLs
        el.setAttribute(attr, wrap(new URL(val, base).href));
      }
    };

    // Attributes
    ['href','src','action'].forEach(attr => {
      doc.querySelectorAll(`[${attr}]`).forEach(el => rewriteAttr(el, attr));
    });
    // Forms
    doc.querySelectorAll('form').forEach(form => {
      const act = form.getAttribute('action') || base.href;
      form.setAttribute('action', wrap(new URL(act, base).href));
      form.setAttribute('method', form.method || 'GET');
    });

    // Inline <style> and style="" url(...) references
    const rewriteCss = txt => txt.replace(
      /(url\(['"]?)([^'")]+)(['"]?\))/g,
      (_, prefix, ref, suffix) => {
        const abs = /^https?:\/\//.test(ref)
          ? ref
          : new URL(ref, base).href;
        return `${prefix}${wrap(abs)}${suffix}`;
      }
    );
    doc.querySelectorAll('style').forEach(tag => {
      tag.textContent = rewriteCss(tag.textContent);
    });
    doc.querySelectorAll('[style]').forEach(el => {
      el.setAttribute('style', rewriteCss(el.getAttribute('style')));
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        ...CORS_HEADERS
      },
      body: dom.serialize(),
    };

  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: '❌ Proxy fetch failed'
    };
  }
};
