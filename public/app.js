'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
/* ---------- profiles ---------- */
const PROFILES={tom:{name:'Tom',ini:'T',lvl:'B1',g:'m'},chloe:{name:'Chloé',ini:'C',lvl:'?',g:'f'},sophie:{name:'Sophie',ini:'S',lvl:'?',g:'f'}};
try{CoachLogic.recoverLegacy(localStorage);}catch(e){}
if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').then(r=>r.update()).catch(()=>{});}
const DEMO_P=(location.hash.match(/^#demo-\w+@(\w+)/)||[])[1];
let PROF=DEMO_P||localStorage.getItem('profile');if(!PROFILES[PROF]||location.hash==='#demo-profiles')PROF=null;
const ME=PROFILES[PROF]||PROFILES.tom;const NS='p:'+(PROF||'_')+':';
const LS={get:(k,d)=>{try{const v=localStorage.getItem(NS+k);return v==null?d:JSON.parse(v);}catch{return d;}},set:(k,v)=>localStorage.setItem(NS+k,JSON.stringify(v))};
function pickProfile(id){if(!PROFILES[id]||!CoachLogic.profileId(id))return;localStorage.setItem('profile',id);location.hash='';location.reload();}
function switchProfile(){localStorage.removeItem('profile');location.hash='';location.reload();}
const S=Object.assign({goal:15,accent:'us',speed:1,theme:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'},LS.get('settings',{}));
const saveS=()=>LS.set('settings',S);
const root=document.documentElement;root.dataset.theme=S.theme;
let health={};fetch('/api/health').then(r=>r.json()).then(j=>{health=j;$('#pronInfo').textContent=j.pron?'Score de prononciation (Azure) : activé ✓':'Score de prononciation : désactivé (clé Azure non configurée).';
 const s=$('#searchInfo');if(s)s.textContent=j.search==='off'?'Recherche en ligne désactivée. Le coach ne prétendra pas avoir vérifié.':j.search==='anthropic'?'Recherche web activée seulement à la demande. Elle est facturée à part sur la clé Anthropic.':'Recherche à la demande : Wikipédia et réponses instantanées, seulement si tu le demandes. Pas une recherche web générale, et rien à chaque message.';}).catch(()=>{});
let sid=LS.get('sid',null)||Math.random().toString(36).slice(2);LS.set('sid',sid);
const today=(d=new Date())=>d.toLocaleDateString('sv-SE');
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- stats ---------- */
const days=LS.get('days',{});const vocab=new Set(LS.get('vocab',[]));const levels=LS.get('levels',[]);
const dayRec=(d=today())=>days[d]||(days[d]={secs:0,words:0,errors:0,turns:0,uniq:[]});
const words=t=>(t.toLowerCase().match(/[a-z']+/g)||[]);
function logSpeech(text,secs){const d=dayRec(),w=words(text);d.secs+=secs;d.words+=w.length;d.turns++;const u=new Set(d.uniq);w.forEach(x=>{u.add(x);vocab.add(x)});d.uniq=[...u].slice(0,3000);LS.set('days',days);LS.set('vocab',[...vocab].slice(-20000));refreshHome();}
let clock=null;
try{clock=LS.get('clock',null);}catch(e){clock=null;}
function saveClock(){try{LS.set('clock',clock);}catch(e){}}
function paintSessionBtn(){const b=$('#sessionCtl');if(!b)return;b.hidden=!clock;if(!clock)return;b.textContent=clock.active?'Pause':'Reprendre';b.setAttribute('aria-pressed',clock.active?'true':'false');}
function syncClock(visible){if(!clock){paintSessionBtn();return;}const show=visible!==false&&document.visibilityState!=='hidden';const r=CoachLogic.tickSession(clock,Date.now(),show);clock=r.clock;if(r.addMs>0){const d=dayRec();CoachLogic.noteSessionSecs(d,r.addMs/1000);LS.set('days',days);refreshHome();}saveClock();paintSessionBtn();}
function beginPractice(){if(clock&&clock.active&&!clock.hidden)return;clock=CoachLogic.startSession(clock,Date.now());saveClock();paintSessionBtn();}
function pausePractice(){const r=CoachLogic.pauseSession(clock,Date.now(),document.visibilityState!=='hidden');clock=r.clock;if(r.addMs>0){const d=dayRec();CoachLogic.noteSessionSecs(d,r.addMs/1000);LS.set('days',days);refreshHome();}saveClock();paintSessionBtn();}
document.addEventListener('visibilitychange',()=>{if(!clock||!clock.active)return;if(document.visibilityState==='hidden'){const r=CoachLogic.tickSession(clock,Date.now(),false);clock=r.clock;if(r.addMs>0){const d=dayRec();CoachLogic.noteSessionSecs(d,r.addMs/1000);LS.set('days',days);}saveClock();}else syncClock(true);});
window.addEventListener('pagehide',()=>{if(clock&&clock.active){const r=CoachLogic.tickSession(clock,Date.now(),false);clock=r.clock;saveClock();}if(mainRec&&mainRec.on){const rec=mainRec;mainRec=null;rec.stop().then(r=>{if(r.secs>=1.2)sendTurn(r,false);else setState('idle','À toi');}).catch(()=>setState('idle','À toi'));}});
setInterval(()=>{if(clock&&clock.active&&document.visibilityState!=='hidden')syncClock(true);},5000);
function logErrors(n){dayRec().errors+=n;LS.set('days',days);}
function lastLevel(){return(levels[levels.length-1]||{}).l||ME.lvl;}
function logLevel(l){if(!/^[ABC][12]$/.test(l||''))return;levels.push({d:today(),l});LS.set('levels',levels.slice(-500));}
function streak(){const g=S.goal*60;let n=0,d=new Date();if(CoachLogic.practiceSecs(days[today(d)]||{})>=g)n++;for(;;){d.setDate(d.getDate()-1);if(CoachLogic.practiceSecs(days[today(d)]||{})>=g)n++;else break;}return n;}
function lastDays(n){const out=[];const d=new Date();d.setDate(d.getDate()-n+1);for(let i=0;i<n;i++){out.push([today(d),days[today(d)]||{secs:0,words:0,errors:0,uniq:[]}]);d.setDate(d.getDate()+1);}return out;}

/* ---------- spaced repetition (SM-2) ---------- */
let cards=LS.get('cards',[]);const saveC=()=>LS.set('cards',cards);
function addCard(c){const id=(c.type+':'+c.en).toLowerCase();if(cards.some(x=>x.id===id))return;cards.push({id,...c,ef:2.5,reps:0,ivl:0,due:Date.now()+36e5*4,created:Date.now()});saveC();}
function schedule(card,q){ // q 0..5
 if(q<3){card.reps=0;card.ivl=1;card.lapses=(card.lapses||0)+1;card.due=Date.now()+10*60e3;}
 else{card.reps++;card.ivl=card.reps===1?1:card.reps===2?6:Math.round(card.ivl*card.ef);card.due=Date.now()+card.ivl*864e5;}
 card.ef=Math.max(1.3,card.ef+0.1-(5-q)*(0.08+(5-q)*0.02));saveC();}
const dueCards=()=>cards.filter(c=>c.due<=Date.now()).sort((a,b)=>a.due-b.due);
let archive=CoachLogic.normalizeThread(LS.get('archive',[]),CoachLogic.ARCHIVE_CAP);
let thread=CoachLogic.normalizeThread(LS.get('thread',[]));
function remember(msg){const split=CoachLogic.splitHistory(archive,CoachLogic.appendMessage(thread,msg));archive=split.archive;thread=split.thread;try{LS.set('archive',archive);}catch(e){}saveThread();}
function historyItems(){return CoachLogic.combineHistory(archive,thread);}
let memory=CoachLogic.normalizeMemory(LS.get('memory',[]));
function saveThread(){try{LS.set('thread',thread.slice(-CoachLogic.THREAD_CAP));}catch(e){thread=thread.slice(-20);try{LS.set('thread',thread);}catch(err){}}}
function saveMemory(){try{LS.set('memory',memory);}catch(e){}}
function ctx(extra){const incoming=extra||{};const pressure=incoming.mode==='pressure';extra=Object.assign({profile:PROF||'tom',level:lastLevel(),first:!Object.keys(days).length&&!thread.length},incoming);const due=dueCards().slice(0,6).map(c=>c.type==='fix'?`"${c.en}" (used to say: "${c.wrong}")`:`expression "${c.en}" (${c.fr})`);
 const recent=cards.slice(-10).map(c=>c.en);
 const history=pressure?[]:CoachLogic.datedModelMessages(historyItems()).slice(-6).map(m=>({role:m.role,content:String(m.content).slice(0,180)}));
 const lastMe=[...thread].reverse().find(m=>m.role==='me');
 const journal=pressure?'':CoachLogic.memoryStatus(historyItems(),Date.now()).summary;
 return Object.assign({accent:S.accent,due,recent,memory:memory.slice(-12).map(m=>m.text),history,journal,asked:pressure?[]:CoachLogic.recentQuestions(historyItems()),openings:pressure?[]:CoachLogic.replyOpenings(historyItems()),anchor:pressure?'':(lastMe&&lastMe.text)||'',hasThread:!pressure&&historyItems().length>0},extra);}
const b64=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o))));
let lookupOnce=false;
function syncLookup(){const b=$('#lookupBtn');if(!b)return;b.classList.toggle('on',lookupOnce);b.setAttribute('aria-pressed',lookupOnce?'true':'false');b.textContent=lookupOnce?'Chercher · oui':'Chercher';}
function resumeKey(){return 'resumed:'+(PROF||'tom');}
async function syncContext(){try{await fetch('/api/context?sid='+encodeURIComponent(sid),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({history:CoachLogic.datedModelMessages(historyItems()),log:CoachLogic.memoryLog(historyItems(),Date.now(),memory),profile:PROF||'tom'})});}catch(e){console.warn('context',e);}}

/* ---------- audio out ---------- */
const player=new Audio();player.playsInline=true;player.setAttribute('playsinline','');
const SILENT='data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA';
function unlock(){if(!player.dataset.u){player.src=SILENT;player.play().catch(()=>{});player.dataset.u=1;}}
let q=[],playing=false,streamDone=true,onIdle=null,playGen=0,turnGen=0;
function setRate(r){player.playbackRate=r;player.defaultPlaybackRate=r;try{player.preservesPitch=true;}catch{}}
function voiceRetry(text){const spoken=CoachLogic.forSpeech(text);if(!spoken)return;setState('idle','Voix indisponible');const d=document.createElement('div');d.className='fix';d.innerHTML='<div>La voix n’a pas répondu. Réessaie avec la même voix.</div><button type="button" class="act">Réessayer la voix</button>';d.querySelector('button').onclick=()=>{d.remove();say(spoken);};log.appendChild(d);log.scrollTop=1e9;}
function playNext(){if(playing)return;const c=q.shift();if(!c){if(streamDone&&onIdle){const f=onIdle;onIdle=null;f();}return;}
 if(c.gen!=null&&c.gen!==playGen)return playNext();
 if(!c.audio){voiceRetry(c.text);return playNext();}
 const gen=playGen;playing=true;const fin=()=>{if(gen!==playGen)return;playing=false;playNext();};
 const fail=()=>{if(gen!==playGen)return;player.onended=null;player.onerror=null;playing=false;voiceRetry(c.text);playNext();};
 player.onended=fin;player.onerror=fail;player.src=c.audio.startsWith('blob:')||c.audio.startsWith('data:')?c.audio:'data:audio/mpeg;base64,'+c.audio;setRate(c.rate||S.speed);
 player.play().then(()=>{if(gen===playGen)setState('speak','Speaking');}).catch(fail);}
function stopAudio(){playGen++;q=[];playing=false;player.pause();player.onended=null;player.onerror=null;}
const ttsCache=new Map();
async function ttsUrl(text){const voice=(health.voices&&health.voices[S.accent])||'';const k=voice+'|'+S.accent+'|'+text;if(ttsCache.has(k))return ttsCache.get(k);const r=await fetch('/api/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,accent:S.accent})});if(!r.ok)throw new Error('tts');const u=URL.createObjectURL(await r.blob());ttsCache.set(k,u);return u;}
async function say(text,rate){const spoken=CoachLogic.forSpeech(text);if(!spoken)return;stopAudio();unlock();const gen=playGen;let a=null;try{a=await ttsUrl(spoken);}catch(e){if(gen===playGen)voiceRetry(spoken);return;}if(gen!==playGen)return;streamDone=true;q.push({text:spoken,audio:a,rate:rate||S.speed,gen});playNext();}

/* ---------- recording ---------- */
let stream,ac;
function pickMime(){for(const m of['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/aac','audio/ogg'])if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m))return m;return'';}
async function getStream(){
 if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error("Le micro nécessite HTTPS et un navigateur récent (Safari iOS 14.3+, Chrome).");
 try{if(!stream||!stream.active)stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});return stream;}
 catch(e){throw new Error(e.name==='NotAllowedError'?"Accès au micro refusé. iPhone : Réglages › Safari › Micro › Autoriser (ou « aA » › Réglages du site). Android : 🔒 › Autorisations › Micro.":e.name==='NotFoundError'?"Aucun micro détecté.":"Erreur micro : "+e.name);}}
