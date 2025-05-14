// functions/proxy.js
const axios = require('axios');
const { JSDOM } = require('jsdom');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const wrap = url => `/proxy?url=${encodeURIComponent(url)}`;

exports.handler = async (event) => {
  // 1) CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    const raw = event.queryStringParameters && event.queryStringParameters.url;
    if (!raw || !/^https?:\/\//.test(raw)) {
      return {
        statusCode: 400,
        headers: CORS,
        body: '🔗 Invalid URL. Include full URL, e.g. https://example.com'
      };
    }

    const target = decodeURIComponent(raw);
    const base = new URL(target);

    // 2) Fetch as binary to proxy images/CSS/JS/fonts/etc.
    const resp = await axios.get(target, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    // 3) Handle HTTP redirects (3xx)
    if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
      const loc = new URL(resp.headers.location, base).href;
      return {
        statusCode: 302,
        headers: { ...CORS, Location: wrap(loc) },
        body: ''
      };
    }

    const cType = resp.headers['content-type'] || '';

    // 4) Non‑HTML assets: stream back base64
    if (!cType.includes('text/html')) {
      return {
        statusCode: resp.status,
        isBase64Encoded: true,
        headers: { 'Content-Type': cType, ...CORS },
        body: Buffer.from(resp.data, 'binary').toString('base64')
      };
    }

    // 5) HTML: parse, inject <base>, rewrite URLs
    const html = resp.data.toString('utf8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // --- Inject <base> so relative URLs resolve via our proxy ---
    const proxyBase = '/proxy?url=' + encodeURIComponent(target);
    const baseTag = doc.createElement('base');
    baseTag.setAttribute('href', proxyBase + '&path=');
    if (doc.head.firstChild) {
      doc.head.insertBefore(baseTag, doc.head.firstChild);
    } else {
      doc.head.appendChild(baseTag);
    }

    // Helper: normalize and wrap any URL
    function normalizeAndWrap(val) {
      if (!val) return val;
      // protocol‑relative: //foo → https://foo
      if (val.startsWith('//')) {
        return wrap('https:' + val);
      }
      // absolute http(s)
      if (/^https?:\/\//.test(val)) {
        return wrap(val);
      }
      // root‑relative
      if (val.startsWith('/')) {
        return wrap(new URL(val, base).href);
      }
      // leave anchors, data URIs, JS snippets untouched
      return val;
    }

    // Rewrite href, src, action attributes
    ['href','src','action'].forEach(attr => {
      doc.querySelectorAll(`[${attr}]`).forEach(el => {
        const original = el.getAttribute(attr);
        const rewritten = normalizeAndWrap(original);
        if (rewritten) el.setAttribute(attr, rewritten);
      });
    });

    // Rewrite form submissions
    doc.querySelectorAll('form').forEach(form => {
      const act = form.getAttribute('action') || base.href;
      form.setAttribute('action', normalizeAndWrap(act));
      form.setAttribute('method', form.method || 'GET');
    });

    // Rewrite CSS url(...) in <style> blocks and inline style=""
    const cssUrlRegex = /(url\(['"]?)([^'")]+)(['"]?\))/g;
    function rewriteCssText(txt) {
      return txt.replace(cssUrlRegex, (_m, pre, ref, post) => {
        return `${pre}${normalizeAndWrap(ref)}${post}`;
      });
    }

    doc.querySelectorAll('style').forEach(tag => {
      tag.textContent = rewriteCssText(tag.textContent);
    });
    doc.querySelectorAll('[style]').forEach(el => {
      el.setAttribute('style', rewriteCssText(el.getAttribute('style')));
    });

    // 6) Return rewritten HTML
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html', ...CORS },
      body: dom.serialize()
    };

  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 500,
      headers: CORS,
      body: '❌ Proxy fetch failed'
    };
  }
};
