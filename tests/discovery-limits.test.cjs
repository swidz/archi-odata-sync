const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../lib/core.js');
const root = 'https://example.test/odata/';
const resolve = (base, relative) => new URL(relative, base).href;
function schema(types, sets = [{name: 'Roots', type: 'D.Root'}]) {
  return {schemas: [{namespace: 'D', types, sets}]};
}
function branching(depth = 8) {
  const types = [{name: 'Root', kind: 'EntityType', fields: [{name: 'Tree', type: 'D.T0'}]}];
  for (let i = 0; i < depth; i++) {
    types.push({name: `T${i}`, kind: 'ComplexType', fields: Array.from({length: 4}, (_, j) =>
      ({name: `F${j}`, type: i + 1 < depth ? `D.T${i + 1}` : 'Edm.String'}))});
  }
  return schema(types);
}
function discover(metadata, settings, progress, names = ['Roots']) {
  return C.discover({value: names.map(name => ({name, url: name}))}, metadata, root, resolve, progress, settings);
}
function flat(count) {
  return schema([{name: 'Root', kind: 'EntityType', fields: Array.from({length: count}, (_, i) => ({name: `F${i}`, type: 'Edm.String'}))}]);
}

test('default limit bounds acyclic complex expansion without returning partial fields', () => {
  const row = discover(branching())[0];
  assert.equal(row.available, false);
  assert.deepEqual(row.fields, []);
  assert.match(row.status, /maxExpandedFieldsPerEntity \(10000\)/);
});

test('per-entity limits accept the exact boundary and leave other entities available', () => {
  const metadata = branching(1); // Tree plus four leaf fields.
  metadata.schemas[0].types.push({name: 'Small', kind: 'EntityType', fields: [{name: 'Id', type: 'Edm.Int32'}]});
  metadata.schemas[0].sets.push({name: 'Small', type: 'D.Small'});
  const rows = discover(metadata, {maxExpandedFieldsPerEntity: 4}, null, ['Roots', 'Small']);
  assert.equal(rows[0].available, false);
  assert.equal(rows[1].available, true);
  assert.equal(discover(metadata, {maxExpandedFieldsPerEntity: 5})[0].fields.length, 5);
});

test('whole-discovery budget counts all entities even when they share a cached type', () => {
  const metadata = flat(3);
  metadata.schemas[0].sets.push({name: 'Other', type: 'D.Root'});
  assert.throws(() => discover(metadata, {maxTotalExpandedFields: 5}, null, ['Roots', 'Other']),
    error => error.discoveryLimit && /maxTotalExpandedFields \(5\)/.test(error.message));
  const rows = discover(metadata, {maxTotalExpandedFields: 6}, null, ['Roots', 'Other']);
  assert.ok(rows.every(row => row.available && row.fields.length === 3));
});

test('failed entity attempts cannot reset the whole-discovery budget', () => {
  const metadata = branching(2);
  metadata.schemas[0].sets.push({name: 'Other', type: 'D.Root'});
  assert.throws(() => discover(metadata, {maxExpandedFieldsPerEntity: 6, maxTotalExpandedFields: 10}, null, ['Roots', 'Other']),
    error => error.discoveryLimit === true);
});

test('navigation fields also consume the per-entity and overall budgets', () => {
  const metadata = flat(1);
  metadata.schemas[0].types[0].navigation = [{name: 'One', type: 'D.Root'}, {name: 'Two', type: 'D.Root'}];
  assert.equal(discover(metadata, {maxExpandedFieldsPerEntity: 2})[0].available, false);
  assert.throws(() => discover(metadata, {maxTotalExpandedFields: 2}), error => error.discoveryLimit === true);
  assert.equal(discover(metadata, {maxTotalExpandedFields: 3})[0].navigation.length, 2);
});

test('cancel propagates unchanged from inside a single entity expansion', () => {
  const canceled = Object.assign(Error('canceled in expansion'), {cancelled: true});
  let calls = 0;
  assert.throws(() => discover(branching(), {}, () => { if (++calls === 2) throw canceled; }), error => error === canceled);
  assert.equal(calls, 2); // The first callback is before the entity; the second is inside its expansion.
});

