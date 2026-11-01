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
