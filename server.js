// English tutor backend — zero dependencies (Node 20+). Usage: ANTHROPIC_API_KEY=sk-ant-... node server.js
const http=require('http'),fs=require('fs'),path=require('path');
const KEY=process.env.ANTHROPIC_API_KEY, MODEL=process.env.CHAT_MODEL||'claude-haiku-5-5', PORT=process.env.PORT||8787;
const SYS=`You are a warm, energetic English teacher talking by voice with Tom, a French speaker whose goal is to become bilingual.
Each turn: 1) If Tom made REAL mistakes (grammar, wrong word, frenchism) — never trivial slips or transcription glitches — briefly give the corrected sentence, and if useful one short tip in French on its OWN separate line starting with "Tip :". If no mistakes, say nothing about correction (maybe a quick "Great sentence!").
2) Then react naturally to what he said and continue the conversation with ONE engaging question. Keep it short (max ~70 words), spoken style, no markdown, no lists. Speak English except the French tip.
If Tom speaks French, gently encourage him to try in English and help him with the words.`;
const sessions=new Map();
const OKEY=process.env.OPENAI_API_KEY, TTS_MODEL=process.env.TTS_MODEL||'gpt-4o-mini-tts', VOICE=process.env.VOICE||'nova';
const englishOnly=t=>t.split('\n').map(l=>l.replace(/Tip\s*:.*$/i,'')).join(' ').replace(/\s+/g,' ').trim();
async function tts(text){
  if(!OKEY)throw new Error('OPENAI_API_KEY manquante');
  const input=englishOnly(text).slice(0,4000); if(!input)throw new Error('rien à lire');
  const p={model:TTS_MODEL,voice:VOICE,input,response_format:'mp3'};
  if(TTS_MODEL.includes('gpt-4o'))p.instructions='Speak as a warm, natural, friendly English teacher. Relaxed conversational pace, clear American accent, encouraging tone.';
  const r=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+OKEY,'Content-Type':'application/json'},body:JSON.stringify(p)});
  if(!r.ok)throw new Error('TTS '+r.status+': '+(await r.text()).slice(0,200));
  return Buffer.from(await r.arrayBuffer());
}
function body(req){return new Promise((res,rej)=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>res(Buffer.concat(c)));req.on('error',rej);});}
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://x');
 if(u.pathname==='/api/health')return json(res,200,{ok:true,hasKey:!!KEY,model:MODEL,tts:!!OKEY,ttsModel:TTS_MODEL,voice:VOICE});
 if(u.pathname==='/api/tts'&&req.method==='POST'){let b;try{b=JSON.parse((await body(req)).toString()||'{}');}catch{return json(res,400,{error:'JSON invalide.'});}
  try{const mp3=await tts(String(b.text||''));res.writeHead(200,{'Content-Type':'audio/mpeg','Content-Length':mp3.length});return res.end(mp3);}catch(e){return json(res,502,{error:String(e.message)});}}
 if(u.pathname==='/api/reset'&&req.method==='POST'){sessions.delete(u.searchParams.get('sid'));return json(res,200,{ok:true});}
 if(u.pathname==='/api/chat'&&req.method==='POST'){
  if(!KEY)return json(res,500,{error:"Clé ANTHROPIC_API_KEY manquante sur le serveur. Ajoute-la dans les variables d'environnement (Render > Environment)."});
  let b;try{b=JSON.parse((await body(req)).toString()||'{}');}catch{return json(res,400,{error:'JSON invalide.'});}
  const sid=String(b.sid||'default'),text=String(b.text||'').trim().slice(0,4000);
  if(!text)return json(res,400,{error:"Je n'ai rien entendu. Réessaie en parlant plus près du micro."});
  const h=sessions.get(sid)||[];h.push({role:'user',content:text});
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},
   body:JSON.stringify({model:MODEL,max_tokens:2048,system:SYS,messages:h.slice(-30)})});
  const j=await r.json();
  if(!r.ok){h.pop();return json(res,502,{error:'Erreur Claude ('+r.status+') : '+(j.error&&j.error.message||'inconnue')});}
  const reply=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(' ').trim()||"Sorry, could you say that again?";
  h.push({role:'assistant',content:reply});sessions.set(sid,h.slice(-40));
  let audio=null;if(b.tts!==false)try{audio=(await tts(reply)).toString('base64');}catch(e){console.error(e.message);}
  return json(res,200,{reply,audio});
 }
 let f=path.join(__dirname,'public',u.pathname==='/'?'index.html':path.normalize(u.pathname).replace(/^(\.\.[\/\\])+/,''));
 if(!f.startsWith(path.join(__dirname,'public'))||!fs.existsSync(f)){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':f.endsWith('.html')?'text/html; charset=utf-8':'text/plain'});fs.createReadStream(f).pipe(res);
}catch(e){console.error(e);json(res,500,{error:String(e.message||e)});}}).listen(PORT,'0.0.0.0',()=>console.log('listening',PORT,'key:',!!KEY));
