# English Coach (Claude)
Big button → speak English (browser speech recognition) → Claude corrects + asks a question → spoken back (speechSynthesis).
Browsers: Safari iPhone, Chrome Android/desktop (not Firefox). Needs HTTPS.
Local: `ANTHROPIC_API_KEY=sk-ant-... node server.js` → http://localhost:8787
## Deploy on Render
1. Push this folder to a GitHub repo.
2. render.com → New → Blueprint → pick the repo (uses render.yaml).
3. Paste ANTHROPIC_API_KEY (console.anthropic.com → API Keys) when asked. Deploy.
4. Open https://english-tutor-xxxx.onrender.com on the phone. (Free plan sleeps after 15 min idle: first load ~30-50 s.)
