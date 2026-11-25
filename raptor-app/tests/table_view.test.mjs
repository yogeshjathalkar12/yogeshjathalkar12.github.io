// Run with:  node --test tests/table_view.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPrefs, reconcilePrefs, toggleColumn, moveColumn, cycleSort, setFilter, hasFilters, displayValue, compareValues, matcher, applyView, loadPrefs, savePrefs, EMPTY_CHOICE } from '../src/lib/tableView.ts';

const COLS = [
  { id: 'name', label: 'Name', kind: 'text', value: (r) => r.name, locked: true },
  { id: 'city', label: 'City', kind: 'text', value: (r) => r.city, defaultVisible: true },
  { id: 'size', label: 'Employees', kind: 'number', value: (r) => r.size },
  { id: 'since', label: 'Since', kind: 'date', value: (r) => r.since },
  { id: 'stage', label: 'Stage', kind: 'select', value: (r) => r.stage, options: ['Lead', 'Won'] },
];
const ROWS = [
  { name: 'beta', city: 'Pune', size: 120, since: '2026-03-04T10:00:00Z', stage: 'Won' },
  { name: 'Alpha', city: 'pune', size: 9, since: '2025-12-31', stage: 'Lead' },
  { name: 'gamma', city: null, size: null, since: null, stage: null },
  { name: 'Delta 10', city: 'Delhi', size: '1,500', since: '2026-11-25', stage: 'Lead' },
  { name: 'Delta 2', city: 'Mumbai', size: 40, since: '2026-01-01', stage: 'Won' },
];
const names = (rows) => rows.map((r) => r.name);
const view = (prefs) => names(applyView(ROWS, COLS, { ...defaultPrefs(COLS), ...prefs }));

test('the default view is the locked column plus the default-visible ones', () => {
  assert.deepEqual(defaultPrefs(COLS), { visible: ['name', 'city'], sort: null, filters: {} });
});

test('prefs from an earlier visit are made to fit today\'s columns', () => {
  const p = reconcilePrefs({ visible: ['city', 'gone', 'size', 'city'], sort: { id: 'gone', dir: 'asc' }, filters: { gone: 'x', city: 'pu', size: '  ' } }, COLS);
  assert.deepEqual(p, { visible: ['name', 'city', 'size'], sort: null, filters: { city: 'pu' } });   // locked column put back first, deleted ones dropped, empty filter dropped
  assert.deepEqual(reconcilePrefs(null, COLS), defaultPrefs(COLS));
  assert.deepEqual(reconcilePrefs({ visible: 'nonsense' }, COLS), defaultPrefs(COLS));
});

test('showing, hiding and moving columns; the locked one cannot be hidden', () => {
  let p = defaultPrefs(COLS);
  p = toggleColumn(p, COLS, 'size');
  assert.deepEqual(p.visible, ['name', 'city', 'size']);
  p = moveColumn(p, 'size', -1);
  assert.deepEqual(p.visible, ['name', 'size', 'city']);
  assert.deepEqual(moveColumn(p, 'name', -1).visible, p.visible);          // already first
  assert.deepEqual(toggleColumn(p, COLS, 'name').visible, p.visible);      // locked
  p = setFilter(cycleSort(p, 'size'), 'size', '>5');
  p = toggleColumn(p, COLS, 'size');                                       // hiding a column also drops its sort and filter
  assert.equal(p.sort, null);
  assert.deepEqual(p.filters, {});
});

test('a header click goes ascending, descending, then back to the original order', () => {
  let p = defaultPrefs(COLS);
  p = cycleSort(p, 'city'); assert.deepEqual(p.sort, { id: 'city', dir: 'asc' });
  p = cycleSort(p, 'city'); assert.deepEqual(p.sort, { id: 'city', dir: 'desc' });
  p = cycleSort(p, 'city'); assert.equal(p.sort, null);
  p = cycleSort(cycleSort(p, 'city'), 'size'); assert.deepEqual(p.sort, { id: 'size', dir: 'asc' });
});

