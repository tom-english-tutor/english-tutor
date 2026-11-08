'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logic = require('../public/logic');

function mem() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem() { throw new Error('storage must not be cleared'); }
  };
}

test('v5 keys are copied onto Tom and the originals stay', () => {
  const storage = mem();
  const cards = JSON.stringify([{ id: 'fix:went', type: 'fix', en: 'I went', reps: 4, ef: 2.6, due: 10 }]);
  const days = JSON.stringify({ '2026-10-01': { secs: 900, words: 120, errors: 2, turns: 6, uniq: ['went'] } });
  const settings = JSON.stringify({ goal: 25, accent: 'uk', speed: 1, theme: 'dark' });
  storage.setItem('cards', cards);
  storage.setItem('days', days);
  storage.setItem('settings', settings);
  storage.setItem('vocab', JSON.stringify(['went', 'beach']));
  storage.setItem('levels', JSON.stringify([{ d: '2026-10-01', l: 'B1' }]));
  storage.setItem('flow', JSON.stringify({ '2026-10-01': 3 }));
  storage.setItem('sid', JSON.stringify('old-sid'));
  const first = logic.recoverLegacy(storage);
  assert.deepEqual(first.copied.sort(), ['p:tom:cards', 'p:tom:days', 'p:tom:flow', 'p:tom:levels', 'p:tom:settings', 'p:tom:sid', 'p:tom:vocab']);
  assert.equal(storage.getItem('cards'), cards);
  assert.equal(storage.getItem('p:tom:cards'), cards);
  assert.equal(storage.getItem('p:tom:days'), days);
  assert.equal(storage.getItem('p:tom:settings'), settings);
  assert.equal(storage.getItem('migratedV6'), '1');
  assert.equal(storage.getItem('p:chloe:cards'), null);
  assert.equal(storage.getItem('p:sophie:cards'), null);
  storage.setItem('cards', JSON.stringify([{ id: 'other' }]));
  const second = logic.recoverLegacy(storage);
  assert.deepEqual(second.copied, []);
  assert.equal(storage.getItem('p:tom:cards'), cards);
  assert.match(storage.getItem('cards'), /other/);
});

test('existing Tom and Chloé v6 stores are not overwritten', () => {
  const storage = mem();
  storage.setItem('migratedV6', '1');
  storage.setItem('p:tom:cards', JSON.stringify([{ id: 'tom-card', en: 'I went' }]));
  storage.setItem('p:chloe:thread', JSON.stringify([{ role: 'me', text: 'I like drawing', at: 1 }]));
  storage.setItem('cards', JSON.stringify([{ id: 'legacy', en: 'should not replace' }]));
  logic.recoverLegacy(storage);
  assert.match(storage.getItem('p:tom:cards'), /tom-card/);
  assert.match(storage.getItem('cards'), /legacy/);
  assert.match(storage.getItem('p:chloe:thread'), /drawing/);
  assert.equal(storage.getItem('p:sophie:cards'), null);
});

test('import merges old Tom data into a new shortcut without dropping Sophie', () => {
  const current = mem();
  current.setItem('profile', 'sophie');
  current.setItem('p:sophie:cards', JSON.stringify([{ id: 'sophie-card', type: 'fix', en: 'I have a cat', reps: 1, ef: 2.5, due: 5 }]));
  current.setItem('p:sophie:thread', JSON.stringify([{ role: 'me', text: 'Hello from the new shortcut', at: 50 }]));
  current.setItem('p:tom:settings', JSON.stringify({ goal: 15, accent: 'us', speed: 1, theme: 'light' }));
  const incoming = {
    'p:tom:cards': JSON.stringify([{ id: 'tom-card', type: 'fix', en: 'I went', reps: 4, ef: 2.6, due: 9 }]),
    'p:tom:days': JSON.stringify({ '2026-10-01': { secs: 900, words: 100, errors: 1, turns: 4, uniq: ['went'] } }),
    'p:tom:thread': JSON.stringify([{ role: 'me', text: 'I publish the Taïa books', at: 2 }, { role: 'ai', text: 'Which one?', at: 3 }]),
    'p:tom:memory': JSON.stringify([{ text: 'Publishes Taïa', at: 1 }]),
    'p:tom:settings': JSON.stringify({ goal: 25, accent: 'uk', speed: 1, theme: 'dark' }),
    'p:chloe:cards': JSON.stringify([{ id: 'chloe-card', type: 'expr', en: 'to sketch', reps: 0, ef: 2.5, due: 1 }]),
    profile: 'tom'
  };
  const file = JSON.stringify({ app: 'english-coach', origin: 'https://english-tutor-1tyl.onrender.com', version: 6, keys: incoming });
  const parsed = logic.parseTransfer(file);
  assert.equal(parsed.ok, true);
  const plan = logic.planImport(logic.snapshot(current), parsed.keys);
  const ops = Object.fromEntries(plan.actions.map(a => [a.key, a.op]));
  assert.equal(ops['p:tom:cards'], 'add');
  assert.equal(ops['p:tom:settings'], 'conflict');
  assert.equal(ops['p:sophie:cards'], 'keep');
  assert.equal(ops.profile, 'skip');
  const beforeSophie = current.getItem('p:sophie:cards');
  const beforeSettings = current.getItem('p:tom:settings');
  logic.applyImport(current, plan, {});
  assert.equal(current.getItem('p:sophie:cards'), beforeSophie);
  assert.match(current.getItem('p:sophie:thread'), /new shortcut/);
  assert.match(current.getItem('p:tom:cards'), /tom-card/);
  assert.match(current.getItem('p:tom:thread'), /Taïa/);
  assert.match(current.getItem('p:chloe:cards'), /sketch/);
  assert.equal(current.getItem('p:tom:settings'), beforeSettings);
  assert.equal(current.getItem('profile'), 'sophie');
  const again = logic.planImport(logic.snapshot(current), parsed.keys);
  logic.applyImport(current, again, {});
  assert.equal(JSON.parse(current.getItem('p:tom:cards')).length, 1);
});

