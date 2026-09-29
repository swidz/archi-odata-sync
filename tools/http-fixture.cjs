// Local-only test endpoint. Synthetic credentials; no real service data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const metadata = fs.readFileSync(path.join(root, 'tests/fixtures/metadata.xml'));
const service = fs.readFileSync(path.join(root, 'tests/fixtures/service.json'));
let tokenRequests = 0, renewed = false;
const issued = new Set();
const server = http.createServer((req, res) => {
  const route = req.url;
  if (route.startsWith('/token/') || route === '/tenant/oauth2/v2.0/token') {
    tokenRequests++;
    if (route === '/token/redirect') { res.writeHead(307, {Location: '/token/resource'}); return res.end(); }
    if (route === '/token/large') { res.writeHead(200); return res.end('x'.repeat(1048577)); }
    let body = '';
    req.setEncoding('utf8'); req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const form = new URLSearchParams(body);
      if (req.method !== 'POST' || !String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded') || req.headers.authorization ||
          form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== 'synthetic-client' || form.get('client_secret') !== 'a+b &=/%?é!()') {
        res.writeHead(400, {'Content-Type': 'application/json'}); return res.end(JSON.stringify({error: 'invalid_client', error_description: body}));
      }
      const v2 = route === '/tenant/oauth2/v2.0/token';
      if (v2 ? form.get('scope') !== 'https://resource.example.test/.default' || form.has('resource') : form.get('resource') !== 'https://resource.example.test' || form.has('scope')) {
        res.writeHead(400); return res.end(JSON.stringify({error: 'invalid_scope'}));
      }
      if (route === '/token/reject') { res.writeHead(400); return res.end(JSON.stringify({error: 'invalid_client', error_description: body})); }
      if (route === '/token/non-json') { res.writeHead(200); return res.end('not json'); }
      const token = 'oauth-' + tokenRequests; issued.add(token);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({access_token: token, token_type: route === '/token/wrong-type' ? 'MAC' : 'Bearer', expires_in: 3600}));
    });
    return;
  }
  if (route === '/stats') { res.writeHead(200); return res.end(JSON.stringify({tokenRequests})); }
  if (route === '/blocked/' || (route === '/renew/' && !renewed)) { renewed = true; res.writeHead(401); return res.end(); }
  if ((route.startsWith('/oauth/') || route.startsWith('/renew/')) && !issued.has(String(req.headers.authorization).replace(/^Bearer /, ''))) { res.writeHead(401); return res.end(); }
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