class Rec{async start(){unlock();stopAudio();const s=await getStream();ac=ac||new (window.AudioContext||window.webkitAudioContext)();await ac.resume();
  this.an=ac.createAnalyser();this.an.fftSize=1024;this.src=ac.createMediaStreamSource(s);this.src.connect(this.an);
  const m=pickMime();this.r=m?new MediaRecorder(s,{mimeType:m}):new MediaRecorder(s);this.ch=[];this.r.ondataavailable=e=>e.data.size&&this.ch.push(e.data);this.t0=Date.now();this.r.start(1000);this.on=true;}
 stop(){return new Promise(res=>{this.on=false;this.r.onstop=()=>{try{this.src.disconnect();}catch{}const type=this.r.mimeType||'audio/mp4';res({blob:new Blob(this.ch,{type}),type,secs:(Date.now()-this.t0)/1000});};this.r.stop();});}}
async function transcribe(rec){const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':rec.type},body:rec.blob});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);return j.text||'';}
async function toWav16k(blob){ // client-side: decode -> mono 16 kHz PCM16 WAV (for Azure)
 const buf=await blob.arrayBuffer();const C=window.AudioContext||window.webkitAudioContext;const tmp=ac||new C();
 const audio=await new Promise((ok,ko)=>{const p=tmp.decodeAudioData(buf,ok,ko);if(p&&p.then)p.then(ok,ko);});
 const len=Math.ceil(audio.duration*16000);const off=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,len,16000);
 const s=off.createBufferSource();s.buffer=audio;s.connect(off.destination);s.start();const out=(await off.startRendering()).getChannelData(0);
 const dv=new DataView(new ArrayBuffer(44+out.length*2));const W=(o,str)=>{for(let i=0;i<str.length;i++)dv.setUint8(o+i,str.charCodeAt(i));};
 W(0,'RIFF');dv.setUint32(4,36+out.length*2,true);W(8,'WAVE');W(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,16000,true);dv.setUint32(28,32000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);W(36,'data');dv.setUint32(40,out.length*2,true);
 for(let i=0;i<out.length;i++){const v=Math.max(-1,Math.min(1,out[i]));dv.setInt16(44+i*2,v<0?v*0x8000:v*0x7fff,true);}
 return new Blob([dv],{type:'audio/wav'});}
