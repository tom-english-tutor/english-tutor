'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logic = require('../public/logic');

test('a visible lesson adds elapsed time once, and an overnight gap adds none', () => {
  let clock = logic.startSession(null, 1_000);
  let t = logic.tickSession(clock, 11_000, true);
  assert.equal(t.addMs, 10_000);
  t = logic.tickSession(t.clock, 11_000, true);
  assert.equal(t.addMs, 0);
  t = logic.tickSession(t.clock, 21_000, true);
  assert.equal(t.addMs, 10_000);
  const away = logic.tickSession(t.clock, 21_000 + 8 * 3600 * 1000, true);
  assert.equal(away.addMs, 0);
  assert.equal(away.clock.active, false);
});

test('background, pause, and resume do not double count', () => {
  let clock = logic.startSession(null, 0);
  let t = logic.tickSession(clock, 5_000, false);
  assert.equal(t.addMs, 0);
  assert.equal(t.clock.active, true);
  t = logic.tickSession(t.clock, 15_000, true);
  assert.equal(t.addMs, 0);
  t = logic.tickSession(t.clock, 25_000, true);
  assert.equal(t.addMs, 10_000);
  const paused = logic.pauseSession(t.clock, 40_000, true);
  assert.equal(paused.addMs, 15_000);
  assert.equal(paused.clock.active, false);
  const still = logic.tickSession(paused.clock, 100_000, true);
  assert.equal(still.addMs, 0);
  const resumed = logic.tickSession(logic.startSession(paused.clock, 100_000), 130_000, true);
  assert.equal(resumed.addMs, 30_000);
});

test('old speaking totals stay, and new session time is stored separately', () => {
  const oldDay = { secs: 300, words: 40, turns: 2 };
  assert.equal(logic.practiceSecs(oldDay), 300);
  assert.equal(oldDay.sessionSecs, undefined);
  const today = { secs: 300, words: 40 };
  assert.equal(logic.noteSessionSecs(today, 600), 900);
  assert.equal(today.secs, 300);
  assert.equal(logic.practiceSecs(today), 900);
  logic.noteSessionSecs(today, 0);
  assert.equal(today.sessionSecs, 900);
  const merged = logic.planImport(
    { 'p:tom:days': JSON.stringify({ '2026-11-08': { secs: 120, sessionSecs: 400, words: 10, errors: 0, turns: 1, uniq: [] } }) },
    { 'p:tom:days': JSON.stringify({ '2026-11-08': { secs: 300, sessionSecs: 200, words: 20, errors: 0, turns: 1, uniq: [] }, '2026-10-01': { secs: 60, words: 5, errors: 0, turns: 1, uniq: [] } }) }
  );
  const storage = {
    m: new Map(),
    get length() { return this.m.size; },
    key(i) { return [...this.m.keys()][i] ?? null; },
    getItem(k) { return this.m.has(k) ? this.m.get(k) : null; },
    setItem(k, v) { this.m.set(k, String(v)); },
    removeItem() { throw new Error('no delete'); }
  };
  storage.setItem('p:tom:days', JSON.stringify({ '2026-11-08': { secs: 120, sessionSecs: 400, words: 10, errors: 0, turns: 1, uniq: [] } }));
  logic.applyImport(storage, merged, {});
  const days = JSON.parse(storage.getItem('p:tom:days'));
  assert.equal(days['2026-11-08'].secs, 300);
  assert.equal(days['2026-11-08'].sessionSecs, 400);
  assert.equal(days['2026-10-01'].secs, 60);
  assert.equal(days['2026-10-01'].sessionSecs, undefined);
  assert.equal(logic.practiceSecs(days['2026-10-01']), 60);
});

test('the coach is told the questions already asked and does not restart a finished turn', () => {
  const thread = [
    { role: 'ai', text: 'How was your day?' },
    { role: 'me', text: 'I worked on the sleep book.' },
    { role: 'ai', text: 'How was your day? Which chapter is hard?' },
    { role: 'me', text: 'Chapter three.' }
  ];
  const asked = logic.recentQuestions(thread);
  assert.deepEqual(asked, ['How was your day?', 'Which chapter is hard?']);
  const add = logic.sessionAddendum({ hasThread: true, asked, spelling: 'American', mode: 'talk' });
  assert.match(add, /How was your day\?/);
  assert.match(add, /do not ask these again/i);
  assert.match(add, /Do not greet again/);
  assert.doesNotMatch(add, /praise reuse/);
  assert.equal(logic.shouldContinueAloud(thread), true);
  assert.equal(logic.shouldContinueAloud(thread.slice(0, 3)), false);
  const resume = logic.openingText({ resume: true }, 4, 'Tom');
  assert.match(resume, /Do not say hello again/);
  assert.match(resume, /do not repeat a question/);
  const prompt = fs.readFileSync(path.join(__dirname, '..', 'prompt.md'), 'utf8');
  assert.match(prompt, /Do not repeat a question/);
  assert.match(prompt, /No menu of topics/);
  assert.match(prompt, /Never invent a memory/);
});
