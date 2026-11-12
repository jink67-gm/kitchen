import { CloudRoom, cloudConfigured, planTeams } from './cloud.js';
import { stationId, isStale, boardReserve, boardStart, boardChop, boardCancel, boardTake, CHOPS_DEFAULT, CHOP_OPTIONS, cookStart, cookPhase, cookProgress, cookTake, washStart, washFinish, plateWashed, defaultPlates, MIX_PRESSES, WASH_PRESSES } from './stations.js';
import { newPlate, isPlate, contentsOf, plateMatch, missingOf, rackTake, rackReturn, plateDirtied, tablePut, tableAddCheck, tableAdd, tableLift } from './plates.js';
import { ordersTick, activeOrders, serveOrder,roundEvent,FINISH_BONUS,acceptOrder,questionsFor,acceptBonus,orderForKind, patience, patienceColor, isRush, fairScore, ORDER_TIME_OPTIONS, ORDER_TIME_DEFAULT, RUSH_SPEED, MAX_ORDERS } from './orders.js';
import { INTRO_MS, TITLE_AT, MISSION_AT, SOUND_CUES, lineAt, musicAt } from './intro.js';
import * as sfx from './sfx.js';
import { makeProblem, isCorrect, weakUnit, UNIT_NAMES } from './math.js';
import { PRESETS, sanitize, withChops, cookTimes } from './settings.js';
import { COOK_TIMES, COOK_DEFAULT } from './stations.js';
import { participationBonus, PART_BONUS } from './orders.js';
import { ICONS } from './assets/icons/map.js';
import { newItem, heldString, prepare, checkReturn, checkStore, storePut, storeTake, storageList, checkTrash, applyPenalty, STORAGE_MAX, TRASH_PENALTY } from './items.js';
const $=id=>document.getElementById(id);
const canvas=$('gameCanvas'),g=canvas.getContext('2d');
const W=18,H=12,T=48,OX=68,OY=47;
const COLOR=['#e77e95','#56c5dd','#fac268','#9d88e9','#63c49b'];
const FOOD={lettuce:{emoji:'🥬',name:'양상추',prep:'cut'},tomato:{emoji:'🍅',name:'토마토',prep:'cut'},meat:{emoji:'🥩',name:'고기',prep:'cook'},flour:{emoji:'🥣',name:'밀가루',prep:'mix'},berry:{emoji:'🍓',name:'딸기',prep:'cut'},cheese:{emoji:'🧀',name:'치즈',prep:'cut'},bread:{emoji:'🍞',name:'빵',prep:'cook'},milk:{emoji:'🥛',name:'우유',prep:'mix'},dough:{emoji:'🫓',name:'반죽',prep:'cook'}};
const RECIPES=[
 {emoji:'🥗',title:'무지개 샐러드',desc:'양상추와 토마토를 손질해요',items:['lettuce','tomato']},
 {emoji:'🍔',title:'왕왕 햄버거',desc:'빵과 고기를 굽고 양상추를 손질해요',items:['bread','meat','lettuce']},
 {emoji:'🥤',title:'분홍빛 딸기라테',desc:'딸기를 손질하고 우유를 섞어요',items:['berry','milk']},
 {emoji:'🍕',title:'치즈 폭탄 피자',desc:'반죽을 굽고 치즈와 토마토를 손질해요',items:['dough','cheese','tomato']},
 {emoji:'🥞',title:'폭신 팬케이크',desc:'밀가루와 우유를 섞고 딸기를 손질해요',items:['flour','milk','berry']},
 {emoji:'🥙',title:'싱싱 치즈 샌드',desc:'빵을 굽고 치즈·양상추·토마토를 손질해요',items:['bread','cheese','lettuce','tomato']},
 {emoji:'🍰',title:'딸기 생크림 케이크',desc:'밀가루와 딸기를 준비해요',items:['flour','berry']},
 {emoji:'🌮',title:'든든 타코',desc:'반죽과 고기를 굽고 양상추와 치즈를 손질해요',items:['dough','meat','lettuce','cheese']},
 {emoji:'🥪',title:'든든 서브 샌드위치',desc:'빵과 고기를 굽고 토마토를 손질해요',items:['bread','meat','tomato']},
 {emoji:'🧇',title:'바삭 와플',desc:'밀가루와 우유를 섞어요',items:['flour','milk']},
 {emoji:'🧁',title:'크림치즈 컵케이크',desc:'밀가루를 섞고 치즈와 딸기를 손질해요',items:['flour','cheese','berry']},
 {emoji:'🥧',title:'새콤 딸기 파이',desc:'반죽을 굽고 딸기를 손질해요',items:['dough','berry']},
 {emoji:'🫕',title:'퐁당 치즈 퐁듀',desc:'빵을 굽고 치즈를 손질하고 우유를 섞어요',items:['bread','cheese','milk']}
];   // 판마다 무작위 순서로 나옴 (orders.js pickRecipe)
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
// ── 인트로 컷신 《사라진 천재 셰프》: 게임 시작 시각(meta.startedAt)을 인트로 길이만큼 뒤로 잡고, 그 전까지는 인트로를 보여 줌 ──
// 인트로 위치 = INTRO_MS - (시작 시각 - 지금). 모든 학생이 같은 시작 시각을 보므로 같은 장면을 보고 같은 순간에 게임이 시작됨
let introUI=false,introSkipped=false,introLast=-1,demoIntro=true,introFreeze=null;   // introFreeze: 테스트용 장면 멈춤
const introPos=()=>introFreeze!=null?introFreeze:meta?.startedAt?INTRO_MS-(meta.startedAt-srvNow()):INTRO_MS;
const inIntro=()=>roundStarted&&!ended&&(introFreeze!=null||(!!meta?.startedAt&&srvNow()<meta.startedAt));
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
let chopNeed=CHOPS_DEFAULT;
// ── 9단계: 난이도 설정. 혼자 체험은 시작 화면에서 고른 값, 온라인은 방을 만든 교사의 값(meta.settings)을 모두가 씀 ──
const S=()=>sanitize(meta?.settings);
const ORDER_KEY={100000:'easy',75000:'normal',55000:'fast'};
function menuSettings(){
 const key=$('presetSelect').value,pre=PRESETS[key]||PRESETS.basic;
 const s=sanitize({...pre,cookScale:$('cookSelect').value,graceScale:$('graceSelect').value,orderTimeMs:ORDER_TIME_OPTIONS[$('orderTimeSelect').value],rushSpeed:$('rushSpeedSelect').value,rushIntervalMs:$('rushIntervalSelect').value,mathLevel:$('mathLevelSelect').value},key);
 return withChops(s,$('chopSelect').value);
}
function fillPreset(){const pre=PRESETS[$('presetSelect').value]||PRESETS.basic;$('chopSelect').value=String(pre.chops);$('cookSelect').value=String(pre.cookScale);$('graceSelect').value=String(pre.graceScale);$('orderTimeSelect').value=ORDER_KEY[pre.orderTimeMs];$('rushSpeedSelect').value=String(pre.rushSpeed);$('rushIntervalSelect').value=String(pre.rushIntervalMs);$('mathLevelSelect').value=String(pre.mathLevel)}
// 정답을 맞히면 다음 몇 번은 문제 없이 바로 작업 (매 동작마다 문제를 내지 않기 위함). 내 수학 기록도 여기 모음
let mathPass=0,myStats={correct:0,wrong:0,hints:0,units:{}};
function resetStats(){mathPass=0;myStats={correct:0,wrong:0,hints:0,units:{}};chopNeed=S().chops}
let chopChain=Promise.resolve(),cookSeen={};
// 화덕 상태가 바뀌는 순간 소리로 알림 (익음 → 경고 → 탐). 상태 자체는 시각으로 계산되므로 여기서는 알리기만 함
function cookAlerts(){const now=srvNow();let hot=false;for(const st of STATIONS){if(st.type!=='cook')continue;const id=stationId(st),b=boardOf(st),ph=b?cookPhase(b,now):'idle';if(cookSeen[id]!==ph){const prev=cookSeen[id];cookSeen[id]=ph;if(prev===undefined)continue;if(ph==='ready')sound('cookDone');else if(ph==='warning')sound('warn');else if(ph==='burnt')sound('burnt')}if(ph==='cooking'||ph==='ready'||ph==='warning')hot=true}sfx.setSizzle(hot&&roundStarted&&!ended)}
function chopSound(kind='chop'){sfx.play(kind)}
async function useBoard(st){
 const b=boardOf(st),it=p.item,now=srvNow();
 // 내가 연타 중인 도마: 누를 때마다 1회 (키를 꾹 누르는 반복 입력은 keydown에서 이미 걸러짐)
 if(b&&b.state==='working'&&b.owner===myUid&&!isStale(b,now)){
  chopChain=chopChain.then(async()=>{
   const r=await stationOp(st,s=>boardChop(s,myUid,srvNow()));
   if(!r)return;
   chopSound(st.type==='mix'?'stir':'chop');celebrate(st.x+.5,st.y+.3,r.done?12:2);
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
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);await beginOrAsk(it.kind,st.type,st)}
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
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);await beginOrAsk(it.kind,'cook',st)}
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
   chopSound('wash');celebrate(st.x+.5,st.y+.3,2);
   if(r.done)await washedOne(st);else updateUI();
  }).catch(e=>console.warn('설거지 동기화',e));
  return;
 }
 if(b){toast(`${b.name||'다른 친구'}님이 설거지하고 있어요.`);return}
 if(p.item){toast('손이 비어 있어야 설거지할 수 있어요.');sound('error');return}
 if(!(getPlates().dirty>0)){toast('씻을 접시가 없어요.');return}
 if(mode==='demo'&&!teamData.plates)teamData.plates=defaultPlates();
 const r=await stationOp(st,s=>washStart(s,myUid,p.name,S().washPresses,srvNow()));
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
function toast(t){if(inIntro())return;setText('toast',t);$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function sound(type){sfx.play(type)}
// 2대2 대결에서 다른 학생의 편: 같은 모둠 안에서 자리 번호 순으로 앞의 두 명이 A편
function sideOf(uid,seatNo){if(currentMode!=='duel')return null;if(mode==='demo')return seatNo<2?'A':'B';const list=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);return list.findIndex(([id])=>id===uid)<2?'A':'B'}
function getSide(){if(currentMode!=='duel')return 'ALL';const list=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);return (list.findIndex(([uid])=>uid===myUid)<2)?'A':'B'}
function getGroup(side=getSide()){return teamData?.groups?.[side]||blankGroup()}
// ── 6단계: 주문 대기열. 규칙은 orders.js, 여기서는 설정값과 저장 위치만 정함 ──
// 이모지 대신 그림 파일(Fluent Emoji Flat)을 넣음. 그림이 없는 이모지는 글자 그대로 둠
function putIcon(el,emoji){const src=ICONS[emoji];if(!src){el.textContent=emoji;return}if(el.dataset.emoji===emoji)return;el.dataset.emoji=emoji;const img=document.createElement('img');img.src=src;img.alt=emoji;img.className='emo';img.draggable=false;el.replaceChildren(img)}
const NO_ORDER={emoji:'⏳',title:'주문을 기다리는 중',desc:'곧 새 주문이 들어와요',items:[]};
const PREP_ICON={cut:'🔪',cook:'🔥',mix:'🥣'};
const curEvent=()=>FIXED_ORDERS?null:roundEvent(meta?.startedAt||0,RECIPES.length);   // 오늘의 이벤트 (판마다 다름)
const orderCfg=()=>({startedAt:meta?.startedAt||0,durationMs:(meta?.duration||180)*1000,orderTimeMs:Math.round(S().orderTimeMs*(curEvent()?.id==='relaxed'?1.3:1)),rushIntervalMs:S().rushIntervalMs,recipeCount:RECIPES.length,recipeSizes:RECIPES.map(r=>r.items.length),seed:FIXED_ORDERS?undefined:meta?.startedAt||0,minOrders:FIXED_ORDERS?1:(teamSize()>=3?2:1)+(curEvent()?.id==='group'?1:0)});
const FIXED_ORDERS=new URLSearchParams(location.search).get('fixedOrders')==='1';   // 테스트용: 예전처럼 차례대로 1개씩
// 내 모둠(대결은 내 편) 인원: 3명 이상이면 처음부터 주문 2개
function teamSize(){if(currentMode==='duel')return 2;if(mode==='demo')return 4;return Number(meta?.sizes?.[team])||Object.values(members||{}).filter(m=>Number(m.team)===team).length||1}
const liveOrders=(side=getSide())=>activeOrders(getGroup(side),srvNow());
const liveRecipes=()=>liveOrders().map(o=>RECIPES[o.recipeId]);
function order(side=getSide()){const o=liveOrders(side)[0];return o?RECIPES[o.recipeId]:NO_ORDER}   // 가장 먼저 온 주문
let tickBusy=false,lastTick=0,rushNow=false,myServed=0,cardKey='';
function orderTick(t){
 if(t-lastTick<200||tickBusy||!meta?.startedAt)return;lastTick=t;
 if(cloud?(cloud.role!=='student'||mode==='demo'):!teamData?.groups)return;   // 온라인 입장 처리 중이거나 교사 화면이면 주문을 건드리지 않음
 const side=getSide(),change=ordersTick(getGroup(side),srvNow(),orderCfg());
 if(!change)return;
 if(!cloud){teamData.groups[side]=change;updateUI()}
 else{tickBusy=true;cloud.groupOp(side,old=>ordersTick(old,srvNow(),orderCfg())).catch(e=>console.warn('주문 갱신',e)).finally(()=>{tickBusy=false})}
}
function rushSound(){sfx.play('rush')}
function syncEventPill(){const tx=roundStarted&&!inIntro()?eventText():'';const el=$('roundLabel');if(el.textContent!==tx)el.textContent=tx;el.classList.toggle('hidden',!tx)}
function setRush(on){if(rushNow===on)return;rushNow=on;$('stageWrap').classList.toggle('rush',on);$('rushLabel').classList.toggle('hidden',!on);if(on){rushSound();toast('🔥 러시타임! 주문이 몰려와요. 발이 빨라졌어요!')}}
// 왼쪽 위 주문 카드: 주문 목록이 바뀔 때만 다시 만들고, 게이지와 '담김' 표시는 매 프레임 갱신
function drawOrderCards(){
 const list=roundStarted?liveOrders():[],key=list.map(o=>o.id).join(','),now=srvNow(),holder=$('orderCards');
 if(key!==cardKey){cardKey=key;holder.replaceChildren(...list.map(o=>{const r=RECIPES[o.recipeId],c=document.createElement('article');c.className='ocard'+(curEvent()?.special===o.recipeId?' special':'');c.dataset.id=o.id;
   c.innerHTML='<div class="oc-tape"></div><div class="oc-dish"></div><h3></h3><div class="oc-needs"></div><div class="oc-bar"><b></b></div><button class="oc-lock" type="button">문제 풀고 주문 받기 <kbd>Q</kbd></button>';c.querySelector('.oc-lock').onclick=()=>{document.activeElement?.blur?.();askOrder(o.id)};
   putIcon(c.querySelector('.oc-dish'),r.emoji);c.querySelector('h3').textContent=r.title;
   c.querySelector('.oc-needs').replaceChildren(...r.items.map(k=>{const n=document.createElement('span');n.className='oc-need';n.dataset.kind=k;n.title=FOOD[k].name;n.innerHTML='<em></em><i></i>';putIcon(n.querySelector('em'),FOOD[k].emoji);putIcon(n.querySelector('i'),PREP_ICON[FOOD[k].prep]);return n}));return c}))}
 const plated=platedKinds();
 for(const c of holder.children){const o=list.find(v=>v.id===c.dataset.id);if(!o)continue;const f=patience(o,now),b=c.querySelector('.oc-bar b');b.style.width=(f*100).toFixed(1)+'%';b.className=patienceColor(f);c.classList.toggle('locked',!o.accepted);{const nq=questionsFor(RECIPES[o.recipeId]),lb=c.querySelector('.oc-lock'),tx=nq>1?`문제 ${nq}개 풀고 주문 받기 (${o.solved||0}/${nq}) · 보너스 +${acceptBonus(nq)}`:'문제 풀고 주문 받기';if(lb.dataset.tx!==tx){lb.dataset.tx=tx;lb.innerHTML=tx+' <kbd>Q</kbd>'}}c.classList.toggle('hurry',f>0&&f<=.25);c.classList.toggle('late',f<=0);for(const n of c.querySelectorAll('.oc-need'))n.classList.toggle('done',plated.has(n.dataset.kind))}
}