test('cancel propagates while resolving a wide type', () => {
  const canceled = Object.assign(Error('canceled in type resolution'), {cancelled: true});
  let calls = 0;
  assert.throws(() => discover(flat(8000), {}, () => { if (++calls === 2) throw canceled; }), error => error === canceled);
});

test('invalid analysis limits fail even for an empty service', () => {
  for (const name of ['maxExpandedFieldsPerEntity', 'maxTotalExpandedFields']) {
    for (const value of [0, -1, 1.5, NaN, Infinity, 'invalid', null, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => discover(schema([]), {[name]: value}, null, []),
        error => error.discoveryLimit && error.message.includes(name));
    }
  }
});

test('inherited and own duplicates are rejected, including prototype-like field names', () => {
  for (const name of ['Id', '__proto__', 'constructor', 'toString']) {
    const metadata = schema([
      {name: 'Base', kind: 'EntityType', fields: [{name, type: 'Edm.String'}]},
      {name: 'Root', kind: 'EntityType', base: 'D.Base', fields: [{name, type: 'Edm.String'}]}
    ]);
    assert.match(discover(metadata)[0].status, /Duplicate inherited field/);
    metadata.schemas[0].types[1].base = '';
    metadata.schemas[0].types[1].fields.push({name, type: 'Edm.Int32'});
    assert.match(discover(metadata)[0].status, /Duplicate inherited field/);
  }
});

test('repeated types retain distinct paths, inherited keys and independent returned rows', () => {
  const metadata = schema([
    {name: 'Base', kind: 'EntityType', keys: ['Id'], fields: [{name: 'Id', type: 'Edm.Int32'}]},
    {name: 'Root', kind: 'EntityType', base: 'D.Base', fields: [
      {name: 'Home', type: 'D.Address'}, {name: 'Work', type: 'Collection(D.Address)'}
    ], navigation: [{name: 'Related', type: 'D.Root'}]},
    {name: 'Address', kind: 'ComplexType', fields: [{name: 'City', type: 'Edm.String'}]}
  ]);
  const catalog = C.catalog(metadata), first = catalog.fields('D.Root');
  first.fields[0].key = false;
  first.fields[2].description = 'Caller note';
  first.navigation[0].name = 'Changed';
  const second = catalog.fields('D.Root');
  assert.deepEqual(second.fields.map(f => f.path), ['Id', 'Home', 'Home.City', 'Work', 'Work[].City']);
  assert.equal(second.fields[0].key, true);
  assert.equal(second.fields[2].description, undefined);
  assert.equal(second.navigation[0].name, 'Related');
});

test('deep inheritance remains cancellable and does not overflow the call stack', () => {
  const types = [{name: 'T0', kind: 'EntityType', fields: [{name: 'Id', type: 'Edm.Int32'}], keys: ['Id']}];
  for (let i = 1; i < 6000; i++) types.push({name: `T${i}`, kind: 'EntityType', base: `D.T${i - 1}`});
  const metadata = schema(types, [{name: 'Roots', type: 'D.T5999'}]);
  assert.equal(discover(metadata)[0].fields[0].key, true);
  const canceled = Object.assign(Error('canceled in inheritance'), {cancelled: true});
  let cancel = false;
  const catalog = C.catalog(metadata, () => { if (cancel) throw canceled; });
  cancel = true;
  assert.throws(() => catalog.fields('D.T5999'), error => error === canceled);
});

test('inheritance stays correct when resolved types do not fit in the bounded cache', () => {
  const metadata = schema([
    {name: 'Base', kind: 'EntityType', fields: [{name: 'Id', type: 'Edm.Int32'}], keys: ['Id']},
    {name: 'Root', kind: 'EntityType', base: 'D.Base'}
  ]);
  const rows = discover(metadata, {maxTotalExpandedFields: 1});
  assert.ok(rows[0].available && rows[0].fields[0].key);
});
