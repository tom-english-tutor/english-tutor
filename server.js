// English Coach v5 — Claude teaches, OpenAI listens & speaks, Azure (optional) scores pronunciation. Zero deps, Node 20+.
const http=require('http'),fs=require('fs'),path=require('path');
const E=process.env,PORT=E.PORT||8787;
const KEY=E.ANTHROPIC_API_KEY,MODEL=E.CHAT_MODEL||'claude-haiku-5-5',THINK=E.THINKING||'disabled';
const OKEY=E.OPENAI_API_KEY,TTS_MODEL=E.TTS_MODEL||'gpt-4o-mini-tts',STT_MODEL=E.STT_MODEL||'gpt-4o-transcribe';
const AZ_KEY=E.AZURE_SPEECH_KEY,AZ_REGION=E.AZURE_SPEECH_REGION;
const SYS=fs.readFileSync(path.join(__dirname,'prompt.md'),'utf8');
const ACCENTS={
 us:{voice:E.VOICE_US||E.VOICE||'coral',accent:'a natural General American accent',spelling:'American'},
 uk:{voice:E.VOICE_UK||'fable',accent:'a natural Southern British (London) accent',spelling:'British'},
 au:{voice:E.VOICE_AU||'sage',accent:'a natural, relaxed Australian accent',spelling:'Australian/British'}};
const acc=a=>ACCENTS[a]||ACCENTS.us;
const voiceInstr=a=>`Voice: a warm, relaxed native English speaker in their late twenties with ${acc(a).accent} — a friendly friend chatting, not a narrator or announcer.
Tone: genuinely interested, light enthusiasm, smiling voice, encouraging.
Pacing: natural and unhurried, small pauses between ideas; slightly slower on corrections so they're easy to catch.
Intonation: natural rises and falls, real conversational melody; questions sound curious. Never flat, robotic or theatrical.`;
const PRESSURE={
 interview:'a demanding hiring manager at a fast-growing international company interviewing {{NAME}} for a role that fits what you know about them',
 meeting:'a sceptical client in a tense meeting who is unhappy about delays and price, and pushes {{NAME}} for clear answers',
 pitch:'a sharp, impatient investor (VC) listening to {{NAME}} pitch {{PITCH}} and asking hard questions about numbers, market and competition'};
