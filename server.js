// English Coach — Claude teaches, OpenAI listens & speaks. Zero deps, Node 20+.
const http=require('http'),fs=require('fs'),path=require('path');
const KEY=process.env.ANTHROPIC_API_KEY, MODEL=process.env.CHAT_MODEL||'claude-haiku-5-5', PORT=process.env.PORT||8787;
const OKEY=process.env.OPENAI_API_KEY, TTS_MODEL=process.env.TTS_MODEL||'gpt-4o-mini-tts', VOICE=process.env.VOICE||'coral';
const STT_MODEL=process.env.STT_MODEL||'gpt-4o-transcribe';
const SYS=fs.readFileSync(path.join(__dirname,'prompt.md'),'utf8');
const VOICE_INSTR=`Voice: a warm, relaxed native English speaker in their late twenties — a friendly friend chatting, not a narrator or announcer.
Tone: genuinely interested, light enthusiasm, smiling voice, encouraging.
Pacing: natural and unhurried, with small pauses between ideas; slightly slower when giving a correction so it's easy to catch.
Intonation: natural rises and falls, real conversational melody, questions sound curious. Avoid a flat, robotic or overly theatrical delivery.`;
const sessions=new Map();
const THINK=process.env.THINKING||'disabled'; // 'disabled' = fastest first token
function sysFor(notes){let x=SYS;try{const n=notes||{};const m=(n.mistakes||[]).slice(-15),e=(n.expressions||[]).slice(-15);
 if(m.length||e.length)x+=`\n\n# Tom's learner file (from previous turns/sessions)\nRecurring mistakes to recycle (create natural chances for him to get them right; praise when he does):\n- ${m.join('\n- ')||'none yet'}\nExpressions already taught (get him to reuse them; don't re-teach):\n- ${e.join('\n- ')||'none yet'}`;}catch{}return x;}
