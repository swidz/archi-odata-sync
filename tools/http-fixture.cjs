// Local-only test endpoint. Synthetic credentials; no real service data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const metadata = fs.readFileSync(path.join(root, 'tests/fixtures/metadata.xml'));
const service = fs.readFileSync(path.join(root, 'tests/fixtures/service.json'));
const server = http.createServer((req, res) => {
  const route = req.url;
  if (route.startsWith('/bearer/') && req.headers.authorization !== 'Bearer synthetic-test-token') { res.writeHead(401); return res.end(); }
  if (route.startsWith('/basic/') && req.headers.authorization !== 'Basic ZGVtbzpwYXNzd29yZA==') { res.writeHead(403); return res.end(); }
  if (route === '/denied/') { res.writeHead(401); return res.end('Sensitive body must never appear in errors'); }
  if (route === '/cross/') { res.writeHead(302, {Location: 'http://localhost:1/'}); return res.end(); }
  if (route === '/redirect/') { res.writeHead(302, {Location: '/odata/'}); return res.end(); }
  if (route === '/large/') { res.writeHead(200); return res.end('x'.repeat(2048)); }
  if (route === '/slow/') { res.writeHead(200); return setTimeout(() => res.end('{}'), 1500); }
  if (route.endsWith('$metadata')) { res.writeHead(200, {'Content-Type': 'application/xml', 'OData-Version': '4.0'}); return res.end(metadata); }
  if (route.endsWith('/')) { res.writeHead(200, {'Content-Type': 'application/json', 'OData-Version': '4.0'}); return res.end(service); }
  res.writeHead(500); res.end('Entity record endpoints must never be requested.');
});
server.listen(0, '127.0.0.1', () => {
  fs.mkdirSync(path.join(root, 'work'), {recursive: true});
  fs.writeFileSync(path.join(root, 'work/http-fixture-url.txt'), `http://127.0.0.1:${server.address().port}/`);
  console.log('OData test fixture listening on loopback.');
});