function getName(){return safeName($('nicknameInput').value)}
function setRoomStatus(){setText('connectionLabel',mode==='demo'?'혼자 체험하기':cloud?.code?'학급방 '+cloud.code:'학급방');$('connectionDot').classList.toggle('online',mode!=='demo')}
function playerColor(n){return COLOR[n%COLOR.length]}
function resetLocal(kind="coop"){
 mode='demo';cloud=null;myUid='demo';seat=0;team=0;members={demo:{name:p.name,seat:0,team:'0'},bot1:{name:'도우미1',seat:1,team:'0'},bot2:{name:'도우미2',seat:2,team:'0'},bot3:{name:'도우미3',seat:3,team:'0'}};currentMode=kind;
 const demoSec=Math.max(20,Math.min(600,Number(new URLSearchParams(location.search).get('demoSeconds'))||180));   // 주소 뒤에 ?demoSeconds=60 을 붙이면 체험 시간을 바꿀 수 있음
 meta={phase:'playing',mode:kind,unit,startedAt:Date.now()+(demoIntro&&$('introCheck').checked&&use3D?INTRO_MS:0),duration:demoSec,orderTime:ORDER_TIME_OPTIONS[$('orderTimeSelect').value]||ORDER_TIME_DEFAULT,settings:menuSettings(),sizes:[4],count:4};resetStats();
 teamData={groups:{ALL:blankGroup(),A:blankGroup(),B:blankGroup()},storage:{},stations:{},plates:defaultPlates(),solvers:{}};cookSeen={};popups=[];fx=[];closePicker();
 players={demo:{...p}};allTeams={0:{data:teamData}};totalTime=demoSec;nowTime=demoSec;roundStarted=true;ended=false;pending=false;elapsed=0;rivalServed=0;activeQuestion=null;myServed=0;cardKey='';setRush(false);
 hide('menuOverlay');hide('setupOverlay');hide('endOverlay');hide('lobbyOverlay');hide('questionOverlay');
 setRoomStatus();setText('modeLabel',kind==='duel'?'봇과 2대2 대결 · 나는 🌸 A편':'혼자 체험');$('modeLabel').dataset.side=kind==='duel'?'A':'';updateUI();toast('요리사 출동! 재료 상자에서 시작해 보세요 🍓');setTimeout(()=>{if(!inIntro())announceEvent()},2800);
}
function startDemo(kind='coop',withIntro=true){demoIntro=withIntro;unit=$('unitSelect').value;p={x:7,y:7,dir:'down',held:'',item:null,name:getName(),seat:0,updatedAt:Date.now()};resetLocal(kind)}
function setModeUI(){let nm={coop:'협동 요리',duel:'2대2 대결',class:'협동 요리'};setText('modeLabel',(nm[currentMode]||nm.coop)+(currentMode==='duel'?(getSide()==='A'?' · 나는 🌸 A편':' · 나는 🌊 B편'):''));$('modeLabel').dataset.side=currentMode==='duel'?getSide():'';}
function updateUI(){
 if(!roundStarted)return;
 let side=getSide(),grp=getGroup(side),rec=order(side);
 const plated=platedKinds();
 putIcon($('orderEmoji'),rec.emoji);setText('orderTitle',rec.title);setText('orderDesc',rec.desc);setText('orderCount',((grp.served||0)+1)+'번째 주문');
 $('orderIngredients').replaceChildren(...rec.items.map(k=>{let e=document.createElement('div');e.className='ingredient-chip'+(plated.has(k)?' done':'');e.innerHTML='<span class="chip-ico"></span><div>'+FOOD[k].name+'<small style="display:block;color:#afc6d5">'+(plated.has(k)?'✅ 접시에 담김':'준비해서 접시에 담기')+'</small></div>';putIcon(e.querySelector('.chip-ico'),FOOD[k].emoji);return e}));
 let roster=mode==='demo'?[{id:'demo',...p},...bots.map((b,i)=>({id:'bot'+i,...b}))]:Object.entries(players||{}).map(([id,v])=>({id,...v})).sort((a,b)=>a.seat-b.seat);
 $('playerRoster').replaceChildren(...roster.map(v=>{const e=document.createElement('div');e.className='roster-item';let side=currentMode==='duel'?(v.seat%4<2?'A팀':'B팀'):(v.id===myUid?'나':'팀원');const solved=teamData?.solvers?.[v.id==='demo'?myUid:v.id]||0;if(!String(v.id).startsWith('bot'))side+=' · 정답 '+solved;e.innerHTML='<span class="roster-avatar" style="background:'+playerColor(v.seat)+'">🍳</span><span class="roster-name"></span><span class="roster-team">'+side+'</span>';e.querySelector('.roster-name').textContent=v.name;return e}));
 setText('scoreLabel',grp.score||0);setText('scoreDetail',`완성 요리 ${grp.served||0}개 · 수학 정답 ${grp.correct||0}개`+((grp.combo||0)>0&&srvNow()-(grp.lastServeAt||0)<=14000?` · 🔥 콤보 ${grp.combo}`:''));
 if(currentMode==='duel'){let a=getGroup('A'),b=getGroup('B');$('teamRanking').innerHTML=`<div class="ranking-item">🌸 A팀 <b>${a.score||0}점</b></div><div class="ranking-item">🌊 B팀 <b>${b.score||0}점</b></div>`}
 else if(meta?.sizes?.length>1){let ranking=Object.entries(allTeams).map(([id,v])=>{let d=v?.data?.groups?.ALL||{};let size=meta.sizes[Number(id)]||4;return {id,score:d.score||0,normalized:fairScore(d.score,size)}}).sort((a,b)=>b.normalized-a.normalized);$('teamRanking').replaceChildren(...ranking.map(v=>{let e=document.createElement('div');e.className='ranking-item';e.textContent=`${Number(v.id)+1}팀 · 보정 ${v.normalized}점`;return e}));}
 else $('teamRanking').textContent='함께 만들면 점수가 올라가요!';
 const hi=p.item;setText('heldLabel',!hi?'빈손':isPlate(hi)?`접시 · ${contentsOf(hi).length?contentsOf(hi).map(k=>FOOD[k].name).join('+')+(plateMatch(contentsOf(hi),liveRecipes())?' 완성!':' 미완성'):'비어 있음'}`:`${FOOD[hi.kind].name} · ${hi.state==='raw'?'손질 전':hi.state==='burnt'?'탄 것':'준비 완료'}`);
 let station=nearestStation();
 const ns=nextStep();let h=ns?ns.text:station?getStationHint(station):'재료 상자로 이동해서 E를 눌러 보세요!';setText('statusHint',h);setText('missionText',`현재 주문: ${rec.title} · ${rec.items.map(k=>FOOD[k].name).join(' + ')}. 친구들과 나누어 준비해 보세요!`);
 setModeUI();
}
// 받침에 따라 을/를
const eul=w=>w+(((w.charCodeAt(w.length-1)-0xAC00)%28)?'을':'를');
const PREP_PLACE={cut:['도마','썰기'],cook:['화덕','굽기'],mix:['믹서','섞기']};
// 다음 할 일: 지금 상태에서 무엇을 하면 되는지 한 줄 + 가야 할 설비 (화면에 화살표로 표시)
function nextStep(){
 if(!roundStarted||ended)return null;
 const T=type=>STATIONS.filter(s=>s.type===type),it=p.item,os=liveOrders();
 if(it&&!isPlate(it)&&it.state==='burnt')return{text:'탄 음식은 쓰레기통에 버려요.',targets:T('trash')};
 if(it&&isPlate(it)){const c=contentsOf(it);if(plateMatch(c,liveRecipes()))return{text:'요리 완성! 서빙 벨로 가져가서 E를 누르고 마지막 문제를 풀어요.',targets:T('serve')};return{text:c.length?'재료가 아직 모자라요. 접시를 플레이팅대에 다시 놓아요.':'빈 접시를 플레이팅대에 놓아요.',targets:T('plate').filter(s=>!boardOf(s))}}
 if(it&&it.state==='raw'){const pr=FOOD[it.kind].prep,free=T(pr).filter(s=>!boardOf(s));return{text:`${eul(FOOD[it.kind].name)} ${PREP_PLACE[pr][0]}에 올리고 E를 눌러요.`,targets:free.length?free:T(pr)}}
 if(it){const tables=T('plate').filter(s=>boardOf(s)?.state==='plate');if(tables.length)return{text:`준비한 ${eul(FOOD[it.kind].name)} 플레이팅대의 접시에 올려요.`,targets:tables};return{text:'접시가 아직 없어요. 재료를 보관대에 두고 접시대에서 접시를 꺼내요.',targets:T('storage')}}
 if(!os.length)return{text:'새 주문을 기다려요.',targets:[]};
 const views=boardViews(),at=v=>STATIONS.filter(s=>s.x===v.x&&s.y===v.y);
 const mine=views.find(v=>v.owner==='me'&&v.state==='working'&&v.type!=='sink');if(mine)return{text:'E나 Space를 여러 번 눌러 손질을 끝내요!',targets:at(mine)};
 const done=views.find(v=>v.type==='plate'&&v.complete);if(done)return{text:'요리 완성! 빈손으로 접시를 들어요.',targets:at(done)};
 const acc=os.filter(o=>o.accepted);
 if(!acc.length)return{text:'왼쪽 위 주문서의 "문제 풀고 주문 받기"를 누르거나 Q를 눌러요.',targets:[]};
 const burnt=views.find(v=>v.type==='cook'&&v.state==='burnt');if(burnt)return{text:'탄 음식을 꺼내 쓰레기통에 버려요.',targets:at(burnt)};
 if(!T('plate').some(s=>boardOf(s)?.state==='plate'))return getPlates().clean>0?{text:'접시대에서 접시를 꺼내 플레이팅대에 놓아요.',targets:T('rack')}:{text:'깨끗한 접시가 없어요. 싱크대에서 설거지해요.',targets:T('sink')};
 const plated=platedKinds(),missing=[...new Set(acc.flatMap(o=>RECIPES[o.recipeId].items))].filter(k=>!plated.has(k));
 const ready=views.find(v=>['cut','mix','cook'].includes(v.type)&&missing.includes(v.kind)&&(v.type==='cook'?v.ready:v.look==='ready'));
 if(ready)return{text:`다 된 ${eul(FOOD[ready.kind].name)} 빈손으로 꺼내요.`,targets:at(ready)};
 const stored=storageList(getStorage()).find(r=>missing.includes(r.kind)&&r.state!=='raw');if(stored)return{text:`보관대에서 ${eul(FOOD[stored.kind].name)} 꺼내요.`,targets:T('storage')};
 const todo=missing.filter(k=>!views.some(v=>v.kind===k));
 if(todo.length){const k=todo[0];return{text:`${FOOD[k].name} 상자에서 재료를 집어요. (${PREP_PLACE[FOOD[k].prep][0]}에서 ${PREP_PLACE[FOOD[k].prep][1]})`,targets:STATIONS.filter(s=>s.type==='bin'&&s.food===k)}}
 const cooking=views.filter(v=>v.type==='cook'&&v.state==='cooking');if(cooking.length)return{text:'익을 때까지 기다려요. 타기 전에 꺼내요!',targets:cooking.flatMap(at)};
 return{text:os.some(o=>!o.accepted)?'다음 주문도 받아 둘까요? Q를 눌러요.':'친구가 준비하고 있어요. 접시와 다음 재료를 챙겨요.',targets:[]};
}
// 가까이 가면 잠깐(3.5초) 뜨는 이름표: 재료 상자는 "토마토 · 도마에서 썰기"
const tagSince=new Map();
function nearTags(t){
 const out=[],focus=nearestStation();
 for(const s of STATIONS){if(PASSIVE.has(s.type))continue;const k=s.x+','+s.y,near=Math.hypot(s.x+.5-p.x,s.y+.5-p.y)<1.9;
  if(!near){tagSince.delete(k);continue}
  if(!tagSince.has(k))tagSince.set(k,t);
  if(t-tagSince.get(k)>=4500)continue;const main=s===focus;
  out.push({x:s.x,y:s.y,main,text:s.type!=='bin'?s.label:main?`${FOOD[s.food].name} · ${PREP_PLACE[FOOD[s.food].prep][0]}에서 ${PREP_PLACE[FOOD[s.food].prep][1]}`:FOOD[s.food].name});}
 return out;
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
async function interact(){if(inIntro())return;
 if(!roundStarted||ended||activeQuestion||pending||pickerOpen)return;
 const st=nearestStation();if(!st){toast('조리대나 재료 상자 가까이 가보세요!');return}
 let held=p.held;
 if(isPlate(p.item)&&!['plate','serve','rack','trash'].includes(st.type)){toast('접시는 🍽️ 플레이팅대에 놓거나 🔔 서빙 벨로 가져가요.');sound('error');return}
 if(st.type==='bin'){
  if(p.item){
   const r=checkReturn(p.item,st),nm=FOOD[p.item.kind].name;
   if(r.ok){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);toast('↩️ '+nm+'을(를) 상자에 돌려놓았어요.');sound('return');updateUI();return}
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
   if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);sound('plate')}else toast('다른 친구가 먼저 접시를 놓았어요!');
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
   else{celebrate(st.x+.5,st.y+.5,4);toast('🍽️ '+nm+' 담기 완료! 남은 재료: '+missingOf(contentsOf(r.next.plate),recs).map(k=>FOOD[k].name).join(', '));sound('plate')}}
  else toast('다른 친구가 먼저 담았어요!');
 }catch(e){toast('플레이팅에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
}
// 서빙 벨: 완성 접시를 직접 들고 와야만 점수. 서빙한 접시는 더러운 접시가 되어 싱크대로 감
function bellSound(){sfx.play('serve')}
async function useServe(st,finish=null){
 const it=p.item,recs=liveRecipes();
 if(!isPlate(it)){toast('완성한 접시를 직접 들고 와야 서빙할 수 있어요!');sound('error');return}
 const c=contentsOf(it);
 if(!plateMatch(c,recs)){const miss=missingOf(c,recs);toast(!c.length?'빈 접시는 서빙할 수 없어요!':miss.length?'아직 완성되지 않은 접시예요. 남은 재료: '+miss.map(k=>FOOD[k].name).join(', '):'지금 주문에 없는 요리예요. 주문 카드를 확인해요!');sound('error');return}
 if(finish==null){askMath(null,'serve',null,null,{st,rec:plateMatch(c,recs)});return}   // 완성 문제를 맞혀야 서빙
 pending=true;
 try{
  let out;const side=getSide();
  if(mode!=='demo')out=await cloud.servePlate(side,c,RECIPES,srvNow,finish,curEvent());
  else{out=serveOrder(getGroup(side),c,RECIPES,srvNow(),finish,curEvent());if(out)teamData.groups[side]=out.next}
  if(out){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);await platesOp(plateDirtied);myServed++;
   const title=RECIPES[out.order.recipeId].title,extra=[out.special?`추천 요리 +${out.special}`:'',out.finish?`완성 문제 +${out.finish}`:'',out.size?`재료 많은 요리 +${out.size}`:'',out.tip?`팁 +${out.tip}`:'',out.bonus?`콤보 +${out.bonus}`:''].filter(Boolean).join(', ');
   if(mode!=='demo'&&cloud){const ids=Object.entries(members).filter(([,m])=>Number(m.team)===team).map(([id])=>id);cloud.groupOp(side,g=>participationBonus(g,ids,teamData?.solvers)).then(g=>{if(g&&g.partBonus){cloud.publishScore(side,g);toast(`🙌 팀원 모두가 문제를 풀었어요! 참여 보너스 +${PART_BONUS}`)}}).catch(()=>{})}
   celebrate(st.x+.5,st.y+.5,25);popups.push({text:'+'+out.gained,x:st.x+.5,y:st.y+.5,t:performance.now()});p.cheer=performance.now();bellSound();if(out.combo>0){popups.push({text:`🔥 콤보 ×${out.combo+1}`,x:st.x+.5,y:st.y-.6,t:performance.now()+250,hot:true});sound('combo')}toast(`🎉 ${title} 서빙 완료! +${out.gained}점`+(extra?` (${extra})`:''));}
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
  if(ok){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);toast('🗄️ '+FOOD[it.kind].name+' 보관 완료!');sound('store')}
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
  try{flyFx(p.held,p,st);setHeld({...it,contents:[]});await updatePlayer(true);if(mode!=='demo')await cloud.penalize(getSide());else{const gr=getGroup();gr.score=applyPenalty(gr.score)}toast(`🗑️ 접시 위 음식을 버렸어요. -${TRASH_PENALTY}점`);sound('trash')}catch(e){toast('버리기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 const r=checkTrash(it);
 if(!r.ok){toast(r.reason==='raw'?`손질 전 재료는 ${FOOD[it.kind].name} 상자에 돌려놓으면 감점이 없어요.`:'버릴 재료가 없어요.');if(it)sound('error');return}
 pending=true;
 try{
  flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);
  if(mode!=='demo')await cloud.penalize(getSide());else{const gr=getGroup();gr.score=applyPenalty(gr.score)}
  toast(`🗑️ ${FOOD[it.kind].name}을(를) 버렸어요. -${TRASH_PENALTY}점`);sound('trash');
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
async function mathStat(correct,unitNum){const k=correct?'correct':'wrong';myStats[k]++;(myStats.units[unitNum]=myStats.units[unitNum]||{correct:0,wrong:0})[k]++;let gr=getGroup();if(mode==='demo'){gr[k]++;if(correct){teamData.solvers=teamData.solvers||{};teamData.solvers[myUid]=(teamData.solvers[myUid]||0)+1}return}await cloud.writeMath(getSide(),correct,unitNum)}
function hintStat(unitNum){myStats.hints++;if(mode!=='demo'&&cloud)cloud.writeHint(unitNum).catch(()=>{})}
function shuffle(a){let z=[...a];for(let i=z.length-1;i>0;i--){let j=rnd(0,i);[z[i],z[j]]=[z[j],z[i]]}return z}
function mkProblem(u){return makeProblem(Number(u)||rnd(1,6),S().mathLevel)}   // 문제 만들기는 math.js
// 주문 받기 문제 (주문 카드의 버튼이나 Q 키). 맞히면 그 요리의 재료는 모두 문제 없이 준비
function askOrder(id){
 if(!roundStarted||activeQuestion||pickerOpen||inIntro())return;
 const o=liveOrders().find(v=>!v.accepted&&(!id||v.id===id));if(!o){if(liveOrders().length)toast('이미 받은 주문이에요. 재료를 준비해요!');return}
 askMath(null,'order',null,o.id);
}
async function acceptNow(q){
 const side=getSide(),fn=old=>{const oo=old&&old.orders&&old.orders[q.orderId];return oo?acceptOrder(old,q.orderId,srvNow(),srvNow()-q.openedAt,questionsFor(RECIPES[oo.recipeId])):null};
 let n=null;
 try{if(mode==='demo'||!cloud){n=fn(getGroup(side));if(n)teamData.groups[side]=n}else n=await cloud.groupOp(side,fn)}catch(e){console.warn('주문 받기',e)}
 return (n||getGroup(side)).orders?.[q.orderId]||null;   // 갱신된 주문 (이미 서빙되어 사라졌으면 null)
}
// 수학 단원: 'all' 또는 '1,3,5'처럼 고른 단원들 중에서 무작위
const unitList=u=>u==='all'||!u?[1,2,3,4,5,6]:String(u).split(',').map(Number).filter(n=>n>=1&&n<=6);
function pickUnit(){const l=unitList(unit);return l.length?l[rnd(0,l.length-1)]:rnd(1,6)}
function askMath(food,kind,board=null,orderId=null,serve=null){
 const pz=mkProblem(pickUnit()),icon={cut:'🔪',cook:'🔥',mix:'🥣'}[kind];
 activeQuestion={food,kind,pz,wrong:false,board,orderId,serve,openedAt:srvNow()};
 const orec=orderId?RECIPES[liveOrders().find(v=>v.id===orderId)?.recipeId]:null;
if(serve){putIcon($('questionFood'),serve.rec.emoji);setText('questionTitle',serve.rec.title+' 완성! 마지막 문제')}else if(orec){const oo=liveOrders().find(v=>v.id===orderId),nq=questionsFor(orec);putIcon($('questionFood'),orec.emoji);setText('questionTitle',orec.title+' 주문 받기!'+(nq>1?` (${(oo?.solved||0)+1}/${nq})`:''))}else{setText('questionFood',FOOD[food].emoji+icon);setText('questionTitle',FOOD[food].name+' 요리 미션!')}setText('questionUnit',pz.unit+'단원 · '+UNIT_NAMES[pz.unit]);setMath('questionText',pz.question);setText('questionFeedback',serve?`맞히면 서빙! 한 번에 맞히면 +${FINISH_BONUS}점`:orec?(questionsFor(orec)>1?`재료가 많은 요리라 ${questionsFor(orec)}문제예요. 다 맞히면 보너스 +${acceptBonus(questionsFor(orec))}점! `:'')+'맞히면 이 요리의 재료는 문제 없이 준비해요. 푸는 동안 이 주문의 시간은 멈춰요.':'정답을 골라 재료를 준비해요.');
 $('questionGrid').replaceChildren();if(pz.grid){const tb=document.createElement('table');tb.className='block-grid';for(const row of pz.grid){const tr=tb.insertRow();for(const v of row)tr.insertCell().textContent=v}const cap=document.createElement('div');cap.className='block-grid-cap';cap.textContent='↑ 뒤 · 앞 ↓';$('questionGrid').append(tb,cap)}
 let ans=$('answerGrid');ans.replaceChildren(...pz.options.map((opt,i)=>{let b=document.createElement('button');b.className='answer-btn';b.innerHTML='<span class="opt-no">'+(i+1)+'</span>'+fracHTML(opt);b.addEventListener('click',()=>answerMath(opt,b));return b}));show('questionOverlay');sound('pickup');
}
// 설비에 올린 재료의 작업을 시작 (도마·믹서는 연타, 화덕은 굽기). 성공하면 안내 문구를 돌려줌
async function startWork(kind,st){
 const item=boardOf(st)?.item?.kind;
 if(kind==='cook'){const r=await stationOp(st,s=>cookStart(s,myUid,srvNow(),cookTimes(COOK_TIMES[item]||COOK_DEFAULT,S())));if(r)sound('panStart');return r?'🔥 굽기 시작! 다 익으면 타기 전에 E로 꺼내요.':''}
 const n=kind==='mix'?S().mixPresses:chopNeed,r=await stationOp(st,s=>boardStart(s,myUid,n,srvNow()));
 return r?(kind==='mix'?`🥣 이제 E나 Space를 ${n}번 눌러 저어요!`:`🔪 이제 E나 Space를 ${n}번 눌러 손질해요!`):'';
}
// 방금 정답을 맞혔다면 문제 없이 바로 시작, 아니면 문제를 냄
async function beginOrAsk(kind,type,st){
 const need=orderForKind(getGroup(),kind,RECIPES,srvNow());
 if(need==='free'){const msg=await startWork(type,st);toast(msg?'받은 주문이라 문제 없이 바로! '+msg:'다시 사용해 주세요.');return}
 if(need){askMath(kind,type,st,need);return}
 if(mathPass>0){mathPass--;const msg=await startWork(type,st);toast(msg?'문제 없이 바로! '+msg:'다시 사용해 주세요.');return}
 askMath(kind,type,st);
}
async function answerMath(choice,button){if(!activeQuestion||activeQuestion.solving)return;let q=activeQuestion,correct=isCorrect(q.pz,choice);
 if(!correct){button.classList.add('wrong');button.disabled=true;q.wrong=true;setText('questionFeedback','아쉬워요! 다시 골라 보세요. '+q.pz.hint);sound('error');await mathStat(false,q.pz.unit);return}
 q.solving=true;button.classList.add('correct');setMath('questionFeedback','정답! '+q.pz.explanation+' ✨');sound('success');await mathStat(true,q.pz.unit);
 setTimeout(async()=>{if(activeQuestion!==q)return;document.activeElement?.blur?.();
  if(q.orderId){const oo=await acceptNow(q);
   if(oo&&!oo.accepted){activeQuestion=null;toast(`정답! 한 문제 더 (${oo.solved}/${questionsFor(RECIPES[oo.recipeId])})`);askMath(q.food,q.kind,q.board,q.orderId);return}   // 어려운 요리: 다음 문제로 이어짐
   const bonus=oo?acceptBonus(questionsFor(RECIPES[oo.recipeId])):0;if(bonus){popups.push({text:'+'+bonus,x:p.x,y:p.y-.6,t:performance.now()});q.bonusMsg=` 문제 보너스 +${bonus}점!`}}
  if(q.kind==='serve'){activeQuestion=null;hide('questionOverlay');await useServe(q.serve.st,q.wrong?0:FINISH_BONUS);updateUI();return}
  if(q.kind==='order'){activeQuestion=null;hide('questionOverlay');sound('success');toast('📝 주문을 받았어요!'+(q.bonusMsg||'')+' 이 요리의 재료는 문제 없이 준비해요.');updateUI();return}
  if(q.board){activeQuestion=null;hide('questionOverlay');if(!q.orderId)mathPass=S().freePass;const msg=await startWork(q.kind,q.board);toast(msg||'다시 사용해 주세요.');updateUI();return}
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
function introTeam(){
 if(mode==='demo')return [{name:p.name,seat:0,me:true},...bots.map(b=>({name:b.name,seat:b.seat}))];
 return Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat).map(([id,m])=>({name:m.name,seat:m.seat,me:id===myUid}));
}
function introTick(){
 const pos=introPos();
 if(!introUI){introUI=true;introLast=pos;introSkipped=introSkipped||!use3D;keys.clear();show('introLayer');$('stageWrap').classList.add('intro-on')}
 const watching=!introSkipped&&use3D,l=watching?lineAt(pos):null;
 $('stageWrap').classList.toggle('intro-watch',watching);
 $('introSub').classList.toggle('hidden',!l);if(l){setText('introWho',l[2]);setText('introText',l[3]);$('introSub').dataset.who=l[2]}
 $('introChapter').classList.toggle('hidden',!(watching&&pos<3600));$('introChapter').style.opacity=String(Math.min(1,pos/400,(3600-pos)/600));
 const titleOn=pos>=(watching?TITLE_AT:MISSION_AT-1200);
 $('introTitle').classList.toggle('hidden',!titleOn);$('introTitle').classList.toggle('mission',pos>=MISSION_AT);
 const wait=!watching&&!titleOn;$('introWait').classList.toggle('hidden',!wait);
 if(wait)setText('introWait',`친구들과 함께 시작해요! ${Math.max(1,Math.ceil((meta.startedAt-srvNow())/1000))}초`);
 $('introSkip').classList.toggle('hidden',pos>=TITLE_AT-400||(introSkipped&&mode!=='demo'));
 if(watching){for(const [at,name] of SOUND_CUES)if(introLast<at&&pos>=at&&pos-at<700)sfx.play(name);sfx.setMusic(musicAt(pos))}
 else{if(introLast<MISSION_AT&&pos>=MISSION_AT)sfx.play('missionStart');sfx.setMusic(null)}
 introLast=pos;
}
function introClear(){if(!introUI)return;introUI=false;introSkipped=false;hide('introLayer');$('stageWrap').classList.remove('intro-on','intro-watch');sfx.setMusic(null)}
function introDone(){introClear();toast('🎉 영업 시작! 주문서의 문제를 풀고 요리를 시작해요.');setTimeout(announceEvent,2700);updateUI()}
// 오늘의 이벤트 알림 + 위쪽 표시줄
function eventText(){const e=curEvent();if(!e)return '';return '⭐ '+e.title+(e.special!=null?' · '+RECIPES[e.special].title+' +50':'')}
function announceEvent(){const e=curEvent();if(!e||!roundStarted||ended)return;toast('오늘의 이벤트! '+eventText().slice(2)+' — '+e.desc);sound('success')}
// 건너뛰기: 혼자 체험은 바로 MISSION START로, 온라인 학생은 내 화면만 건너뛰고 친구들과 함께 시작할 때까지 카운트다운
function skipIntro(){
 if(!inIntro())return;sfx.setMusic(null);
 if(mode==='demo'){meta.startedAt=Math.min(meta.startedAt,Date.now()+INTRO_MS-MISSION_AT+300);introLast=introPos();return}
 introSkipped=true;
}
// 장면에 맞는 배경음악: 메뉴·대기실(잔잔) / 요리(경쾌) / 러시타임(긴박) / 결과(느긋). 인트로는 introTick이 따로 정함
// 브라우저는 첫 클릭·키 입력 전에는 소리를 막으므로 그 뒤부터 켬
let audioOK=false,musicCheck=0;
addEventListener('pointerdown',()=>{audioOK=true},{once:true});addEventListener('keydown',()=>{audioOK=true},{once:true});
function syncMusic(){
 if(!audioOK||introUI||inIntro())return;
 sfx.setMusic(roundStarted&&!ended?(rushNow?'rush':'cook'):ended&&!$('endOverlay').classList.contains('hidden')?'result':'lobby');
}
function drawGame(t){
 if(use3D&&view3d){
  try{
   if(inIntro()&&!introSkipped){view3d.render({chefs:[],focus:null,focusLabel:'',boards:[],storage:[],fx:[],popups:[],orders:[],rush:false,tags:[],guide:[],guests:[],order:null,particles:[],dim:false,intro:{ms:introPos(),team:introTeam()}},t);return}
   const chefs=mode==='demo'?bots.map((b,i)=>({id:'bot'+i,...b,side:sideOf('bot'+i,b.seat)})):Object.entries(players).filter(([id])=>id!==myUid).map(([id,ch])=>({id,...ch,side:sideOf(id)}));
   if(roundStarted)chefs.push({id:'me',...p,mine:true,side:currentMode==='duel'?getSide():null});
   const foc=roundStarted&&!activeQuestion&&!pickerOpen?nearestStation():null;
   view3d.render({chefs,focus:foc,focusLabel:foc?actionLabel(foc):'',boards:boardViews(),storage:storageList(getStorage()),fx,popups,orders:roundStarted?liveRecipes().map(r=>({items:r.items,emoji:r.emoji})):[],rush:rushNow,tags:roundStarted?nearTags(t):[],guide:(()=>{const ns=nextStep();return ns&&((getGroup().served||0)<2||S().freePass>=2)?ns.targets.map(s=>({x:s.x,y:s.y})):[]})(),guests:roundStarted?liveOrders().map(o=>({id:o.id,emoji:RECIPES[o.recipeId].emoji,f:patience(o,srvNow()),locked:!o.accepted})):[],order:roundStarted?{items:order().items,emoji:order().emoji}:null,particles:particles.map(pt=>({x:(pt.x-OX)/T,y:(pt.y-OY)/T,life:pt.life,color:pt.color})),dim:!roundStarted},t);
   return;
  }catch(e){console.warn('3D 그리기 오류',e);gl3dErrors=gl3dErrors.filter(t=>performance.now()-t<5000);gl3dErrors.push(performance.now());if(gl3dErrors.length>=5)rebuild3D('그리기 오류가 반복됨');return}   // 한두 번은 넘어가고, 반복되면 3D를 새로 켬 (2D로 바꾸지 않음)
 }
 if(!fallback2D)return;   // 3D 준비 중이거나 다시 켜는 중에는 2D를 그리지 않음
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
// 화면: 항상 3D. 2D 그림은 기기가 3D(WebGL)를 아예 지원하지 않을 때만 (fallback2D)
let fallback2D=false,gl3dErrors=[],rebuilding3D=false;
const hasWebGL=()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch{return false}};
function set3D(on){use3D=!!(on&&view3d);$('game3d').classList.toggle('hidden',!use3D);canvas.classList.toggle('hidden',use3D||!fallback2D);$('loading3d').classList.toggle('hidden',use3D||fallback2D);setText('viewBtn',use3D?'2D로 보기':'3D로 보기');$('viewBtn').classList.add('hidden');try{localStorage.setItem('mathcook-view',use3D?'3d':'2d')}catch{}}
// 3D를 새로 켜기: 그래픽 연결이 끊기거나 오류가 반복될 때. 새 캔버스로 바꾼 뒤 다시 만듦
function rebuild3D(why){
 if(rebuilding3D||fallback2D)return;rebuilding3D=true;console.warn('3D 다시 켜는 중:',why);
 view3d=null;set3D(false);setText('loading3dSub','화면을 다시 준비하는 중이에요');
 const old=$('game3d'),c=old.cloneNode(false);old.replaceWith(c);
 setTimeout(()=>{rebuilding3D=false;init3D()},800);
}
let init3DTries=0;
async function init3D(){
 init3DTries++;
 if(!hasWebGL()){fallback2D=true;view3d=null;set3D(false);setTimeout(()=>toast('이 기기는 3D를 지원하지 않아 간단한 화면으로 보여요.'),1500);return}
 try{const mod=await import('./render3d.js');try{await Promise.race([document.fonts.load('bold 40px Galmuri11'),new Promise(r=>setTimeout(r,1500))])}catch{}   // 3D 글자에 쓸 글꼴을 먼저 불러옴
  let models=init3D.models||new Map();if(!init3D.models)try{models=await (await import('./models.js')).loadModels()}catch(e){console.warn('3D 모델을 불러오지 못해 기본 모형을 씁니다.',e)}
  if(!init3D.models)init3D.models=models;
  const cv=$('game3d');cv.addEventListener('webglcontextlost',e=>{e.preventDefault();rebuild3D('그래픽 연결이 끊김')},{once:true});
  view3d=mod.createRenderer3D(cv,{W,H,stations:STATIONS,foods:FOOD,icons:ICONS,models:init3D.models});init3DTries=0;let saved='3d';try{saved=localStorage.getItem('mathcook-view')||'3d'}catch{}set3D(true);window.__view3d=view3d}
 catch(e){console.warn('3D를 켜지 못함 (시도 '+init3DTries+'번)',e);view3d=null;set3D(false);
  if(init3DTries<3){setText('loading3dSub','다시 시도하는 중이에요 ('+init3DTries+'/3)');const old=$('game3d'),c=old.cloneNode(false);old.replaceWith(c);setTimeout(init3D,1500)}
  else{fallback2D=true;set3D(false);toast('3D 화면을 켤 수 없어 간단한 화면으로 보여요. 브라우저를 다시 열어 보세요.')}}
}
window.__game={get music(){return sfx.musicName()},introSeek(ms){if(mode==='demo'&&meta){meta.startedAt=srvNow()+INTRO_MS-ms;introLast=ms}},introHold(ms){if(mode==='demo'){introFreeze=ms;if(ms==null&&meta)meta.startedAt=Math.min(meta.startedAt,Date.now())}},get intro(){return {on:inIntro(),pos:Math.round(introPos()),skipped:introSkipped,ui:introUI,startAt:meta?.startedAt||0,offset:cloud?.serverOffset||0}},get p(){return p},get group(){return getGroup()},get use3D(){return use3D},get question(){return activeQuestion},get storage(){return storageList(getStorage())},get boards(){return boardViews()},get plates(){return getPlates()},get orderIndex(){return getGroup().served||0},get orders(){return liveOrders().map(o=>({id:o.id,accepted:!!o.accepted,recipe:RECIPES[o.recipeId].title,left:(o.expiresAt-srvNow())/1000}))},get rush(){return rushNow},get settings(){return S()},get mathPass(){return mathPass},get stats(){return myStats},get mode(){return mode},get cloud(){return cloud},get players(){return players},get room(){return cloud?{code:cloud.code,role:cloud.role,team:cloud.team,seat:cloud.seat,uid:cloud.uid}:null},get teams(){return allTeams},get started(){return roundStarted},get volume(){return sfx.getVolume()},get samples(){return sfx.sampleCount()},get combo(){return getGroup().combo||0},get meta(){return meta},get chopNeed(){return chopNeed},get pickerOpen(){return pickerOpen}}; // 자동 테스트·디버깅용 읽기 창구
function animate(t){fx=fx.filter(f=>t-f.t<450);popups=popups.filter(f=>t-f.t<1700);if(roundStarted)cookAlerts();let dt=Math.min(.05,(t-last)/1000);last=t;clock+=dt;
 if(roundStarted&&!ended&&inIntro())introTick();
 else if(roundStarted&&!ended){if(introUI)introDone();
  if(!activeQuestion&&!pickerOpen){let dx=0,dy=0;if(keys.has('ArrowLeft')||keys.has('a'))dx--;if(keys.has('ArrowRight')||keys.has('d'))dx++;if(keys.has('ArrowUp')||keys.has('w'))dy--;if(keys.has('ArrowDown')||keys.has('s'))dy++;
   if(dx||dy){let len=Math.hypot(dx,dy);dx/=len;dy/=len;let s=dt*5.2*(rushNow?S().rushSpeed:1);let nx=p.x+dx*s,ny=p.y+dy*s;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');p.updatedAt=Date.now();if(mode!=='demo'&&cloud)cloud.syncPlayer(p).catch(()=>{});}
  }
  if(mode==='demo')for(let b of bots){let dist=Math.hypot(b.tx-b.x,b.ty-b.y);if(dist<.2||Math.random()<dt*.2){b.tx=rnd(4,13)+.5;b.ty=rnd(3,9)+.5}let vx=(b.tx-b.x)/(dist||1),vy=(b.ty-b.y)/(dist||1);let nx=b.x+vx*dt*.9,ny=b.y+vy*dt*.9;if(walkable(nx,b.y))b.x=nx;if(walkable(b.x,ny))b.y=ny;}
  let started=mode==='demo'?meta.startedAt:meta?.startedAt||Date.now();nowTime=Math.max(0,(meta?.duration||180)-(Date.now()+(cloud?.serverOffset||0)-started)/1000);
  $('timerLabel').parentElement.classList.toggle('final',roundStarted&&nowTime<=30);setText('timerLabel',`${String(Math.floor(nowTime/60)).padStart(2,'0')}:${String(Math.floor(nowTime%60)).padStart(2,'0')}`);
  elapsed=(meta?.duration||180)-nowTime;
  if(mode==='demo'&&currentMode==='duel'&&Math.floor(elapsed/35)>rivalServed){rivalServed++;let gr=getGroup('B');gr.score+=100;gr.served++;toast('⚔️ 라이벌 B팀이 요리를 완성했어요!')}
  setRush(isRush(elapsed*1000,(meta?.duration||180)*1000)&&nowTime>0);orderTick(t);
  if(nowTime<=0)finishRound();
  if(clock-ambience>1){ambience=clock;updateUI()}
 }
 for(let pt of particles){pt.x+=pt.vx*dt*60;pt.y+=pt.vy*dt*60;pt.vy+=.09*dt*60;pt.life-=dt*.9}particles=particles.filter(p=>p.life>0);
 if(cloud?.role==='teacher' && cloud.meta?.phase==='playing' && Math.floor(t/1000)!==Math.floor((t-dt*1000)/1000))updateTeacherMonitor();
 if(t-musicCheck>400){musicCheck=t;syncMusic();syncEventPill()}
 drawOrderCards();drawGame(t);requestAnimationFrame(animate);
}
function finishRound(){if(ended)return;introClear();ended=true;setRush(false);sfx.setSizzle(false);sentPhase='ended';roundStarted=false;activeQuestion=null;hide('questionOverlay');sfx.play('roundEnd');const gr=getGroup();setText('endScore',gr.score||0);setText('endServed',gr.served||0);setText('endCorrect',gr.correct||0);{const w=weakUnit(myStats.units),n=myStats.correct+myStats.wrong;setText('endStudy',n?`내 수학 기록: ${n}번 풀어 ${myStats.correct}번 정답 · 힌트 ${myStats.hints}번`+(w?` · 다시 보면 좋은 단원: ${w}단원 ${UNIT_NAMES[w]}`:''):'이번 판에는 수학 문제를 풀지 않았어요.')}
 let msg=(gr.served||0)>=3?'대단해요! 멋진 요리사 팀이에요 🎉':'친구들과 함께 도전한 것만으로도 멋져요!';setText('endSummary',msg);show('endOverlay');sound('success');}
function beginOnline(){
 if(!cloud||!meta)return;currentMode=meta.mode;unit=meta.unit;totalTime=meta.duration;team=cloud.team;myUid=cloud.uid;seat=cloud.seat;members=cloud.allMembers||{};
 let startPoints=[[7.5,7.5],[10.5,7.5],[6.5,8.5],[11.5,8.5],[9.5,8.5]];
 let same=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);let i=same.findIndex(([id])=>id===myUid),v=startPoints[Math.max(0,i)%startPoints.length];
 p={x:v[0],y:v[1],dir:'down',held:'',item:null,seat,name:getName(),updatedAt:Date.now()};fx=[];closePicker();resetStats();
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
 {const left=cloud.meta.startedAt?Math.ceil((cloud.meta.startedAt-srvNow())/1000):0;if(running&&left>0)setText('teacherTime',`인트로 상영 중 · ${left}초 뒤 게임 시작`);$('skipIntroAllBtn').classList.toggle('hidden',!(running&&left>4))}setText('teacherScoreTitle',running?'실시간 팀 점수':'이번 라운드 최종 팀 점수');
 const rows=Object.values(cloud.results||{}).sort((a,b)=>a.seat-b.seat),tb=$('teacherStudents');
 tb.replaceChildren();
 if(rows.length){const t=document.createElement('table');t.className='student-table';t.innerHTML='<thead><tr><th>별명</th><th>팀</th><th>푼 문제</th><th>정답</th><th>정답률</th><th>힌트</th><th>서빙</th><th>다시 볼 단원</th></tr></thead>';const body=t.createTBody();
  for(const v of rows){const c=v.correct||0,w=v.wrong||0,n=c+w,wu=weakUnit(v.units),tr=body.insertRow();[v.name||'',Number(v.team)+1,n,c,n?Math.round(c/n*100)+'%':'-',v.hints||0,v.served||0,wu?wu+'단원 '+UNIT_NAMES[wu]:'-'].forEach(x=>{tr.insertCell().textContent=x})}
  tb.append(t)}
}
// 대기실의 학생 한 줄: 교사에게는 '모둠 바꾸기'와 '내보내기'가 붙음
function memberRow(uid,u,k,m){
 const li=document.createElement('div');li.className='lobby-member';
 const nm=document.createElement('span');nm.textContent=(m.mode==='duel'?(k<2?'🌸 A편 ':'🌊 B편 '):'👨‍🍳 ')+u.name+(cloud.role==='student'&&uid===cloud.uid?' (나)':'')+(u.online===false?' · 연결 끊김':'');if(u.online===false)li.classList.add('offline');li.appendChild(nm);
 if(cloud.role==='teacher'){
  const sel=document.createElement('select');sel.className='lobby-sel';sel.title='모둠 바꾸기';sel.disabled=m.phase==='playing';
  m.sizes.forEach((_,j)=>{const o=document.createElement('option');o.value=j;o.textContent=(j+1)+'모둠';if(j===Number(u.team))o.selected=true;sel.appendChild(o)});
  // 다른 모둠 학생과 자리 맞바꾸기 (모둠이 꽉 찼을 때)
  Object.entries(cloud.allMembers||{}).filter(([id,v])=>id!==uid&&v.team!==u.team).sort((a,b)=>Number(a[1].team)-Number(b[1].team)||a[1].seat-b[1].seat).forEach(([id,v])=>{const o=document.createElement('option');o.value='swap:'+id;o.textContent=`↔ ${v.name}(${Number(v.team)+1}모둠)와 바꾸기`;sel.appendChild(o)});
  sel.onchange=()=>{const v=sel.value,job=v.startsWith('swap:')?cloud.swapMembers(uid,v.slice(5)).then(()=>toast(`${u.name} ↔ ${cloud.allMembers?.[v.slice(5)]?.name||''} 자리를 바꿨어요.`)):cloud.moveMember(uid,Number(v)).then(()=>toast(`${u.name} → ${Number(v)+1}모둠`));job.catch(e=>{toast(e.message);refreshLobby()})};
  const kick=document.createElement('button');kick.className='lobby-kick';kick.textContent='내보내기';kick.title='이 학생을 방에서 내보내요 (다시 들어올 수 없음)';
  kick.onclick=()=>{if(confirm(`${u.name} 학생을 방에서 내보낼까요? 이 방에는 다시 들어올 수 없어요.`))cloud.kick(uid).then(()=>toast(`${u.name} 학생을 내보냈어요.`)).catch(e=>toast('내보내지 못했어요: '+e.message))};
  li.append(sel,kick);
 }
 return li;
}
function refreshLobby(){
 if(!cloud||!cloud.meta)return;let m=cloud.meta;let all=cloud.allMembers||{};setText('roomCodeDisplay',cloud.code);{const on=Object.values(all).filter(u=>u.online!==false).length,n=Object.keys(all).length;setText('lobbyCount',`${n}/${m.max||m.count}명 입장`+(on<n?` · 접속 ${on}명`:''))}setText('lobbyMode',({coop:'🤝 협동 요리',duel:'⚔️ 2대2 요리 대결',class:'🤝 협동 요리'})[m.mode]+` · 모둠 ${m.sizes.length}개`);
 let entries=Object.entries(all).sort((a,b)=>a[1].seat-b[1].seat),holder=$('lobbyTeams');holder.replaceChildren(...m.sizes.map((num,i)=>{let div=document.createElement('div');div.className='lobby-team';let title=document.createElement('h3');title.textContent=`🍳 ${i+1}모둠 · ${num}명`+(m.mode==='duel'?' (🌸 A편 2 · 🌊 B편 2)':'');div.appendChild(title);let mates=entries.filter(([,u])=>Number(u.team)===i);mates.forEach(([uid,u],k)=>div.appendChild(memberRow(uid,u,k,m)));if(cloud.role==='student'&&Number(cloud.team)!==i&&m.phase!=='playing'){const b=document.createElement('button');b.className='subtle-btn lobby-move';const full=mates.length>=num;b.textContent=full?'자리 없음 (선생님께 바꿔 달라고 해요)':'이 모둠으로 이동';b.disabled=full;b.onclick=()=>cloud.moveSelf(i).then(()=>toast(`${i+1}모둠으로 옮겼어요!`)).catch(e=>toast(e.message));div.appendChild(b)}if(cloud.role==='student'&&Number(cloud.team)===i)div.classList.add('mine');if(mates.length===0){let li=document.createElement('div');li.className='lobby-member';li.textContent='아직 입장한 학생이 없어요';div.appendChild(li)}return div}));
 let count=Object.keys(all).length;setText('lobbyNotice',count===(m.max||m.count)?'🎉 모든 학생이 입장했습니다!':cloud.role==='teacher'?'학생은 들어오는 순서대로 모둠에 배정돼요. 학생 이름 옆에서 모둠을 바꾸거나 내보낼 수 있어요.':'원하는 모둠의 "이 모둠으로 이동"을 누르면 옮길 수 있어요 (게임 시작 전까지).');
 $('startBtn').classList.toggle('hidden',cloud.role!=='teacher');$('lobbyIntroWrap').classList.toggle('hidden',cloud.role!=='teacher');$('startBtn').disabled=!count||m.phase==='playing';updateTeacherMonitor();
}
async function setupCloud(isTeacher){$('joinProgress').classList.add('hidden');setText('joinRoomBtn','입장하기');teacher=isTeacher;setText('setupTitle',isTeacher?'👩‍🏫 학급방 만들기':'🧑‍🎓 게임방 입장');setText('setupIntro',isTeacher?'모드와 모둠 구성을 고르면 학생용 코드가 만들어져요.':'선생님께 받은 6자리 코드를 입력해 주세요.');$('createForm').classList.toggle('hidden',!isTeacher);$('joinForm').classList.toggle('hidden',isTeacher);setText('setupError','');show('setupOverlay');}
function wireCloud(obj){
 obj.on('meta',v=>{
  if(!v)return;meta=v;currentMode=v.mode;
  if(obj.role==='teacher'){if(v.phase==='playing'||v.phase==='ended'){refreshLobby();$('startBtn').textContent='다음 판 시작하기 🍳';if(v.phase==='ended')toast('게임이 끝났어요. 새 라운드를 시작할 수 있습니다.')}else refreshLobby();}
  else if(v.phase==='playing'&&sentPhase!=='playing')beginOnline();else if(v.phase==='ended'&&roundStarted)finishRound();else if(v.phase==='lobby'&&sentPhase==='playing'){sentPhase='lobby';roundStarted=false;show('lobbyOverlay');}
 });
 obj.on('members',v=>{members=v||{};refreshLobby();if(roundStarted)updateUI()});
 obj.on('net',ok=>{$('netBanner').classList.toggle('hidden',ok)});
 obj.on('moved',({to})=>toast(`${to+1}모둠으로 옮겨졌어요.`));
 obj.on('kicked',async()=>{await goHome();setText('firebaseNote','선생님이 방에서 내보냈어요. 선생님께 여쭤 보세요.');toast('선생님이 방에서 내보냈어요.')});
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
 // 모둠 수 × 모둠 인원 안내 (2대2 대결은 모둠마다 4명 고정)
 const groupInfo=()=>{const duel=$('createMode').value==='duel',gN=Number($('groupCount').value);if(duel)$('groupSize').value='4';$('groupSize').disabled=duel;const n=gN*Number($('groupSize').value);setText('groupTotal',(duel?`모둠 ${gN}개 × 4명(2명씩 두 편)`:`모둠 ${gN}개 × ${$('groupSize').value}명`)+` = 최대 ${n}명`+(n>25?' · 25명까지만 만들 수 있어요':''));$('groupTotal').classList.toggle('form-error',n>25)};
 ['createMode','groupCount','groupSize'].forEach(id=>$(id).addEventListener('change',groupInfo));groupInfo();
 // ── 입장·방 만들기 진행 표시: 단계, 늦어질 때 안내, 오류 종류별 안내 ──
 const STAGE={sdk:'connect',app:'connect',connect:'connect',authRestore:'auth',authNew:'auth',meta:'room',member:'room',seat:'seat',register:'seat',lobby:'done'};
 let stageAt=0,stageLabel='',slowTimer=null;
 function showProgress(p){
  const box=$('joinProgress');box.classList.remove('hidden');const order=['connect','auth','room','seat','done'],cur=order.indexOf(STAGE[p.step]||'connect');
  box.querySelectorAll('li').forEach((li,i)=>{li.className=i<cur?'done':i===cur?(p.step==='lobby'?'done':'now'):''});
  stageAt=performance.now();stageLabel=p.label;setText('joinSlow','');
 }
 function startProgress(){clearInterval(slowTimer);setText('setupError','');$('joinProgress').classList.remove('hidden');$('joinProgress').querySelectorAll('li').forEach(li=>li.className='');stageAt=performance.now();stageLabel='Firebase 연결 중';
  slowTimer=setInterval(()=>{const s=(performance.now()-stageAt)/1000;setText('joinSlow',s>=5?`"${stageLabel}" 단계가 늦어지고 있어요 (${Math.floor(s)}초). 조금만 기다려 주세요.`:'')},500)}
 function stopProgress(err){clearInterval(slowTimer);setText('joinSlow','');if(err){const tag={network:'🌐 연결 문제',auth:'🔑 로그인 문제',permission:'⛔ 권한 문제',code:'🔢 방 확인',timeout:'⏱️ 응답 없음',unknown:'⚠️ 문제'}[err.kind]||'⚠️ 문제';setText('setupError',tag+' · '+err.message);$('joinProgress').querySelector('li.now')?.classList.replace('now','fail')}}
 $('createRoomBtn').onclick=async()=>{
  let btn=$('createRoomBtn');if(btn.disabled)return;btn.disabled=true;setText('setupError','');startProgress();try{
   const m=$('createMode').value,gN=Number($('groupCount').value),gS=m==='duel'?4:Number($('groupSize').value),n=gN*gS;
   if(n>25)throw new Error('한 방에는 25명까지 들어올 수 있어요. 모둠 수나 인원을 줄여 주세요.');
   cloud=new CloudRoom();wireCloud(cloud);cloud.on('progress',showProgress);await cloud.create({name:getName(),count:n,sizes:Array(gN).fill(gS),mode:m,unit:$('unitSelect').value,duration:Number($('durationSelect').value),orderTime:ORDER_TIME_OPTIONS[$('orderTimeSelect').value],settings:menuSettings(),pin:$('teacherPinInput').value.trim()});$('teacherPinInput').value='';
   stopProgress();mode='online';teacher=true;hide('setupOverlay');hide('menuOverlay');show('lobbyOverlay');refreshLobby();setRoomStatus();
  }catch(e){stopProgress(e.kind?e:{kind:'unknown',message:e.message})}finally{btn.disabled=false}
 };
 // 입장: 진행 중에는 버튼을 다시 눌러도 새 요청을 보내지 않음. 실패하면 '다시 시도' (진행 중이던 자리 배정은 이어서 확인)
 let joining=false;
 $('joinRoomBtn').onclick=async()=>{
  let btn=$('joinRoomBtn');if(joining)return;joining=true;btn.disabled=true;setText('joinRoomBtn','입장하는 중…');startProgress();try{
   if(cloud&&cloud.role==='student'&&!cloud.connected){try{await cloud.disconnect()}catch{}}
   cloud=new CloudRoom();wireCloud(cloud);cloud.on('progress',showProgress);await cloud.join({code:$('roomCodeInput').value.replace(/\D/g,''),name:getName()});
   stopProgress();mode='online';teacher=false;myUid=cloud.uid;team=cloud.team;seat=cloud.seat;hide('setupOverlay');hide('menuOverlay');show('lobbyOverlay');refreshLobby();setRoomStatus();
  }catch(e){stopProgress(e.kind?e:{kind:'unknown',message:e.message});setText('joinRoomBtn','다시 시도')}finally{btn.disabled=false;joining=false;if($('joinRoomBtn').textContent==='입장하는 중…')setText('joinRoomBtn','입장하기')}
 };
 $('startBtn').onclick=async()=>{if(!cloud)return;let btn=$('startBtn');btn.disabled=true;try{await cloud.begin($('lobbyIntroCheck').checked?INTRO_MS:0);$('lobbyIntroCheck').checked=false;refreshLobby();toast('요리 축제가 시작됐습니다!')}catch(e){toast(e.message)}finally{btn.disabled=false}};
 $('lobbyBackBtn').onclick=goHome;
 $('csvBtn').onclick=()=>{
   if(!cloud || cloud.role!=='teacher')return;
   let header=['번호','별명','팀','푼 문제','정답','오답','정답률(%)','힌트','서빙',...Array.from({length:6},(_,i)=>(i+1)+'단원 정답'),...Array.from({length:6},(_,i)=>(i+1)+'단원 오답'),'다시 볼 단원'];
   let lines=[header,...Object.values(cloud.results||{}).sort((a,b)=>a.seat-b.seat).map((v,i)=>[i+1,v.name||'',Number(v.team)+1,(v.correct||0)+(v.wrong||0),v.correct||0,v.wrong||0,(v.correct||0)+(v.wrong||0)?Math.round((v.correct||0)/((v.correct||0)+(v.wrong||0))*100):'',v.hints||0,v.served||0,...Array.from({length:6},(_,j)=>v.units?.[j+1]?.correct||0),...Array.from({length:6},(_,j)=>v.units?.[j+1]?.wrong||0),weakUnit(v.units)?weakUnit(v.units)+'단원 '+UNIT_NAMES[weakUnit(v.units)]:''])];
   let csv='\ufeff'+lines.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"').join(',')).join('\r\n');
   let a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='math-restaurant-result_'+cloud.code+'.csv';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},1000);
 };
 $('endRoundBtn').onclick=async()=>{if(!cloud||cloud.role!=='teacher')return;try{await cloud.finish();refreshLobby()}catch(e){toast(e.message)}};
 $('copyCodeBtn').onclick=async()=>{try{await navigator.clipboard.writeText(cloud.code);toast('학급방 코드가 복사됐어요!')}catch{toast('방 코드: '+cloud.code)}};
 $('helpBtn').onclick=()=>show('helpOverlay');
 document.querySelectorAll('[data-close]').forEach(x=>x.addEventListener('click',()=>hide(x.dataset.close)));
 $('soundBtn').onclick=()=>{const i=sfx.VOLUME_STEPS.findIndex(v=>Math.abs(v-sfx.getVolume())<.01);sfx.setVolume(sfx.VOLUME_STEPS[(i+1)%sfx.VOLUME_STEPS.length]);muted=sfx.getVolume()<=0;setText('soundBtn',sfx.volumeIcon());sfx.play('pickup')};
 setText('soundBtn',sfx.volumeIcon());$('soundBtn').title='소리: 크게 → 작게 → 끔';
 $('interactBtn').onclick=interact;
 $('viewBtn').onclick=()=>set3D(!use3D);init3D();
 $('storageCloseBtn').onclick=closePicker;
 $('presetSelect').onchange=fillPreset;fillPreset();
 $('hintBtn').onclick=()=>{if(!activeQuestion)return;if(!activeQuestion.hinted){activeQuestion.hinted=true;hintStat(activeQuestion.pz.unit)}setText('questionFeedback','힌트: '+activeQuestion.pz.hint)};
 $('cancelQuestionBtn').onclick=()=>{abortQuestion();toast('준비되면 다시 도전해 보세요!')};
 $('introSkip').onclick=()=>{document.activeElement?.blur?.();skipIntro()};
 $('skipIntroAllBtn').onclick=()=>cloud?.skipIntro(INTRO_MS-MISSION_AT+300).catch(e=>toast(e.message));
 if(new URLSearchParams(location.search).get('intro')==='0'){$('introCheck').checked=false;$('lobbyIntroCheck').checked=false}   // 테스트용: 주소 뒤 ?intro=0 이면 인트로 끔
 // 단원 체크 상자 → 숨은 값(unitSelect): 모두 고르면 'all', 아니면 '1,3,5'. 하나는 꼭 남김
 $('unitChecks').addEventListener('change',e=>{const boxes=[...document.querySelectorAll('#unitChecks input')],on=boxes.filter(b=>b.checked);if(!on.length&&e.target.checked===false){e.target.checked=true;toast('단원은 하나 이상 골라야 해요.');return}$('unitSelect').value=on.length===boxes.length?'all':on.map(b=>b.dataset.unit).join(',')});
 $('leaveBtn').onclick=goHome;$('endHomeBtn').onclick=goHome;
 $('roomInfoBtn').onclick=()=>{if(mode==='demo')show('helpOverlay');else{show('lobbyOverlay');refreshLobby()}};
 $('restartBtn').onclick=()=>{if(mode==='demo')startDemo(currentMode,false);else if(cloud?.role==='teacher')cloud.begin($('lobbyIntroCheck').checked?INTRO_MS:0).catch(e=>toast(e.message));else{hide('endOverlay');show('lobbyOverlay');toast('선생님이 다음 라운드를 시작하면 입장해요!')}};
 document.addEventListener('keydown',e=>{
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space','Spacebar'].includes(key)&&e.target.tagName!=='INPUT')e.preventDefault();
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(inIntro()){if(key==='Escape'&&!e.repeat)skipIntro();return}
  if(e.target.tagName==='BUTTON'&&(key===' '||key==='Spacebar')&&!activeQuestion&&!pickerOpen){e.preventDefault();e.target.blur()}   // 버튼에 남은 포커스가 Space 연타를 가로채지 않게
  if(!pickerOpen)keys.add(key);
  if((key==='e'||key===' '||key==='Space'||key==='Spacebar')&&!e.repeat)interact();
  if(pickerOpen){if(key==='Escape')closePicker();else if(/^[1-5]$/.test(key)&&!e.repeat){const b=$('storageGrid').children[Number(key)-1];if(b)takeFromStorage(b.dataset.id)}return}
  if(key==='q'&&!e.repeat)askOrder();
  if(key==='Escape'&&activeQuestion)abortQuestion();
 });
 document.addEventListener('keyup',e=>{keys.delete(e.key.length===1?e.key.toLowerCase():e.key)});
 window.addEventListener('blur',()=>keys.clear());
 if(cloudConfigured()){setText('firebaseNote','혼자 체험은 바로 시작됩니다. 학급방은 선생님이 만들고, 학생은 방 코드로 들어와요.');}
 p.name='꼬마셰프';requestAnimationFrame(animate);
}
async function goHome(){introClear();$('netBanner').classList.add('hidden');
 closePicker();setHeld(null);sfx.setSizzle(false);
 if(cloud)await cloud.disconnect();cloud=null;mode='demo';teacher=false;roundStarted=false;ended=false;activeQuestion=null;sentPhase='';keys.clear();hide('endOverlay');hide('setupOverlay');hide('lobbyOverlay');hide('questionOverlay');show('menuOverlay');setRoomStatus();
}
boot();
