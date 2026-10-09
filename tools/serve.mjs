// Local preview: serves public/ like Cloudflare Pages does (/privacy -> privacy/index.html), plus dev/ at /dev/.
// node tools/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.argv[2] || process.env.PORT || 4321);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function resolve(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0]);
  const base = p.startsWith('/dev/') ? path.join(ROOT, 'dev') : path.join(ROOT, 'public');
  const rel = p.startsWith('/dev/') ? p.slice(4) : p;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return null;
  for (const f of [file, path.join(file, 'index.html'), `${file}.html`]) {
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url);
    if (!file) {
      const nf = path.join(ROOT, 'public/404.html');
      res.writeHead(404, { 'content-type': TYPES['.html'] });
      return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
