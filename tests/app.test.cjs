const {test} = require('node:test');
const assert = require('node:assert/strict');
const App = require('../lib/app.js');
function fixture() {
  const calls = [], auth = {header: 'Bearer test-only'}, row = {id: 'Customers', available: true};
  const io = {
    promptUrl() { calls.push('url'); return 'https://example.test/'; },
    normalizeUrl(v) { return v; }, cacheChoice() { return 'fresh'; }, authenticate() { calls.push('auth'); return auth; },
    discover() { calls.push('discover'); return [row]; }, saved() { return {}; },
    select() { calls.push('select'); return [row]; }, prepare() { calls.push('prepare'); return {}; },
    apply() { calls.push('apply'); return {entities: 1, created: 2, updated: 0}; },
    synchronize(root, rows, options) { return io.apply(io.prepare(root, rows, options)); }, info() {}
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

test('cached discovery skips authentication and passes the reuse choice', () => {
  const f = fixture(); f.io.cacheChoice = () => 'reuse';
  f.io.discover = (root, auth, settings, mode) => { assert.equal(mode, 'reuse'); assert.equal(auth.header, ''); return [{id: 'Customers'}]; };
  App.execute(f.io, {}); assert.ok(!f.calls.includes('auth')); assert.ok(f.calls.includes('apply'));
});

test('fresh discovery authenticates and passes the explicit refresh choice', () => {
  const f = fixture(); f.io.discover = (root, auth, settings, mode) => { assert.equal(mode, 'fresh'); assert.equal(auth, f.auth); return [{id: 'Customers'}]; };
  App.execute(f.io, {}); assert.ok(f.calls.includes('auth'));
});

test('canceling the metadata-source choice does not authenticate, discover or mutate', () => {
  const f = fixture(); f.io.cacheChoice = () => null;
  assert.equal(App.execute(f.io, {}).cancelled, true); assert.deepEqual(f.calls, ['url']);
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

test('canceling progress never reaches model application and clears run credentials', () => {
  for (const phase of ['discover', 'prepare']) {
    const f = fixture(); let cleared = false;
    f.auth.clear = () => { cleared = true; };
    f.io[phase] = () => { throw Object.assign(Error('canceled'), {cancelled: true}); };
    assert.throws(() => App.execute(f.io, {}), error => error.cancelled);
    assert.ok(cleared); assert.ok(!f.calls.includes('apply'));
  }
});

test('URL prompt uses process memory across models and ignores the legacy model property', () => {
  const vm = require('node:vm'), fs = require('node:fs'), Session = require('../lib/session.js');
  let stored, entered = 'https://example.test/$metadata', defaultValue;
  const session = Session.create({get: () => stored, set: value => { stored = value; }});
  const context = vm.createContext({
    ODataCore: require('../lib/core.js'), ODataSession: {current: () => session}, ODataCache: {info: () => null},
    model: {prop() { throw Error('Connection form must not access model properties'); }},
    ODataUI: {authentication: () => null}, ODataArchi: {},
    ODataJava: {normalizeUrl: () => 'https://example.test/'},
    window: {prompt: (label, value) => { defaultValue = value; return entered; }, alert(message) { throw Error(message); }}
  });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/app.js'), 'utf8'), context);
  context.ODataApp.run({defaultUrl: 'configured-default'}); assert.equal(defaultValue, 'configured-default');
  context.model = {prop() { throw Error('Different model must not affect session defaults'); }}; entered = null;
  context.ODataApp.run({}); assert.equal(defaultValue, 'https://example.test/'); assert.equal(session.lastUrl(), defaultValue);
});
