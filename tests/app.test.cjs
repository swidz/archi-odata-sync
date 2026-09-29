const {test} = require('node:test');
const assert = require('node:assert/strict');
const App = require('../lib/app.js');
function fixture() {
  const calls = [], auth = {header: 'Bearer test-only'}, row = {id: 'Customers', available: true};
  const io = {
    promptUrl() { calls.push('url'); return 'https://example.test/'; },
    normalizeUrl(v) { return v; }, authenticate() { calls.push('auth'); return auth; },
    discover() { calls.push('discover'); return [row]; }, saved() { return {}; },
    select() { calls.push('select'); return [row]; }, prepare() { calls.push('prepare'); return {}; },
    apply() { calls.push('apply'); return {entities: 1, created: 2, updated: 0}; }, info() {}
  };
  return {io, calls, auth};
}
test('URL and complete discovery precede selection and all mutations', () => {
  const f = fixture(); App.execute(f.io, {});
  assert.deepEqual(f.calls, ['url', 'auth', 'discover', 'select', 'prepare', 'apply']);
  assert.equal(f.auth.header, '');
});
test('cancel at URL causes no authentication or network access', () => {
  const f = fixture(); f.io.promptUrl = () => null; assert.equal(App.execute(f.io, {}).cancelled, true); assert.deepEqual(f.calls, []);
});
test('cancel entity selection makes no model changes and clears credentials', () => {
  const f = fixture(); f.io.select = () => null; assert.equal(App.execute(f.io, {}).cancelled, true);
  assert.ok(!f.calls.includes('apply')); assert.equal(f.auth.header, '');
});
test('discovery errors clear credentials and cannot apply', () => {
  const f = fixture(); f.io.discover = () => { throw Error('unavailable'); };
  assert.throws(() => App.execute(f.io, {}), /unavailable/); assert.equal(f.auth.header, ''); assert.ok(!f.calls.includes('apply'));
});
test('preflight error does not apply', () => {
  const f = fixture(); f.io.prepare = () => { throw Error('duplicate identity'); };
  assert.throws(() => App.execute(f.io, {}), /duplicate/); assert.ok(!f.calls.includes('apply'));
});
test('OAuth session is cleared after cancellation and failures', () => {
  for (const failure of [false, true]) {
    const f = fixture(); let cleared = false;
    f.auth.clear = () => { cleared = true; };
    if (failure) f.io.discover = () => { throw Error('denied'); }; else f.io.select = () => null;
    if (failure) assert.throws(() => App.execute(f.io, {}), /denied/); else App.execute(f.io, {});
    assert.equal(cleared, true); assert.ok(!f.calls.includes('apply'));
  }
});
test('OAuth authentication failure occurs before discovery or model changes', () => {
  const f = fixture(); f.io.authenticate = () => { throw Error('invalid_client'); };
  assert.throws(() => App.execute(f.io, {}), /invalid_client/);
  assert.deepEqual(f.calls, ['url']);
});
