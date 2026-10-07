// alttpr.com relay for ALTTPR Unified (a Cloudflare Worker, free plan).
//
// alttpr.com doesn't let web pages on other sites read its seeds, so the app
// asks this relay instead, and the relay asks alttpr.com. It only passes on
// the three things needed to play an alttpr.com seed, only for the app's own
// pages, and only reads (GET): nothing else can go through it.
//
//   /hash/<id>        the seed's patch and settings
//   /api/h/<id>       which base ROM build the seed needs
//   /bps/<md5>.bps    that build's base patch
//
// Set up: see "Loading alttpr.com seeds" in the README.

// Pages allowed to use this relay. Add your own address if you host the app
// somewhere else.
const ALLOWED = [
  'https://hugecrankhank.github.io',
  'http://localhost:8080',
];

const PATHS = /^\/(hash\/[A-Za-z0-9]{10}|api\/h\/[A-Za-z0-9]{10}|bps\/[0-9a-f]{32}\.bps)$/;

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Vary': 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;
    const m = path.match(PATHS);
    if (request.method !== 'GET' || !m) {
      return new Response('This relay only passes on alttpr.com seeds for ALTTPR Unified.', { status: 404, headers: cors });
    }
    // Seeds never change, so let Cloudflare keep a copy for a day and spare alttpr.com.
    const upstream = await fetch('https://alttpr.com/' + m[1], {
      headers: { 'User-Agent': 'ALTTPR-Unified relay' },
      cf: { cacheEverything: true, cacheTtl: 86400 },
    });
    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
