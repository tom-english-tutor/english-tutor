'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../public/logic');

const NOW = Date.parse('2026-11-08T18:00:00Z');
const YDAY = Date.parse('2026-11-07T15:00:00Z');

test('Paris dates and yesterday do not depend on the machine timezone', () => {
  assert.equal(logic.parisDate(Date.parse('2026-11-07T22:30:00Z')), '2026-11-07');
  assert.equal(logic.parisDate(Date.parse('2026-11-07T23:30:00Z')), '2026-11-08');
  assert.equal(logic.parisYesterday(NOW), '2026-11-07');
});

test('a dated conversation answers yesterday and does not invent another day', () => {
  const tom = [
    { role: 'me', text: 'We stayed on the sofa with the dog.', at: YDAY },
    { role: 'ai', text: 'The dog took the cushion.', at: YDAY + 60000 },
    { role: 'me', text: 'I edited chapter three today.', at: NOW - 3600000 }
  ];
  const chloe = [{ role: 'me', text: 'I sketched a museum.', at: YDAY }];
  const brief = logic.memoryBrief(tom, NOW, [{ text: 'Has a girlfriend' }], 'What did we do yesterday?');
  const mma = logic.memoryBrief(tom, NOW, [{ text: 'Has a girlfriend' }], "Let's talk about MMA.");
  assert.match(brief, /Today is 2026-11-08/);
  assert.match(brief, /Yesterday was 2026-11-07/);
  assert.match(brief, /2026-11-07 \(yesterday\)/);
  assert.match(brief, /sofa with the dog/);
  assert.match(brief, /chapter three today/);
  assert.match(brief, /Has a girlfriend/);
  assert.match(brief, /not tied to a day/);
  assert.doesNotMatch(brief, /2026-11-06/);
  assert.doesNotMatch(brief, /museum/);
  const status = logic.memoryStatus(tom, NOW);
  assert.equal(status.yesterdayCount > 0, true);
  assert.match(logic.memoryStatus([], NOW).summary, /ne peut pas être reconstitué/);
  const msgs = logic.datedModelMessages(tom);
  assert.match(msgs.map(m => m.content).join('\n'), /We stayed on the sofa/);
  assert.doesNotMatch(msgs.map(m => m.content).join('\n'), /\[2026-11-07\]|\[undated\]/);
  assert.doesNotMatch(mma, /sofa|cushion|chapter three/);
  assert.match(mma, /2026-11-07/);
  assert.match(mma, /withheld/);
  const kept = logic.splitHistory([], tom.concat(Array.from({ length: 50 }, (_, i) => ({ role: 'me', text: 'line ' + i, at: NOW }))));
  assert.equal(kept.thread.length, logic.THREAD_CAP);
  assert.ok(kept.archive.length > 0);
  assert.match(JSON.stringify(kept.archive), /sofa with the dog/);
  assert.doesNotMatch(JSON.stringify(logic.memoryBrief(chloe, NOW, [])), /sofa/);
});

test('speech request stays on the current model and sends instructions', () => {
  const body = logic.speechRequest({ text: 'You went yesterday?', voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent' });
  const statement = logic.speechRequest({ text: 'MMA takes a lot of work.', voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent' });
  assert.equal(body.model, 'gpt-4o-mini-tts');
  assert.equal(body.voice, 'marin');
  assert.equal(body.instructions, statement.instructions);
  assert.equal(body.voice, statement.voice);
  assert.match(body.instructions, /one person/);
  assert.match(body.instructions, /not a cheerleader/);
  assert.doesNotMatch(body.instructions, /This phrase is a question/);
  assert.doesNotMatch(body.input, /Taïa|journal|yesterday was/i);
  const legacy = logic.speechRequest({ text: 'Hello.', model: 'tts-1', voice: 'coral' });
  assert.equal(legacy.instructions, undefined);
  assert.equal(legacy.voice, 'coral');
});
