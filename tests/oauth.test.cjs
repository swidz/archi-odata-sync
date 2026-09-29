const {test} = require('node:test');
const assert = require('node:assert/strict');
const OAuth = require('../lib/oauth.js');
const credentials = () => ({tokenUrl: 'https://login.example.test/tenant/oauth2/token', resource: 'https://api.example.test', clientId: 'test-client', clientSecret: 'a+b &=/%?é!()'});
test('client-credentials resource request encodes every value without altering the secret', () => {
  const input = credentials(), req = OAuth.request(input), form = new URLSearchParams(req.body);
  assert.equal(form.get('grant_type'), 'client_credentials'); assert.equal(form.get('resource'), input.resource);
  assert.equal(form.get('client_id'), input.clientId); assert.equal(form.get('client_secret'), input.clientSecret);
  assert.equal(form.has('scope'), false); assert.equal(form.size, 4);
});
test('Entra v2 endpoints use resource/.default as scope', () => {
  const req = OAuth.request({...credentials(), tokenUrl: 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token'});
  const form = new URLSearchParams(req.body); assert.equal(form.get('scope'), 'https://api.example.test/.default'); assert.equal(form.has('resource'), false);
});
test('v2 conversion preserves a resource identifier ending in slash', () => {
  const req = OAuth.request({...credentials(), tokenUrl: 'https://login.example.test/t/oauth2/v2.0/token', resource: 'https://api.example.test/'});
  assert.equal(new URLSearchParams(req.body).get('scope'), 'https://api.example.test//.default');
});
test('explicit .default is not duplicated', () => {
  const req = OAuth.request({...credentials(), tokenUrl: 'https://login.example.test/t/oauth2/v2.0/token', resource: 'api://example/.default'});
  assert.equal(new URLSearchParams(req.body).get('scope'), 'api://example/.default');
});
for (const tokenUrl of ['http://login.example.test/token', 'https://u:secret@example.test/token', 'https://login.example.test/token?secret=x', 'https://login.example.test/token#x', 'file:///token', 'https://login.example.test:99999/token']) {
  test('rejects token endpoint ' + tokenUrl, () => assert.throws(() => OAuth.validate({...credentials(), tokenUrl})));
}
test('permits explicit loopback HTTP for synthetic tests', () => assert.equal(OAuth.validate({...credentials(), tokenUrl: 'http://127.0.0.1:1234/token'}).tokenUrl, 'http://127.0.0.1:1234/token'));
for (const field of ['resource', 'clientId', 'clientSecret']) test('requires ' + field, () => assert.throws(() => OAuth.validate({...credentials(), [field]: ''})));
test('acquires once, reuses until expiry and reacquires with the client credentials grant', () => {
  let clock = 0, requests = 0;
  const auth = OAuth.session(credentials(), req => { assert.equal(new URLSearchParams(req.body).get('grant_type'), 'client_credentials'); return {access_token: `token-${++requests}`, token_type: 'Bearer', expires_in: 100}; }, () => clock);
  assert.equal(auth.getHeader(), 'Bearer token-1'); clock = 89000; assert.equal(auth.getHeader(), 'Bearer token-1');
  clock = 90000; assert.equal(auth.getHeader(), 'Bearer token-2'); assert.equal(requests, 2); auth.clear();
});
test('invalidate renews token and clear makes the session unusable', () => {
  let count = 0;
  const auth = OAuth.session(credentials(), () => ({access_token: `token-${++count}`, token_type: 'bearer', expires_in: '3600'}));
  auth.getHeader(); auth.invalidate(); assert.equal(auth.getHeader(), 'Bearer token-2'); auth.clear(); assert.throws(() => auth.getHeader(), /session has ended/);
});
test('request bodies and response token fields are cleared after token acquisition', () => {
  let req; const response = {access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 3600, refresh_token: 'unused'};
  const auth = OAuth.session(credentials(), value => { req = value; return response; }); auth.getHeader();
  assert.equal(req.body, ''); assert.equal(response.access_token, ''); assert.equal(response.refresh_token, ''); auth.clear();
});
for (const response of [{access_token: ''}, {access_token: 'token\nheader', token_type: 'Bearer'}, {access_token: 'token', token_type: 'MAC'}, {access_token: 'token', token_type: 'Bearer', expires_in: -1}]) {
  test('rejects invalid token response ' + JSON.stringify(response), () => {
    const auth = OAuth.session(credentials(), () => response); assert.throws(() => auth.getHeader()); auth.clear();
  });
}
