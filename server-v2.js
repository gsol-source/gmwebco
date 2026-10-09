// GM Web Co. — local web server (no dependencies, just Node 18+)
// Run: node server-v2.js   then open http://localhost:3060
// On Vercel, api/index.js is used instead; both share lib/app.js.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { handle, config, googleConfigured, googleConnected, send } = require('./lib/app');
const store = require('./lib/store');

const PUBLIC = path.join(__dirname, 'public');
const V2 = path.join(__dirname, 'site-v2'); // site-v2 files win; everything else falls back to public/
const PORT = process.env.PORT || 3060;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.mp4': 'video/mp4', '.webp': 'image/webp',
};

function serveStatic(res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (!path.extname(pathname)) pathname += '.html'; // clean URLs: /privacy -> privacy.html
  let file = path.normalize(path.join(V2, pathname));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC) && !file.startsWith(V2)) return send(res, 403, 'Forbidden', 'text/plain');
  // Videos: stream with byte-range support (Safari won't play <video> without it)
  if (path.extname(file) === '.mp4') {
    return fs.stat(file, (err, st) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      const m = /bytes=(\d*)-(\d*)/.exec(res.req.headers.range || '');
      const start = m && m[1] ? +m[1] : 0;
      const end = m && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      res.writeHead(m ? 206 : 200, {
        'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
        ...(m && { 'Content-Range': `bytes ${start}-${end}/${st.size}` }),
      });
      fs.createReadStream(file, { start, end }).pipe(res);
    });
  }
  fs.readFile(file, (err, content) => {
    if (err) return fs.readFile(path.join(PUBLIC, '404.html'), (e2, page) => send(res, 404, page || 'Not found', 'text/html; charset=utf-8'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Frame-Options': 'DENY' });
    res.end(content);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) return handle(req, res, pathname);
  if (req.method === 'GET') return serveStatic(res, decodeURIComponent(pathname));
  send(res, 405, { error: 'Method not allowed' });
}).listen(PORT, '127.0.0.1', async () => {
  const base = `http://localhost:${PORT}`;
  const google = (await googleConnected()) ? 'connected'
    : googleConfigured() ? 'not connected — log in to admin and click Connect' : 'not set up (see README.md)';
  console.log(`\n  GM Web Co. is running → ${base}`);
  console.log(`  Admin dashboard      → ${base}/admin${config.adminPassword ? '' : '  (set adminPassword in config.json!)'}`);
  console.log(`  Storage              → ${store.backend === 'redis' ? 'Upstash Redis' : 'local files in data/'}`);
  console.log(`  Google Meet booking  → ${google}\n`);
});
