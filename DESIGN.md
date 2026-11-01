# English Coach — teaching design (1 page)

Goal: make Tom (French, ~B1, entrepreneur, performance anxiety in interviews/meetings) bilingual through daily spoken conversation. The system prompt is in `prompt.md`.

| Principle (research) | How the coach applies it |
|---|---|
| **Comprehensible input, i+1** (Krashen, *Principles and Practice in SLA*, 1982) | Natural English just above his level; CEFR estimated each turn (`level`). |
| **Output hypothesis** (Swain, 1985; 1995): producing language makes learners notice gaps | Short teacher turns (≤45 words) so that Tom speaks 70%+; one open question per turn; sometimes asks him to say it again. |
| **Interaction hypothesis** (Long, 1996): negotiating meaning drives acquisition | Real back-and-forth about his life, with clarification requests and reactions. |
| **Corrective feedback** (Lyster & Ranta, 1997; Lyster & Saito, 2010 meta-analysis; Li, 2010): feedback works; recasts are least disruptive, prompts/explicit feedback lead to more uptake | Recast by default, woven into the reaction; brief explicit correction plus a French "Tip" for recurring or important errors; max 1–2 corrections per turn; trivial slips ignored. |
| **Spacing / retrieval practice** (Cepeda et al., 2006; Karpicke & Roediger, 2008) | Each reply has a hidden `##` JSON (mistakes, expressions, level), stored in the phone's localStorage and sent back each turn, so the coach brings old errors and expressions back later in the conversation and across sessions. |
| **Formulaic chunks & high-frequency vocabulary** (Nation, 2001; Wray, 2002; Boers & Lindstromberg) | One useful natural expression every 2–3 turns, then a question that makes him reuse it; brief, specific praise when he does. |
| **Task-based learning** (Ellis, 2003; Willis) | Mini-tasks (pitch your book, convince me, tell me about your week) and role-plays (job interview, client meeting, investor pitch, negotiation). |
| **Motivation & anxiety** (Dörnyei, 2001; Krashen's affective filter; Horwitz et al., 1986 on foreign language anxiety) | A warm friend persona and topics he cares about (Taïa books, sport, business, travel); role-plays rehearse stressful situations in a safe space. |

**Bilan button:** an end-of-session recap in French: estimated level, strengths, top 5 mistakes (wrong → right), new expressions with examples, a goal for next time.

**Latency design:** audio → `gpt-4o-transcribe` → Claude Haiku streamed (SSE, thinking disabled) → sentence chunker → `gpt-4o-mini-tts` per sentence, started in parallel and played in order. The first sentence plays while the rest is still being generated.

## v5 features
- **Shadowing (Répéter)**: every correction or expression card plays the model sentence (1× or 0.8×). Tom repeats it; the app transcribes, shows a word-level diff (green = right, red = missing, struck = extra), and adds per-word Azure pronunciation scores when that's configured.
- **SRS**: each correction or expression becomes an SM-2 card in localStorage. Due cards are sent to Claude (`X-Ctx`) so it reuses them naturally. A 3-minute oral review gives a French prompt; Tom answers aloud; a fuzzy match ≥90% counts as perfect, otherwise Claude grades it 0–3; then the card is scheduled.
- **Daily habit**: goal (default 15 min of speaking), streak (days where the goal is met), progress ring, session flow (Revision → Conversation → Bilan), and a daily reminder as an .ics calendar event (no web push).
- **Progress**: minutes, words/min, errors per 100 words, vocabulary size and 7-day variety (type/token ratio), weekly CEFR median.
- **Mode pression**: interview, client meeting or investor pitch. Answer timer (20–90 s) with auto cut-off sent to Claude, a 5 s "think" countdown, tough short questions and interruptions, no corrections until the debrief.
- **Accent** US/UK/AU (voice + TTS instructions + spelling) and a speed slider (client playbackRate).
- **Pronunciation**: `/api/pron` → Azure Speech REST short-audio Pronunciation Assessment. The browser encodes WAV 16 kHz mono client-side. Hidden unless `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are set.