test('sorting: text ignores case and counts numbers inside names, numbers are numbers, dates by day, empty always last', () => {
  assert.deepEqual(view({ sort: { id: 'name', dir: 'asc' } }), ['Alpha', 'beta', 'Delta 2', 'Delta 10', 'gamma']);
  assert.deepEqual(view({ sort: { id: 'size', dir: 'asc' } }), ['Alpha', 'Delta 2', 'beta', 'Delta 10', 'gamma']);        // 9, 40, 120, "1,500", empty
  assert.deepEqual(view({ sort: { id: 'size', dir: 'desc' } }), ['Delta 10', 'beta', 'Delta 2', 'Alpha', 'gamma']);        // empty still last
  assert.deepEqual(view({ sort: { id: 'since', dir: 'asc' } }), ['Alpha', 'Delta 2', 'beta', 'Delta 10', 'gamma']);
});

test('text filters: contains, "empty", "filled"; select filters: the chosen option or none', () => {
  assert.deepEqual(view({ filters: { city: 'PUN' } }), ['beta', 'Alpha']);
  assert.deepEqual(view({ filters: { city: 'empty' } }), ['gamma']);
  assert.deepEqual(view({ filters: { city: 'filled' } }), ['beta', 'Alpha', 'Delta 10', 'Delta 2']);
  assert.deepEqual(view({ filters: { stage: 'Won' } }), ['beta', 'Delta 2']);
  assert.deepEqual(view({ filters: { stage: EMPTY_CHOICE } }), ['gamma']);
});

test('number filters: > >= < <= = != and a..b', () => {
  assert.deepEqual(view({ filters: { size: '>=100' } }), ['beta', 'Delta 10']);
  assert.deepEqual(view({ filters: { size: '<50' } }), ['Alpha', 'Delta 2']);
  assert.deepEqual(view({ filters: { size: '40' } }), ['Delta 2']);
  assert.deepEqual(view({ filters: { size: '9..120' } }), ['beta', 'Alpha', 'Delta 2']);
  assert.deepEqual(view({ filters: { size: '!=40' } }), ['beta', 'Alpha', 'gamma', 'Delta 10']);
});

test('date filters: from a day, before a day, or part of a date', () => {
  assert.deepEqual(view({ filters: { since: '>=2026-03' } }), ['beta', 'Delta 10']);
  assert.deepEqual(view({ filters: { since: '<2026-01-02' } }), ['Alpha', 'Delta 2']);
  assert.deepEqual(view({ filters: { since: '2026-11' } }), ['Delta 10']);
});

test('several filters work together, and the input rows are never changed', () => {
  const copy = JSON.stringify(ROWS);
  assert.deepEqual(view({ filters: { city: 'pune', size: '>10' } }), ['beta']);
  assert.deepEqual(view({ filters: { city: 'pune' }, sort: { id: 'name', dir: 'desc' } }), ['beta', 'Alpha']);
  assert.equal(JSON.stringify(ROWS), copy);
  assert.equal(hasFilters(setFilter(defaultPrefs(COLS), 'city', 'x')), true);
  assert.equal(hasFilters(defaultPrefs(COLS)), false);
});

test('what the table prints', () => {
  assert.equal(displayValue('date', '2026-03-04T10:00:00Z'), '2026-03-04');
  assert.equal(displayValue('text', null), '—');
  assert.equal(displayValue('number', 0), '0');
  assert.equal(compareValues('number', '9', '10') < 0, true);
  assert.equal(matcher('text', '   ')('anything'), true);
});

test('choices are remembered per person and survive a damaged or missing store', () => {
  const mem = new Map(); const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const p = toggleColumn(defaultPrefs(COLS), COLS, 'stage');
  savePrefs(store, 'companies:alice', p);
  assert.deepEqual(loadPrefs(store, 'companies:alice', COLS).visible, ['name', 'city', 'stage']);
  assert.deepEqual(loadPrefs(store, 'companies:bob', COLS), defaultPrefs(COLS));                     // another person starts from the default
  mem.set('raptor_view_v1:companies:alice', '{not json');
  assert.deepEqual(loadPrefs(store, 'companies:alice', COLS), defaultPrefs(COLS));
  assert.deepEqual(loadPrefs(null, 'x', COLS), defaultPrefs(COLS));
  assert.doesNotThrow(() => savePrefs({ getItem: () => null, setItem: () => { throw new Error('quota'); } }, 'x', p));
  assert.doesNotThrow(() => savePrefs(null, 'x', p));
});
