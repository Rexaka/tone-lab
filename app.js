import {midiFor,hzFor,median} from './pitch.mjs';
const $=id=>document.getElementById(id), names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','H'], scale=[0,2,4,5,7,9,11,12];
const noteName=m=>names[((m%12)+12)%12]+(Math.floor(m/12)-1);
let context,stream,source,analyser,worker,frame,busy=false,running=false,mode=null,session=0,lastSent=0,oscillator,demoTimer;
let profile=null,cal=null,history=[],lastGood=0,keyboardBase=48,activeMidi=null;
try{const saved=JSON.parse(localStorage.getItem('tone-lab-profile-v1'));if(saved&&saved.a4>=420&&saved.a4<=460&&saved.gate>=.003&&saved.gate<=.08)profile=saved;}catch{}
function renderProfile(){
 $('tuning').textContent=(profile?.a4??440).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' Hz';
 $('instrument').textContent=profile?.family??'Noch kein Profil';
 $('profileDetail').textContent=profile?`${profile.demo?'Demo-Profil · ':''}8 Töne kalibriert · ${profile.offset>=0?'+':''}${profile.offset.toFixed(1)} Cent gegenüber A4 = 440 Hz. ${profile.description} Instrumentart ist eine grobe Klanghinweis-Einschätzung.`:'Die Hüllkurve kann Hinweise auf angeschlagene oder gehaltene Klänge geben. Ein bestimmtes Instrument lässt sich damit nicht sicher bestimmen.';
}
function renderSteps(){ $('steps').replaceChildren(...scale.map((s,i)=>{const el=document.createElement('span');el.className='step'+(cal?.stage==='notes'?(i<cal.index?' done':i===cal.index?' current':''):'');el.textContent=names[s%12];return el;}));}
function keyboard(base){
 keyboardBase=base; const root=$('keyboard');root.replaceChildren();let whiteIndex=0;const whites=21;
 for(let m=base;m<base+36;m++){
 const black=[1,3,6,8,10].includes(m%12),key=document.createElement('span');key.className='key '+(black?'black':'white');key.dataset.midi=m;key.textContent=noteName(m);key.setAttribute('aria-label',noteName(m));
 if(black){key.style.width=(100/whites*.62)+'%';key.style.left=((whiteIndex-.31)*100/whites)+'%';}else whiteIndex++;
 root.append(key);
 }
 $('rangeLabel').textContent=noteName(base)+' – '+noteName(base+35);
}
function highlight(m){if(m!==null&&(m<keyboardBase||m>=keyboardBase+36))keyboard(Math.max(24,Math.min(72,Math.floor((m-12)/12)*12)));if(m===activeMidi)return;activeMidi=m;for(const k of $('keyboard').children)k.classList.toggle('active',Number(k.dataset.midi)===m);$('keyboard').setAttribute('aria-label',m===null?'Klaviertastatur, kein Ton erkannt':'Erkannter Ton: '+noteName(m));}
function clearNote(){highlight(null);$('note').textContent='—';$('frequency').textContent=running?'Warte auf einen Ton':'Mikrofon pausiert';$('noteDetail').textContent='65–2.000 Hz · etwa C2–H6';$('confidence').textContent='—';$('cents').textContent='— Cent';$('needle').style.opacity=0;}
function error(message){$('error').hidden=!message;$('error').textContent=message;}
function cancelCalibration(message='Kalibrierung abgebrochen. Du kannst sie erneut starten.'){
 if(!cal)return;cal=null;renderSteps();$('octave').disabled=false;$('calibrate').textContent='Kalibrierung starten';$('calInstruction').textContent=message;
}
async function stop(){
 running=false;session++;cancelAnimationFrame(frame);clearInterval(demoTimer);demoTimer=null;worker?.terminate();worker=null;busy=false;
 stream?.getTracks().forEach(t=>t.stop());stream=null;
 if(oscillator){try{oscillator.stop();}catch{}oscillator=null;}
 source?.disconnect();source=null;if(context){await context.close().catch(()=>{});context=null;}analyser=null;
 cancelCalibration();history=[];mode=null;$('mic').textContent='Mikrofon aktivieren';$('demo').textContent='Demo anhören';$('demo').disabled=false;$('mic').disabled=false;$('calibrate').disabled=true;$('status').textContent='Pausiert';$('statusDot').classList.remove('active');$('sourceBadge').textContent='EINZELTÖNE';$('level').style.width='0';clearNote();
}
async function start(kind){
 if(running&&mode===kind){await stop();return;}
 await stop();error('');const thisSession=session; $('mic').disabled=true;$('demo').disabled=true;
 try{
 if(!window.isSecureContext)throw new Error('Bitte öffne die App über HTTPS oder localhost, damit das Mikrofon verfügbar ist.');
 context=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});await context.resume();
 if(kind==='mic'){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error('Dieser Browser bietet hier keinen Mikrofonzugriff an. Bitte Chrome, Firefox oder Safari verwenden.');
 $('status').textContent='Mikrofonfreigabe wartet …';
 const acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
 if(session!==thisSession){acquired.getTracks().forEach(t=>t.stop());return;}
 stream=acquired;source=context.createMediaStreamSource(stream);
 stream.getAudioTracks()[0].addEventListener('ended',()=>{if(running&&mode==='mic'){stop();error('Der Mikrofonzugriff wurde beendet. Bitte erneut aktivieren.');}},{once:true});
 }else{
 oscillator=context.createOscillator();const real=new Float32Array([0,1,.35,.15,.08]),imag=new Float32Array(5);oscillator.setPeriodicWave(context.createPeriodicWave(real,imag));source=oscillator;
 const volume=context.createGain();volume.gain.value=.06;oscillator.connect(volume);volume.connect(context.destination);oscillator.start();
 let step=0;oscillator.frequency.value=hzFor(60);demoTimer=setInterval(()=>{if(!oscillator||!context)return;step=(step+1)%8;oscillator.frequency.setValueAtTime(hzFor(60+scale[step]),context.currentTime);},1500);
 }
 analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0;source.connect(analyser);
 worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{busy=false;if(running)receive(data,performance.now());};worker.onerror=()=>{stop();error('Die Audioanalyse konnte nicht gestartet werden. Bitte Seite neu laden und erneut versuchen.');};
 running=true;mode=kind;lastGood=0;$('mic').textContent=kind==='mic'?'Mikrofon stoppen':'Mikrofon aktivieren';$('demo').textContent=kind==='demo'?'Demo stoppen':'Demo anhören';$('mic').disabled=false;$('demo').disabled=false;$('calibrate').disabled=false;$('statusDot').classList.add('active');$('status').textContent=kind==='demo'?'Demo läuft · synthetische Töne':'Mikrofon hört zu';$('sourceBadge').textContent=kind==='demo'?'DEMO · KEIN MIKROFON':'LIVE · MIKROFON';
 loop();
 }catch(e){await stop();const messages={NotAllowedError:'Kein Mikrofonzugriff. Erlaube ihn in den Website-Einstellungen deines Browsers und versuche es erneut.',NotFoundError:'Kein Mikrofon gefunden. Bitte verbinde ein Mikrofon.',NotReadableError:'Das Mikrofon ist gerade nicht verfügbar. Prüfe, ob eine andere App es verwendet.'};error(messages[e.name]??e.message);}
}
function loop(now=0){
 if(!running||!analyser)return;frame=requestAnimationFrame(loop);
 if(busy||now-lastSent<55)return;lastSent=now;
 const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);draw(samples);
 busy=true;worker.postMessage({samples,rate:context.sampleRate,gate:cal?.stage==='noise'?.003:(profile?.gate??.006)},[samples.buffer]);
}
function draw(samples){const canvas=$('wave'),width=Math.round(canvas.clientWidth*devicePixelRatio);if(canvas.width!==width)canvas.width=width;const c=canvas.getContext('2d'),h=canvas.height;c.clearRect(0,0,width,h);c.strokeStyle='#9bc47d';c.lineWidth=1.3;c.beginPath();for(let i=0;i<width;i++){const y=h/2+samples[Math.floor(i/width*samples.length)]*h*.42;i?c.lineTo(i,y):c.moveTo(i,y);}c.stroke();}
function receive(result,now){
 $('level').style.width=Math.min(100,Math.max(0,(20*Math.log10(Math.max(result.rms,.00001))+65)/65*100))+'%';
 if(cal)calibrateFrame(result,now);
 if(!result.frequency||result.confidence<.86){if(now-lastGood>220){history=[];clearNote();}return;}
 lastGood=now;const midi=midiFor(result.frequency,profile?.a4??440);const nearest=Math.round(midi);
 history.push({midi,nearest});if(history.length>4)history.shift();
 if(history.length<3||history.slice(-3).some(x=>x.nearest!==nearest))return;
 const smooth=median(history.filter(x=>x.nearest===nearest).map(x=>x.midi)),cents=(smooth-nearest)*100;
 $('note').textContent=noteName(nearest);$('frequency').textContent=result.frequency.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' Hz';$('noteDetail').textContent='MIDI '+nearest+' · '+(profile?'kalibrierte Stimmung':'Standardstimmung');$('confidence').textContent=Math.round(result.confidence*100)+' %';$('cents').textContent=(cents>=0?'+':'')+cents.toFixed(1)+' Cent';$('needle').style.left=(50+cents)+'%';$('needle').style.opacity=1;highlight(nearest);
}
function beginCalibration(){
 if(cal){cancelCalibration();return;}
 if(!running)return;
 if(mode==='demo'){
 // Restart demo sequence after noise phase; synthetic silence is provided by gainless detector gating below.
 cancelCalibration('Die Demo zeigt die Tonerkennung. Für ein eigenes Klangprofil bitte das Mikrofon aktivieren.');
 $('calInstruction').textContent='Für die Kalibrierung bitte auf Mikrofon wechseln. Die Demo verwendet synthetische Töne.';return;
 }
 cal={stage:'noise',start:performance.now(),noise:[],index:0,root:Number($('octave').value),offsets:[],decays:[],hold:[],holdStart:0};
 $('octave').disabled=true;$('calibrate').textContent='Kalibrierung abbrechen';$('calInstruction').textContent='Bitte 2 Sekunden still sein. Wir messen das Hintergrundgeräusch.';renderSteps();
}
function calibrateFrame(r,now){
 if(cal.stage==='noise'){
 cal.noise.push(r.rms);if(now-cal.start<2000)return;
 const noise=median(cal.noise);if(noise>.025){cancelCalibration('Zu laut für eine zuverlässige Kalibrierung. Bitte in ruhigerer Umgebung erneut starten.');return;}
 cal.gate=Math.min(.08,Math.max(.004,noise*3));cal.stage='notes';cal.start=now;renderSteps();$('calInstruction').textContent='Spiele jetzt '+noteName(cal.root)+' und halte den Ton etwa 1 Sekunde.';return;
 }
 if(now-cal.start>90000){cancelCalibration('Zeitlimit erreicht. Du kannst die Tonleiter erneut starten.');return;}
 const expected=cal.root+scale[cal.index],raw=r.frequency?midiFor(r.frequency):null;
 if(raw===null||r.rms<cal.gate||r.confidence<.9||Math.abs(raw-expected)>.45){cal.hold=[];cal.holdStart=0;return;}
 if(!cal.holdStart)cal.holdStart=now;cal.hold.push({offset:(raw-expected)*100,rms:r.rms});
 if(now-cal.holdStart<650||cal.hold.length<7)return;
 cal.offsets.push(median(cal.hold.map(x=>x.offset)));
 const first=median(cal.hold.slice(0,3).map(x=>x.rms)),last=median(cal.hold.slice(-3).map(x=>x.rms));cal.decays.push(last/Math.max(first,.00001));cal.index++;cal.hold=[];cal.holdStart=0;
 if(cal.index<8){$('calInstruction').textContent='Erkannt! Jetzt '+noteName(cal.root+scale[cal.index])+' spielen und halten.';renderSteps();return;}
 const offset=median(cal.offsets),decay=median(cal.decays),percussive=decay<.72;
 profile={a4:440*2**(offset/1200),gate:cal.gate,offset,family:percussive?'Abklingender Klang':'Gehaltener / langsam abklingender Klang',description:percussive?'Hinweis auf angeschlagene oder gezupfte Töne (z. B. Klavier, Gitarre).':'Passt etwa zu Orgel, Blasinstrument oder lang klingendem Keyboard-Sound.'};
 try{localStorage.setItem('tone-lab-profile-v1',JSON.stringify(profile));}catch{}
 cal=null;$('octave').disabled=false;$('calibrate').textContent='Erneut kalibrieren';$('calInstruction').textContent='Kalibrierung abgeschlossen. Spiele jetzt beliebige einzelne Töne. Dein Profil ist auf diesem Gerät gespeichert.';renderSteps();for(const el of $('steps').children)el.className='step done';renderProfile();history=[];
}
$('mic').onclick=()=>start('mic');$('demo').onclick=()=>start('demo');$('calibrate').onclick=beginCalibration;
$('reset').onclick=()=>{cancelCalibration('Profil zurückgesetzt. Für die Kalibrierung halte die acht Töne der Tonleiter einzeln.');profile=null;try{localStorage.removeItem('tone-lab-profile-v1');}catch{}renderProfile();renderSteps();history=[];};
$('octave').onchange=renderSteps;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});
window.addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());context?.close();worker?.terminate();});
keyboard(48);renderSteps();renderProfile();
