import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const base = new URL('../apps/store', import.meta.url).pathname;
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const srv = http.createServer((req, res) => {
  let p = req.url === '/' ? '/index.html' : req.url;
  p = p.split('?')[0];
  const fp = path.join(base, p);
  if (!fs.existsSync(fp)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(fp);
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'text/plain',
    'Access-Control-Allow-Origin': '*',
  });
  fs.createReadStream(fp).pipe(res);
});

srv.listen(3001, () => console.log('[store] Static server on http://localhost:3001'));
