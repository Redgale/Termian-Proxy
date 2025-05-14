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

    // Fetch the page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      withCredentials: true
    });

    const dom = new JSDOM(response.data);
    const baseUrl = new URL(url);
    const elements = dom.window.document.querySelectorAll("[href], [src], [action]");

    // Rewrite links, src, and form actions
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
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',  // Allow cross-origin access
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
