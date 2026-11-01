// English Coach — Claude teaches, OpenAI listens & speaks. Zero deps, Node 20+.
const http=require('http'),fs=require('fs'),path=require('path');
const KEY=process.env.ANTHROPIC_API_KEY, MODEL=process.env.CHAT_MODEL||'claude-haiku-5-5', PORT=process.env.PORT||8787;
const OKEY=process.env.OPENAI_API_KEY, TTS_MODEL=process.env.TTS_MODEL||'gpt-4o-mini-tts', VOICE=process.env.VOICE||'coral';
const STT_MODEL=process.env.STT_MODEL||'gpt-4o-transcribe';
const SYS=`You are Tom's English conversation partner and teacher — like a friendly native-speaker friend chatting over coffee. Tom is French and wants to become bilingual.
Your reply is read aloud, so write the way people actually talk: contractions (I'm, you've, that's), short sentences, natural reactions ("Oh nice!", "Ha, I love that."), an occasional light filler ("well", "you know") used sparingly. No markdown, no lists, no emojis.
Each turn:
1) If Tom made REAL mistakes (grammar, wrong word, frenchisms) — never trivial slips or transcription glitches — casually give the natural way to say it in one sentence.
2) If useful, add ONE short tip in French on its OWN separate line starting with "Tip :".
3) React genuinely to what he said and keep the conversation going with ONE engaging question.
Keep the spoken part under ~60 words. If Tom speaks French, gently nudge him to try in English and give him the words.`;
const VOICE_INSTR=`Voice: a warm, relaxed native English speaker in their late twenties — a friendly friend chatting, not a narrator or announcer.
Tone: genuinely interested, light enthusiasm, smiling voice, encouraging.
Pacing: natural and unhurried, with small pauses between ideas; slightly slower when giving a correction so it's easy to catch.
Intonation: natural rises and falls, real conversational melody, questions sound curious. Avoid a flat, robotic or overly theatrical delivery.`;
const sessions=new Map();
const englishOnly=t=>t.split('\n').map(l=>l.replace(/Tip\s*:.*$/i,'')).join(' ').replace(/\s+/g,' ').trim();
function body(req,max=25e6){return new Promise((res,rej)=>{const c=[];let n=0;req.on('data',d=>{n+=d.length;if(n>max){rej(new Error('Fichier trop gros'));req.destroy();}else c.push(d);});req.on('end',()=>res(Buffer.concat(c)));req.on('error',rej);});}
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
async function tts(text){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const input=englishOnly(text).slice(0,4000);if(!input)throw new Error('rien à lire');
  const p={model:TTS_MODEL,voice:VOICE,input,response_format:'mp3'};if(TTS_MODEL.includes('gpt-4o'))p.instructions=VOICE_INSTR;
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
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:MODEL,max_tokens:2048,system:SYS,messages:h.slice(-30)})});
  const j=await r.json();
  if(!r.ok){h.pop();throw Object.assign(new Error('Erreur Claude ('+r.status+') : '+(j.error&&j.error.message||'inconnue')),{code:502});}
  const reply=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(' ').trim()||"Sorry, could you say that again?";
  h.push({role:'assistant',content:reply});sessions.set(sid,h.slice(-40));return reply;
}
async function withAudio(reply){let audio=null;try{audio=(await tts(reply)).toString('base64');}catch(e){console.error(e.message);}return audio;}
const TYPES={'.html':'text/html; charset=utf-8','.json':'application/manifest+json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.js':'text/javascript'};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x'),sid=u.searchParams.get('sid')||'default';
 if(u.pathname==='/api/health')return json(res,200,{ok:true,version:3,hasKey:!!KEY,model:MODEL,tts:!!OKEY,ttsModel:TTS_MODEL,voice:VOICE,sttModel:STT_MODEL});
 if(u.pathname==='/api/reset'&&req.method==='POST'){sessions.delete(sid);return json(res,200,{ok:true});}
 if(u.pathname==='/api/tts'&&req.method==='POST'){const b=JSON.parse((await body(req)).toString()||'{}');
  try{const mp3=await tts(String(b.text||''));res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':mp3.length});return res.end(mp3);}catch(e){return json(res,502,{error:e.message});}}
 if(u.pathname==='/api/transcribe'&&req.method==='POST'){const a=await body(req);if(a.length<800)return json(res,400,{error:'Enregistrement trop court.'});
  try{return json(res,200,await stt(a,req.headers['content-type']||'audio/webm'));}catch(e){return json(res,502,{error:e.message});}}
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
