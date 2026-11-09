'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../public/logic');
const { sysFor } = require('../server');

const HEAD = 'MMA is a much bigger world than a highlight reel suggests.';
const TAIL = 'Most people only see the knockouts and miss the boring gym work that actually decides who wins the fight.';
const FULL = HEAD + ' ' + TAIL;

test('the early clip is sanitized before any speech request', () => {
  const raw = '[2026-11-08] ' + FULL;
  const head = logic.earlyClip(raw);
  assert.equal(head, HEAD);
  assert.doesNotMatch(head, /\[|2026-11-08|undated/);
  const sanitizer = logic.createSpokenSanitizer();
  let seen = '';
  for (const chunk of ['[2026-', '11-08] ' + HEAD + ' ', TAIL]) seen += sanitizer.push(chunk);
  seen += sanitizer.end();
  assert.equal(logic.earlyClip(seen), HEAD);
  assert.doesNotMatch(seen, /\[2026-11-08\]/);
  assert.equal(logic.earlyClip('The fight is on November 8.'), '');
  assert.equal(logic.forSpeech('The fight is on November 8.'), 'The fight is on November 8.');
});

test('two speech clips stay in order and do not repeat', () => {
  assert.deepEqual(logic.orderedClips(FULL, HEAD), [HEAD, TAIL]);
  assert.equal(logic.orderedClips(FULL, HEAD).join(' '), FULL);
  assert.ok(logic.orderedClips(FULL, HEAD).length <= 2);
  const wrong = 'This opening was not what the model finished with at all.';
  const fallback = logic.orderedClips(FULL, wrong);
  assert.equal(fallback[0], HEAD);
  assert.notEqual(fallback[0], wrong);
  assert.equal(fallback.join(' '), FULL);
  assert.deepEqual(logic.speechPlan(FULL), [HEAD, TAIL]);
  assert.equal(logic.speechPlan('Short reply only.').length, 1);
});

test('one accent keeps one persona, and coach biography is not learner memory', () => {
  const persona = 'Sam, 29, from Portland, Oregon, now in Lyon for a product job at a small startup.';
  const question = logic.speechRequest({ text: 'Do you train?', voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent', persona });
  const statement = logic.speechRequest({ text: 'MMA takes a lot of work.', voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent', persona });
  assert.equal(question.instructions, statement.instructions);
  assert.equal(question.voice, 'marin');
  assert.match(question.instructions, /Sam, 29/);
  assert.match(question.instructions, /Same timbre/);
  assert.doesNotMatch(question.instructions, /Jess/);
  const au = logic.speechRequest({ text: 'Do you train?', voice: 'sage', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural, relaxed Australian accent', persona: 'Jess, 28, from Melbourne, freelance videographer.' });
  assert.notEqual(question.instructions, au.instructions);
  assert.match(au.instructions, /Jess, 28/);
  const us = sysFor({ profile: 'tom', accent: 'us' });
  const uk = sysFor({ profile: 'chloe', accent: 'uk' });
  assert.match(us, /Sam, 29/);
  assert.doesNotMatch(us, /Jess, 28/);
  assert.match(uk, /Alex, 30/);
  assert.match(sysFor({ profile: 'tom', accent: 'us', mode: 'pressure' }), /precise native speaker/);
  assert.doesNotMatch(sysFor({ profile: 'tom', accent: 'us', mode: 'pressure' }), /from Portland/);
  assert.deepEqual(logic.learnerNotes([
    'Publishes the Taïa collection',
    'Sam climbs in Portland',
    'Alex works in marketing for a cycling brand',
    'Jess surfs on weekends',
    'Lives in Béziers'
  ]), ['Publishes the Taïa collection', 'Lives in Béziers']);
});