function parseNotes(h){try{return h?JSON.parse(Buffer.from(h,'base64').toString('utf8')):{};}catch{return{};}}
// Stream Claude; calls onText(delta). Returns full text.
async function claudeStream(sid,text,notes,onText){
  if(!KEY)throw Object.assign(new Error("Clé ANTHROPIC_API_KEY manquante sur le serveur."),{code:500});
  const h=sessions.get(sid)||[];h.push({role:'user',content:text});
  const p={model:MODEL,max_tokens:1024,system:sysFor(notes),messages:h.slice(-30),stream:true};if(THINK==='disabled')p.thinking={type:'disabled'};
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify(p)});
  if(!r.ok){h.pop();const j=await r.json().catch(()=>({}));throw Object.assign(new Error('Erreur Claude ('+r.status+') : '+(j.error&&j.error.message||'inconnue')),{code:502});}
  let full='',buf='';const dec=new TextDecoder();
  for await(const c of r.body){buf+=dec.decode(c,{stream:true});let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);
    if(!l.startsWith('data:'))continue;try{const ev=JSON.parse(l.slice(5));if(ev.type==='content_block_delta'&&ev.delta&&ev.delta.type==='text_delta'){full+=ev.delta.text;onText(ev.delta.text);}}catch{}}}
  h.push({role:'assistant',content:full});sessions.set(sid,h.slice(-40));return full;
}
// Splits streamed text into speakable English chunks (skips 'Tip :' and '##' lines)
function chunker(emit){let line='',pend='';const MIN=28;
  const flushPend=f=>{const t=pend.trim();if(t&&(f||t.length>=MIN)){emit(t);pend='';}};
  const spoken=l=>!/^\s*(Tip\s*:|##)/i.test(l);
  return{push(d){for(const ch of d){if(ch==='\n'){if(spoken(line))pend+=' '+line;line='';flushPend(true);continue;}line+=ch;
      if(line.trim().length>=4&&spoken(line)){const m=line.match(/^(.*?[.!?]["”’)]?)(\s+)(.*)$/s);if(m){pend+=' '+m[1];line=m[3];flushPend(false);}}}},
    end(){if(spoken(line))pend+=' '+line;line='';flushPend(true);}};
}
const splitMeta=t=>{const i=t.search(/^\s*##/m);let meta=null;if(i>=0){try{meta=JSON.parse(t.slice(i).replace(/^\s*##\s*/,'').trim());}catch{}t=t.slice(0,i).trim();}return{text:t,meta};};
const englishOnly=t=>t.replace(/^\s*##.*$/ms,'').split('\n').map(l=>l.replace(/Tip\s*:.*$/i,'')).join(' ').replace(/\s+/g,' ').trim();
function body(req,max=25e6){return new Promise((res,rej)=>{const c=[];let n=0;req.on('data',d=>{n+=d.length;if(n>max){rej(new Error('Fichier trop gros'));req.destroy();}else c.push(d);});req.on('end',()=>res(Buffer.concat(c)));req.on('error',rej);});}
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
async function tts(text){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const input=englishOnly(text).slice(0,4000);if(!input)throw new Error('rien à lire');
  const p={model:TTS_MODEL,voice:VOICE,input,response_format:'mp3'};if(TTS_MODEL.includes('gpt-4o'))p.instructions=VOICE_INSTR;
  // keep-alive is default in Node fetch (undici)
  const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+OKEY,'Content-Type':'application/json'},body:JSON.stringify(p)});
  if(!r.ok)throw new Error('TTS '+r.status+': '+(await r.text()).slice(0,200));
  return Buffer.from(await r.arrayBuffer());
}
async function stt(audio,mime){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const m=mime.split(';')[0];const ext=/mp4|m4a|aac/.test(m)?'mp4':/ogg/.test(m)?'ogg':/wav/.test(m)?'wav':/mpeg|mp3/.test(m)?'mp3':'webm';
  let last;
  for(const model of [STT_MODEL,'whisper-1']){
    const fd=new FormData();fd.append('file',new Blob([audio],{type:m}),'speech.'+ext);fd.append('model',model);fd.append('language','en');
    fd.append('prompt','The speaker is Tom, a French native learning English. Transcribe exactly what he says, keeping his grammar mistakes as spoken; do not correct them.');
    const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+OKEY},body:fd});
    if(r.ok)return{text:((await r.json()).text||'').trim(),model};
    last='STT '+model+' '+r.status+': '+(await r.text()).slice(0,200);console.error(last);
  }
  throw new Error(last);
}
async function teach(sid,text){
  if(!KEY)throw Object.assign(new Error("Clé ANTHROPIC_API_KEY manquante sur le serveur."),{code:500});
  const h=sessions.get(sid)||[];h.push({role:'user',content:text});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:1024,system:SYS,messages:h.slice(-30),...(THINK==='disabled'?{thinking:{type:'disabled'}}:{})})});
  const j=await r.json();
  if(!r.ok){h.pop();throw Object.assign(new Error('Erreur Claude ('+r.status+') : '+(j.error&&j.error.message||'inconnue')),{code:502});}
  const reply=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(' ').trim()||"Sorry, could you say that again?";
  h.push({role:'assistant',content:reply});sessions.set(sid,h.slice(-40));return splitMeta(reply).text;
}
async function withAudio(reply){let audio=null;try{audio=(await tts(reply)).toString('base64');}catch(e){console.error(e.message);}return audio;}
const TYPES={'.html':'text/html; charset=utf-8','.json':'application/manifest+json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript'};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x'),sid=u.searchParams.get('sid')||'default';
 if(u.pathname==='/api/health')return json(res,200,{ok:true,version:4,hasKey:!!KEY,model:MODEL,tts:!!OKEY,ttsModel:TTS_MODEL,voice:VOICE,sttModel:STT_MODEL});
 if(u.pathname==='/api/reset'&&req.method==='POST'){sessions.delete(sid);return json(res,200,{ok:true});}
 if(u.pathname==='/api/tts'&&req.method==='POST'){const b=JSON.parse((await body(req)).toString()||'{}');
  try{const mp3=await tts(String(b.text||''));res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':mp3.length});return res.end(mp3);}catch(e){return json(res,502,{error:e.message});}}
 if(u.pathname==='/api/transcribe'&&req.method==='POST'){const a=await body(req);if(a.length<800)return json(res,400,{error:'Enregistrement trop court.'});
  try{return json(res,200,await stt(a,req.headers['content-type']||'audio/webm'));}catch(e){return json(res,502,{error:e.message});}}
 if(u.pathname==='/api/stream'&&req.method==='POST'){ // SSE: audio -> transcript -> streamed Claude -> per-sentence TTS
  const T0=Date.now(),tm={};const a=await body(req);const notes=parseNotes(req.headers['x-notes']);
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  const send=o=>res.write('data: '+JSON.stringify(o)+'\n\n');
  if(a.length<800){send({type:'error',error:"Enregistrement trop court. Appuie, parle, puis appuie à nouveau."});return res.end();}
  let t;try{t=await stt(a,req.headers['content-type']||'audio/webm');}catch(e){send({type:'error',error:'Transcription impossible : '+e.message});return res.end();}
  tm.stt=Date.now()-T0;send({type:'user',text:t.text});
  if(!t.text){send({type:'reply',text:"Sorry, I didn't catch that. Could you say it again?"});send({type:'done'});return res.end();}
  let chain=Promise.resolve(),idx=0;
  const ck=chunker(chunk=>{const i=idx++;const pr=tts(chunk).then(b=>b.toString('base64')).catch(e=>{console.error(e.message);return null;});
    chain=chain.then(async()=>{const b64=await pr;if(i===0)tm.firstAudio=Date.now()-T0;send({type:'audio',i,text:chunk,audio:b64});});});
  try{let first=true;const full=await claudeStream(sid,t.text,notes,d=>{if(first){tm.firstToken=Date.now()-T0;first=false;}send({type:'delta',text:d});ck.push(d);});
    ck.end();tm.claudeDone=Date.now()-T0;const {text,meta}=splitMeta(full);send({type:'reply',text,meta});await chain;tm.total=Date.now()-T0;send({type:'done',timings:tm});console.log('timings',JSON.stringify(tm));}
  catch(e){send({type:'error',error:e.message});}
  return res.end();
 }
 if(u.pathname==='/api/recap'&&req.method==='POST'){const b=JSON.parse((await body(req)).toString()||'{}');if(!KEY)return json(res,500,{error:'Clé manquante'});
  const h=(sessions.get(String(b.sid||sid))||[]).map(m=>(m.role==='user'?'TOM: ':'TEACHER: ')+m.content).join('\n').slice(-12000);
  const n=b.notes||{};
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:900,thinking:{type:'disabled'},
   system:"Tu es le prof d'anglais de Tom. Rédige un bilan de session court et motivant EN FRANÇAIS, en texte simple (pas de markdown sauf des tirets). Sections: 'Niveau estimé (CEFR)', 'Ce qui était bien', 'Erreurs à retenir' (forme fautive → forme correcte, max 5), 'Expressions apprises' (avec un exemple), 'Objectif pour la prochaine fois'. Max 180 mots.",
   messages:[{role:'user',content:'Conversation:\n'+(h||'(vide)')+'\n\nNotes: '+JSON.stringify(n)}]})});
  const j=await r.json();if(!r.ok)return json(res,502,{error:(j.error&&j.error.message)||'Erreur'});
  return json(res,200,{recap:(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim()});}
 if(u.pathname==='/api/talk'&&req.method==='POST'){ // audio -> text -> Claude -> voice
  const a=await body(req);if(a.length<800)return json(res,400,{error:"Enregistrement trop court. Appuie, parle, puis appuie à nouveau."});
  let t;try{t=await stt(a,req.headers['content-type']||'audio/webm');}catch(e){return json(res,502,{error:'Transcription impossible : '+e.message});}
  if(!t.text)return json(res,200,{user:'',reply:"Sorry, I didn't catch that. Could you say it again?",audio:null});
  try{const reply=await teach(sid,t.text);return json(res,200,{user:t.text,reply,audio:await withAudio(reply)});}catch(e){return json(res,e.code||500,{user:t.text,error:e.message});}
 }
 if(u.pathname==='/api/chat'&&req.method==='POST'){const b=JSON.parse((await body(req)).toString()||'{}');const text=String(b.text||'').trim();
  if(!text)return json(res,400,{error:"Je n'ai rien entendu."});
  try{const reply=await teach(String(b.sid||sid),text);return json(res,200,{reply,audio:b.tts===false?null:await withAudio(reply)});}catch(e){return json(res,e.code||500,{error:e.message});}}
 const pub=path.join(__dirname,'public');let f=path.join(pub,u.pathname==='/'?'index.html':path.normalize(u.pathname));
 if(!f.startsWith(pub)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
}catch(e){console.error(e);json(res,500,{error:String(e.message||e)});}}).listen(PORT,'0.0.0.0',()=>console.log('listening',PORT));
