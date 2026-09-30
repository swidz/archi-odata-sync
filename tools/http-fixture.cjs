// Local-only test endpoint. Synthetic credentials; no real service data.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const metadata = fs.readFileSync(path.join(root, 'tests/fixtures/metadata.xml'));
const service = fs.readFileSync(path.join(root, 'tests/fixtures/service.json'));
const branching = fs.readFileSync(path.join(root, 'tests/fixtures/branching-metadata.xml'));
let tokenRequests = 0, renewed = false;
const issued = new Set();
const requests = {};
const server = http.createServer((req, res) => {
  const route = req.url;
  if (route !== '/stats') requests[route] = (requests[route] || 0) + 1;
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
      const reply = () => res.end(JSON.stringify({access_token: token, token_type: route === '/token/wrong-type' ? 'MAC' : 'Bearer', expires_in: 3600}));
      if (route === '/token/slow') setTimeout(reply, 1000); else reply();
    });
    return;
  }
  if (route === '/stats') { res.writeHead(200); return res.end(JSON.stringify({tokenRequests, requests})); }
  if (route === '/branching/') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({value: [{name: 'Roots', url: 'Roots'}]}));
  }
  if (route === '/branching/$metadata') { res.writeHead(200, {'Content-Type': 'application/xml'}); return res.end(branching); }
  if (route.startsWith('/cache-case-') && route.endsWith('/$metadata')) {
    const version = requests[route];
    if (version === 3) { res.writeHead(503); return res.end('unavailable'); }
    res.writeHead(200, {'Content-Type': 'application/xml'});
    return res.end(version === 4 ? 'invalid XML' : metadata.toString('utf8').replace('Name="Balance"', `Name="CachedVersion${version}"`));
  }
  if (route === '/blocked/' || (route === '/renew/' && !renewed)) { renewed = true; res.writeHead(401); return res.end(); }
  if ((route.startsWith('/oauth/') || route.startsWith('/renew/')) && !issued.has(String(req.headers.authorization).replace(/^Bearer /, ''))) { res.writeHead(401); return res.end(); }
  if (route.startsWith('/bearer/') && req.headers.authorization !== 'Bearer synthetic-test-token') { res.writeHead(401); return res.end(); }
  if (route.startsWith('/basic/') && req.headers.authorization !== 'Basic ZGVtbzpwYXNzd29yZA==') { res.writeHead(403); return res.end(); }
  if (route === '/denied/') { res.writeHead(401); return res.end('Sensitive body must never appear in errors'); }
  if (route === '/cross/') { res.writeHead(302, {Location: 'http://localhost:1/'}); return res.end(); }
  if (route === '/redirect/') { res.writeHead(302, {Location: '/odata/'}); return res.end(); }
  if (route === '/large/') { res.writeHead(200); return res.end('x'.repeat(2048)); }
  if (route === '/large-chunked/') { res.writeHead(200); res.write('x'.repeat(800)); return res.end('y'.repeat(800)); }
  if (route === '/oversize-metadata/$metadata') { res.writeHead(200, {'Content-Type': 'application/xml', 'Content-Length': 1024 * 1024}); return res.end(); }
  if (route === '/big-metadata/$metadata') {
    // More than 32 MiB of actual CSDL fields, not whitespace padding.
    const schemaEnd = metadata.indexOf(Buffer.from('</Schema>'));
    const property = '<Property Name="Field_PLACEHOLDER" Type="Edm.String" MaxLength="200"><Annotation Term="Org.OData.Core.V1.Description" String="Synthetic ERP metadata field for response size regression verification"/></Property>';
    const fields = Array.from({length: 100}, (_, i) => property.replace('PLACEHOLDER', i)).join('');
    const types = Array.from({length: 1800}, (_, i) => `<EntityType Name="AdditionalType${i}">${fields}</EntityType>`);
    const length = metadata.length + types.reduce((sum, value) => sum + Buffer.byteLength(value), 0);
    res.writeHead(200, {'Content-Type': 'application/xml', 'Content-Length': length, 'OData-Version': '4.0'});
    res.write(metadata.subarray(0, schemaEnd));
    for (const type of types) res.write(type);
    return res.end(metadata.subarray(schemaEnd));
  }
  if (route === '/slow/') { res.writeHead(200); return setTimeout(() => res.end('{}'), 1500); }
  if (route === '/progress/$metadata') {
    const content = Buffer.concat([metadata.subarray(0, metadata.length - 1), Buffer.from(' '.repeat(500000)), metadata.subarray(metadata.length - 1)]);
    res.writeHead(200, {'Content-Type': 'application/xml', 'Content-Length': content.length});
    let offset = 0;
    const timer = setInterval(() => { res.write(content.subarray(offset, offset + 50000)); offset += 50000; if (offset >= content.length) { clearInterval(timer); res.end(); } }, 80);
    res.on('close', () => clearInterval(timer)); return;
  }
  if (route.endsWith('$metadata')) { res.writeHead(200, {'Content-Type': 'application/xml', 'OData-Version': '4.0'}); return res.end(metadata); }
  if (route.endsWith('/')) { res.writeHead(200, {'Content-Type': 'application/json', 'OData-Version': '4.0'}); return res.end(service); }
  res.writeHead(500); res.end('Entity record endpoints must never be requested.');
});
server.listen(0, '127.0.0.1', () => {
  fs.mkdirSync(path.join(root, 'work'), {recursive: true});
  fs.writeFileSync(path.join(root, 'work/http-fixture-url.txt'), `http://127.0.0.1:${server.address().port}/`);
  console.log('OData test fixture listening on loopback.');
});