window.__toWav16k=toWav16k;

/* ---------- word diff ---------- */
const norm=t=>t.toLowerCase().replace(/[’`]/g,"'").replace(/[^a-z0-9' ]+/g,' ').split(/\s+/).filter(Boolean);
function diff(target,said){const A=norm(target),B=norm(said),n=A.length,m=B.length,L=Array.from({length:n+1},()=>new Array(m+1).fill(0));
 for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i][j]=A[i]===B[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
 const out=[];let i=0,j=0;while(i<n||j<m){if(i<n&&j<m&&A[i]===B[j]){out.push({w:A[i],k:'ok'});i++;j++;}else if(j<m&&(i>=n||L[i][j+1]>=L[i+1][j])){out.push({w:B[j],k:'extra'});j++;}else{out.push({w:A[i],k:'miss'});i++;}}
 return{score:n?L[0][0]/n:0,out};}
const diffHtml=d=>d.out.map(x=>`<span class="w ${x.k}">${esc(x.w)}</span>`).join(' ');

/* ---------- navigation ---------- */
function show(v){$$('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));$$('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 $('#bilanBtn').hidden=$('#newBtn').hidden=v!=='chat';$('#title').textContent={home:'English Coach',chat:mode.pressure?'Mode pression':'Conversation',review:'Révision',stats:'Progrès'}[v];
 if(v==='home')refreshHome();if(v==='stats')renderStats();if(v==='review'&&!rv.active)startReview(false);}
$$('#tabs button').forEach(b=>b.onclick=()=>show(b.dataset.v));
const openSheet=id=>$('#'+id).classList.add('on'),closeSheet=id=>$('#'+id).classList.remove('on');
$$('.sheet').forEach(s=>s.addEventListener('click',e=>{if(e.target===s)s.classList.remove('on');}));

/* ---------- home ---------- */
function refreshHome(){const d=days[today()]||{secs:0};const min=CoachLogic.practiceSecs(d)/60;$('#todayMin').textContent=Math.floor(min);$('#goalLbl').textContent=`/ ${S.goal} min de séance`;
 $('#ring').style.strokeDashoffset=628.3*(1-Math.min(1,min/S.goal));$('#streak').textContent=streak();$('#hDue').textContent=dueCards().length;
 $('#hWpm').textContent=d.secs>20?Math.round(d.words/(d.secs/60)):'–';$('#hLvl').textContent=lastLevel();
 const st=LS.get('flow',{})[today()]||0;['f1','f2','f3'].forEach((f,i)=>$('#'+f).classList.toggle('on',st>i));
 const note=$('#persistNote');if(note)note.textContent=thread.length?('Conversation de '+ME.name+' enregistrée sur cet appareil ('+thread.length+' message'+(thread.length>1?'s':'')+').'):'Les conversations restent sur cet appareil. Chaque profil est séparé.';}
function flowMark(n){const f=LS.get('flow',{});f[today()]=Math.max(f[today()]||0,n);LS.set('flow',f);}
$('#startSession').onclick=()=>{unlock();beginPractice();session=true;if(dueCards().length){show('review');startReview(true);}else{flowMark(1);openChat(false,null,{resume:true});}};
$('#freeTalk').onclick=()=>{unlock();beginPractice();session=false;openChat(false,null,{resume:true});};
$('#pressureBtn').onclick=()=>openSheet('sh-pressure');
let session=false;

/* ---------- chat ---------- */
const log=$('#log'),micBtn=$('#mic'),stateEl=$('#state'),cv=$('#wave'),cx=cv.getContext('2d');
let mainRec=null,mode={pressure:false},raf,pTimerId,ctxMenu;
function setState(m,t,hot){stateEl.textContent=t;stateEl.classList.toggle('hot',!!hot);micBtn.className='mic'+(m==='rec'?' rec':m==='busy'?' busy':'');}
function bubble(t,c){const h=$('.hello',log);if(h)h.remove();const d=document.createElement('div');d.className='msg '+c;d.textContent=t;log.appendChild(d);log.scrollTop=1e9;return d;}
function hello(){log.innerHTML=`<div class="hello"><h2>${mode.pressure?'Ready?':"Let's talk."}</h2>${mode.pressure?'Le recruteur commence. Réponds avant la fin du chrono.':'Appuie, parle anglais aussi longtemps que tu veux, puis appuie à nouveau. La conversation reste sur cet appareil.'}</div>`;}
function paintSearch(info, sources, el){const node=el||document.createElement('div');const fresh=!!(info&&info.fresh);node.className='searchchip'+(fresh?'':' bad');
 const list=(sources||(info&&info.sources)||[]).map(s=>({title:s.title,url:CoachLogic.safeHttpUrl(s.url)})).filter(s=>s.url);
 if(info&&info.reason==='searching'){node.className='searchchip';node.textContent='Recherche…';}
 else if(fresh&&list.length)node.innerHTML='Vérifié · '+list.map(s=>'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.url)+'</a>').join(' · ');
 else {const reason=info&&info.reason;node.textContent=reason==='disabled'?'Recherche désactivée — pas d’info fraîche':reason==='timeout'?'Recherche trop lente — pas d’info fraîche':'Pas trouvé en ligne — pas d’info fraîche';}
 if(!el)log.appendChild(node);log.scrollTop=1e9;return node;}
function renderThread(){log.innerHTML='';if(!thread.length){hello();return;}
 for(const m of thread){if(m.role==='me')bubble(CoachLogic.stripMetadataTokens(m.text),'me');else{if(m.search)paintSearch(m.search,m.sources);renderReply(m.text,m.meta||null);}}}
function renderReply(text,meta){const h=$('.hello',log);if(h)h.remove();const tips=[];const safe=CoachLogic.stripMetadataTokens(text);
 const main=safe.split('\n').filter(l=>{const m=l.match(/^\s*Tip\s*:\s*(.*)/i);if(m){if(!mode.pressure)tips.push(m[1]);return false}return!/^\s*##/.test(l)}).join('\n').replace(/\n{2,}/g,'\n\n').trim();
 bubble(main,'ai');const mk=(meta&&meta.mistakes)||[];
 mk.forEach((m,i)=>{if(!m||!m.right)return;const d=document.createElement('div');d.className='fix';
  d.innerHTML=`<div class="k">Correction</div>${m.wrong?`<div><s>${esc(m.wrong)}</s></div>`:''}<div class="right">${esc(m.right)}</div>${i===0&&tips[0]?`<div class="fr">${esc(tips[0])}</div>`:''}<button class="act">🔁 Répéter</button>`;
  d.querySelector('.act').onclick=()=>openShadow(m.right);log.appendChild(d);});
 if(!mk.length&&tips.length){const d=document.createElement('div');d.className='fix';d.innerHTML=`<div class="k">Tip</div><div>${esc(tips.join(' '))}</div>`;log.appendChild(d);}
 ((meta&&meta.expressions)||[]).forEach(e=>{if(!e||!e.en)return;const d=document.createElement('div');d.className='fix';d.innerHTML=`<div class="k">Nouvelle expression</div><div class="right">${esc(e.en)}</div><div class="fr">${esc(e.fr||'')}${e.example?' · '+esc(e.example):''}</div><button class="act">🔁 Répéter</button>`;d.querySelector('.act').onclick=()=>openShadow(e.example||e.en);log.appendChild(d);});
 log.scrollTop=1e9;}
function absorbMeta(meta){if(!meta)return;(meta.mistakes||[]).forEach(m=>m&&m.right&&addCard({type:'fix',en:m.right,wrong:m.wrong||'',fr:m.fr||''}));
 (meta.expressions||[]).forEach(e=>e&&e.en&&addCard({type:'expr',en:e.en,fr:e.fr||'',example:e.example||''}));
 if(Array.isArray(meta.notes)&&meta.notes.length){memory=CoachLogic.mergeMemory(memory,CoachLogic.learnerNotes(meta.notes));saveMemory();}
 if(!mode.pressure||true)logErrors((meta.mistakes||[]).length);logLevel(meta.level);}
function draw(an){const W=cv.width,H=cv.height,d=new Uint8Array(an.frequencyBinCount);an.getByteTimeDomainData(d);let s=0;for(const v of d){const x=(v-128)/128;s+=x*x}const lvl=Math.min(1,Math.sqrt(s/d.length)*4);
 cx.clearRect(0,0,W,H);const N=72,R=W*0.33;for(let i=0;i<N;i++){const a=i/N*Math.PI*2,v=(d[(i*7)%d.length]-128)/128,len=6+Math.abs(v)*W*.12*lvl+lvl*20;
 cx.strokeStyle=`rgba(255,55,95,${.25+lvl*.6})`;cx.lineWidth=5;cx.lineCap='round';cx.beginPath();cx.moveTo(W/2+Math.cos(a)*R,H/2+Math.sin(a)*R);cx.lineTo(W/2+Math.cos(a)*(R+len),H/2+Math.sin(a)*(R+len));cx.stroke();}
 raf=requestAnimationFrame(()=>draw(an));}
const drawIdle=()=>{cancelAnimationFrame(raf);cx.clearRect(0,0,cv.width,cv.height);};
async function beginGreeting(opts){opts=opts||{};setState('busy','Thinking');if(!mode.pressure)await syncContext();
 try{const extra=mode.pressure?{mode:'pressure',scenario:mode.scenario}:{resume:!!opts.resume};
  const r=await fetch('/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sid,ctx:ctx(extra)})});const j=await r.json();if(!r.ok)throw new Error(j.error||'start');
  const reply=CoachLogic.cleanCoachText(j.reply||'');
  renderReply(reply,j.meta);
  if(!mode.pressure&&reply)remember({role:'ai',text:reply,meta:CoachLogic.slimMeta(j.meta),at:Date.now()});
  const spoken=CoachLogic.forSpeech(reply);streamDone=true;
  if(j.audio&&spoken){onIdle=afterTeacher;q.push({text:spoken,audio:j.audio,gen:playGen});playNext();}
  else{if(spoken&&!j.audio)voiceRetry(spoken);afterTeacher();}}
 catch(e){bubble('Erreur : '+e.message,'err');setState('idle','Prêt');}}
function clearConversation(){thread=[];saveThread();try{sessionStorage.removeItem(resumeKey());}catch(e){}fetch('/api/reset?sid='+encodeURIComponent(sid),{method:'POST'}).catch(()=>{});hello();refreshHome();}
async function openChat(pressure,scenario,opts){opts=opts||{};mode={pressure:!!pressure,scenario:scenario||''};
 const lookup=$('#lookupBtn');if(lookup)lookup.hidden=!!pressure;
 $('#pBanner').hidden=!pressure;
 if(pressure)$('#pScen').textContent={interview:"Entretien d'embauche",meeting:'Réunion client',pitch:'Pitch investisseur'}[scenario]||'';
 show('chat');
 if(pressure){await fetch('/api/reset?sid='+encodeURIComponent(sid),{method:'POST'}).catch(()=>{});hello();await beginGreeting({resume:false});return;}
 if(opts.fresh){thread=[];saveThread();try{sessionStorage.removeItem(resumeKey());}catch(e){}await fetch('/api/reset?sid='+encodeURIComponent(sid),{method:'POST'}).catch(()=>{});hello();await beginGreeting({resume:false});return;}
 renderThread();
 let resumed=false;try{resumed=!!sessionStorage.getItem(resumeKey());}catch(e){}
 if(opts.resume&&thread.length&&!resumed){try{sessionStorage.setItem(resumeKey(),'1');}catch(e){}if(CoachLogic.shouldContinueAloud(thread))await beginGreeting({resume:true});else setState('idle','À toi');}
 else if(opts.resume&&!thread.length)await beginGreeting({resume:false});
 else setState('idle',thread.length?'À toi':'Prêt');}
function afterTeacher(){if(!mode.pressure)return setState('idle','À toi');
 let t=5;setState('idle',`À toi — ${t}`,true);clearInterval(pTimerId);pTimerId=setInterval(()=>{t--;if(mainRec)return clearInterval(pTimerId);if(t>0)setState('idle',`À toi — ${t}`,true);else{clearInterval(pTimerId);setState('idle','Réponds maintenant !',true);}},1000);}
micBtn.onclick=async()=>{
 if(mainRec&&mainRec.on){clearInterval(pTimerId);$('#pTimer').textContent='';const r=mainRec;mainRec=null;drawIdle();sendTurn(await r.stop(),r.interrupted);return;}
 if(micBtn.classList.contains('busy')||(mainRec&&mainRec.starting))return;
 try{turnGen++;stopAudio();beginPractice();mainRec=new Rec();mainRec.starting=true;await mainRec.start();mainRec.starting=false;}catch(e){mainRec=null;return bubble(e.message,'err');}
 setState('rec','Listening');draw(mainRec.an);
 if(mode.pressure){let t=+S.pSecs||45;$('#pTimer').textContent=t+'s';clearInterval(pTimerId);pTimerId=setInterval(()=>{t--;$('#pTimer').textContent=t+'s';if(t<=10)setState('rec',`Plus que ${t}s`,true);if(t<=0&&mainRec){mainRec.interrupted=true;micBtn.click();}},1000);}};
async function sendTurn(rec,interrupted){const my=++turnGen;setState('busy','Thinking');if(!rec||rec.blob.size<1500)return setState('idle','Trop court — réessaie');
 const doSearch=lookupOnce&&!mode.pressure;lookupOnce=false;syncLookup();
 const pending=bubble('…','me');let live=null,acc='',searchEl=null,searchSaved=null;const speakFilter=CoachLogic.createSpokenSanitizer();const audioHold=new Map();let nextAudio=0;stopAudio();streamDone=false;onIdle=afterTeacher;
 try{if(!mode.pressure)await syncContext();
  const r=await fetch('/api/stream?sid='+encodeURIComponent(sid),{method:'POST',headers:{'Content-Type':rec.type,'X-Ctx':b64(ctx({secs:rec.secs,interrupted:!!interrupted,search:doSearch,...(mode.pressure?{mode:'pressure',scenario:mode.scenario}:{})}))},body:rec.blob});
  if(!r.ok||!r.body)throw new Error('HTTP '+r.status);const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
  while(true){const{value,done}=await rd.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
   while((i=buf.indexOf('\n\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+2);if(!l.startsWith('data: '))continue;const ev=JSON.parse(l.slice(6));
    if(my!==turnGen)return;
    if(ev.type==='user'){if(ev.text){pending.textContent=ev.text+(interrupted?'  ⏱':'');logSpeech(ev.text,rec.secs);if(!mode.pressure&&!ev.unclear)remember({role:'me',text:ev.text,at:Date.now()});}else pending.remove();}
    else if(ev.type==='search'){if(ev.state==='searching'){searchEl=paintSearch({reason:'searching'});setState('busy','Recherche…');}else{searchSaved={fresh:!!ev.fresh,reason:ev.reason||'',mode:ev.mode||'',sources:ev.sources||[]};if(searchEl)paintSearch(searchSaved,searchSaved.sources,searchEl);else searchEl=paintSearch(searchSaved);}}
    else if(ev.type==='delta'){acc+=speakFilter.push(ev.text||'');const v=acc.split('\n').filter(x=>!/^\s*(Tip\s*:|##)/i.test(x)).join('\n').trim();if(v){if(!live)live=bubble('','ai');live.textContent=v;log.scrollTop=1e9;}}
    else if(ev.type==='audio'){if(my!==turnGen)continue;const idx=Number.isInteger(ev.i)?ev.i:nextAudio;audioHold.set(idx,ev);while(audioHold.has(nextAudio)){const item=audioHold.get(nextAudio);audioHold.delete(nextAudio);nextAudio++;const said=CoachLogic.forSpeech(item.text||'');if(!item.audio){voiceRetry(said);continue;}q.push(Object.assign({gen:playGen},item,{text:said}));playNext();}}
    else if(ev.type==='reply'){speakFilter.end();const reply=CoachLogic.cleanCoachText(ev.text||'');if(live)live.remove();renderReply(reply,ev.meta);if(!reply||!/didn't quite catch/i.test(reply))absorbMeta(ev.meta);
     if(!mode.pressure&&reply&&!/didn't quite catch/i.test(reply)){const item={role:'ai',text:reply,meta:CoachLogic.slimMeta(ev.meta),at:Date.now()};if(searchSaved){item.search=searchSaved;if(searchSaved.sources)item.sources=searchSaved.sources;}remember(item);refreshHome();}}
    else if(ev.type==='error')throw new Error(ev.error);
    else if(ev.type==='done'){streamDone=true;if(!playing&&!q.length){const f=onIdle;onIdle=null;f&&f();}}}}
 }catch(e){if(pending.textContent==='…')pending.remove();if(searchEl&&!searchSaved)paintSearch({fresh:false,reason:'error'},null,searchEl);bubble('Erreur : '+e.message,'err');setState('idle','Prêt');}}
$('#newBtn').onclick=()=>{if(!confirm('Effacer la conversation de '+ME.name+' et en commencer une nouvelle ? Les cartes de révision et les réglages restent.'))return;mode={pressure:false};$('#pBanner').hidden=true;const lookup=$('#lookupBtn');if(lookup)lookup.hidden=false;openChat(false,null,{fresh:true});};
$('#bilanBtn').onclick=async()=>{setState('busy','Bilan…');stopAudio();const d=days[today()]||{};
 try{if(!mode.pressure)await syncContext();const r=await fetch('/api/recap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sid,ctx:{profile:PROF||'tom'},stats:{minutesToday:Math.round((d.secs||0)/60),wordsToday:d.words,errorsToday:d.errors,streak:streak()}})});const j=await r.json();if(!r.ok)throw new Error(j.error);
  const el=document.createElement('div');el.className='recap';el.innerHTML='<b>Bilan de session</b>';el.append(j.recap);log.appendChild(el);log.scrollTop=1e9;flowMark(3);}catch(e){bubble('Erreur : '+e.message,'err');}setState('idle','Prêt');};
$('#pQuit').onclick=()=>{clearInterval(pTimerId);stopAudio();mode={pressure:false};$('#pBanner').hidden=true;const lookup=$('#lookupBtn');if(lookup)lookup.hidden=false;renderThread();show('home');};
$$('#sh-pressure [data-sc]').forEach(b=>b.onclick=()=>{unlock();beginPractice();closeSheet('sh-pressure');openChat(true,b.dataset.sc);});
const pS=$('#pSecs');pS.value=S.pSecs||45;$('#pSecsV').textContent=pS.value+' s';pS.oninput=()=>{S.pSecs=+pS.value;saveS();$('#pSecsV').textContent=pS.value+' s';};$('#pClose').onclick=()=>closeSheet('sh-pressure');

/* ---------- shadowing ---------- */
let shTarget='',shRate=1,shRec=null;
function openShadow(t){shTarget=t;$('#shTarget').textContent=t;$('#shResult').innerHTML='';$('#shState').textContent='Écoute, puis appuie et répète';openSheet('sh-shadow');say(t,shRate);}
$('#shPlay').onclick=()=>say(shTarget,shRate);
$$('#shSpeed button').forEach(b=>b.onclick=()=>{shRate=+b.dataset.s;$$('#shSpeed button').forEach(x=>x.classList.toggle('on',x===b));say(shTarget,shRate);});
$('#shClose').onclick=()=>{closeSheet('sh-shadow');stopAudio();};
$('#shMic').onclick=async()=>{const m=$('#shMic');
 if(shRec&&shRec.on){const rec=await shRec.stop();shRec=null;m.className='mic smallmic busy';$('#shState').textContent='Analyse…';
  try{const [said,pron]=await Promise.all([transcribe(rec),health.pron?pronScore(rec,shTarget):Promise.resolve(null)]);logSpeech(said,rec.secs);
   const d=diff(shTarget,said),pct=Math.round(d.score*100);
   let html=`<div class="score" style="color:${pct>=90?'var(--good)':pct>=60?'var(--warn)':'var(--bad)'}">${pct}%</div><div style="text-align:center">${diffHtml(d)}</div>`;
   if(pron&&pron.scores)html+=`<h3>Prononciation</h3><div>${pron.words.map(w=>`<span class="w ${w.error!=='None'&&w.error!=='Insertion'?'miss':w.score>=80?'ok':w.score>=60?'mid':'miss'}">${esc(w.word)} <small>${Math.round(w.score||0)}</small></span>`).join(' ')}</div><div style="color:var(--mute);font-size:13px;margin-top:6px">Global ${Math.round(pron.scores.pron||0)} · Précision ${Math.round(pron.scores.accuracy||0)} · Fluidité ${Math.round(pron.scores.fluency||0)}</div>`;
   html+=`<p style="text-align:center;margin:10px 0 0">${pct>=90?'Parfait, bravo ! 🎉':pct>=60?'Presque ! Réécoute et réessaie.':'Réessaie, écoute bien chaque mot.'}</p>`;
   $('#shResult').innerHTML=html;$('#shState').textContent=pct>=90?'Excellent':'Réessaie quand tu veux';
   const c=cards.find(x=>x.en===shTarget);if(c&&pct>=90&&c.reps===0)schedule(c,4);}
  catch(e){$('#shResult').innerHTML=`<p class="msg err">${esc(e.message)}</p>`;}
  m.className='mic smallmic';return;}
 try{beginPractice();stopAudio();shRec=new Rec();await shRec.start();m.className='mic smallmic rec';$('#shState').textContent='Je t\'écoute… appuie pour finir';}catch(e){shRec=null;$('#shResult').innerHTML=`<p class="msg err">${esc(e.message)}</p>`;}};
async function pronScore(rec,ref){try{const wav=await toWav16k(rec.blob);const r=await fetch('/api/pron?ref='+encodeURIComponent(ref),{method:'POST',headers:{'Content-Type':'audio/wav'},body:wav});const j=await r.json();return j.enabled&&!j.error?j:null;}catch(e){console.warn(e);return null;}}

/* ---------- oral review ---------- */
const rv={active:false,list:[],i:0,end:0,timer:null,rec:null,cur:null};
function startReview(fromSession){const due=dueCards();rv.list=(due.length?due:[...cards].sort((a,b)=>a.due-b.due)).slice(0,30);rv.i=0;rv.active=true;rv.fromSession=fromSession;rv.end=Date.now()+180e3;
 clearInterval(rv.timer);rv.timer=setInterval(tickReview,500);$('#rToChat').hidden=!fromSession;$('#rNext').hidden=true;
 if(!rv.list.length){$('#rPrompt').textContent='Pas encore de cartes.';$('#rKind').textContent='Les corrections et expressions de tes conversations apparaîtront ici.';$('#rCount').textContent='0 / 0';$('#rMic').hidden=true;$('#rToChat').hidden=false;rv.active=false;clearInterval(rv.timer);return;}
 $('#rMic').hidden=false;showCard();}
function tickReview(){const s=Math.max(0,Math.round((rv.end-Date.now())/1000));$('#rTimer').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');if(s<=0&&!(rv.rec&&rv.rec.on)){clearInterval(rv.timer);finishReview('Temps écoulé ⏱');}}
function showCard(){const c=rv.cur=rv.list[rv.i];$('#rCount').textContent=(rv.i+1)+' / '+rv.list.length;$('#rResult').innerHTML='';$('#rNext').hidden=true;
 $('#rKind').textContent=c.type==='fix'?'Dis-le en anglais (correctement !)':'Quelle expression anglaise ?';$('#rPrompt').textContent=c.type==='fix'?(c.fr||'« '+c.wrong+' » → corrige'):(c.fr||c.example||c.en);$('#rState').textContent='Appuie et parle';}
function finishReview(msg){rv.active=false;$('#rPrompt').textContent=msg||'Révision terminée ✓';$('#rKind').textContent='';$('#rResult').innerHTML='';$('#rMic').hidden=true;$('#rNext').hidden=true;$('#rToChat').hidden=false;flowMark(1);refreshHome();}
$('#rMic').onclick=async()=>{const m=$('#rMic');
 if(rv.rec&&rv.rec.on){const rec=await rv.rec.stop();rv.rec=null;m.className='mic smallmic busy';$('#rState').textContent='Correction…';const c=rv.cur;
  try{const said=await transcribe(rec);logSpeech(said,rec.secs);const target=c.type==='expr'?(c.example||c.en):c.en;const d=diff(c.en,said);let score,fb;
   if(d.score>=0.9){score=3;fb='Parfait !';}else{const r=await fetch('/api/grade',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fr:c.fr,target:c.en+(c.example?' (e.g. '+c.example+')':''),answer:said})});const j=await r.json();score=+j.score||0;fb=j.feedback||'';}
   schedule(c,[1,3,4,5][score]||1);
   $('#rResult').innerHTML=`<div style="margin-top:8px">${diffHtml(d)}</div><div style="margin-top:10px;font-weight:600;color:${score>=2?'var(--good)':'var(--bad)'}">${['À revoir','Presque','Bien','Parfait'][score]} · ${esc(fb)}</div><div style="color:var(--mute);font-size:14px;margin-top:4px">Réponse : ${esc(target)}</div>`;
   say(target);$('#rNext').hidden=false;$('#rState').textContent='';}
  catch(e){$('#rResult').innerHTML=`<p class="msg err">${esc(e.message)}</p>`;}
  m.className='mic smallmic';return;}
 try{beginPractice();rv.rec=new Rec();await rv.rec.start();m.className='mic smallmic rec';$('#rState').textContent='Je t\'écoute… appuie pour valider';}catch(e){rv.rec=null;$('#rResult').innerHTML=`<p class="msg err">${esc(e.message)}</p>`;}};
$('#rNext').onclick=()=>{rv.i++;if(rv.i>=rv.list.length||Date.now()>rv.end)finishReview();else showCard();};
$('#rToChat').onclick=()=>{clearInterval(rv.timer);rv.active=false;flowMark(1);openChat(false,null,{resume:true});};

/* ---------- stats charts ---------- */
function bars(svg,vals,color){const W=300,H=110,n=vals.length,mx=Math.max(1,...vals),bw=W/n;svg.setAttribute('viewBox',`0 0 ${W} ${H+4}`);
 svg.innerHTML=vals.map((v,i)=>{const h=Math.max(2,v/mx*H);return`<rect x="${i*bw+bw*.2}" y="${H-h}" width="${bw*.6}" height="${h}" rx="${Math.min(4,bw*.3)}" fill="${color}" opacity="${v?1:.25}"/>`}).join('');}
function line(svg,vals,color,minY,maxY){const W=300,H=110,pts=vals.map((v,i)=>v==null?null:[i/(Math.max(1,vals.length-1))*W,H-((v-minY)/(maxY-minY||1))*H*.9-5]).filter(Boolean);svg.setAttribute('viewBox',`0 0 ${W} ${H+4}`);
 if(!pts.length){svg.innerHTML=`<text x="150" y="60" text-anchor="middle" fill="var(--mute)" font-size="12">Pas encore de données</text>`;return;}
 svg.innerHTML=`<polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p=>p.join(',')).join(' ')}"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${color}"/>`).join('');}
const LV=['A1','A2','B1','B2','C1','C2'];
function renderStats(){const d14=lastDays(14);const min=d14.map(([,d])=>Math.round(CoachLogic.practiceSecs(d)/60));bars($('#cMin'),min,'var(--accent)');
 $('#lMin').innerHTML=`<span>${d14[0][0].slice(5)}</span><span>aujourd'hui</span>`;
 line($('#cWpm'),d14.map(([,d])=>d.secs>20?Math.round(d.words/(d.secs/60)):null),'var(--good)',0,Math.max(60,...d14.map(([,d])=>d.secs>20?d.words/(d.secs/60):0)));
 line($('#cErr'),d14.map(([,d])=>d.words>10?+(d.errors/d.words*100).toFixed(1):null),'var(--rec)',0,Math.max(5,...d14.map(([,d])=>d.words>10?d.errors/d.words*100:0)));
 $('#sMin').textContent=lastDays(7).reduce((a,[,d])=>a+CoachLogic.practiceSecs(d),0)/60|0;$('#sStreak').textContent=streak();$('#sCards').textContent=cards.length;$('#sVocab').textContent=vocab.size;
 const w7=lastDays(7),tot=w7.reduce((a,[,d])=>a+d.words,0),u=new Set(w7.flatMap(([,d])=>d.uniq||[]));$('#sTtr').textContent=tot>30?Math.round(u.size/tot*100)+'%':'–';
 const wk={};levels.forEach(x=>{const dt=new Date(x.d);dt.setDate(dt.getDate()-((dt.getDay()+6)%7));const k=today(dt);(wk[k]=wk[k]||[]).push(LV.indexOf(x.l));});
 const ks=Object.keys(wk).sort().slice(-8),vals=ks.map(k=>{const a=wk[k].sort((x,y)=>x-y);return a[a.length>>1];});
 line($('#cLvl'),vals,'#bf5af2',0,5);$('#lLvl').innerHTML=ks.length?`<span>${ks[0].slice(5)}</span><span>${vals.length?LV[vals[vals.length-1]]:''}</span>`:'';}

