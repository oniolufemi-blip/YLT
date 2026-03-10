// netlify/functions/claude-proxy.js
// Proxies requests to the Anthropic API server-side.
// Set ANTHROPIC_API_KEY in Netlify → Site Settings → Environment Variables.
// Uses Node's built-in https module — works on all Netlify Node versions.

const https = require('https');

function getCorsHeaders(event) {
  const origin = (event.headers && event.headers.origin) || '';
  const allowed =
    origin.includes('yorubalandtime') ||
    origin.includes('netlify.app') ||
    origin.includes('localhost') ||
    origin === '';
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'https://www.yorubalandtime.org',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function httpsPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async function (event) {
  const corsHeaders = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Netlify environment variables.' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.min(Number(body.max_tokens) || 1000, 1000),
    system: body.system || '',
    messages: Array.isArray(body.messages) ? body.messages : [],
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  };

  try {
    const result = await httpsPost(options, payload);
    let data;
    try {
      data = JSON.parse(result.body);
    } catch {
      console.error('Non-JSON from Anthropic:', result.body.slice(0, 200));
      return {
        statusCode: 502,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid response from Anthropic API' }),
      };
    }
    if (result.status !== 200) {
      console.error('Anthropic error', result.status, JSON.stringify(data));
    }
    return {
      statusCode: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error('Proxy error:', err.message);
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to reach Anthropic API', detail: err.message }),
    };
  }
};