test('cards, days and threads from both stores stay present and a second import does not double them', () => {
  const current = {
    'p:tom:cards': JSON.stringify([{ id: 'new-card', en: 'I have a dog', reps: 1, ef: 2.5, due: 3 }]),
    'p:tom:days': JSON.stringify({ '2026-11-08': { secs: 120, words: 20, errors: 0, turns: 1, uniq: ['dog'] } }),
    'p:tom:thread': JSON.stringify([{ role: 'me', text: 'New shortcut line', at: 9 }])
  };
  const incoming = {
    'p:tom:cards': JSON.stringify([{ id: 'old-card', en: 'I went', reps: 5, ef: 2.7, due: 8 }]),
    'p:tom:days': JSON.stringify({ '2026-10-01': { secs: 600, words: 80, errors: 1, turns: 2, uniq: ['went'] }, '2026-11-08': { secs: 30, words: 5, errors: 0, turns: 1, uniq: ['today'] } }),
    'p:tom:thread': JSON.stringify([{ role: 'me', text: 'Old shortcut line', at: 1 }, { role: 'me', text: 'New shortcut line', at: 9 }])
  };
  const plan = logic.planImport(current, incoming);
  const storage = mem();
  for (const [k, v] of Object.entries(current)) storage.setItem(k, v);
  logic.applyImport(storage, plan, {});
  const cards = JSON.parse(storage.getItem('p:tom:cards'));
  assert.deepEqual(cards.map(c => c.id).sort(), ['new-card', 'old-card']);
  const days = JSON.parse(storage.getItem('p:tom:days'));
  assert.equal(days['2026-10-01'].secs, 600);
  assert.equal(days['2026-11-08'].secs, 120);
  assert.ok(days['2026-11-08'].uniq.includes('dog'));
  assert.ok(days['2026-11-08'].uniq.includes('today'));
  const thread = JSON.parse(storage.getItem('p:tom:thread'));
  assert.equal(thread.length, 2);
  logic.applyImport(storage, logic.planImport(logic.snapshot(storage), incoming), {});
  assert.equal(JSON.parse(storage.getItem('p:tom:cards')).length, 2);
  assert.equal(JSON.parse(storage.getItem('p:tom:days'))['2026-11-08'].secs, 120);
});

test('choosing the old settings is explicit and the backup snapshot still has the new ones', () => {
  const current = { 'p:tom:settings': JSON.stringify({ goal: 15, accent: 'us' }) };
  const incoming = { 'p:tom:settings': JSON.stringify({ goal: 25, accent: 'uk' }) };
  const plan = logic.planImport(current, incoming);
  assert.equal(plan.actions.find(a => a.key === 'p:tom:settings').op, 'conflict');
  const storage = mem();
  storage.setItem('p:tom:settings', current['p:tom:settings']);
  const backup = logic.snapshot(storage);
  logic.applyImport(storage, plan, {});
  assert.equal(storage.getItem('p:tom:settings'), current['p:tom:settings']);
  logic.applyImport(storage, plan, { 'p:tom:settings': 'incoming' });
  assert.match(storage.getItem('p:tom:settings'), /uk/);
  assert.match(backup['p:tom:settings'], /us/);
});

test('a bad file and the service worker do not wipe or cache the app', () => {
  assert.equal(logic.parseTransfer('[]').ok, false);
  assert.equal(logic.parseTransfer('{"app":"other","keys":{}}').ok, false);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'public/sw.js'), 'utf8');
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /caches\.delete/);
  assert.match(sw, /fetch\(event\.request\)/);
  assert.doesNotMatch(sw, /cache\.put|caches\.put|addAll/);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /no-store/);
});
