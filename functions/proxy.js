// functions/proxy.js
const axios = require('axios');
const { JSDOM } = require('jsdom');

exports.handler = async (event) => {
  try {
    const { url } = event.queryStringParameters;
    if (!url || !/^https?:\/\//.test(url)) {
      return {
        statusCode: 400,
        body: 'Invalid URL. Please include the full URL (e.g., https://example.com).'
      };
    }

    const targetUrl = decodeURIComponent(url);
    const baseUrl = new URL(targetUrl);

    // Fetch the target page, including redirects
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      maxRedirects: 5,
      withCredentials: true,
      validateStatus: () => true,  // Capture all status codes
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400 && response.headers.location) {
      const redirectUrl = new URL(response.headers.location, baseUrl);
      return {
        statusCode: 302,
        headers: {
          Location: `/proxy?url=${encodeURIComponent(redirectUrl.href)}`,
        },
        body: '',
      };
    }

    const dom = new JSDOM(response.data);
    const elements = dom.window.document.querySelectorAll("[href], [src], [action], form");

    // Rewrite URLs to point back to the proxy
    elements.forEach((el) => {
      if (el.href && el.href.startsWith(baseUrl.origin)) {
        el.href = `/proxy?url=${encodeURIComponent(el.href)}`;
      }
      if (el.src && el.src.startsWith(baseUrl.origin)) {
        el.src = `/proxy?url=${encodeURIComponent(el.src)}`;
      }
      if (el.action && el.action.startsWith(baseUrl.origin)) {
        el.action = `/proxy?url=${encodeURIComponent(el.action)}`;
      }
      // Rewrite form submissions to the proxy
      if (el.tagName === 'FORM' && el.action) {
        const actionUrl = new URL(el.action, baseUrl);
        el.action = `/proxy?url=${encodeURIComponent(actionUrl.href)}`;
      }
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
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: 'Failed to fetch the site. Please try again later.',
    };
  }
};
