// api/claude-proxy.js
// Vercel serverless function — proxies requests to the Anthropic API.
// Set ANTHROPIC_API_KEY in Vercel → Project Settings → Environment Variables.

const https = require('https');

function getCorsHeaders(req) {
  const origin = req.headers['origin'] || '';
  const allowed =
    origin.includes('yorubalandtime') ||
    origin.includes('vercel.app') ||
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

export default async function handler(req, res) {
  const corsHeaders = getCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set');
    res.writeHead(500, corsHeaders);
    return res.end(JSON.stringify({ error: 'API key not configured. Set ANTHROPIC_API_KEY in Vercel environment variables.' }));
  }

  let body;
  try {
    // Vercel parses the body automatically when bodyParser is enabled (default)
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    res.writeHead(400, corsHeaders);
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
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
      res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid response from Anthropic API' }));
    }
    if (result.status !== 200) {
      console.error('Anthropic error', result.status, JSON.stringify(data));
    }
    res.writeHead(result.status, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Failed to reach Anthropic API', detail: err.message }));
  }
}
