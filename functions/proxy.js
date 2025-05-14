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

    const response = await axios.get(url);
    const dom = new JSDOM(response.data);

    // Rewrite all links and asset URLs to be relative
    const baseUrl = new URL(url);
    const elements = dom.window.document.querySelectorAll("[href], [src]");

    elements.forEach((el) => {
      if (el.href && el.href.startsWith(baseUrl.origin)) {
        el.href = el.href.replace(baseUrl.origin, '');
      }
      if (el.src && el.src.startsWith(baseUrl.origin)) {
        el.src = el.src.replace(baseUrl.origin, '');
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
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
