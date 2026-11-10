import { CloudRoom, cloudConfigured, planTeams } from './cloud.js';
import { stationId, isStale, boardReserve, boardStart, boardChop, boardCancel, boardTake, CHOPS_DEFAULT, CHOP_OPTIONS, cookStart, cookPhase, cookProgress, cookTake, washStart, washFinish, plateWashed, defaultPlates, MIX_PRESSES, WASH_PRESSES } from './stations.js';
import { newPlate, isPlate, contentsOf, plateMatch, missingOf, rackTake, rackReturn, plateDirtied, tablePut, tableAddCheck, tableAdd, tableLift } from './plates.js';
import { ordersTick, activeOrders, serveOrder, patience, patienceColor, isRush, fairScore, ORDER_TIME_OPTIONS, ORDER_TIME_DEFAULT, RUSH_SPEED, MAX_ORDERS } from './orders.js';
import { newItem, heldString, prepare, checkReturn, checkStore, storePut, storeTake, storageList, checkTrash, applyPenalty, STORAGE_MAX, TRASH_PENALTY } from './items.js';
const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),g=canvas.getContext('2d');
const W=18,H=12,T=48,OX=68,OY=47;
const COLOR=['#e77e95','#56c5dd','#fac268','#9d88e9','#63c49b'];
const FOOD={lettuce:{emoji:'🥬',name:'양상추',prep:'cut'},tomato:{emoji:'🍅',name:'토마토',prep:'cut'},meat:{emoji:'🥩',name:'고기',prep:'cook'},flour:{emoji:'🥣',name:'밀가루',prep:'mix'},berry:{emoji:'🍓',name:'딸기',prep:'cut'},cheese:{emoji:'🧀',name:'치즈',prep:'cut'},bread:{emoji:'🍞',name:'빵',prep:'cook'},milk:{emoji:'🥛',name:'우유',prep:'mix'},dough:{emoji:'🫓',name:'반죽',prep:'cook'}};
const RECIPES=[
 {emoji:'🥗',title:'무지개 샐러드',desc:'양상추와 토마토를 손질해요',items:['lettuce','tomato']},
 {emoji:'🍔',title:'왕왕 햄버거',desc:'고기와 빵을 맛있게 준비해요',items:['meat','bread']},
 {emoji:'🍰',title:'딸기 생크림 케이크',desc:'밀가루와 딸기를 준비해요',items:['flour','berry']},
 {emoji:'🍕',title:'치즈 폭탄 피자',desc:'반죽을 굽고 치즈를 손질해요',items:['dough','cheese']},
 {emoji:'🥤',title:'분홍빛 딸기라테',desc:'딸기를 손질하고 우유를 섞어요',items:['berry','milk']},
 {emoji:'🥙',title:'싱싱 치즈 샌드',desc:'양상추와 치즈를 손질해요',items:['lettuce','cheese']}
];
// 주방 배치 (2.0 새 구조): 벽을 따라 이어진 조리대 + 가운데 Z자 섬. 이 글자 지도만 고치면 2D·3D 양쪽 배치가 함께 바뀝니다.
// # 벽  . 바닥  = 빈 조리대  대문자 = 설비 (KIND 참고). 보관대·싱크대·쓰레기통은 2~4단계에서 기능이 붙습니다.
const LAYOUT=[
 '##################',
 '#==LT=KK=PPAHB=S=#',
 '#=..............=#',
 '#M..............I#',
 '#=..............=#',
 '#F...==RR=......D#',
 '#=.......====...=#',
 '#Y..............=#',
 '#=..............=#',
 '#=..............X#',
 '#..=OO==VV==ZZ=..#',
 '##################'
];
const KIND={'=':['counter','조리대'],S:['sink','싱크대'],K:['cut','도마'],P:['plate','플레이팅대'],O:['cook','화덕'],V:['serve','서빙 벨'],Z:['mix','믹서'],A:['rack','접시대'],R:['storage','보관대'],X:['trash','쓰레기통'],
 L:['bin','양상추 상자','lettuce'],T:['bin','토마토 상자','tomato'],H:['bin','치즈 상자','cheese'],B:['bin','빵 상자','bread'],M:['bin','고기 상자','meat'],F:['bin','밀가루 상자','flour'],Y:['bin','딸기 상자','berry'],I:['bin','우유 상자','milk'],D:['bin','반죽 상자','dough']};
