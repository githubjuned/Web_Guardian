/**
 * Minimal static server for the Brewly demo site (no dependencies).
 * Usage: node demo-site/serve.mjs [port]   (default 4000)
 *
 * The WebGuardian backend also serves this site at /demo/ and creates
 * per-audit sandbox copies at /sandbox/<id>/ so fixes can be applied safely.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const port = Number(process.argv[2] ?? process.env.PORT ?? 4000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(root, urlPath));
    if (!file.startsWith(root)) return res.writeHead(403).end('Forbidden');
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404, { 'Content-Type': 'text/html' }).end('<h1>404 — Page not found</h1>');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`Brewly demo site → http://localhost:${port}/`));