/* ---------- settings ---------- */
function syncSettings(){$$('#setAccent button').forEach(b=>b.classList.toggle('on',b.dataset.a===S.accent));$$('#setTheme button').forEach(b=>b.classList.toggle('on',b.dataset.t===S.theme));
 $('#setSpeed').value=S.speed;$('#setSpeedV').textContent=(+S.speed).toFixed(2)+'×';$('#setGoal').value=S.goal;$('#setGoalV').textContent=S.goal+' min';root.dataset.theme=S.theme;}
$('#setBtn').onclick=()=>{syncSettings();openSheet('sh-settings');};$('#setClose').onclick=()=>{closeSheet('sh-settings');refreshHome();};
$$('#setAccent button').forEach(b=>b.onclick=e=>{e.preventDefault();S.accent=b.dataset.a;saveS();syncSettings();say({us:`Hey ${ME.name}. This is how I sound.`,uk:`Hello ${ME.name}. This is me.`,au:`Hey ${ME.name}. This is how I sound.`}[S.accent]);});
$$('#setTheme button').forEach(b=>b.onclick=e=>{e.preventDefault();S.theme=b.dataset.t;saveS();syncSettings();});
$('#setSpeed').oninput=e=>{S.speed=+e.target.value;saveS();syncSettings();setRate(S.speed);};
$('#setGoal').oninput=e=>{S.goal=+e.target.value;saveS();syncSettings();};
const forgetChat=$('#forgetChat');if(forgetChat)forgetChat.onclick=()=>{if(!confirm('Effacer la conversation de '+ME.name+' sur cet appareil ? Les cartes de révision et les réglages restent.'))return;clearConversation();closeSheet('sh-settings');};
const forgetNotes=$('#forgetNotes');if(forgetNotes)forgetNotes.onclick=()=>{if(!confirm('Oublier les notes du coach sur '+ME.name+' ? La conversation, les cartes et les réglages restent.'))return;memory=[];saveMemory();};
const lookupBtn=$('#lookupBtn');if(lookupBtn)lookupBtn.onclick=()=>{lookupOnce=!lookupOnce;syncLookup();};
$('#icsBtn').onclick=e=>{e.preventDefault();const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//English Coach//FR','BEGIN:VEVENT','UID:english-coach-daily@coach','DTSTAMP:20260101T000000Z','DTSTART;TZID=Europe/Paris:20260101T190000','DURATION:PT15M','RRULE:FREQ=DAILY','SUMMARY:🎙️ English Coach — '+S.goal+' min','URL:'+location.origin,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:English Coach','TRIGGER:PT0M','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='english-coach.ics';a.click();};

function paintProfiles(){const stats=CoachLogic.profileStats(CoachLogic.snapshot(localStorage));stats.forEach(s=>{const el=document.querySelector('[data-p="'+s.id+'"] .pdata');if(el)el.textContent=s.hasData?(s.cards+' carte'+(s.cards>1?'s':'')+' · '+s.minutes+' min'+(s.messages?' · '+s.messages+' msg':'')):'Pas encore de données ici';});
 const hint=$('#transferHint');if(!hint)return;const any=stats.some(s=>s.hasData);hint.hidden=any;if(!any)hint.textContent='Aucun progrès dans ce raccourci. Si l’ancien raccourci a encore tes données, ne le supprime pas. Quand il affiche la version '+CoachLogic.APP_VERSION+', exporte la copie et importe-la ici.';}
function downloadJson(name,obj){const blob=new Blob([JSON.stringify(obj)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
async function shareOrDownload(name,obj){const blob=new Blob([JSON.stringify(obj)],{type:'application/json'});const file=new File([blob],name,{type:'application/json'});
 if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){try{await navigator.share({files:[file],title:'English Coach'});return;}catch(e){if(e&&e.name==='AbortError')return;}}
 downloadJson(name,obj);}
let importPlan=null;
function renderImport(plan,parsed){const box=$('#importPreview');if(!box)return;importPlan=plan;const bits=[];
 if(parsed.origin&&parsed.origin!==location.origin)bits.push('<div>Ce fichier vient de '+esc(parsed.origin)+'.</div>');
 const shown=plan.actions.filter(a=>a.op==='add'||a.op==='merge'||a.op==='conflict');
 if(!shown.length)bits.push('<div>Rien de nouveau à ajouter. Les données déjà ici restent.</div>');
 shown.forEach(a=>{
  if(a.op==='conflict')bits.push('<label class="set">'+esc(a.preview)+' <select data-import-key="'+esc(a.key)+'"><option value="current">Garder ce raccourci</option><option value="incoming">Prendre l’ancien</option></select></label>');
  else bits.push('<div>'+esc(a.preview)+'</div>');
 });
 bits.push('<button class="btn" type="button" id="applyImport" style="margin-top:12px">Ajouter cette copie</button>');
 box.innerHTML=bits.join('');
 const btn=$('#applyImport');if(btn)btn.onclick=()=>{const choices={};box.querySelectorAll('[data-import-key]').forEach(s=>{choices[s.dataset.importKey]=s.value;});
  const backup=CoachLogic.snapshot(localStorage);downloadJson('english-coach-avant-import.json',{app:'english-coach',exportedAt:new Date().toISOString(),origin:location.origin,version:CoachLogic.APP_VERSION,keys:backup});
  CoachLogic.applyImport(localStorage,plan,choices);location.reload();};}
const exportBtn=$('#exportBtn');if(exportBtn)exportBtn.onclick=()=>{const keys=CoachLogic.snapshot(localStorage);shareOrDownload('english-coach-copie.json',{app:'english-coach',exportedAt:new Date().toISOString(),origin:location.origin,version:CoachLogic.APP_VERSION,standalone:matchMedia('(display-mode: standalone)').matches||navigator.standalone===true,keys});};
const importFile=$('#importFile');if(importFile)importFile.onchange=async()=>{const file=importFile.files&&importFile.files[0];importFile.value='';if(!file)return;const parsed=CoachLogic.parseTransfer(await file.text());const box=$('#importPreview');
 if(!parsed.ok){if(box)box.textContent=parsed.error;return;}renderImport(CoachLogic.planImport(CoachLogic.snapshot(localStorage),parsed.keys),parsed);};
const buildInfo=$('#buildInfo');if(buildInfo)buildInfo.textContent='Version '+CoachLogic.APP_VERSION+' dans ce raccourci.';
function paintJournal(){const el=$('#journalInfo');if(!el)return;el.textContent=CoachLogic.memoryStatus(historyItems(),Date.now()).summary;}

/* ---------- boot ---------- */
$('#meBtn').textContent=ME.ini;$('#meBtn').className='av '+(PROF||'tom');$('#meBtn').onclick=switchProfile;
$$('#profiles [data-p]').forEach(b=>b.onclick=()=>pickProfile(b.dataset.p));
$('#profiles').hidden=!!PROF;
syncClock(document.visibilityState!=='hidden');
paintProfiles();
paintJournal();
const sessionCtl=$('#sessionCtl');if(sessionCtl)sessionCtl.onclick=()=>{if(clock&&clock.active)pausePractice();else beginPractice();};
syncSettings();syncLookup();refreshHome();renderThread();
if(location.hash.startsWith('#demo')&&location.hash!=='#demo-profiles'){document.head.insertAdjacentHTML('beforeend','<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>');
 const v=location.hash.slice(6).split('@')[0]||'home';const t0=new Date();
 if(!LS.get('demoSeeded')){for(let i=13;i>=0;i--){const d=new Date(t0);d.setDate(d.getDate()-i);if(i%5===3)continue;days[today(d)]={secs:(8+((i*7)%14))*60,words:(8+((i*7)%14))*60*1.6+i*20,errors:30-i,turns:12,uniq:['w'+i]};levels.push({d:today(d),l:i>8?'B1':'B1'});}
  levels.push({d:today(),l:'B2'});['I went to the beach yesterday.','We were very happy.','I agree with you.'].forEach((x,i)=>addCard({type:'fix',en:x,wrong:['I go to the beach yesterday','we was very happy','I am agree'][i],fr:['Je suis allé à la plage hier.','Nous étions très heureux.',"Je suis d'accord avec toi."][i]}));addCard({type:'expr',en:'it paid off',fr:'ça a payé',example:'All that hard work really paid off.'});
  cards.forEach(c=>c.due=Date.now()-1);saveC();for(let i=0;i<1500;i++)vocab.add('v'+i);days[today()].secs=11*60;LS.set('days',days);}
 refreshHome();
 if(v==='chat'){show('chat');bubble("Yesterday I go to the beach with my friends and we was very happy.",'me');renderReply("You went yesterday, and you were happy. What did you actually do once you got there?\nTip : au passé, go devient went, et avec we on dit were.",{mistakes:[{wrong:'I go to the beach yesterday',right:'I went to the beach yesterday.',fr:'Je suis allé à la plage hier.'}],expressions:[{en:'to get up to',fr:'faire (quelque chose)',example:'What did you get up to this weekend?'}]});setState('rec','Listening');}
 if(v==='pressure'){mode={pressure:true,scenario:'interview'};$('#pBanner').hidden=false;$('#pScen').textContent="Entretien d'embauche";$('#pTimer').textContent='12s';show('chat');bubble("Thanks for coming in, Tom. Let's not waste time — why should we hire you over the other ten candidates?",'ai');bubble("Because I have built my own business and I know how to sell products online…",'me');bubble("Sorry, let me stop you there — give me one number. What did you actually achieve?",'ai');setState('rec','Plus que 12s',true);}
 if(v==='review'){show('review');rv.list=[...cards];rv.i=0;rv.end=Date.now()+142e3;showCard();tickReview();const d=diff('I went to the beach yesterday.','I go to the beach yesterday');$('#rResult').innerHTML=`<div style="margin-top:8px">${diffHtml(d)}</div><div style="margin-top:10px;font-weight:600;color:var(--warn)">Presque · Attention au passé : go → went.</div><div style="color:var(--mute);font-size:14px;margin-top:4px">Réponse : I went to the beach yesterday.</div>`;$('#rNext').hidden=false;}
 if(v==='shadow'){show('chat');$('#shTarget').textContent='I went to the beach yesterday.';const d=diff('I went to the beach yesterday.','I want to the beach yesterday');$('#shResult').innerHTML=`<div class="score" style="color:var(--warn)">83%</div><div style="text-align:center">${diffHtml(d)}</div><h3>Prononciation</h3><div>${[['I',95],['went',58],['to',90],['the',88],['beach',72],['yesterday',84]].map(([w,s])=>`<span class="w ${s>=80?'ok':s>=60?'mid':'miss'}">${w} <small>${s}</small></span>`).join(' ')}</div><p style="text-align:center">Presque ! Réécoute et réessaie.</p>`;openSheet('sh-shadow');}
 if(v==='stats')show('stats');if(v==='settings'){syncSettings();openSheet('sh-settings');}if(v==='pressuresheet')openSheet('sh-pressure');}