const STATIONS=[];
LAYOUT.forEach((row,y)=>[...row].forEach((ch,x)=>{const k=KIND[ch];if(k)STATIONS.push({x,y,type:k[0],label:k[1],...(k[2]?{food:k[2]}:{})})}));
const PASSIVE=new Set(['counter']); // 아직 E로 쓸 수 없는 설비
const blocked=new Set(STATIONS.map(s=>s.x+','+s.y));
let mode='demo',cloud=null,meta=null,players={},members={},allTeams={},teamData=null,localState=null,myUid='demo',seat=0,team=0,roundStarted=false,ended=false,last=performance.now(),totalTime=180,nowTime=180,activeQuestion=null,unit='all',muted=false,toastTimeout=null,teacher=false,currentMode='coop',sentPhase='',helpBefore=false;
let p={x:7,y:7,dir:'down',held:'',item:null,seat:0,name:'꼬마셰프',updatedAt:0};
// 들고 있는 재료는 p.item(객체)이 기준. p.held(문자열)는 화면·온라인 동기화용으로 여기서만 만들어집니다.
function setHeld(item){p.item=item?{...item,loc:'held'}:null;p.held=heldString(p.item)}
let pickerOpen=false,fx=[],popups=[];
const getStorage=()=>teamData?.storage||{};
// ── 도마 상태 (3단계). 규칙은 stations.js, 여기서는 저장 위치(혼자 체험=메모리, 온라인=Firebase 트랜잭션)만 고릅니다 ──
const srvNow=()=>Date.now()+(cloud?.serverOffset||0);
const boardOf=st=>teamData?.stations?.[stationId(st)]||null;
async function stationOp(st,fn){
 const id=stationId(st);
 if(mode!=='demo')return cloud.stationOp(id,fn);
 teamData.stations=teamData.stations||{};
 const out=fn(teamData.stations[id]||null);
 if(!out)return null;
 if(out.next)teamData.stations[id]=out.next;else delete teamData.stations[id];
 return out;
}
let chopNeed=CHOPS_DEFAULT;try{const v=Number(localStorage.getItem('mathcook-chops'));if(CHOP_OPTIONS.includes(v))chopNeed=v}catch{}
let chopChain=Promise.resolve(),cookSeen={};
// 화덕 상태가 바뀌는 순간 소리로 알림 (익음 → 경고 → 탐). 상태 자체는 시각으로 계산되므로 여기서는 알리기만 함
function cookAlerts(){const now=srvNow();for(const st of STATIONS){if(st.type!=='cook')continue;const id=stationId(st),b=boardOf(st),ph=b?cookPhase(b,now):'idle';if(cookSeen[id]!==ph){const prev=cookSeen[id];cookSeen[id]=ph;if(prev===undefined)continue;if(ph==='ready')sound('success');else if(ph==='warning'||ph==='burnt')sound('error')}}}
function chopSound(){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),gn=audio.createGain(),tm=audio.currentTime;o.type='square';o.frequency.setValueAtTime(240,tm);o.frequency.exponentialRampToValueAtTime(90,tm+.06);gn.gain.setValueAtTime(.07,tm);gn.gain.exponentialRampToValueAtTime(.001,tm+.08);o.connect(gn).connect(audio.destination);o.start(tm);o.stop(tm+.09)}catch{}}
async function useBoard(st){
 const b=boardOf(st),it=p.item,now=srvNow();
 // 내가 연타 중인 도마: 누를 때마다 1회 (키를 꾹 누르는 반복 입력은 keydown에서 이미 걸러짐)
 if(b&&b.state==='working'&&b.owner===myUid&&!isStale(b,now)){
  chopChain=chopChain.then(async()=>{
   const r=await stationOp(st,s=>boardChop(s,myUid,srvNow()));
   if(!r)return;
   chopSound();celebrate(st.x+.5,st.y+.3,r.done?12:2);
   if(r.done){toast((st.type==='mix'?'🥣 ':'🔪 ')+FOOD[r.next.item.kind].name+' 준비 완료! E로 집어요.');sound('success')}
   updateUI();
  }).catch(e=>console.warn('연타 동기화',e));
  return;
 }
 if(b&&b.state==='reserved'&&b.owner===myUid&&!isStale(b,now)){askMath(b.item.kind,st.type,st);return}   // 새로고침 뒤 다시 문제 열기
 if(b&&(b.state==='ready'||isStale(b,now))){
  if(it){toast('손이 비어 있어야 재료를 집을 수 있어요.');sound('error');return}
  pending=true;
  try{const r=await stationOp(st,s=>boardTake(s,srvNow()));
   if(r){setHeld(r.item);await updatePlayer(true);toast(FOOD[r.item.kind].emoji+' '+FOOD[r.item.kind].name+(r.item.state==='raw'?'을(를) 회수했어요.':' 완성! 🍽️ 접시로 가져가요.'));sound('pickup')}
   else toast('다른 친구가 먼저 집었어요!');
  }catch(e){toast('집기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 if(b){toast(`${b.name||'다른 친구'}님이 쓰고 있어요.`);sound('error');return}
 if(!it){toast('재료를 들고 오세요!');return}
 if(it.state!=='raw'){toast(it.state==='burnt'?'탄 재료는 🗑️ 쓰레기통에 버려야 해요.':'이미 준비된 재료예요. 🍽️ 접시에 담아 주세요!');return}
 if(FOOD[it.kind].prep!==st.type){let txt={cut:'도마에서 손질할',cook:'화덕에서 구울',mix:'믹서에서 섞을'}[FOOD[it.kind].prep];toast(`이 재료는 ${txt} 수 있어요!`);sound('error');return}
 pending=true;
 try{const r=await stationOp(st,s=>boardReserve(s,it,myUid,p.name,srvNow()));
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);askMath(it.kind,st.type,st)}
  else toast('다른 친구가 먼저 차지했어요!');
 }catch(e){toast('도마 사용에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// ── 화덕: 올려두면 시간이 알아서 흐름. 익으면 직접 꺼내고, 늦으면 탐 ──
async function useCooker(st){
 const b=boardOf(st),it=p.item,now=srvNow();
 if(b&&b.state==='reserved'&&b.owner===myUid&&!isStale(b,now)){askMath(b.item.kind,'cook',st);return}
 if(b){
  const ph=isStale(b,now)?'stale':cookPhase(b,now);
  if(ph==='reserved'){toast(`${b.name||'다른 친구'}님이 쓰고 있어요.`);sound('error');return}
  if(ph==='cooking'){toast(it?'화덕이 사용 중이에요. 다른 화덕을 써요.':'아직 굽는 중이에요. 조금만 기다려요!');return}
  if(it){toast('손이 비어 있어야 꺼낼 수 있어요.');sound('error');return}
  pending=true;
  try{const r=await stationOp(st,s=>cookTake(s,srvNow()));
   if(r){setHeld(r.item);await updatePlayer(true);const nm=FOOD[r.item.kind].name;
    if(r.item.state==='burnt'){toast('🔥 '+nm+'이(가) 타 버렸어요. 🗑️ 쓰레기통에 버려요.');sound('error')}
    else if(r.item.state==='raw'){toast(nm+'을(를) 회수했어요.');sound('pickup')}
    else{toast('🔥 '+nm+' 완성! 🍽️ 접시로 가져가요.');sound('success');celebrate(st.x+.5,st.y+.3,8)}}
   else toast('다른 친구가 먼저 꺼냈어요!');
  }catch(e){toast('꺼내기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 if(!it){toast('구울 재료를 들고 오세요!');return}
 if(it.state!=='raw'){toast(it.state==='burnt'?'탄 재료는 🗑️ 쓰레기통에 버려야 해요.':'이미 준비된 재료예요. 🍽️ 접시에 담아 주세요!');return}
 if(FOOD[it.kind].prep!=='cook'){let txt={cut:'도마에서 손질할',mix:'믹서에서 섞을'}[FOOD[it.kind].prep];toast(`이 재료는 ${txt} 수 있어요!`);sound('error');return}
 pending=true;
 try{const r=await stationOp(st,s=>boardReserve(s,it,myUid,p.name,srvNow()));
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);askMath(it.kind,'cook',st)}
  else toast('다른 친구가 먼저 차지했어요!');
 }catch(e){toast('화덕 사용에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// ── 싱크대: 더러운 접시를 문질러 씻으면 깨끗한 접시가 됨 (접시 순환은 5단계에서 연결) ──
const getPlates=()=>teamData?.plates||defaultPlates();
async function washedOne(st){
 await stationOp(st,s=>washFinish(s));
 let ok;
 if(mode!=='demo')ok=await cloud.plateWashed();else{const n=plateWashed(teamData.plates);ok=Boolean(n);if(ok)teamData.plates=n}
 if(ok){toast('✨ 깨끗한 접시 +1');sound('success');celebrate(st.x+.5,st.y+.3,8)}
 updateUI();
}
async function useSink(st){
 const b=boardOf(st),now=srvNow();
 if(b&&b.state==='ready'){await washedOne(st);return}                 // 마무리가 끊긴 경우 누구나 마저 처리
 if(b&&isStale(b,now)){await stationOp(st,s=>boardTake(s,srvNow()));updateUI();return}
 if(b&&b.state==='working'&&b.owner===myUid){
  chopChain=chopChain.then(async()=>{
   const r=await stationOp(st,s=>boardChop(s,myUid,srvNow()));
   if(!r)return;
   chopSound();celebrate(st.x+.5,st.y+.3,2);
   if(r.done)await washedOne(st);else updateUI();
  }).catch(e=>console.warn('설거지 동기화',e));
  return;
 }
 if(b){toast(`${b.name||'다른 친구'}님이 설거지하고 있어요.`);return}
 if(p.item){toast('손이 비어 있어야 설거지할 수 있어요.');sound('error');return}
 if(!(getPlates().dirty>0)){toast('씻을 접시가 없어요.');return}
 if(mode==='demo'&&!teamData.plates)teamData.plates=defaultPlates();
 const r=await stationOp(st,s=>washStart(s,myUid,p.name,Math.min(chopNeed,WASH_PRESSES),srvNow()));
 toast(r?`🫧 E나 Space를 ${r.next.need}번 눌러 접시를 씻어요!`:'다른 친구가 먼저 시작했어요.');updateUI();
}
// 문제 창을 닫을 때: 도마에 올려둔 재료를 손으로 되돌리고 도마를 비움 (예약이 남지 않게)
async function abortQuestion(){
 const q=activeQuestion;if(!q)return;activeQuestion=null;hide('questionOverlay');
 if(q.board&&!q.solving){try{const r=await stationOp(q.board,s=>boardCancel(s,myUid));if(r&&!p.item){setHeld(r.item);await updatePlayer(true)}}catch(e){console.warn('도마 취소',e)}updateUI()}
}
function flyFx(held,from,to){fx.push({held,x0:from.x,y0:from.y,x1:to.x+.5,y1:to.y+.5,t:performance.now()})}
const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 분수는 항상 분자가 위, 분모가 아래인 세로 모양으로 표시
const fracHTML=t=>esc(t).replace(/(\d+)\/(\d+)/g,'<span class="frac"><span>$1</span><span>$2</span></span>');
const setMath=(id,t)=>{$(id).innerHTML=fracHTML(t)};
const keys=new Set();
let bots=[{x:10,y:7,seat:1,dir:'left',name:'도우미1',held:'',tx:10,ty:5},{x:6,y:7,seat:2,dir:'right',name:'도우미2',held:'',tx:7,ty:9},{x:11,y:8,seat:3,dir:'up',name:'도우미3',held:'',tx:10,ty:2}];
let clock=0,particles=[],elapsed=0,pending=false,ambience=0,audio=null,rivalServed=0;
const show=id=>$(id).classList.remove('hidden');
const hide=id=>$(id).classList.add('hidden');
const setText=(id,t)=>$(id).textContent=t;
const clamp=(a,min,max)=>Math.max(min,Math.min(max,a));
const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const blankGroup=()=>({score:0,served:0,correct:0,wrong:0,orderSeq:0,orders:{}});
const safeName=s=>String(s||'꼬마셰프').trim().slice(0,12)||'꼬마셰프';
function toast(t){setText('toast',t);$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function sound(type){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();let osc=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;osc.type=type==='success'?'triangle':'sine';osc.frequency.setValueAtTime(type==='success'?523:type==='error'?185:390,time);osc.frequency.exponentialRampToValueAtTime(type==='success'?784:type==='error'?125:510,time+.14);gain.gain.setValueAtTime(.08,time);gain.gain.exponentialRampToValueAtTime(.001,time+.21);osc.connect(gain).connect(audio.destination);osc.start(time);osc.stop(time+.22)}catch{}}
function getSide(){if(currentMode!=='duel')return 'ALL';const list=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);return (list.findIndex(([uid])=>uid===myUid)<2)?'A':'B'}
function getGroup(side=getSide()){return teamData?.groups?.[side]||blankGroup()}
// ── 6단계: 주문 대기열. 규칙은 orders.js, 여기서는 설정값과 저장 위치만 정함 ──
const NO_ORDER={emoji:'⏳',title:'주문을 기다리는 중',desc:'곧 새 주문이 들어와요',items:[]};
const PREP_ICON={cut:'🔪',cook:'🔥',mix:'🥣'};
const orderCfg=()=>({startedAt:meta?.startedAt||0,durationMs:(meta?.duration||180)*1000,orderTimeMs:meta?.orderTime||ORDER_TIME_DEFAULT,recipeCount:RECIPES.length});
const liveOrders=(side=getSide())=>activeOrders(getGroup(side),srvNow());
const liveRecipes=()=>liveOrders().map(o=>RECIPES[o.recipeId]);
function order(side=getSide()){const o=liveOrders(side)[0];return o?RECIPES[o.recipeId]:NO_ORDER}   // 가장 먼저 온 주문
let tickBusy=false,lastTick=0,rushNow=false,myServed=0,cardKey='';
function orderTick(t){
 if(t-lastTick<200||tickBusy||!meta?.startedAt)return;lastTick=t;
 if(mode!=='demo'&&cloud?.role!=='student')return;
 const side=getSide(),change=ordersTick(getGroup(side),srvNow(),orderCfg());
 if(!change)return;
 if(mode==='demo'){teamData.groups[side]=change;updateUI()}
 else{tickBusy=true;cloud.groupOp(side,old=>ordersTick(old,srvNow(),orderCfg())).catch(e=>console.warn('주문 갱신',e)).finally(()=>{tickBusy=false})}
}
function rushSound(){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();for(let i=0;i<3;i++){const o=audio.createOscillator(),gn=audio.createGain(),tm=audio.currentTime+i*.22;o.type='sawtooth';o.frequency.setValueAtTime(660,tm);o.frequency.linearRampToValueAtTime(880,tm+.16);gn.gain.setValueAtTime(.06,tm);gn.gain.exponentialRampToValueAtTime(.001,tm+.2);o.connect(gn).connect(audio.destination);o.start(tm);o.stop(tm+.21)}}catch{}}
function setRush(on){if(rushNow===on)return;rushNow=on;$('stageWrap').classList.toggle('rush',on);$('rushLabel').classList.toggle('hidden',!on);if(on){rushSound();toast('🔥 러시타임! 주문이 몰려와요. 발이 빨라졌어요!')}}
// 왼쪽 위 주문 카드: 주문 목록이 바뀔 때만 다시 만들고, 게이지와 '담김' 표시는 매 프레임 갱신
function drawOrderCards(){
 const list=roundStarted?liveOrders():[],key=list.map(o=>o.id).join(','),now=srvNow(),holder=$('orderCards');
 if(key!==cardKey){cardKey=key;holder.replaceChildren(...list.map(o=>{const r=RECIPES[o.recipeId],c=document.createElement('article');c.className='ocard';c.dataset.id=o.id;
   c.innerHTML='<div class="oc-tape"></div><div class="oc-dish"></div><h3></h3><div class="oc-needs"></div><div class="oc-bar"><b></b></div>';
   c.querySelector('.oc-dish').textContent=r.emoji;c.querySelector('h3').textContent=r.title;
   c.querySelector('.oc-needs').replaceChildren(...r.items.map(k=>{const n=document.createElement('span');n.className='oc-need';n.dataset.kind=k;n.title=FOOD[k].name;n.innerHTML='<em></em><i></i>';n.querySelector('em').textContent=FOOD[k].emoji;n.querySelector('i').textContent=PREP_ICON[FOOD[k].prep];return n}));return c}))}
 const plated=platedKinds();
 for(const c of holder.children){const o=list.find(v=>v.id===c.dataset.id);if(!o)continue;const f=patience(o,now),b=c.querySelector('.oc-bar b');b.style.width=(f*100).toFixed(1)+'%';b.className=patienceColor(f);c.classList.toggle('hurry',f<=.25);for(const n of c.querySelectorAll('.oc-need'))n.classList.toggle('done',plated.has(n.dataset.kind))}
}

function getName(){return safeName($('nicknameInput').value)}
function setRoomStatus(){setText('connectionLabel',mode==='demo'?'혼자 체험하기':cloud?.code?'학급방 '+cloud.code:'학급방');$('connectionDot').classList.toggle('online',mode!=='demo')}
function playerColor(n){return COLOR[n%COLOR.length]}
function resetLocal(kind="coop"){
 mode='demo';cloud=null;myUid='demo';seat=0;team=0;members={demo:{name:p.name,seat:0,team:'0'},bot1:{name:'도우미1',seat:1,team:'0'},bot2:{name:'도우미2',seat:2,team:'0'},bot3:{name:'도우미3',seat:3,team:'0'}};currentMode=kind;
 const demoSec=Math.max(20,Math.min(600,Number(new URLSearchParams(location.search).get('demoSeconds'))||180));   // 주소 뒤에 ?demoSeconds=60 을 붙이면 체험 시간을 바꿀 수 있음
 meta={phase:'playing',mode:kind,unit,startedAt:Date.now(),duration:demoSec,orderTime:ORDER_TIME_OPTIONS[$('orderTimeSelect').value]||ORDER_TIME_DEFAULT,sizes:[4],count:4};
 teamData={groups:{ALL:blankGroup(),A:blankGroup(),B:blankGroup()},storage:{},stations:{},plates:defaultPlates()};cookSeen={};popups=[];fx=[];closePicker();
 players={demo:{...p}};allTeams={0:{data:teamData}};totalTime=demoSec;nowTime=demoSec;roundStarted=true;ended=false;pending=false;elapsed=0;rivalServed=0;activeQuestion=null;myServed=0;cardKey='';setRush(false);
 hide('menuOverlay');hide('setupOverlay');hide('endOverlay');hide('lobbyOverlay');hide('questionOverlay');
 setRoomStatus();setText('modeLabel',kind==='duel'?'⚔️ 봇 대결 체험':'🤝 연습용 협동');setText('roundLabel','🍰 디저트 주방');updateUI();toast('요리사 출동! 재료 상자에서 시작해 보세요 🍓');
}
function startDemo(kind='coop'){unit=$('unitSelect').value;p={x:7,y:7,dir:'down',held:'',item:null,name:getName(),seat:0,updatedAt:Date.now()};resetLocal(kind)}
function setModeUI(){let nm={coop:'🤝 협동 주방',duel:'⚔️ 2대2 배틀',class:'🏆 학급 대항전'};setText('modeLabel',nm[currentMode]||nm.coop);setText('roundLabel','🍰 '+(['디저트 주방','회전 주방','축제 주방'][Math.floor(elapsed/110)%3]));}
function updateUI(){
 if(!roundStarted)return;
 let side=getSide(),grp=getGroup(side),rec=order(side);
 const plated=platedKinds();
 setText('orderEmoji',rec.emoji);setText('orderTitle',rec.title);setText('orderDesc',rec.desc);setText('orderCount','ORDER '+String((grp.served||0)+1).padStart(2,'0'));
 $('orderIngredients').replaceChildren(...rec.items.map(k=>{let e=document.createElement('div');e.className='ingredient-chip'+(plated.has(k)?' done':'');e.innerHTML='<span>'+FOOD[k].emoji+'</span><div>'+FOOD[k].name+'<small style="display:block;color:#afc6d5">'+(plated.has(k)?'✅ 접시에 담김':'준비해서 접시에 담기')+'</small></div>';return e}));
 let roster=mode==='demo'?[{id:'demo',...p},...bots.map((b,i)=>({id:'bot'+i,...b}))]:Object.entries(players||{}).map(([id,v])=>({id,...v})).sort((a,b)=>a.seat-b.seat);
 $('playerRoster').replaceChildren(...roster.map(v=>{const e=document.createElement('div');e.className='roster-item';let side=currentMode==='duel'?(v.seat%4<2?'A팀':'B팀'):(v.id===myUid?'나':'팀원');e.innerHTML='<span class="roster-avatar" style="background:'+playerColor(v.seat)+'">🍳</span><span class="roster-name"></span><span class="roster-team">'+side+'</span>';e.querySelector('.roster-name').textContent=v.name+(v.id===myUid?' ✨':'');return e}));
 setText('scoreLabel',grp.score||0);setText('scoreDetail',`완성 요리 ${grp.served||0}개 · 수학 정답 ${grp.correct||0}개`+((grp.combo||0)>0&&srvNow()-(grp.lastServeAt||0)<=14000?` · 🔥 콤보 ${grp.combo}`:''));
 if(currentMode==='duel'){let a=getGroup('A'),b=getGroup('B');$('teamRanking').innerHTML=`<div class="ranking-item">🌸 A팀 <b>${a.score||0}점</b></div><div class="ranking-item">🌊 B팀 <b>${b.score||0}점</b></div>`}
 else if(meta?.sizes?.length>1){let ranking=Object.entries(allTeams).map(([id,v])=>{let d=v?.data?.groups?.ALL||{};let size=meta.sizes[Number(id)]||4;return {id,score:d.score||0,normalized:fairScore(d.score,size)}}).sort((a,b)=>b.normalized-a.normalized);$('teamRanking').replaceChildren(...ranking.map(v=>{let e=document.createElement('div');e.className='ranking-item';e.textContent=`${Number(v.id)+1}팀 · 보정 ${v.normalized}점`;return e}));}
 else $('teamRanking').textContent='함께 만들면 점수가 올라가요!';
 const hi=p.item;setText('heldLabel',!hi?'✋ 빈손':isPlate(hi)?`✋ 🍽️ 접시 · ${contentsOf(hi).length?contentsOf(hi).map(k=>FOOD[k].emoji).join('')+(plateMatch(contentsOf(hi),liveRecipes())?' 완성!':' 미완성'):'비어 있음'}`:`✋ ${FOOD[hi.kind].emoji} ${FOOD[hi.kind].name} · ${hi.state==='raw'?'손질 전':hi.state==='burnt'?'탄 것':'준비 완료'}`);
 let station=nearestStation();
 let h=station?getStationHint(station):'재료 상자로 이동해서 E를 눌러 보세요!';setText('statusHint',h);setText('missionText',`현재 주문: ${rec.title} · ${rec.items.map(k=>FOOD[k].name).join(' + ')}. 친구들과 나누어 준비해 보세요!`);
 setModeUI();
}
function getStationHint(st){
 if(st.type==='bin'){const it=p.item;return !it?`📦 ${st.label}: E를 눌러 재료 집기`:checkReturn(it,st).ok?`↩️ ${st.label}: E를 눌러 돌려놓기 (감점 없음)`:`📦 ${st.label}: 지금 든 재료는 여기에 넣을 수 없어요`}
 if(st.type==='storage')return p.item?'🗄️ 보관대: 손질한 재료를 E로 보관 (최대 5칸)':'🗄️ 보관대: E를 눌러 꺼낼 재료 고르기';
 if(st.type==='trash')return `🗑️ 쓰레기통: 손질한 재료를 E로 버리기 (-${TRASH_PENALTY}점)`;
 if(st.type==='cut'){const b=boardOf(st);if(!b)return '🔪 도마: 손질할 재료를 들고 E';if(b.state==='ready')return '🔪 도마: 완성! 빈손으로 E를 눌러 집기';if(isStale(b,srvNow()))return '🔪 도마: 주인 없는 재료예요. 빈손으로 E를 눌러 회수';if(b.owner===myUid)return b.state==='working'?`🔪 도마: E나 Space를 연타! (${b.progress}/${b.need})`:'🔪 도마: E를 눌러 수학 문제 풀기';return `🔪 도마: ${b.name||'친구'}님이 사용 중`}if(st.type==='cook'){const b=boardOf(st);if(!b)return '🔥 화덕: 구울 재료를 들고 E. 올려두고 다른 일을 해도 돼요';const ph=cookPhase(b,srvNow());return ph==='cooking'?'🔥 화덕: 굽는 중. 다 익으면 꺼내요':ph==='burnt'?'🔥 화덕: 타 버렸어요. 빈손으로 꺼내서 쓰레기통에 버려요':ph==='reserved'?'🔥 화덕: 수학 문제를 풀면 굽기 시작':'🔥 화덕: 다 익었어요! 빈손으로 E를 눌러 꺼내기'}
 if(st.type==='mix')return boardOf(st)?'🥣 믹서: 사용 중 (E나 Space로 젓기 / 완성되면 빈손으로 집기)':'🥣 믹서: 섞을 재료를 들고 E';
 if(st.type==='sink')return '🚰 싱크대: 빈손으로 E를 눌러 더러운 접시 씻기';if(st.type==='plate')return boardOf(st)?'🍽️ 플레이팅대: 준비된 재료를 E로 하나씩 올려요. 빈손이면 접시를 들어요':'🍽️ 플레이팅대: 먼저 접시대에서 접시를 가져와 놓아요';if(st.type==='serve')return '🔔 서빙 벨: 완성한 접시를 직접 들고 와서 E';if(st.type==='rack')return '🍽️ 접시대: 빈손으로 E를 눌러 깨끗한 접시 꺼내기';return '중앙 조리대';}
function nearestStation(){let best=null,dist=1.55;for(let s of STATIONS){if(PASSIVE.has(s.type))continue;let d=Math.hypot((s.x+.5)-p.x,(s.y+.5)-p.y);if(d<dist){dist=d;best=s}}return best}
function walkable(x,y){if(x<1.1||x>W-1.1||y<1.1||y>H-1.1)return false;const radius=.29;for(let sx of [-radius,radius])for(let sy of [-radius,radius])if(blocked.has(Math.floor(x+sx)+','+Math.floor(y+sy)))return false;return true}
function tryMove(dx,dy){let speed=0.115;let nx=p.x+dx*speed,ny=p.y+dy*speed;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.updatedAt=Date.now();}
async function updatePlayer(force=false){players[myUid]={...p};if(mode!=='demo'&&cloud){try{await cloud.syncPlayer(p,force)}catch(e){console.warn('위치 동기화',e)}}}
async function interact(){
 if(!roundStarted||ended||activeQuestion||pending||pickerOpen)return;
 const st=nearestStation();if(!st){toast('조리대나 재료 상자 가까이 가보세요!');return}
 let held=p.held;
 if(isPlate(p.item)&&!['plate','serve','rack','trash'].includes(st.type)){toast('접시는 🍽️ 플레이팅대에 놓거나 🔔 서빙 벨로 가져가요.');sound('error');return}
 if(st.type==='bin'){
  if(p.item){
   const r=checkReturn(p.item,st),nm=FOOD[p.item.kind].name;
   if(r.ok){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);toast('↩️ '+nm+'을(를) 상자에 돌려놓았어요.');sound('pickup');updateUI();return}
   toast(r.reason==='wrongBin'?`이 재료는 ${nm} 상자에만 돌려놓을 수 있어요.`:'손질한 재료는 상자에 넣을 수 없어요. 🗄️ 보관대에 두거나 🗑️ 쓰레기통에 버려요.');sound('error');return;
  }
  setHeld(newItem(st.food,myUid));await updatePlayer(true);toast(FOOD[st.food].emoji+' '+FOOD[st.food].name+'을(를) 들었어요!');sound('pickup');updateUI();return;
 }
 if(st.type==='cut'||st.type==='mix')return useBoard(st);
 if(st.type==='cook')return useCooker(st);
 if(st.type==='sink')return useSink(st);
 if(st.type==='storage')return useStorage(st);
 if(st.type==='trash')return useTrash(st);
 if(st.type==='rack')return useRack(st);
 if(st.type==='plate')return usePlateTable(st);
 if(st.type==='serve')return useServe(st);
}
// ── 5단계: 실제 접시 ──
// 접시대: 깨끗한 접시를 한 장 꺼내거나, 빈 접시를 돌려놓음
async function platesOp(fn){
 if(mode!=='demo')return cloud.platesOp(fn);
 const n=fn(teamData.plates||null);if(!n)return false;teamData.plates=n;return true;
}
async function useRack(st){
 const it=p.item;
 if(it&&!isPlate(it)){toast('접시대에는 접시만 둘 수 있어요.');sound('error');return}
 if(it&&contentsOf(it).length){toast('재료가 담긴 접시는 접시대에 못 둬요. 플레이팅대에 놓아요.');sound('error');return}
 pending=true;
 try{
  if(it){if(await platesOp(rackReturn)){flyFx('plate:',p,st);setHeld(null);await updatePlayer(true);toast('접시를 접시대에 돌려놓았어요.');sound('pickup')}}
  else if(await platesOp(rackTake)){setHeld(newPlate(myUid));await updatePlayer(true);toast('🍽️ 깨끗한 접시를 들었어요. 플레이팅대에 놓아요!');sound('pickup')}
  else{toast(getPlates().dirty>0?'깨끗한 접시가 없어요. 🚰 싱크대에서 설거지해요!':'접시가 모두 사용 중이에요.');sound('error')}
 }catch(e){toast('접시대 사용에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// 플레이팅대: 접시 놓기 → 준비된 재료를 하나씩 올리기 → 접시 들기
async function usePlateTable(st){
 const b=boardOf(st),it=p.item,recs=liveRecipes();
 pending=true;
 try{
  if(isPlate(it)){
   if(b){toast('이미 접시가 놓여 있어요. 다른 플레이팅대를 써요.');sound('error');return}
   const r=await stationOp(st,s=>tablePut(s,it,srvNow()));
   if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);sound('pickup')}else toast('다른 친구가 먼저 접시를 놓았어요!');
   return;
  }
  if(!it){
   if(!b){toast('먼저 접시대에서 접시를 가져와 놓아요!');return}
   const r=await stationOp(st,s=>tableLift(s));
   if(r){setHeld(r.item);await updatePlayer(true);sound('pickup');toast(plateMatch(contentsOf(r.item),recs)?'✨ 완성 접시! 🔔 서빙 벨로 가져가요.':'접시를 들었어요.')}else toast('다른 친구가 먼저 들었어요!');
   return;
  }
  const chk=tableAddCheck(b,it,recs),nm=FOOD[it.kind].name;
  if(!chk.ok){toast({noPlate:'먼저 접시대에서 접시를 가져와 놓아요!',notPrepared:'손질이나 조리를 마친 재료만 담을 수 있어요.',burnt:'탄 재료는 접시에 담을 수 없어요. 🗑️ 쓰레기통에 버려요.',notNeeded:b&&contentsOf(b.plate).length?'이 접시의 요리에는 들어가지 않는 재료예요. 다른 접시에 담아요!':'지금 주문에 필요한 재료가 아니에요!',duplicate:`${nm}은(는) 이미 접시에 있어요!`}[chk.reason]);sound('error');return}
  const r=await stationOp(st,s=>tableAdd(s,it,liveRecipes(),srvNow()));
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);
   const done=plateMatch(contentsOf(r.next.plate),recs);
   if(done){celebrate(st.x+.5,st.y+.5,18);toast('✨ '+done.title+' 완성! 접시를 들고 🔔 서빙 벨로 가요.');sound('success')}
   else{celebrate(st.x+.5,st.y+.5,4);toast('🍽️ '+nm+' 담기 완료! 남은 재료: '+missingOf(contentsOf(r.next.plate),recs).map(k=>FOOD[k].name).join(', '));sound('pickup')}}
  else toast('다른 친구가 먼저 담았어요!');
 }catch(e){toast('플레이팅에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// 서빙 벨: 완성 접시를 직접 들고 와야만 점수. 서빙한 접시는 더러운 접시가 되어 싱크대로 감
function bellSound(){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();for(const [f,d] of [[1318,0],[1760,.09]]){const o=audio.createOscillator(),gn=audio.createGain(),tm=audio.currentTime+d;o.type='sine';o.frequency.setValueAtTime(f,tm);gn.gain.setValueAtTime(.09,tm);gn.gain.exponentialRampToValueAtTime(.001,tm+.5);o.connect(gn).connect(audio.destination);o.start(tm);o.stop(tm+.52)}}catch{}}
async function useServe(st){
 const it=p.item,recs=liveRecipes();
 if(!isPlate(it)){toast('완성한 접시를 직접 들고 와야 서빙할 수 있어요!');sound('error');return}
 const c=contentsOf(it);
 if(!plateMatch(c,recs)){const miss=missingOf(c,recs);toast(!c.length?'빈 접시는 서빙할 수 없어요!':miss.length?'아직 완성되지 않은 접시예요. 남은 재료: '+miss.map(k=>FOOD[k].name).join(', '):'지금 주문에 없는 요리예요. 주문 카드를 확인해요!');sound('error');return}
 pending=true;
 try{
  let out;const side=getSide();
  if(mode!=='demo')out=await cloud.servePlate(side,c,RECIPES,srvNow);
  else{out=serveOrder(getGroup(side),c,RECIPES,srvNow());if(out)teamData.groups[side]=out.next}
  if(out){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);await platesOp(plateDirtied);myServed++;
   const title=RECIPES[out.order.recipeId].title,extra=[out.tip?`팁 +${out.tip}`:'',out.bonus?`콤보 +${out.bonus}`:''].filter(Boolean).join(', ');
   celebrate(st.x+.5,st.y+.5,25);popups.push({text:'+'+out.gained,x:st.x+.5,y:st.y+.5,t:performance.now()});bellSound();toast(`🎉 ${title} 서빙 완료! +${out.gained}점`+(extra?` (${extra})`:''));}
  else{toast('주문이 바뀌었어요. 주문 카드를 다시 확인해요!');sound('error')}
 }catch(e){toast('서빙에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// ── 보관대: 손질한 재료만 최대 5칸. 꺼낼 때는 목록에서 직접 고름 ──
async function useStorage(st){
 const it=p.item;
 if(!it){if(!storageList(getStorage()).length){toast('보관대가 비어 있어요. 손질한 재료를 넣어 둘 수 있어요.');return}openPicker();return}
 const r=checkStore(getStorage(),it);
 if(!r.ok){toast({raw:`손질 전 재료는 ${FOOD[it.kind].name} 상자에 돌려놓아요.`,burnt:'탄 재료는 보관할 수 없어요. 쓰레기통에 버려요.',full:`보관대가 꽉 찼어요! (${STORAGE_MAX}칸)`,duplicate:'이미 보관된 재료예요.'}[r.reason]);sound('error');return}
 pending=true;
 try{
  let ok;
  if(mode!=='demo')ok=await cloud.storagePut(it);
  else{const next=storePut(getStorage(),it);ok=Boolean(next);if(ok)teamData.storage=next}
  if(ok){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);toast('🗄️ '+FOOD[it.kind].name+' 보관 완료!');sound('pickup')}
  else{toast('보관대가 꽉 찼어요!');sound('error')}
 }catch(e){toast('보관에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
function openPicker(){pickerOpen=true;keys.clear();renderPicker();show('storageOverlay')}
function closePicker(){pickerOpen=false;hide('storageOverlay')}
function renderPicker(){
 const list=storageList(getStorage());
 setText('storageCount',`${list.length} / ${STORAGE_MAX}칸`);
 $('storageGrid').replaceChildren(...list.map((rec,i)=>{const b=document.createElement('button');b.className='answer-btn';b.dataset.id=rec.id;b.textContent=`${i+1}  ${FOOD[rec.kind]?.emoji||''} ${FOOD[rec.kind]?.name||rec.kind}`;b.addEventListener('click',()=>takeFromStorage(rec.id));return b}));
 if(!list.length)closePicker();
}
async function takeFromStorage(id){
 if(pending||p.item)return;
 pending=true;
 try{
  let item=null;
  if(mode!=='demo')item=await cloud.storageTake(id);
  else{const r=storeTake(getStorage(),id);if(r){teamData.storage=r.storage;item=r.item}}
  if(item){setHeld(item);await updatePlayer(true);toast('🗄️ '+FOOD[item.kind].name+'을(를) 꺼냈어요!');sound('pickup');closePicker()}
  else{toast('다른 친구가 먼저 꺼냈어요!');renderPicker()}
 }catch(e){toast('꺼내기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// ── 쓰레기통: 손질한 재료만 버릴 수 있고 -8점 (0점 아래로는 안 내려감) ──
async function useTrash(st){
 const it=p.item;
 if(isPlate(it)){
  if(!contentsOf(it).length){toast('빈 접시는 버리지 않아요. 접시대에 돌려놓아요.');return}
  pending=true;
  try{flyFx(p.held,p,st);setHeld({...it,contents:[]});await updatePlayer(true);if(mode!=='demo')await cloud.penalize(getSide());else{const gr=getGroup();gr.score=applyPenalty(gr.score)}toast(`🗑️ 접시 위 음식을 버렸어요. -${TRASH_PENALTY}점`);sound('error')}catch(e){toast('버리기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 const r=checkTrash(it);
 if(!r.ok){toast(r.reason==='raw'?`손질 전 재료는 ${FOOD[it.kind].name} 상자에 돌려놓으면 감점이 없어요.`:'버릴 재료가 없어요.');if(it)sound('error');return}
 pending=true;
 try{
  flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);
  if(mode!=='demo')await cloud.penalize(getSide());else{const gr=getGroup();gr.score=applyPenalty(gr.score)}
  toast(`🗑️ ${FOOD[it.kind].name}을(를) 버렸어요. -${TRASH_PENALTY}점`);sound('error');
 }catch(e){toast('버리기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// 지금 E를 누르면 무슨 일이 일어나는지 (3D 말풍선·힌트에 사용)
function actionLabel(st){
 const it=p.item;
 if(st.type==='bin')return !it?'집기':checkReturn(it,st).ok?'돌려놓기':'✕';
 if(st.type==='storage')return it?(it.state==='raw'?'✕':'보관'):'꺼내기';
 if(st.type==='trash')return it&&it.state!=='raw'?`버리기 -${TRASH_PENALTY}`:'✕';
 if(st.type==='sink')return it?'✕':getPlates().dirty>0||boardOf(st)?'설거지':'E';
 if(st.type==='rack')return !it?(getPlates().clean>0?'접시 꺼내기':'✕'):isPlate(it)&&!contentsOf(it).length?'접시 놓기':'✕';
 if(st.type==='plate'){const b=boardOf(st);if(isPlate(it))return b?'✕':'접시 놓기';if(!it)return b?'접시 들기':'✕';return tableAddCheck(b,it,liveRecipes()).ok?'담기':'✕'}
 if(st.type==='serve')return isPlate(it)&&plateMatch(contentsOf(it),liveRecipes())?'서빙!':'✕';
 if(st.type==='cook'){const b=boardOf(st);if(!b)return it&&it.state==='raw'&&FOOD[it.kind].prep==='cook'?'굽기':it?'✕':'E';return 'E'}
 if(st.type==='cut'||st.type==='mix'){const b=boardOf(st);if(!b)return it&&it.state==='raw'&&FOOD[it.kind].prep===st.type?(st.type==='mix'?'섞기':'손질'):it?'✕':'E';if(b.state==='ready'||isStale(b,srvNow()))return it?'✕':'집기';return b.owner===myUid?(b.state==='working'?'연타!':'문제 풀기'):'✕'}
 return 'E';
}
async function mathStat(correct,unitNum){let gr=getGroup();if(mode==='demo'){gr[correct?'correct':'wrong']++;return}await cloud.writeMath(getSide(),correct,unitNum)}
function shuffle(a){let z=[...a];for(let i=z.length-1;i>0;i--){let j=rnd(0,i);[z[i],z[j]]=[z[j],z[i]]}return z}
function mkProblem(u){
 let unitNum=Number(u)==0?rnd(1,6):Number(u),question='',value=0,hint='',expl='';
 switch(unitNum){
 case 1:{const den=[2,3,4,5,6,8][rnd(0,5)],num=rnd(2,6);let whole=rnd(2,6);value=num;question=`${whole* num}/${den} ÷ ${whole}/${den} = ?`;hint='분수의 나눗셈은 뒤의 분수를 뒤집어 곱해요.';expl=`${whole*num}/${den} × ${den}/${whole} = ${num}`;break}
 case 2:{let a=rnd(2,9),b=[.2,.4,.5,1.2,1.5,2.5][rnd(0,5)];value=a;question=`${+(a*b).toFixed(2)} ÷ ${b} = ?`;hint='나누는 수가 자연수가 되도록 소수점을 옮겨 보세요.';expl=`${+(a*b).toFixed(2)} ÷ ${b} = ${a}`;break}
 case 3:{let a=rnd(1,3),b=rnd(2,4),c=rnd(1,3);value=a+b+c;question=`쌓기나무가 세 줄로 있어요.\n각 줄 높이가 ${a}개, ${b}개, ${c}개라면\n모두 몇 개일까요?`;hint='줄마다 쌓인 나무 개수를 모두 더해요.';expl=`${a}+${b}+${c}=${value}개`;break}
 case 4:{let a=rnd(1,4),b=rnd(2,5),t=rnd(2,5);value=a*t;question=`딸기와 우유를 ${a}:${b}로 나눠요.\n총 ${(a+b)*t}컵이면 딸기는 몇 컵?`;hint='전체를 비의 각 항의 합으로 나눈 다음, 딸기 쪽의 비를 곱해요.';expl=`${(a+b)*t} ÷ ${a+b} × ${a} = ${value}`;break}
 case 5:{let r=[2,3,4,5][rnd(0,3)],circ=Math.random()<.5;value=+(circ?2*r*3.14:r*r*3.14).toFixed(2);question=`반지름이 ${r}cm인 원의\n${circ?'둘레':'넓이'}는 얼마일까요?\n(원주율 3.14)`;hint=circ?'원의 둘레 = 반지름 × 2 × 원주율':'원의 넓이 = 반지름 × 반지름 × 원주율';expl=`${circ?`${r}×2×3.14`:`${r}×${r}×3.14`} = ${value}`;break}
 case 6:{let q=[['원기둥의 밑면은 몇 개일까요?',2,'원기둥의 위아래에는 같은 크기의 원이 있어요.'],['원뿔의 꼭짓점은 몇 개일까요?',1,'뾰족한 꼭짓점은 하나예요.'],['구의 평평한 면은 몇 개일까요?',0,'구에는 평평한 면이 없어요.'],['원기둥의 모서리는 몇 개일까요?',2,'밑면과 옆면이 만나는 원형 모서리 두 개가 있어요.'],['원뿔의 밑면은 몇 개일까요?',1,'원 모양 밑면이 하나 있어요.']][rnd(0,4)];question=q[0];value=q[1];hint=q[2];expl=q[2];break}
 }
 const options=new Set([value]);let tries=0;while(options.size<4&&tries<100){tries++;let d=[-5,-3,-2,-1,1,2,3,5][rnd(0,7)];let v=+(value+d*(unitNum===5?3.14:1)).toFixed(2);if(v>=0)options.add(v)}
 return {question,answer:value,options:shuffle([...options]),unit:unitNum,hint,explanation:expl};
}
function askMath(food,kind,board=null){
 const pz=mkProblem(unit==='all'?rnd(1,6):unit),icon={cut:'🔪',cook:'🔥',mix:'🥣'}[kind];
 activeQuestion={food,kind,pz,wrong:false,board};
 setText('questionFood',FOOD[food].emoji+icon);setText('questionTitle',FOOD[food].name+' 요리 미션!');setText('questionUnit',pz.unit+'. '+['분수의 나눗셈','소수의 나눗셈','공간과 입체','비례식과 비례배분','원의 둘레와 넓이','원기둥, 원뿔, 구'][pz.unit-1]);setMath('questionText',pz.question);setText('questionFeedback','정답을 골라 재료를 준비해요.');
 let ans=$('answerGrid');ans.replaceChildren(...pz.options.map((opt,i)=>{let b=document.createElement('button');b.className='answer-btn';b.textContent=`${'①②③④'[i]}  ${opt}`;b.addEventListener('click',()=>answerMath(opt,b));return b}));show('questionOverlay');sound('pickup');
}
async function answerMath(choice,button){if(!activeQuestion||activeQuestion.solving)return;let q=activeQuestion,correct=Math.abs(Number(choice)-q.pz.answer)<.00001;
 if(!correct){button.classList.add('wrong');button.disabled=true;q.wrong=true;setText('questionFeedback','아쉬워요! 다시 골라 보세요. '+q.pz.hint);sound('error');await mathStat(false,q.pz.unit);return}
 q.solving=true;button.classList.add('correct');setMath('questionFeedback','정답! '+q.pz.explanation+' ✨');sound('success');await mathStat(true,q.pz.unit);
 setTimeout(async()=>{if(activeQuestion!==q)return;document.activeElement?.blur?.();
  if(q.board){activeQuestion=null;hide('questionOverlay');let r,msg;
   if(q.kind==='cook'){r=await stationOp(q.board,s=>cookStart(s,myUid,srvNow()));msg='🔥 정답! 굽기 시작. 다 익으면 타기 전에 E로 꺼내요!'}
   else{const n=q.kind==='mix'?Math.min(chopNeed,MIX_PRESSES):chopNeed;r=await stationOp(q.board,s=>boardStart(s,myUid,n,srvNow()));msg=`${q.kind==='mix'?'🥣 정답! 이제 E나 Space를 '+n+'번 눌러 저어요!':'🔪 정답! 이제 E나 Space를 '+n+'번 눌러 손질해요!'}`}
   toast(r?msg:'다시 사용해 주세요.');updateUI();return}
  setHeld(prepare(p.item)||{...newItem(q.food,myUid),state:'prepared'});activeQuestion=null;hide('questionOverlay');await updatePlayer(true);celebrate(p.x,p.y,10);toast(FOOD[q.food].emoji+' 손질 완료! 🍽️ 접시로 가져가요.');updateUI();},700);
}
function celebrate(x,y,n=10){for(let i=0;i<n;i++)particles.push({x:OX+x*T,y:OY+y*T,vx:(Math.random()-.5)*4,vy:-1-Math.random()*3,life:1,color:['#ffd879','#61e4cc','#ff8cae','#fff'][rnd(0,3)]})}
function canvasPos(x,y){return [OX+x*T,OY+y*T]}
const rr=(x,y,w,h,r)=>{g.beginPath();g.roundRect(x,y,w,h,r);};
function fillRounded(x,y,w,h,r,color){g.fillStyle=color;rr(x,y,w,h,r);g.fill()}
function glow(x,y,r,color){let grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,'transparent');g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2)}
function drawFloor(){
 g.clearRect(0,0,1000,640);let grad=g.createLinearGradient(0,0,900,640);grad.addColorStop(0,'#28334b');grad.addColorStop(.5,'#173f56');grad.addColorStop(1,'#182940');g.fillStyle=grad;g.fillRect(0,0,1000,640);
 glow(95,300,300,'#24dec725');glow(900,160,260,'#ff9b5925');
 g.fillStyle='#111c2c';g.fillRect(OX-20,OY-6,18*T+40,12*T+25);g.fillStyle='#3b5064';g.fillRect(OX-9,OY-2,18*T+18,12*T+8);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let px=OX+x*T,py=OY+y*T;
  let base=(x+y)%2===0?'#657d92':'#61788c';
  g.fillStyle=base;g.fillRect(px+.5,py+.5,T-1,T-1);
  g.strokeStyle='#465f74';g.lineWidth=1.3;g.strokeRect(px+.8,py+.8,T-1.6,T-1.6);
  g.fillStyle='rgba(255,255,255,.045)';g.fillRect(px+3,py+2,T-6,2);
  if((x*7+y*11)%17===0){g.fillStyle='#374b62';g.fillRect(px+10,py+32,4,2)}
 }
 for(let x=0;x<W;x++){
  let px=OX+x*T;fillRounded(px,OY-3,T-1,21,2,'#30455b');g.fillStyle='#47627a';g.fillRect(px+2,OY-1,T-4,4);g.fillStyle='#23354a';g.fillRect(px+23,OY+8,2,8);
 }
 for(let y=0;y<H;y++){
  const py=OY+y*T;fillRounded(OX-12,py,17,T-1,2,'#30435b');fillRounded(OX+W*T-5,py,17,T-1,2,'#26384b');
 }
 glow(OX+20,OY+470,110,'#2cefc524');glow(OX+820,OY+80,150,'#f9915f29');
 // decorative plants, hanging lights, and kitchen accents
 drawEmoji('🪴',OX+42,OY+50,27);drawEmoji('🪴',OX+W*T-34,OY+50,27);
 for(let x of [4,8,13]){fillRounded(OX+x*T-6,OY+12,6,18,3,'#324e63');glow(OX+x*T,OY+31,38,'#ffe19b29');drawEmoji('✨',OX+x*T+2,OY+42,10)}
}
function drawEmoji(symbol,x,y,size=23){g.font=`${size}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(symbol,x,y)}
function drawStation(st,t){
 let [x,y]=canvasPos(st.x,st.y);let cx=x+24,cy=y+24;
 // tiled counters with an exaggerated top and front face to create the 2.5D feeling
 fillRounded(x+4,y+13,43,36,5,'#1c2936');fillRounded(x+2,y+6,44,34,5,'#5c3f3c');fillRounded(x+1,y+1,45,30,5,'#bb8d69');fillRounded(x+4,y+3,39,22,4,st.type==='bin'?'#beaa83':'#af8569');
 g.fillStyle='#e6ba8a';g.fillRect(x+6,y+4,34,2);
 if(st.type==='bin'){fillRounded(x+6,y+7,35,18,4,'#625045');drawEmoji(FOOD[st.food].emoji,cx,y+14,23)}
 else if(st.type==='cut'){fillRounded(x+7,y+7,34,16,3,'#d3b480');drawEmoji('🔪',cx+3,y+15,22)}
 else if(st.type==='cook'){fillRounded(x+6,y+4,35,25,6,'#283443');fillRounded(x+13,y+9,22,15,7,'#ea6a48');drawEmoji('🔥',cx,y+14,22);if(Math.sin(t/300+st.x)>0){glow(cx,y+17,38,'#ff7d4a44')}}
 else if(st.type==='mix'){fillRounded(x+7,y+6,33,19,4,'#457185');drawEmoji('🥣',cx,y+16,26)}
 else if(st.type==='plate'){fillRounded(x+6,y+6,35,18,4,'#ddd8c5')}
 else if(st.type==='serve'){fillRounded(x+6,y+6,35,19,4,'#ece2bc');drawEmoji('🔔',cx,y+14,23)}
 else {const em={sink:'🚰',trash:'🗑️',storage:'🗄️'}[st.type];if(em)drawEmoji(em,cx,y+14,22);if(st.type==='storage'){g.font='800 10px Nunito,sans-serif';g.textAlign='center';g.fillStyle='#fff';g.fillText(storageList(getStorage()).length+'/'+STORAGE_MAX,cx,y+32)}}
 if(st.type==='counter')return;
 g.font='700 10px Nunito, sans-serif';g.textAlign='center';g.fillStyle='#ffe3b6';g.shadowColor='#182135';g.shadowBlur=4;g.fillText(st.type==='bin'?FOOD[st.food].name:st.label,cx,y+45);g.shadowBlur=0;
}
function drawChef(ch,isMine,t){
 let [x,y]=canvasPos(ch.x,ch.y);let col=playerColor(ch.seat||0);let bounce=Math.sin(t/125+(ch.seat||0))*.9;
 g.fillStyle='#111d2d80';g.beginPath();g.ellipse(x,y+13,18,8,0,0,Math.PI*2);g.fill();
 g.fillStyle=col;g.beginPath();g.ellipse(x,y-1+bounce,17,18,0,0,Math.PI*2);g.fill();
 fillRounded(x-13,y-14+bounce,26,18,9,'#f4c9a6');
 g.fillStyle='#493b46';g.beginPath();g.arc(x-5,y-5+bounce,1.9,0,Math.PI*2);g.arc(x+5,y-5+bounce,1.9,0,Math.PI*2);g.fill();
 g.strokeStyle='#b77a77';g.lineWidth=1.6;g.beginPath();g.arc(x,y-5+bounce,4,.35,Math.PI-.35);g.stroke();
 fillRounded(x-13,y-31+bounce,26,16,8,'#f4f8ff');
 for(let i=-1;i<=1;i++){g.fillStyle='#fff';g.beginPath();g.arc(x+i*8,y-27+bounce,8,0,Math.PI*2);g.fill()}
 fillRounded(x-13,y-19+bounce,26,6,2,'#d7eaf2');
 if(ch.held&&ch.held.startsWith('plate:')){fillRounded(x+4,y-40,30,28,9,'#fff8e4');drawEmoji('🍽️',x+19,y-26,19);ch.held.slice(6).split('+').filter(k=>FOOD[k]).forEach((k,i)=>drawEmoji(FOOD[k].emoji,x+12+i*13,y-44,12))}else if(ch.held){let it=ch.held.replace(/^\w+:/,'');if(FOOD[it]){fillRounded(x+4,y-40,30,28,9,ch.held.startsWith('ready:')?'#2d8d70':'#fff8e4');drawEmoji(FOOD[it].emoji,x+19,y-26,19)}}
 if(isMine){g.strokeStyle='#ffd775';g.lineWidth=3;g.beginPath();g.ellipse(x,y+12,20,10,0,0,Math.PI*2);g.stroke()}
 let nm=String(ch.name||'셰프').slice(0,8);g.font='800 11px Nunito,"Noto Sans KR",sans-serif';let width=Math.max(52,g.measureText(nm).width+14);fillRounded(x-width/2,y-53+bounce,width,18,8,isMine?'#4c785d':'#293d53');g.fillStyle='#fff';g.textAlign='center';g.fillText(nm,x,y-40+bounce);
}
function drawGame(t){
 if(use3D&&view3d){
  try{
   const chefs=mode==='demo'?bots.map((b,i)=>({id:'bot'+i,...b})):Object.entries(players).filter(([id])=>id!==myUid).map(([id,ch])=>({id,...ch}));
   if(roundStarted)chefs.push({id:'me',...p,mine:true});
   const foc=roundStarted&&!activeQuestion&&!pickerOpen?nearestStation():null;
   view3d.render({chefs,focus:foc,focusLabel:foc?actionLabel(foc):'',boards:boardViews(),storage:storageList(getStorage()),fx,popups,orders:roundStarted?liveRecipes().map(r=>({items:r.items,emoji:r.emoji})):[],rush:rushNow,order:roundStarted?{items:order().items,emoji:order().emoji}:null,particles:particles.map(pt=>({x:(pt.x-OX)/T,y:(pt.y-OY)/T,life:pt.life,color:pt.color})),dim:!roundStarted},t);
   return;
  }catch(e){console.warn('3D 오류 → 2D로 전환',e);set3D(false);toast('3D 화면에 문제가 생겨 2D로 바꿨어요.')}
 }
 drawFloor();let focus=nearestStation();
 for(let st of STATIONS){drawStation(st,t);if(focus===st&&roundStarted&&!activeQuestion){let [x,y]=canvasPos(st.x+.5,st.y+.1);g.strokeStyle='#ffdf94';g.lineWidth=3;g.strokeRect(x-24,y-6,47,43);drawEmoji('E',x+21,y-8,12)}}
 for(const b of boardViews()){let [bx,by]=canvasPos(b.x,b.y);if(b.type==='plate'){drawEmoji(b.complete?b.emoji:'⚪',bx+24,by+14,b.complete?24:22);if(!b.complete)b.contents.forEach((k,i)=>drawEmoji(FOOD[k].emoji,bx+15+i*16,by+14,14))}if(b.type==='rack')drawEmoji('🍽️',bx+24,by+14,20);if(b.kind)drawEmoji(b.look==='burnt'?'⚫':FOOD[b.kind].emoji,bx+14,by+15,b.ready?20:16);if(b.ready)drawEmoji('✨',bx+34,by+8,11);if(b.type!=='plate'&&b.type!=='rack'&&!(b.type==='sink'&&b.state!=='working')){fillRounded(bx+4,by-9,40,6,3,'#1d2a3d');fillRounded(bx+4,by-9,Math.max(3,40*b.progress),6,3,b.state==='warning'?'#ff6b57':b.state==='burnt'?'#555':b.ready?'#61e4a0':b.state==='stale'?'#9aa7b8':'#ffd166')}g.font='800 9px Nunito,"Noto Sans KR",sans-serif';g.textAlign='center';g.fillStyle='#fff';g.shadowColor='#182135';g.shadowBlur=4;g.fillText(b.label,bx+24,by-13);g.shadowBlur=0}
 if(mode==='demo'){for(let b of bots)drawChef(b,false,t)}else{let list=Object.entries(players).sort((a,b)=>a[1].y-b[1].y);for(let [id,ch] of list){if(id===myUid)continue;drawChef(ch,false,t)}}
 if(roundStarted)drawChef(p,true,t);
 for(let pt of particles){g.globalAlpha=pt.life;g.fillStyle=pt.color;g.beginPath();g.arc(pt.x,pt.y,4*pt.life+1,0,Math.PI*2);g.fill();g.globalAlpha=1}
 if(!roundStarted){g.fillStyle='#101d3699';g.fillRect(OX,OY,W*T,H*T);g.fillStyle='#fce8c6';g.textAlign='center';g.font='900 26px Nunito,"Noto Sans KR"';g.fillText('주방에 오신 것을 환영합니다!',500,315);g.font='700 14px Nunito,"Noto Sans KR"';g.fillText('시작 화면에서 체험하거나 학급방에 입장하세요.',500,350)}
}
// 주문 카드에 '담김' 표시를 할 재료: 플레이팅대의 접시들과 내가 든 접시에 올라간 것
function platedKinds(){const set=new Set();for(const st of STATIONS){if(st.type!=='plate')continue;const b=boardOf(st);if(b)contentsOf(b.plate).forEach(k=>set.add(k))}if(isPlate(p.item))contentsOf(p.item).forEach(k=>set.add(k));return set}
// 화면에 보여줄 도마 상태 (2D·3D 공용)
function boardViews(){
 const now=srvNow(),out=[];
 for(const st of STATIONS){
  const b=boardOf(st);
  if(st.type==='sink'){const pl=getPlates();out.push({x:st.x,y:st.y,type:'sink',kind:null,look:'raw',state:b?b.state:'idle',progress:b?b.progress/b.need:0,count:b?b.progress:0,need:b?b.need:0,owner:b&&b.owner===myUid?'me':b?.owner,dirty:pl.dirty,clean:pl.clean,label:b&&b.state==='working'?`${b.name||'친구'} 설거지 ${b.progress}/${b.need}`:pl.dirty>0?`더러운 접시 ${pl.dirty}장 · E로 설거지`:''});continue}
  if(st.type==='rack'){const pl=getPlates();out.push({x:st.x,y:st.y,type:'rack',kind:null,look:'raw',state:'idle',progress:0,count:0,need:0,clean:pl.clean,label:pl.clean?'':'깨끗한 접시 없음'});continue}
  if(st.type==='plate'){if(b&&b.state==='plate'){const c=contentsOf(b.plate),recs=liveRecipes(),done=plateMatch(c,recs),miss=missingOf(c,recs);out.push({x:st.x,y:st.y,type:'plate',kind:null,look:'raw',state:done?'complete':'plate',progress:0,count:0,need:0,contents:c,complete:!!done,emoji:done?done.emoji:'',label:done?'✨ 완성! E로 들기':!c.length?'빈 접시 · 재료를 올려요':miss.length?'남은 재료: '+miss.map(k=>FOOD[k].name).join(', '):'지난 주문 접시 · 쓰레기통에 비워요'})}continue}
  if(!b||!['cut','mix','cook'].includes(st.type))continue;
  const stale=isStale(b,now),who=b.name||'친구';
  if(st.type==='cook'){
   const ph=stale?'stale':cookPhase(b,now),left=Math.max(0,(b.startAt+b.cookMs+b.graceMs-now)/1000);
   out.push({x:st.x,y:st.y,type:'cook',kind:b.item.kind,look:ph==='burnt'?'burnt':ph==='ready'||ph==='warning'?'ready':'raw',ready:ph==='ready'||ph==='warning',state:ph,progress:ph==='cooking'?cookProgress(b,now):ph==='reserved'||ph==='stale'?0:1,count:0,need:0,owner:b.owner===myUid?'me':b.owner,
    label:ph==='cooking'?'굽는 중…':ph==='ready'?'다 익었어요! E로 꺼내기':ph==='warning'?`🔥 탄다! 빨리 꺼내요 ${left.toFixed(0)}초`:ph==='burnt'?'탔어요 · 꺼내서 버리기':ph==='stale'?'주인 없음 · E로 회수':`${who} 문제 푸는 중`});
   continue;
  }
  const verb=st.type==='mix'?'젓는 중':'손질 중';
  out.push({x:st.x,y:st.y,type:st.type,kind:b.item.kind,look:b.state==='ready'?'ready':'raw',ready:b.state==='ready',state:stale?'stale':b.state,progress:b.state==='working'?b.progress/b.need:b.state==='ready'?1:0,count:b.progress,need:b.need,owner:b.owner===myUid?'me':b.owner,
   label:b.state==='ready'?'완성! E로 집기':stale?'주인 없음 · E로 회수':b.state==='working'?`${who} ${verb} ${b.progress}/${b.need}`:`${who} 문제 푸는 중`});
 }
 return out;
}
// ── 3D 화면 연결: render3d.js는 그리기만 담당. 불러오기에 실패하거나 WebGL이 없으면 기존 2D 그대로 동작 ──
let view3d=null,use3D=false;
function set3D(on){use3D=!!(on&&view3d);$('game3d').classList.toggle('hidden',!use3D);canvas.classList.toggle('hidden',use3D);setText('viewBtn',use3D?'🖼️ 2D로 보기':'🧊 3D로 보기');$('viewBtn').classList.toggle('hidden',!view3d);try{localStorage.setItem('mathcook-view',use3D?'3d':'2d')}catch{}}
async function init3D(){
 try{const mod=await import('./render3d.js');view3d=mod.createRenderer3D($('game3d'),{W,H,stations:STATIONS,foods:FOOD});let saved='3d';try{saved=localStorage.getItem('mathcook-view')||'3d'}catch{}set3D(saved!=='2d');window.__view3d=view3d}
 catch(e){console.warn('3D를 켤 수 없어 2D로 실행합니다.',e);view3d=null;set3D(false)}
}
window.__game={get p(){return p},get group(){return getGroup()},get use3D(){return use3D},get question(){return activeQuestion},get storage(){return storageList(getStorage())},get boards(){return boardViews()},get plates(){return getPlates()},get orderIndex(){return getGroup().served||0},get orders(){return liveOrders().map(o=>({id:o.id,recipe:RECIPES[o.recipeId].title,left:(o.expiresAt-srvNow())/1000}))},get rush(){return rushNow},get combo(){return getGroup().combo||0},get meta(){return meta},get chopNeed(){return chopNeed},get pickerOpen(){return pickerOpen}}; // 자동 테스트·디버깅용 읽기 창구
function animate(t){fx=fx.filter(f=>t-f.t<450);popups=popups.filter(f=>t-f.t<1400);if(roundStarted)cookAlerts();let dt=Math.min(.05,(t-last)/1000);last=t;clock+=dt;
 if(roundStarted&&!ended){
  if(!activeQuestion&&!pickerOpen){let dx=0,dy=0;if(keys.has('ArrowLeft')||keys.has('a'))dx--;if(keys.has('ArrowRight')||keys.has('d'))dx++;if(keys.has('ArrowUp')||keys.has('w'))dy--;if(keys.has('ArrowDown')||keys.has('s'))dy++;
   if(dx||dy){let len=Math.hypot(dx,dy);dx/=len;dy/=len;let s=dt*5.2*(rushNow?RUSH_SPEED:1);let nx=p.x+dx*s,ny=p.y+dy*s;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');p.updatedAt=Date.now();if(mode!=='demo'&&cloud)cloud.syncPlayer(p).catch(()=>{});}
  }
  if(mode==='demo')for(let b of bots){let dist=Math.hypot(b.tx-b.x,b.ty-b.y);if(dist<.2||Math.random()<dt*.2){b.tx=rnd(4,13)+.5;b.ty=rnd(3,9)+.5}let vx=(b.tx-b.x)/(dist||1),vy=(b.ty-b.y)/(dist||1);let nx=b.x+vx*dt*.9,ny=b.y+vy*dt*.9;if(walkable(nx,b.y))b.x=nx;if(walkable(b.x,ny))b.y=ny;}
  let started=mode==='demo'?meta.startedAt:meta?.startedAt||Date.now();nowTime=Math.max(0,(meta?.duration||180)-(Date.now()+(cloud?.serverOffset||0)-started)/1000);
  setText('timerLabel',`${String(Math.floor(nowTime/60)).padStart(2,'0')}:${String(Math.floor(nowTime%60)).padStart(2,'0')}`);
  elapsed=(meta?.duration||180)-nowTime;
  if(mode==='demo'&&currentMode==='duel'&&Math.floor(elapsed/35)>rivalServed){rivalServed++;let gr=getGroup('B');gr.score+=100;gr.served++;toast('⚔️ 라이벌 B팀이 요리를 완성했어요!')}
  setRush(isRush(elapsed*1000,(meta?.duration||180)*1000)&&nowTime>0);orderTick(t);
  if(nowTime<=0)finishRound();
  if(clock-ambience>1){ambience=clock;updateUI()}
 }
 for(let pt of particles){pt.x+=pt.vx*dt*60;pt.y+=pt.vy*dt*60;pt.vy+=.09*dt*60;pt.life-=dt*.9}particles=particles.filter(p=>p.life>0);
 if(cloud?.role==='teacher' && cloud.meta?.phase==='playing' && Math.floor(t/1000)!==Math.floor((t-dt*1000)/1000))updateTeacherMonitor();
 drawOrderCards();drawGame(t);requestAnimationFrame(animate);
}
function finishRound(){if(ended)return;ended=true;setRush(false);sentPhase='ended';roundStarted=false;activeQuestion=null;hide('questionOverlay');const gr=getGroup();setText('endScore',gr.score||0);setText('endServed',gr.served||0);setText('endCorrect',gr.correct||0);
 let msg=(gr.served||0)>=3?'대단해요! 멋진 요리사 팀이에요 🎉':'친구들과 함께 도전한 것만으로도 멋져요!';setText('endSummary',msg);show('endOverlay');sound('success');}
function beginOnline(){
 if(!cloud||!meta)return;currentMode=meta.mode;unit=meta.unit;totalTime=meta.duration;team=cloud.team;myUid=cloud.uid;seat=cloud.seat;members=cloud.allMembers||{};
 let startPoints=[[7.5,7.5],[10.5,7.5],[6.5,8.5],[11.5,8.5],[9.5,8.5]];
 let same=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);let i=same.findIndex(([id])=>id===myUid),v=startPoints[Math.max(0,i)%startPoints.length];
 p={x:v[0],y:v[1],dir:'down',held:'',item:null,seat,name:getName(),updatedAt:Date.now()};fx=[];closePicker();
 cloud.spawn(p).catch(e=>toast('입장 오류: '+e.message));
 hide('menuOverlay');hide('setupOverlay');hide('lobbyOverlay');hide('endOverlay');hide('questionOverlay');roundStarted=true;ended=false;pending=false;activeQuestion=null;elapsed=0;sentPhase='playing';setRoomStatus();setModeUI();updateUI();toast('🎉 게임 시작! 친구들과 요리를 완성하세요.');
}
function updateTeacherMonitor(){
 if(!cloud||cloud.role!=='teacher')return;
 let running=cloud.meta?.phase==='playing';$('teacherMonitor').classList.toggle('hidden',!running&&cloud.meta?.phase!=='ended');
 if(!cloud.meta)return;
 let remaining=Math.max(0,cloud.meta.duration-Math.floor((Date.now()+(cloud.serverOffset||0)-cloud.meta.startedAt)/1000));
 setText('teacherTime','남은 시간 '+String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0'));
 let scores=cloud.meta.sizes.map((size,i)=>{let gr=cloud.allTeams[i]?.data?.groups||{};let v=cloud.meta.mode==='duel'?((gr.A?.score||0)+' / '+(gr.B?.score||0)):(gr.ALL?.score||0);return {size,i,v}});
 $('teacherScores').replaceChildren(...scores.map(s=>{let n=document.createElement('div');n.className='teacher-score';n.innerHTML='<div>'+ (s.i+1)+'팀 · '+s.size+'명</div><b>'+s.v+'</b><div>요리 점수</div>';return n}));
 $('endRoundBtn').disabled=!running;
}
function refreshLobby(){
 if(!cloud||!cloud.meta)return;let m=cloud.meta;let all=cloud.allMembers||{};setText('roomCodeDisplay',cloud.code);setText('lobbyCount',`${Object.keys(all).length}/${m.count}명 입장`);setText('lobbyMode',({coop:'🤝 협동',duel:'⚔️ 2대2 대결',class:'🏆 학급 대항전'})[m.mode]);
 let entries=Object.entries(all).sort((a,b)=>a[1].seat-b[1].seat),holder=$('lobbyTeams');holder.replaceChildren(...m.sizes.map((num,i)=>{let div=document.createElement('div');div.className='lobby-team';let title=document.createElement('h3');title.textContent=`🍳 ${i+1}팀 · ${num}명`;div.appendChild(title);let mates=entries.filter(([,u])=>Number(u.team)===i);for(let [,u] of mates){let li=document.createElement('div');li.className='lobby-member';li.textContent='👨‍🍳 '+u.name;div.appendChild(li)}if(mates.length===0){let li=document.createElement('div');li.className='lobby-member';li.textContent='아직 입장한 학생이 없어요';div.appendChild(li)}return div}));
 let count=Object.keys(all).length;setText('lobbyNotice',count===m.count?'🎉 모든 학생이 입장했습니다!':'학생들이 입장할 때마다 팀에 자동 배정됩니다.');
 $('startBtn').classList.toggle('hidden',cloud.role!=='teacher');$('startBtn').disabled=!count||m.phase==='playing';updateTeacherMonitor();
}
async function setupCloud(isTeacher){teacher=isTeacher;setText('setupTitle',isTeacher?'👩‍🏫 학급방 만들기':'🧑‍🎓 게임방 입장');setText('setupIntro',isTeacher?'학급 인원과 모드를 선택하면 학생용 코드가 만들어져요.':'선생님께 받은 6자리 코드를 입력해 주세요.');$('createForm').classList.toggle('hidden',!isTeacher);$('joinForm').classList.toggle('hidden',isTeacher);setText('setupError','');show('setupOverlay');}
function wireCloud(obj){
 obj.on('meta',v=>{
  if(!v)return;meta=v;currentMode=v.mode;
  if(obj.role==='teacher'){if(v.phase==='playing'||v.phase==='ended'){refreshLobby();$('startBtn').textContent='다음 판 시작하기 🍳';if(v.phase==='ended')toast('게임이 끝났어요. 새 라운드를 시작할 수 있습니다.')}else refreshLobby();}
  else if(v.phase==='playing'&&sentPhase!=='playing')beginOnline();else if(v.phase==='ended'&&roundStarted)finishRound();else if(v.phase==='lobby'&&sentPhase==='playing'){sentPhase='lobby';roundStarted=false;show('lobbyOverlay');}
 });
 obj.on('members',v=>{members=v||{};refreshLobby();if(roundStarted)updateUI()});
 obj.on('results',()=>updateTeacherMonitor());
 obj.on('players',v=>{players=v||{}});
 obj.on('teamData',v=>{teamData=v||{groups:{ALL:blankGroup(),A:blankGroup(),B:blankGroup()}};if(pickerOpen)renderPicker();if(roundStarted)updateUI()});
 obj.on('teams',v=>{allTeams=v||{};if(roundStarted)updateUI();if(cloud?.role==='teacher')updateTeacherMonitor()});
 obj.on('error',err=>toast('Firebase: '+err));
}
function boot(){
 $('demoBtn').onclick=()=>startDemo('coop');
 $('demoBattleBtn').onclick=()=>startDemo('duel');
 $('teacherBtn').onclick=()=>setupCloud(true);
 $('joinBtn').onclick=()=>setupCloud(false);
 $('createRoomBtn').onclick=async()=>{
  let btn=$('createRoomBtn');btn.disabled=true;setText('setupError','');try{
   let n=Number($('classCount').value),m=$('createMode').value;if(m==='duel'&&n!==4)m='class';
   cloud=new CloudRoom();wireCloud(cloud);await cloud.create({name:getName(),count:n,mode:m,unit:$('unitSelect').value,duration:Number($('durationSelect').value),orderTime:ORDER_TIME_OPTIONS[$('orderTimeSelect').value]});
   mode='online';teacher=true;hide('setupOverlay');hide('menuOverlay');show('lobbyOverlay');refreshLobby();setRoomStatus();
  }catch(e){setText('setupError',e.message)}finally{btn.disabled=false}
 };
 $('joinRoomBtn').onclick=async()=>{
  let btn=$('joinRoomBtn');btn.disabled=true;setText('setupError','');try{
   cloud=new CloudRoom();wireCloud(cloud);await cloud.join({code:$('roomCodeInput').value.replace(/\D/g,''),name:getName()});
   mode='online';teacher=false;myUid=cloud.uid;team=cloud.team;seat=cloud.seat;hide('setupOverlay');hide('menuOverlay');show('lobbyOverlay');refreshLobby();setRoomStatus();
  }catch(e){setText('setupError',e.message)}finally{btn.disabled=false}
 };
 $('startBtn').onclick=async()=>{if(!cloud)return;let btn=$('startBtn');btn.disabled=true;try{await cloud.begin();refreshLobby();toast('요리 축제가 시작됐습니다!')}catch(e){toast(e.message)}finally{btn.disabled=false}};
 $('lobbyBackBtn').onclick=goHome;
 $('csvBtn').onclick=()=>{
   if(!cloud || cloud.role!=='teacher')return;
   let header=['번호','이름(별명)','팀','정답','오답','서빙',...Array.from({length:6},(_,i)=>(i+1)+'단원 정답')];
   let lines=[header,...Object.values(cloud.results||{}).sort((a,b)=>a.seat-b.seat).map((v,i)=>[i+1,v.name||'',Number(v.team)+1,v.correct||0,v.wrong||0,v.served||0,...Array.from({length:6},(_,j)=>v.units?.[j+1]?.correct||0)])];
   let csv='\ufeff'+lines.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
   let a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='수학레스토랑_학생별결과_'+cloud.code+'.csv';a.click();URL.revokeObjectURL(url);
 };
 $('endRoundBtn').onclick=async()=>{if(!cloud||cloud.role!=='teacher')return;try{await cloud.finish();refreshLobby()}catch(e){toast(e.message)}};
 $('copyCodeBtn').onclick=async()=>{try{await navigator.clipboard.writeText(cloud.code);toast('학급방 코드가 복사됐어요!')}catch{toast('방 코드: '+cloud.code)}};
 $('helpBtn').onclick=()=>show('helpOverlay');
 document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>hide(x.dataset.close)));
 $('soundBtn').onclick=()=>{muted=!muted;setText('soundBtn',muted?'🔇':'🔊')};
 $('interactBtn').onclick=interact;
 $('viewBtn').onclick=()=>set3D(!use3D);init3D();
 $('storageCloseBtn').onclick=closePicker;
 $('chopSelect').value=String(chopNeed);$('chopSelect').onchange=()=>{chopNeed=Number($('chopSelect').value)||CHOPS_DEFAULT;try{localStorage.setItem('mathcook-chops',String(chopNeed))}catch{}};
 $('hintBtn').onclick=()=>{if(activeQuestion)setText('questionFeedback','💡 '+activeQuestion.pz.hint)};
 $('cancelQuestionBtn').onclick=()=>{abortQuestion();toast('준비되면 다시 도전해 보세요!')};
 $('leaveBtn').onclick=goHome;$('endHomeBtn').onclick=goHome;
 $('roomInfoBtn').onclick=()=>{if(mode==='demo')show('helpOverlay');else{show('lobbyOverlay');refreshLobby()}};
 $('restartBtn').onclick=()=>{if(mode==='demo')startDemo(currentMode);else if(cloud?.role==='teacher')cloud.begin().catch(e=>toast(e.message));else{hide('endOverlay');show('lobbyOverlay');toast('선생님이 다음 라운드를 시작하면 입장해요!')}};
 document.addEventListener('keydown',e=>{
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space','Spacebar'].includes(key)&&e.target.tagName!=='INPUT')e.preventDefault();
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(e.target.tagName==='BUTTON'&&(key===' '||key==='Spacebar')&&!activeQuestion&&!pickerOpen){e.preventDefault();e.target.blur()}   // 버튼에 남은 포커스가 Space 연타를 가로채지 않게
  if(!pickerOpen)keys.add(key);
  if((key==='e'||key===' '||key==='Space'||key==='Spacebar')&&!e.repeat)interact();
  if(pickerOpen){if(key==='Escape')closePicker();else if(/^[1-5]$/.test(key)&&!e.repeat){const b=$('storageGrid').children[Number(key)-1];if(b)takeFromStorage(b.dataset.id)}return}
  if(key==='Escape'&&activeQuestion)abortQuestion();
 });
 document.addEventListener('keyup',e=>{keys.delete(e.key.length===1?e.key.toLowerCase():e.key)});
 window.addEventListener('blur',()=>keys.clear());
 if(cloudConfigured()){setText('firebaseNote','✅ Firebase 연결 준비 완료 · 선생님이 학급방을 만들어 실시간 협동할 수 있어요.');}
 p.name='꼬마셰프';requestAnimationFrame(animate);
}
async function goHome(){
 closePicker();setHeld(null);
 if(cloud)await cloud.disconnect();cloud=null;mode='demo';teacher=false;roundStarted=false;ended=false;activeQuestion=null;sentPhase='';keys.clear();hide('endOverlay');hide('setupOverlay');hide('lobbyOverlay');hide('questionOverlay');show('menuOverlay');setRoomStatus();
}
boot();
