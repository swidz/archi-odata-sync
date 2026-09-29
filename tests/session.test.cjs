const {test} = require('node:test');
const assert = require('node:assert/strict');
const Session = require('../lib/session.js');
const OAuth = 'OAuth 2.0 (client credentials)';
function storage() { let value = null; return {get: () => value, set: next => { value = next; }}; }
function credentials() { return {tokenUrl: 'https://login.example.test/token', resource: 'https://example.test/', clientId: 'client', clientSecret: ' synthetic secret '}; }

test('connection defaults survive new script instances sharing the application store', () => {
  const memory = storage(), first = Session.create(memory);
  first.rememberUrl('https://example.test/'); first.remember('https://example.test/', OAuth, credentials());
  const next = Session.create(memory);
  assert.equal(next.lastUrl(), 'https://example.test/'); assert.deepEqual(next.credentials(next.lastUrl(), OAuth), credentials());
});

test('remembered credentials and authentication mode are isolated by service URL and mode', () => {
  const session = Session.create(storage()), root = 'https://example.test/';
  session.remember(root, OAuth, credentials()); session.remember(root, 'Basic', {username: 'demo', secret: 'password'});
  assert.equal(session.mode(root), 'Basic'); assert.deepEqual(session.credentials(root, OAuth), credentials());
  assert.deepEqual(session.credentials('https://different.example.test/', OAuth), {});
  assert.equal(session.mode('https://different.example.test/'), OAuth);
});

test('clearing per-run credentials or editing a returned form cannot change session memory', () => {
  const session = Session.create(storage()), values = credentials(); session.remember('url', OAuth, values);
  values.clientSecret = ''; const copy = session.credentials('url', OAuth); copy.clientSecret = 'edited';
  assert.deepEqual(session.credentials('url', OAuth), credentials());
});

test('only allowlisted form fields are remembered, never tokens or response data', () => {
  const memory = storage(), session = Session.create(memory);
  session.remember('url', OAuth, {...credentials(), access_token: 'do-not-cache', header: 'Bearer do-not-cache'});
  assert.ok(!memory.get().includes('do-not-cache'));
  assert.throws(() => session.remember('url', 'unexpected', {}), /Unknown/);
});

test('a new application store or explicit clear has no remembered values', () => {
  const session = Session.create(storage()); session.rememberUrl('url'); session.remember('url', OAuth, credentials());
  const fresh = Session.create(storage()); assert.equal(fresh.lastUrl(), ''); assert.deepEqual(fresh.credentials('url', OAuth), {});
  session.clear(); assert.equal(session.lastUrl(), ''); assert.deepEqual(session.credentials('url', OAuth), {});
});
