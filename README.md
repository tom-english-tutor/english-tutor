# English Coach (Claude)

Private spoken English practice. The phone records, OpenAI transcribes and speaks, Claude replies. Tom, Chloé, and Sophie each have their own cards, notes, and conversation on that device.

Local: `ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-... node server.js` → http://localhost:8787  
Tests: `npm test` (no API keys).

## What stays on the phone

Conversations, learner notes, review cards, and settings are in `localStorage`, one namespace per profile (`p:tom:…`, `p:chloe:…`, `p:sophie:…`). Reloading or closing the browser restores the thread, and the next turn sends that thread to Claude so the reply continues it. Sophie starts blank: nothing is copied from Tom or Chloé. The old v6 migration still moves only pre-profile keys onto Tom.

This is one home-screen shortcut, or one browser, on one device. It is not an account. On iPhone and iPad, a new home-screen shortcut does not see the data of the previous shortcut, even at the same address. Do not delete the old shortcut. When it shows version 9, use Réglages → Exporter, then Importer on the new shortcut. The import adds and merges; it does not delete either side. The Render service has no database.

The daily ring is session time: speaking, the coach's replies, and ordinary pauses while the lesson is open. It pauses when the app is in the background or left for more than a minute and a half, and it does not fill in time for older days that only recorded speech. Words per minute still use speaking time. "Nouveau", or Réglages → Conversation → Effacer, clears that profile's transcript only. Réglages → Notes du coach clears remembered facts. Cards, mistakes, streaks, and settings stay until you remove them yourself.

## Tone

The coach talks like a friend of the same age: short, specific, and willing to correct a real mistake in passing. It is instructed not to open with "Wow", "incredible", "awesome", "great response", and the rest of that list.

## Lookup

Nothing is searched on an ordinary turn. Tap **Chercher** (one next message) or ask to look something up / ask a fresh-fact question that is not about your own life ("What's the weather in Béziers?").

Default (`WEB_SEARCH` unset) asks Wikipedia and DuckDuckGo Instant Answer, with a short timeout. The phone shows "Recherche…", then the real links, or a clear "pas d'info fraîche". The coach is told not to invent a current fact when the lookup failed. Only the short query is sent — not the transcript, the profile, or the notes. Page text is treated as untrusted data.

That default is not general web search. Weather, news, and scores often come back empty, and the app says so.

**Anthropic web search stays off.** It bills about $10 per 1,000 searches on the existing `ANTHROPIC_API_KEY`, and the organization has to enable the tool in the Claude Console. No new key is required, but it is a separate charge, so it is not turned on. Set `WEB_SEARCH=anthropic` only if that charge is accepted. `WEB_SEARCH=off` disables lookup entirely; chat still works.

## Deploy

Production (https://english-tutor-1tyl.onrender.com, service `srv-dbjiphajnfac7384d9m0`) auto-deploys **main** only. A branch or an open PR does not go live.

After review, merge the PR into `main`. No new service, disk, database, or env var is required for the default behavior. Do not set `WEB_SEARCH=anthropic` unless the per-search charge is accepted. Existing `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and optional Azure keys stay as they are.

Free plan: the site sleeps after about 15 minutes idle; the first load can take half a minute. Chat history still comes from the phone, not from the sleeping server.
