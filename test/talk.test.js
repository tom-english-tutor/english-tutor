'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../public/logic');

function phrases(text) {
  const out = [];
  const g = logic.createPhraseGrouper(p => out.push(p));
  g.push(text);
  g.end();
  return out;
}

test('short sentences are spoken together so the voice does not restart every few words', () => {
  const out = phrases('Yeah. You went yesterday? What was the water like?');
  assert.ok(out.length <= 2, out.join(' | '));
  assert.match(out[0], /Yeah/);
  assert.match(out[0], /yesterday/);
  assert.ok(out.every(p => !/Tip\s*:|##/.test(p)));
  const hidden = phrases('You went yesterday?\nTip : passé\n## {"mistakes":[]}');
  assert.deepEqual(hidden, ['You went yesterday?']);
});

test('a mumbled transcript is not treated as a story, and a real sentence is', () => {
  assert.equal(logic.unclearSpeech(''), true);
  assert.equal(logic.unclearSpeech('um'), true);
  assert.equal(logic.unclearSpeech('euh'), true);
  assert.equal(logic.unclearSpeech('I worked on the sleep book.'), false);
  assert.equal(logic.unclearSpeech('I agree.'), false);
});

test('a scripted reload keeps the lesson and does not repeat the last opening', () => {
  const thread = [
    { role: 'me', text: 'I worked on chapter three of the sleep book.', at: 1 },
    { role: 'ai', text: 'Chapter three is the hard one. What happens in the morning scene?', at: 2 }
  ];
  assert.equal(logic.shouldContinueAloud(thread), false);
  const again = logic.toModelMessages(thread);
  const next = logic.conversationForApi(again, 'The hero misses his train.');
  assert.match(next[0].content, /chapter three/);
  assert.match(next[2].content, /train/);
  const brief = logic.sessionAddendum({
    hasThread: true,
    asked: logic.recentQuestions(thread),
    openings: logic.replyOpenings(thread),
    anchor: 'The hero misses his train.',
    spelling: 'American'
  });
  assert.match(brief, /misses his train/);
  assert.match(brief, /morning scene/);
  assert.match(brief, /Do not open with the same words/);
  assert.match(brief, /Do not greet again/);
  assert.match(brief, /No stock praise/);
  const sophie = logic.sessionAddendum({ profile: 'sophie', hasThread: false, anchor: 'I started English this week.', spelling: 'American' });
  assert.match(sophie, /started English/);
  assert.doesNotMatch(sophie, /Taïa|Béziers/);
});
