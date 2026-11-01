import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  } catch {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(projectRoot, '.' + pathname);
  if (filePath !== projectRoot && !filePath.startsWith(projectRoot + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    let stat = await fs.stat(filePath);
    let resolvedPath = filePath;
    if (stat.isDirectory()) {
      resolvedPath = path.join(filePath, 'index.html');
      stat = await fs.stat(resolvedPath);
    }
    if (!stat.isFile()) throw new Error('Not a file');

    response.writeHead(200, {
      'Content-Type': contentTypes[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    createReadStream(resolvedPath)
      .on('error', () => {
        if (!response.headersSent) response.writeHead(500);
        response.end('Internal Server Error');
      })
      .pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write('Alicerce test server listening at http://127.0.0.1:' + port + '\n');
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
