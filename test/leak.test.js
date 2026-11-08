'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const logic = require('../public/logic');
const { createApp, sessions } = require('../server');

const SHOT = '[2026-11-08] MMA, nice, that’s a big change from the sofa. Do you train it yourself, or are you more of a watcher on the couch? What got you into it in the first place?';
const ONE = 'MMA, nice, that’s a big change from the sofa. Do you train it yourself, or are you more of a watcher on the couch?';

function feed(chunks) {
  const sanitizer = logic.createSpokenSanitizer();
  const parts = chunks.map(chunk => sanitizer.push(chunk));
  parts.push(sanitizer.end());
  return parts;
}

test('a date tag split across stream chunks never reaches the visible reply', () => {
  const parts = feed(['[2026-', '11-08] MMA, nice, that', '’s a big change from the sofa.']);
  assert.ok(parts.every(part => !/\[(?:undated|\d{4})/.test(part)), parts.join('|'));
  assert.equal(parts.join(''), 'MMA, nice, that’s a big change from the sofa.');
  assert.equal(feed(['[undated] ', 'Hello there.']).join(''), 'Hello there.');
  assert.equal(feed(['[20', '26-11-08]Hello']).join(''), 'Hello');
  const kept = 'The fight is on 2026-11-08 in Paris. November 8, 2026 is the card.';
  assert.equal(feed([kept.slice(0, 12), kept.slice(12)]).join(''), kept);
  assert.equal(logic.forSpeech(kept), kept);
  assert.equal(logic.spokenAloud(kept), kept);
});

test('the leaked reply is cleaned once for the screen and for speech', () => {
  const aloud = logic.spokenAloud(SHOT);
  assert.equal(aloud, ONE);
  assert.equal((aloud.match(/\?/g) || []).length, 1);
  assert.doesNotMatch(aloud, /\[2026-11-08\]|first place/);
  const cleaned = logic.cleanCoachText(SHOT + '\nTip : une seule question\n## {"notes":[]}');
  assert.match(cleaned, /Tip : une seule question/);
  assert.match(cleaned, /## \{"notes"/);
  assert.equal(logic.spokenAloud(cleaned), ONE);
  assert.deepEqual(logic.speechPlan(cleaned), [ONE]);
  const planned = logic.speechPlan(logic.spokenAloud(SHOT));
  const request = logic.speechRequest({ text: planned[0], voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent' });
  assert.deepEqual(planned, [ONE]);
  assert.equal(request.input, ONE);
  assert.equal(request.voice, 'marin');
  assert.equal(request.model, 'gpt-4o-mini-tts');
  assert.match(request.instructions, /Same timbre/);
  const other = logic.speechRequest({ text: 'Do you train it yourself?', voice: 'marin', model: 'gpt-4o-mini-tts', accentPhrase: 'a natural General American accent' });
  assert.equal(request.instructions, other.instructions);
});

test('import and replay keep the stored words and only hide the tag', () => {
  const raw = JSON.stringify([{ role: 'ai', text: SHOT, at: 1 }, { role: 'me', text: 'We stayed on the sofa.', at: 2 }]);
  const plan = logic.planImport({}, { 'p:tom:thread': raw });
  const storage = {
    items: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this.items, k) ? this.items[k] : null; },
    setItem(k, v) { this.items[k] = String(v); },
    removeItem(k) { delete this.items[k]; }
  };
  const written = logic.applyImport(storage, plan, {});
  assert.ok(written.written.includes('p:tom:thread'));
  const stored = JSON.parse(storage.getItem('p:tom:thread'));
  assert.equal(stored[0].text, SHOT);
  assert.match(stored[1].text, /sofa/);
  assert.equal(logic.forSpeech(stored[0].text), SHOT.replace('[2026-11-08] ', ''));
  const replay = [
    { role: 'me', text: 'We stayed on the sofa.', at: 2 },
    { role: 'ai', text: stored[0].text, at: 1 }
  ];
  const model = logic.toModelMessages(replay).map(m => m.content).join('\n');
  assert.match(model, /sofa/);
  assert.match(model, /MMA, nice/);
  assert.doesNotMatch(model, /\[2026-11-08\]/);
  assert.equal(logic.normalizeThread(replay)[1].text, SHOT);
});

test('an ordinary topic does not receive yesterday’s lines, and a recall question does', () => {
  const tom = [
    { role: 'me', text: 'We stayed on the sofa with the dog.', at: Date.parse('2026-11-07T15:00:00Z') },
    { role: 'ai', text: 'The dog took the cushion.', at: Date.parse('2026-11-07T15:01:00Z') }
  ];
  const hidden = logic.memoryBrief(tom, Date.parse('2026-11-08T18:00:00Z'), [], "Let's talk about MMA.");
  assert.doesNotMatch(hidden, /sofa|cushion/);
  assert.match(hidden, /withheld/);
  assert.match(hidden, /2026-11-07/);
  const shown = logic.memoryBrief(tom, Date.parse('2026-11-08T18:00:00Z'), [], 'What did we do yesterday?');
  assert.match(shown, /sofa with the dog/);
  assert.match(shown, /Never write or speak a tag/);
  const prompt = fs.readFileSync(path.join(__dirname, '../prompt.md'), 'utf8');
  assert.match(prompt, /at most one question mark/);
  assert.match(prompt, /Never write or speak a tag/);
  assert.match(prompt, /lines are withheld/);
});

test('the page never falls back to the browser voice', () => {
  const app = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.doesNotMatch(app, /speechSynthesis/);
  assert.match(app, /Réessayer la voix/);
  assert.match(server, /speechPlan/);
  assert.doesNotMatch(server, /createPhraseGrouper/);
});

test('context storage strips a leaked tag without dropping the sentence', async () => {
  const app = createApp();
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const port = app.address().port;
  try {
    const history = [
      { role: 'me', text: 'We stayed on the sofa.' },
      { role: 'ai', text: '[2026-11-08] The dog took the cushion.' }
    ];
    const res = await fetch('http://127.0.0.1:' + port + '/api/context?sid=leak-sid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, log: logic.memoryLog(history, Date.parse('2026-11-08T18:00:00Z'), []), profile: 'tom' })
    });
    assert.equal(res.status, 200);
    const saved = JSON.stringify(sessions.get('leak-sid'));
    assert.match(saved, /sofa/);
    assert.match(saved, /cushion/);
    assert.doesNotMatch(saved, /\[2026-11-08\]/);
  } finally {
    await new Promise(resolve => app.close(resolve));
  }
});