const sessions=new Map();
const englishOnly=t=>t.replace(/^\s*##.*$/ms,'').split('\n').map(l=>l.replace(/Tip\s*:.*$/i,'')).join(' ').replace(/\s+/g,' ').trim();
function body(req,max=25e6){return new Promise((res,rej)=>{const c=[];let n=0;req.on('data',d=>{n+=d.length;if(n>max){rej(new Error('Fichier trop gros'));req.destroy();}else c.push(d);});req.on('end',()=>res(Buffer.concat(c)));req.on('error',rej);});}
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
const jbody=async req=>{try{return JSON.parse((await body(req)).toString()||'{}');}catch{return{};}};
function parseB64(h){try{return h?JSON.parse(Buffer.from(h,'base64').toString('utf8')):{};}catch{return{};}}

async function tts(text,accent){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const input=englishOnly(text).slice(0,4000);if(!input)throw new Error('rien à lire');
  const p={model:TTS_MODEL,voice:acc(accent).voice,input,response_format:'mp3'};if(TTS_MODEL.includes('gpt-4o'))p.instructions=voiceInstr(accent);
  const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+OKEY,'Content-Type':'application/json'},body:JSON.stringify(p)});
  if(!r.ok)throw new Error('TTS '+r.status+': '+(await r.text()).slice(0,200));
  return Buffer.from(await r.arrayBuffer());
}
async function stt(audio,mime,hint){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const m=mime.split(';')[0];const ext=/mp4|m4a|aac/.test(m)?'mp4':/ogg/.test(m)?'ogg':/wav/.test(m)?'wav':/mpeg|mp3/.test(m)?'mp3':'webm';
  let last;
  for(const model of [STT_MODEL,'whisper-1']){
    const fd=new FormData();fd.append('file',new Blob([audio],{type:m}),'speech.'+ext);fd.append('model',model);fd.append('language','en');
    fd.append('prompt',(hint?`Expected sentence (may be said imperfectly): "${hint}". `:'')+'The speaker is a French native learning English. Transcribe exactly what they say, keeping their mistakes; do not correct them.');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+OKEY},body:fd});
    if(r.ok)return{text:((await r.json()).text||'').trim(),model};
    last='STT '+model+' '+r.status+': '+(await r.text()).slice(0,200);console.error(last);
  }
  throw new Error(last);
}
async function claude(p){
  if(!KEY)throw Object.assign(new Error("Clé ANTHROPIC_API_KEY manquante sur le serveur."),{code:500});
  if(THINK==='disabled')p.thinking={type:'disabled'};
  return fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,...p})});
}
async function claudeText(p){const r=await claude(p);const j=await r.json();if(!r.ok)throw new Error('Claude '+r.status+': '+(j.error&&j.error.message));return(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();}

const PROFILES={
 tom:{name:'Tom',g:'m',profile:'Tom is French, an entrepreneur (he publishes the "Taïa" self-improvement book collection: Devenir sportif, Mieux manger, Mieux dormir, Arrêter de fumer), into sport, lives in Béziers. Goal: become bilingual. Estimated level: B1 (adjust up/down from what you hear). He gets performance anxiety in high-stakes situations (job interviews, meetings), so keep him relaxed and confident. Good topics: his business and books, marketing, sport, sleep, food.',pitch:'his book brand Taïa'},
 chloe:{name:'Chloé',g:'f',profile:'Chloé is a French native speaker learning English. You know nothing else about her yet — do NOT assume her job, hobbies or life. Discovery first: in the early turns, warmly ask about her interests, work/studies, what she enjoys and why she wants English, then build the conversation on what she tells you. Her level is UNKNOWN: estimate it carefully from the first exchanges (start with clear, simple English, then adapt up or down) and report your estimate in the JSON "level".',pitch:'a project or idea she cares about (ask her what it is first, in character)'}};
const prof=c=>PROFILES[(c&&c.profile)]||PROFILES.tom;
function personal(t,c){const p=prof(c);t=t.split('{{PROFILE}}').join(p.profile).split('{{NAME}}').join(p.name).split('{{PITCH}}').join(p.pitch).split('{{GENDER_FR}}').join(p.g==='f'?'féminin : elle est une femme (ex. « tu es prête », « tu es allée »)':'masculin (ex. « tu es prêt », « tu es allé »)');
 if(p.g==='f')t=t.replace(/\bhe\b/g,'she').replace(/\bHe\b/g,'She').replace(/\bhim\b/g,'her').replace(/\bhis\b/g,'her').replace(/\bHis\b/g,'Her').replace(/\bhimself\b/g,'herself');return t;}
function sysFor(ctx){
  let x=SYS;const c=ctx||{};
  x+=`\n\n# Session settings\nAccent/spelling: ${acc(c.accent).spelling} English — use its natural vocabulary and idioms.`;
  const due=(c.due||[]).slice(0,6),recent=(c.recent||[]).slice(0,10);
  if(due.length)x+=`\n\n# Spaced-repetition items DUE today — weave 1 of them naturally into this turn when it fits (create a situation where {{NAME}} needs it; don't quiz):\n- ${due.join('\n- ')}`;
  if(recent.length)x+=`\n\n# Already taught recently (don't re-teach; praise reuse):\n- ${recent.join('\n- ')}`;
  if(c.mode==='pressure'){
    x+=`\n\n# MODE PRESSION (performance-anxiety training) — ACTIVE
You are now ${PRESSURE[c.scenario]||PRESSURE.interview}. Stay fully in character.
- Ask tough, realistic questions; follow up on vague answers ("Be specific.", "What numbers?", "Why should I believe that?").
- Keep each turn very short (1–2 sentences) and direct. Sometimes politely interrupt or redirect ("Sorry, let me stop you there —").
- Do NOT correct mistakes and do NOT write any "Tip :" line during the role-play (only in the final debrief). Still log mistakes in the ## JSON.
- If {{NAME}} ran out of time, react like a real interviewer would (move on, or ask him to get to the point).
- After about 6 exchanges, or if {{NAME}} says "stop", step out of character: say it's over, give him 2 strengths and 2 things to improve, warmly.`;}
  if(c.level)x+=`\n\n# Last estimated level from previous sessions: ${c.level}`;
  return personal(x,c);
}
async function* claudeStream(sid,text,ctx){
  const h=sessions.get(sid)||[];h.push({role:'user',content:text});
  const r=await claude({max_tokens:1024,system:sysFor(ctx),messages:h.slice(-30),stream:true});
  if(!r.ok){h.pop();const j=await r.json().catch(()=>({}));throw Object.assign(new Error('Erreur Claude ('+r.status+') : '+(j.error&&j.error.message||'inconnue')),{code:502});}
  let full='',buf='';const dec=new TextDecoder();
  for await(const c of r.body){buf+=dec.decode(c,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);
    if(!l.startsWith('data:'))continue;try{const ev=JSON.parse(l.slice(5));if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){full+=ev.delta.text;yield ev.delta.text;}}catch{}}}
  h.push({role:'assistant',content:full});sessions.set(sid,h.slice(-40));
}
function chunker(emit){let line='',pend='';const MIN=28;
  const flush=f=>{const t=pend.trim();if(t&&(f||t.length>=MIN)){emit(t);pend='';}};
  const spoken=l=>!/^\s*(Tip\s*:|##)/i.test(l);
  return{push(d){for(const ch of d){if(ch==='\n'){if(spoken(line))pend+=' '+line;line='';flush(true);continue;}line+=ch;
      if(line.trim().length>=4&&spoken(line)){const m=line.match(/^(.*?[.!?]["”’)]?)(\s+)(.*)$/s);if(m){pend+=' '+m[1];line=m[3];flush(false);}}}},
    end(){if(spoken(line))pend+=' '+line;line='';flush(true);}};
}
const splitMeta=t=>{const i=t.search(/^\s*##/m);let meta=null;if(i>=0){try{meta=JSON.parse(t.slice(i).replace(/^\s*##\s*/,'').trim());}catch{}t=t.slice(0,i).trim();}return{text:t,meta};};

async function azurePron(wav,ref){
  const pa=Buffer.from(JSON.stringify({ReferenceText:ref,GradingSystem:'HundredMark',Granularity:'Phoneme',Dimension:'Comprehensive',EnableMiscue:true})).toString('base64');
  const r=await fetch(`https://${AZ_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`,
    {method:'POST',headers:{'Ocp-Apim-Subscription-Key':AZ_KEY,'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000','Pronunciation-Assessment':pa,Accept:'application/json'},body:wav});
  const t=await r.text();if(!r.ok)throw new Error('Azure '+r.status+': '+t.slice(0,200));
  const j=JSON.parse(t),nb=(j.NBest||[])[0];if(!nb)return{recognized:j.DisplayText||'',scores:null,words:[]};
  const S=nb.PronunciationAssessment||nb;
  return{recognized:nb.Display||j.DisplayText||'',scores:{pron:S.PronScore,accuracy:S.AccuracyScore,fluency:S.FluencyScore,completeness:S.CompletenessScore,prosody:S.ProsodyScore},
    words:(nb.Words||[]).map(w=>{const a=w.PronunciationAssessment||w;return{word:w.Word,score:a.AccuracyScore,error:a.ErrorType||'None'};})};
}

const TYPES={'.html':'text/html; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript; charset=utf-8','.css':'text/css'};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x'),q=u.searchParams,sid=q.get('sid')||'default',P=u.pathname;
 if(P==='/api/health')return json(res,200,{ok:true,version:6,hasKey:!!KEY,model:MODEL,tts:!!OKEY,ttsModel:TTS_MODEL,sttModel:STT_MODEL,pron:!!(AZ_KEY&&AZ_REGION),accents:Object.keys(ACCENTS)});
 if(P==='/api/reset'&&req.method==='POST'){sessions.delete(sid);return json(res,200,{ok:true});}
 if(P==='/api/tts'&&req.method==='POST'){const b=await jbody(req);
  try{const mp3=await tts(String(b.text||''),b.accent);res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':mp3.length,'Cache-Control':'private, max-age=86400'});return res.end(mp3);}catch(e){return json(res,502,{error:e.message});}}
 if(P==='/api/transcribe'&&req.method==='POST'){const a=await body(req);if(a.length<800)return json(res,400,{error:'Enregistrement trop court.'});
  try{return json(res,200,await stt(a,req.headers['content-type']||'audio/webm',q.get('hint')||''));}catch(e){return json(res,502,{error:e.message});}}
 if(P==='/api/pron'&&req.method==='POST'){
  if(!(AZ_KEY&&AZ_REGION))return json(res,200,{enabled:false});
  const a=await body(req,5e6);const ref=String(q.get('ref')||'').slice(0,500);if(!ref)return json(res,400,{error:'ref manquant'});
  try{return json(res,200,{enabled:true,...await azurePron(a,ref)});}catch(e){return json(res,502,{enabled:true,error:e.message});}}
 if(P==='/api/grade'&&req.method==='POST'){ // oral review grading
  const b=await jbody(req);
  try{const t=await claudeText({max_tokens:200,system:'You grade a French learner\'s spoken English answer against a target. Meaning and the target structure/expression matter; ignore punctuation, capitalisation, contractions and trivial transcription noise. Reply ONLY with compact JSON: {"score":0-3,"feedback":"<max 15 words, in French, warm>"} where 3=perfect/natural, 2=right with small slip, 1=partly right, 0=wrong/missing.',
   messages:[{role:'user',content:`French prompt: ${b.fr}\nTarget: ${b.target}\nLearner said: ${b.answer}`}]});
   const m=t.match(/\{[\s\S]*\}/);return json(res,200,m?JSON.parse(m[0]):{score:0,feedback:t});}catch(e){return json(res,502,{error:e.message});}}
 if(P==='/api/stream'&&req.method==='POST'){
  const T0=Date.now(),tm={};const a=await body(req);const ctx=parseB64(req.headers['x-ctx']);ctx.accent=q.get('accent')||ctx.accent;
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  const send=o=>res.write('data: '+JSON.stringify(o)+'\n\n');
  if(a.length<800){send({type:'error',error:"Enregistrement trop court. Appuie, parle, puis appuie à nouveau."});return res.end();}
  let t;try{t=await stt(a,req.headers['content-type']||'audio/webm');}catch(e){send({type:'error',error:'Transcription impossible : '+e.message});return res.end();}
  tm.stt=Date.now()-T0;send({type:'user',text:t.text});
  if(!t.text){send({type:'reply',text:"Sorry, I didn't catch that. Could you say it again?"});send({type:'done'});return res.end();}
  let userText=t.text;if(ctx.interrupted)userText+='\n['+prof(ctx).name+' ran out of time — his answer was cut off by the timer.]';if(ctx.secs)userText+=`\n[spoke ${Math.round(ctx.secs)}s]`;
  let chain=Promise.resolve(),idx=0;
  const ck=chunker(chunk=>{const i=idx++;const pr=tts(chunk,ctx.accent).then(b=>b.toString('base64')).catch(e=>{console.error(e.message);return null;});
    chain=chain.then(async()=>{const b64=await pr;if(i===0)tm.firstAudio=Date.now()-T0;send({type:'audio',i,text:chunk,audio:b64});});});
  try{let full='',first=true;for await(const d of claudeStream(sid,userText,ctx)){if(first){tm.firstToken=Date.now()-T0;first=false;}full+=d;send({type:'delta',text:d});ck.push(d);}
    ck.end();tm.claudeDone=Date.now()-T0;const{text,meta}=splitMeta(full);send({type:'reply',text,meta});await chain;tm.total=Date.now()-T0;send({type:'done',timings:tm});console.log('timings',JSON.stringify(tm));}
  catch(e){send({type:'error',error:e.message});}
  return res.end();
 }
 if(P==='/api/start'&&req.method==='POST'){ // teacher opens the conversation (no audio)
  const b=await jbody(req);const ctx=b.ctx||{};const pn=prof(ctx).name;const opener=ctx.mode==='pressure'?`[Start the role-play now: greet ${pn} in character and ask your first question.]`:(ctx.profile==='chloe'&&ctx.first)?`[${pn} is opening the app for the very first time. Greet her warmly by name in one short sentence, say you'd love to get to know her, and ask ONE easy open question about herself and what she enjoys. Keep your English simple: you don't know her level yet.]`:`[${pn} just opened the app for the daily session. Greet warmly by name in one short sentence and ask an engaging open question — about the day, something you know they care about, or a due item.]`;
  try{let full='';for await(const d of claudeStream(String(b.sid||sid),opener,ctx))full+=d;const{text,meta}=splitMeta(full);let audio=null;try{audio=(await tts(text,ctx.accent)).toString('base64');}catch{}
   return json(res,200,{reply:text,meta,audio});}catch(e){return json(res,e.code||500,{error:e.message});}}
 if(P==='/api/recap'&&req.method==='POST'){const b=await jbody(req);
  const P0=prof(b.ctx);const h=(sessions.get(String(b.sid||sid))||[]).map(m=>(m.role==='user'?P0.name.toUpperCase()+': ':'TEACHER: ')+m.content).join('\n').slice(-12000);
  try{const recap=await claudeText({max_tokens:900,system:"Tu es le prof d'anglais de "+P0.name+" ("+(P0.g==='f'?"une femme : accorde au féminin, ex. « tu as été très claire »":"un homme : accorde au masculin")+"). Rédige un bilan de session court et motivant EN FRANÇAIS, en texte simple (pas de markdown sauf des tirets). Sections: 'Niveau estimé (CEFR)', 'Ce qui était bien', 'Erreurs à retenir' (forme fautive → forme correcte, max 5), 'Expressions apprises' (avec un exemple), 'Objectif pour la prochaine fois'. Max 180 mots.",
   messages:[{role:'user',content:'Conversation:\n'+(h||'(vide)')+'\n\nStats: '+JSON.stringify(b.stats||{})}]});return json(res,200,{recap});}catch(e){return json(res,502,{error:e.message});}}
 const pub=path.join(__dirname,'public');let f=path.join(pub,P==='/'?'index.html':path.normalize(P));
 if(!f.startsWith(pub)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(f).pipe(res);
}catch(e){console.error(e);json(res,500,{error:String(e.message||e)});}}).listen(PORT,'0.0.0.0',()=>console.log('listening',PORT));
