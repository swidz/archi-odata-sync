const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/core.js');
const root = 'https://example.test/odata/';
const resolve = (r, u) => new URL(u, r).href;
function metadata() {
  return {schemas: [{namespace: 'Demo', alias: 'D', types: [
    {kind: 'EntityType', name: 'Base', fields: [{name: 'Id', type: 'Edm.Int64', nullable: false}], keys: ['Id']},
    {kind: 'EntityType', name: 'Customer', base: 'D.Base', fields: [
      {name: 'Name', type: 'Edm.String', maxLength: '120', nullable: true, description: 'Customer <name>'},
      {name: 'Address', type: 'D.Address', nullable: true},
      {name: 'State', type: 'D.State', nullable: false},
      {name: 'Tags', type: 'Collection(Edm.String)', nullable: false}
    ], navigation: [{name: 'Orders', type: 'Collection(D.Order)'}]},
    {kind: 'ComplexType', name: 'Address', fields: [{name: 'City', type: 'Edm.String', nullable: true}]},
    {kind: 'EnumType', name: 'State', members: ['Active=1', 'Inactive=2']}
  ], sets: [{name: 'Customers', type: 'D.Customer'}, {name: 'Hidden', type: 'D.Customer'}]}]};
}
function rows(m = metadata()) {
  return C.discover({value: [{name: 'Customers', url: 'Customers'}]}, m, root, resolve);
}
test('normalizes host, default port, trailing slash and metadata URL without folding path case', () => {
  assert.equal(C.normalizeUrl(' HTTPS://Example.TEST:443/MyService/$metadata '), 'https://example.test/MyService/');
  assert.equal(C.normalizeUrl('http://localhost:9876/odata'), 'http://localhost:9876/odata/');
});
for (const url of ['file:///tmp/test', 'https://user:password@test/', 'https://test/?token=secret', 'https://test/#x', 'https://test/a/../b', 'https://test/%2fsecret', 'https://test/line\nbreak', 'https://test\\evil']) {
  test('rejects unsafe or ambiguous service URL: ' + url.replace(/\n/g, ''), () => assert.throws(() => C.normalizeUrl(url)));
}
test('uses only service-advertised EntitySets, ignoring singletons/functions and hidden metadata sets', () => {
  const service = {value: [{name: 'Customers', url: 'Customers'}, {name: 'Current', kind: 'Singleton', url: 'Current'}, {name: 'Search', kind: 'FunctionImport', url: 'Search'}]};
  assert.deepEqual(C.discover(service, metadata(), root, resolve).map(r => r.name), ['Customers']);
});
test('resolves aliases, inherited keys, complex members, collections, enum values and navigation fields', () => {
  const r = rows()[0];
  assert.equal(r.available, true);
  assert.equal(r.type, 'Demo.Customer');
  assert.deepEqual(r.fields.map(f => f.path), ['Id', 'Name', 'Address', 'Address.City', 'State', 'Tags']);
  assert.equal(r.fields[0].key, true);
  assert.equal(r.fields[4].enumMembers, 'Active=1, Inactive=2');
  assert.equal(r.fields[5].displayType, 'Collection(Edm.String)');
  assert.equal(r.navigation[0].name, 'Orders');
});
test('lists unavailable entities without silently creating incomplete objects', () => {
  const r = C.discover({value: [{name: 'Missing', url: 'Missing'}]}, metadata(), root, resolve)[0];
  assert.equal(r.available, false); assert.match(r.status, /missing from/);
});

test('entity analysis reports real entity totals and propagates cancellation', () => {
  const service = {value: [{name: 'Customers', url: 'Customers'}, {name: 'Current', kind: 'Singleton', url: 'Current'}]}, progress = [];
  C.discover(service, metadata(), root, resolve, (stage, done, total) => progress.push([done, total]));
  assert.deepEqual(progress, [[0, 1], [1, 1]]);
  const canceled = Object.assign(Error('canceled'), {cancelled: true});
  assert.throws(() => C.discover(service, metadata(), root, resolve, () => { throw canceled; }), error => error === canceled);
});
test('cyclic inheritance disables only affected entity sets', () => {
  const m = metadata(); m.schemas[0].types[0].base = 'D.Customer';
  assert.match(rows(m)[0].status, /Cyclic/);
});
test('recursive complex types produce a finite explicit field list', () => {
  const m = metadata(); m.schemas[0].types[2].fields.push({name: 'Next', type: 'D.Address'});
  const r = rows(m)[0]; assert.equal(r.available, true); assert.equal(r.fields.find(f => f.path === 'Address.Next').recursive, true);
});
test('missing external field types disable affected rows', () => {
  const m = metadata(); m.schemas[0].types[1].fields.push({name: 'External', type: 'Other.Value'});
  assert.match(rows(m)[0].status, /Field type not defined/);
});
test('rejects duplicate advertised entries and non-service payloads', () => {
  assert.throws(() => C.discover({value: [{name: 'Customers', url: 'Customers'}, {name: 'Customers', url: 'Customers'}]}, metadata(), root, resolve), /Duplicate/);
  assert.throws(() => C.discover({d: {results: []}}, metadata(), root, resolve), /service document/);
  assert.throws(() => C.discover({value: [{Id: 1}]}, metadata(), root, resolve), /Invalid entity/);
});
test('documentation uses numbered markup with escaped metadata, key and type details', () => {
  const doc = C.documentation(rows()[0], 'data');
  assert.match(doc, /1\. \*\*Id\*\*.*required; key/);
  assert.match(doc, /Customer &lt;name&gt;/);
  assert.match(doc, /### Navigation properties/);
  assert.match(doc, /maxLength=120/);
});
test('refresh replaces its generated block and preserves surrounding architect notes', () => {
  const first = C.documentation(rows()[0], 'data');
  const existing = 'Architect notes\n\n' + first + '\n\nLocal notes';
  const changed = C.documentation({...rows()[0], fields: []}, 'data');
  const actual = C.mergeDocumentation(existing, changed);
  assert.ok(actual.startsWith('Architect notes\n\n')); assert.ok(actual.endsWith('\n\nLocal notes'));
  assert.equal(actual.split('archi-odata-sync:begin').length, 2);
  assert.match(actual, /No declared structural fields/);
});
test('damaged documentation markers fail before a model mutation', () => {
  assert.throws(() => C.mergeDocumentation('<!-- archi-odata-sync:begin -->', 'new'), /damaged/);
});
test('entity identity separates service, role and case-sensitive entity-set name', () => {
  const keys = [C.key(root, 'Customer', 'data'), C.key(root, 'customer', 'data'), C.key(root, 'Customer', 'interface'), C.key(root + 'v2/', 'Customer', 'data')];
  assert.equal(new Set(keys).size, 4);
});
