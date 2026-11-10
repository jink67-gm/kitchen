import { CloudRoom, cloudConfigured, planTeams } from './cloud.js';
import { stationId, isStale, boardReserve, boardStart, boardChop, boardCancel, boardTake, CHOPS_DEFAULT, CHOP_OPTIONS } from './stations.js';
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
 '#==LT=KK=PP=HB=S=#',
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
const KIND={'=':['counter','조리대'],S:['sink','싱크대'],K:['cut','도마'],P:['plate','플레이팅대'],O:['cook','화덕'],V:['serve','서빙 벨'],Z:['mix','믹서'],R:['storage','보관대'],X:['trash','쓰레기통'],
 L:['bin','양상추 상자','lettuce'],T:['bin','토마토 상자','tomato'],H:['bin','치즈 상자','cheese'],B:['bin','빵 상자','bread'],M:['bin','고기 상자','meat'],F:['bin','밀가루 상자','flour'],Y:['bin','딸기 상자','berry'],I:['bin','우유 상자','milk'],D:['bin','반죽 상자','dough']};
const STATIONS=[];
LAYOUT.forEach((row,y)=>[...row].forEach((ch,x)=>{const k=KIND[ch];if(k)STATIONS.push({x,y,type:k[0],label:k[1],...(k[2]?{food:k[2]}:{})})}));
const PASSIVE=new Set(['counter','sink']); // 아직 E로 쓸 수 없는 설비
const blocked=new Set(STATIONS.map(s=>s.x+','+s.y));
let mode='demo',cloud=null,meta=null,players={},members={},allTeams={},teamData=null,localState=null,myUid='demo',seat=0,team=0,roundStarted=false,ended=false,last=performance.now(),totalTime=180,nowTime=180,activeQuestion=null,unit='all',muted=false,toastTimeout=null,teacher=false,currentMode='coop',sentPhase='',helpBefore=false;
let p={x:7,y:7,dir:'down',held:'',item:null,seat:0,name:'꼬마셰프',updatedAt:0};
// 들고 있는 재료는 p.item(객체)이 기준. p.held(문자열)는 화면·온라인 동기화용으로 여기서만 만들어집니다.
function setHeld(item){p.item=item?{...item,loc:'held'}:null;p.held=heldString(p.item)}
let pickerOpen=false,fx=[];
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
let chopChain=Promise.resolve();
function chopSound(){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),gn=audio.createGain(),tm=audio.currentTime;o.type='square';o.frequency.setValueAtTime(240,tm);o.frequency.exponentialRampToValueAtTime(90,tm+.06);gn.gain.setValueAtTime(.07,tm);gn.gain.exponentialRampToValueAtTime(.001,tm+.08);o.connect(gn).connect(audio.destination);o.start(tm);o.stop(tm+.09)}catch{}}
async function useBoard(st){
 const b=boardOf(st),it=p.item,now=srvNow();
 // 내가 연타 중인 도마: 누를 때마다 1회 (키를 꾹 누르는 반복 입력은 keydown에서 이미 걸러짐)
 if(b&&b.state==='working'&&b.owner===myUid&&!isStale(b,now)){
  chopChain=chopChain.then(async()=>{
   const r=await stationOp(st,s=>boardChop(s,myUid,srvNow()));
   if(!r)return;
   chopSound();celebrate(st.x+.5,st.y+.3,r.done?12:2);
   if(r.done){toast('🔪 '+FOOD[r.next.item.kind].name+' 손질 완료! E로 집어요.');sound('success')}
   updateUI();
  }).catch(e=>console.warn('연타 동기화',e));
  return;
 }
 if(b&&b.state==='reserved'&&b.owner===myUid&&!isStale(b,now)){askMath(b.item.kind,'cut',st);return}   // 새로고침 뒤 다시 문제 열기
 if(b&&(b.state==='ready'||isStale(b,now))){
  if(it){toast('손이 비어 있어야 도마 위 재료를 집을 수 있어요.');sound('error');return}
  pending=true;
  try{const r=await stationOp(st,s=>boardTake(s,srvNow()));
   if(r){setHeld(r.item);await updatePlayer(true);toast(FOOD[r.item.kind].emoji+' '+FOOD[r.item.kind].name+(r.item.state==='raw'?'을(를) 회수했어요.':' 완성! 🍽️ 접시로 가져가요.'));sound('pickup')}
   else toast('다른 친구가 먼저 집었어요!');
  }catch(e){toast('집기에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 if(b){toast(`${b.name||'다른 친구'}님이 쓰고 있는 도마예요.`);sound('error');return}
 if(!it){toast('손질할 재료를 들고 오세요!');return}
 if(it.state!=='raw'){toast('이미 손질한 재료예요. 🍽️ 접시에 담아 주세요!');return}
 if(FOOD[it.kind].prep!=='cut'){let txt={cook:'화덕에서 구울',mix:'믹서에서 섞을'}[FOOD[it.kind].prep];toast(`이 재료는 ${txt} 수 있어요!`);sound('error');return}
 pending=true;
 try{const r=await stationOp(st,s=>boardReserve(s,it,myUid,p.name,srvNow()));
  if(r){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);askMath(it.kind,'cut',st)}
  else toast('다른 친구가 먼저 도마를 차지했어요!');
 }catch(e){toast('도마 사용에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
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
const blankGroup=()=>({orderIndex:0,tray:{},score:0,served:0,correct:0,wrong:0});
const safeName=s=>String(s||'꼬마셰프').trim().slice(0,12)||'꼬마셰프';
function toast(t){setText('toast',t);$('toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('toast').classList.remove('show'),2600)}
function sound(type){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume();let osc=audio.createOscillator(),gain=audio.createGain(),time=audio.currentTime;osc.type=type==='success'?'triangle':'sine';osc.frequency.setValueAtTime(type==='success'?523:type==='error'?185:390,time);osc.frequency.exponentialRampToValueAtTime(type==='success'?784:type==='error'?125:510,time+.14);gain.gain.setValueAtTime(.08,time);gain.gain.exponentialRampToValueAtTime(.001,time+.21);osc.connect(gain).connect(audio.destination);osc.start(time);osc.stop(time+.22)}catch{}}
function getSide(){if(currentMode!=='duel')return 'ALL';const list=Object.entries(members).filter(([,m])=>Number(m.team)===team).sort((a,b)=>a[1].seat-b[1].seat);return (list.findIndex(([uid])=>uid===myUid)<2)?'A':'B'}
function getGroup(side=getSide()){return teamData?.groups?.[side]||blankGroup()}
function order(side=getSide()){const r=getGroup(side);return RECIPES[r.orderIndex%RECIPES.length]}
function getName(){return safeName($('nicknameInput').value)}
function setRoomStatus(){setText('connectionLabel',mode==='demo'?'혼자 체험하기':cloud?.code?'학급방 '+cloud.code:'학급방');$('connectionDot').classList.toggle('online',mode!=='demo')}
function playerColor(n){return COLOR[n%COLOR.length]}
function resetLocal(kind="coop"){
 mode='demo';cloud=null;myUid='demo';seat=0;team=0;members={demo:{name:p.name,seat:0,team:'0'},bot1:{name:'도우미1',seat:1,team:'0'},bot2:{name:'도우미2',seat:2,team:'0'},bot3:{name:'도우미3',seat:3,team:'0'}};currentMode=kind;
 meta={phase:'playing',mode:kind,unit,startedAt:Date.now(),duration:180,sizes:[4],count:4};
 teamData={groups:{ALL:blankGroup(),A:blankGroup(),B:blankGroup()},storage:{},stations:{}};fx=[];closePicker();
 players={demo:{...p}};allTeams={0:{data:teamData}};totalTime=180;nowTime=180;roundStarted=true;ended=false;pending=false;elapsed=0;rivalServed=0;activeQuestion=null;
 hide('menuOverlay');hide('setupOverlay');hide('endOverlay');hide('lobbyOverlay');hide('questionOverlay');
 setRoomStatus();setText('modeLabel',kind==='duel'?'⚔️ 봇 대결 체험':'🤝 연습용 협동');setText('roundLabel','🍰 디저트 주방');updateUI();toast('요리사 출동! 재료 상자에서 시작해 보세요 🍓');
}
function startDemo(kind='coop'){unit=$('unitSelect').value;p={x:7,y:7,dir:'down',held:'',item:null,name:getName(),seat:0,updatedAt:Date.now()};resetLocal(kind)}
function setModeUI(){let nm={coop:'🤝 협동 주방',duel:'⚔️ 2대2 배틀',class:'🏆 학급 대항전'};setText('modeLabel',nm[currentMode]||nm.coop);setText('roundLabel','🍰 '+(['디저트 주방','회전 주방','축제 주방'][Math.floor(elapsed/110)%3]));}
function updateUI(){
 if(!roundStarted)return;
 let side=getSide(),grp=getGroup(side),rec=order(side);
 setText('orderEmoji',rec.emoji);setText('orderTitle',rec.title);setText('orderDesc',rec.desc);setText('orderCount','ORDER '+String(grp.orderIndex+1).padStart(2,'0'));
 $('orderIngredients').replaceChildren(...rec.items.map(k=>{let e=document.createElement('div');e.className='ingredient-chip'+(grp.tray?.[k]?' done':'');e.innerHTML='<span>'+FOOD[k].emoji+'</span><div>'+FOOD[k].name+'<small style="display:block;color:#afc6d5">'+(grp.tray?.[k]?'✅ 준비 완료':'손질 후 담기')+'</small></div>';return e}));
 let roster=mode==='demo'?[{id:'demo',...p},...bots.map((b,i)=>({id:'bot'+i,...b}))]:Object.entries(players||{}).map(([id,v])=>({id,...v})).sort((a,b)=>a.seat-b.seat);
 $('playerRoster').replaceChildren(...roster.map(v=>{const e=document.createElement('div');e.className='roster-item';let side=currentMode==='duel'?(v.seat%4<2?'A팀':'B팀'):(v.id===myUid?'나':'팀원');e.innerHTML='<span class="roster-avatar" style="background:'+playerColor(v.seat)+'">🍳</span><span class="roster-name"></span><span class="roster-team">'+side+'</span>';e.querySelector('.roster-name').textContent=v.name+(v.id===myUid?' ✨':'');return e}));
 setText('scoreLabel',grp.score||0);setText('scoreDetail',`완성 요리 ${grp.served||0}개 · 수학 정답 ${grp.correct||0}개`);
 if(currentMode==='duel'){let a=getGroup('A'),b=getGroup('B');$('teamRanking').innerHTML=`<div class="ranking-item">🌸 A팀 <b>${a.score||0}점</b></div><div class="ranking-item">🌊 B팀 <b>${b.score||0}점</b></div>`}
 else if(meta?.sizes?.length>1){let ranking=Object.entries(allTeams).map(([id,v])=>{let d=v?.data?.groups?.ALL||{};let size=meta.sizes[Number(id)]||4;return {id,score:d.score||0,normalized:Math.round((d.score||0)/size*4)}}).sort((a,b)=>b.normalized-a.normalized);$('teamRanking').replaceChildren(...ranking.map(v=>{let e=document.createElement('div');e.className='ranking-item';e.textContent=`${Number(v.id)+1}팀 · 보정 ${v.normalized}점`;return e}));}
 else $('teamRanking').textContent='함께 만들면 점수가 올라가요!';
 const hi=p.item;setText('heldLabel',hi?`✋ ${FOOD[hi.kind].emoji} ${FOOD[hi.kind].name} · ${hi.state==='raw'?'손질 전':'손질 완료'}`:'✋ 빈손');
 let station=nearestStation();
 let h=station?getStationHint(station):'재료 상자로 이동해서 E를 눌러 보세요!';setText('statusHint',h);setText('missionText',`현재 주문: ${rec.title} · ${rec.items.map(k=>FOOD[k].name).join(' + ')}. 친구들과 나누어 준비해 보세요!`);
 setModeUI();
}
function getStationHint(st){
 if(st.type==='bin'){const it=p.item;return !it?`📦 ${st.label}: E를 눌러 재료 집기`:checkReturn(it,st).ok?`↩️ ${st.label}: E를 눌러 돌려놓기 (감점 없음)`:`📦 ${st.label}: 지금 든 재료는 여기에 넣을 수 없어요`}
 if(st.type==='storage')return p.item?'🗄️ 보관대: 손질한 재료를 E로 보관 (최대 5칸)':'🗄️ 보관대: E를 눌러 꺼낼 재료 고르기';
 if(st.type==='trash')return `🗑️ 쓰레기통: 손질한 재료를 E로 버리기 (-${TRASH_PENALTY}점)`;
 if(st.type==='cut'){const b=boardOf(st);if(!b)return '🔪 도마: 손질할 재료를 들고 E';if(b.state==='ready')return '🔪 도마: 완성! 빈손으로 E를 눌러 집기';if(isStale(b,srvNow()))return '🔪 도마: 주인 없는 재료예요. 빈손으로 E를 눌러 회수';if(b.owner===myUid)return b.state==='working'?`🔪 도마: E나 Space를 연타! (${b.progress}/${b.need})`:'🔪 도마: E를 눌러 수학 문제 풀기';return `🔪 도마: ${b.name||'친구'}님이 사용 중`}if(st.type==='cook')return '🔥 화덕: 구울 재료를 들고 E';if(st.type==='mix')return '🥣 믹서: 섞을 재료를 들고 E';if(st.type==='plate')return '🍽️ 플레이팅대: 완성 재료를 들고 E';if(st.type==='serve')return '🔔 서빙대: 재료가 다 모이면 E';return '중앙 조리대';}
function nearestStation(){let best=null,dist=1.55;for(let s of STATIONS){if(PASSIVE.has(s.type))continue;let d=Math.hypot((s.x+.5)-p.x,(s.y+.5)-p.y);if(d<dist){dist=d;best=s}}return best}
function walkable(x,y){if(x<1.1||x>W-1.1||y<1.1||y>H-1.1)return false;const radius=.29;for(let sx of [-radius,radius])for(let sy of [-radius,radius])if(blocked.has(Math.floor(x+sx)+','+Math.floor(y+sy)))return false;return true}
function tryMove(dx,dy){let speed=0.115;let nx=p.x+dx*speed,ny=p.y+dy*speed;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.updatedAt=Date.now();}
async function updatePlayer(force=false){players[myUid]={...p};if(mode!=='demo'&&cloud){try{await cloud.syncPlayer(p,force)}catch(e){console.warn('위치 동기화',e)}}}
async function interact(){
 if(!roundStarted||ended||activeQuestion||pending||pickerOpen)return;
 const st=nearestStation();if(!st){toast('조리대나 재료 상자 가까이 가보세요!');return}
 let held=p.held;
 if(st.type==='bin'){
  if(p.item){
   const r=checkReturn(p.item,st),nm=FOOD[p.item.kind].name;
   if(r.ok){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);toast('↩️ '+nm+'을(를) 상자에 돌려놓았어요.');sound('pickup');updateUI();return}
   toast(r.reason==='wrongBin'?`이 재료는 ${nm} 상자에만 돌려놓을 수 있어요.`:'손질한 재료는 상자에 넣을 수 없어요. 🗄️ 보관대에 두거나 🗑️ 쓰레기통에 버려요.');sound('error');return;
  }
  setHeld(newItem(st.food,myUid));await updatePlayer(true);toast(FOOD[st.food].emoji+' '+FOOD[st.food].name+'을(를) 들었어요!');sound('pickup');updateUI();return;
 }
 if(st.type==='cut')return useBoard(st);
 if(st.type==='storage')return useStorage(st);
 if(st.type==='trash')return useTrash(st);
 if(['cook','mix'].includes(st.type)){
  if(!held){toast('재료를 들고 조리대 앞으로 오세요!');return}
  if(held.startsWith('ready:')){toast('이미 완성된 재료예요. 🍽️ 접시에 담아 주세요!');return}
  const food=FOOD[held];if(food?.prep!==st.type){let txt={cut:'도마에서 손질할',cook:'화덕에서 구울',mix:'믹서에서 섞을'}[food?.prep];toast(`이 재료는 ${txt} 수 있어요!`);sound('error');return}
  askMath(held,st.type);return;
 }
 if(st.type==='plate'){
  if(!held||!held.startsWith('ready:')){toast('손질이나 조리를 마친 재료를 가져오세요!');return}
  let item=held.slice(6),rec=order();if(!rec.items.includes(item)){toast('이번 주문에 필요한 재료가 아니에요!');sound('error');return}
  if(getGroup().tray?.[item]){toast('이 재료는 이미 접시에 담았어요!');return}
  pending=true;
  try{
    let accepted=await deposit(item,rec);
    if(accepted){flyFx(p.held,p,st);setHeld(null);await updatePlayer(true);celebrate(st.x+.5,st.y+.5,5);toast('🍽️ '+FOOD[item].name+' 접시 준비 완료!');sound('success');}
    else toast('다른 친구가 먼저 접시에 담았어요!');
  }catch(e){toast('접시 동기화에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
 if(st.type==='serve'){
  let rec=order(),gr=getGroup();if(!rec.items.every(i=>gr.tray?.[i])){toast('재료가 아직 모두 모이지 않았어요!');sound('error');return}
  pending=true;
  try{if(await serve(rec)){celebrate(st.x+.5,st.y+.5,25);toast('🎉 '+rec.title+' 완성! +100점');sound('success')}else toast('서빙 주문이 갱신되었어요!')}
  catch(e){toast('서빙에 실패했어요: '+e.message)}finally{pending=false;updateUI()}
  return;
 }
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
 const it=p.item,r=checkTrash(it);
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
 if(st.type==='cut'){const b=boardOf(st);if(!b)return it&&it.state==='raw'&&FOOD[it.kind].prep==='cut'?'손질':it?'✕':'E';if(b.state==='ready'||isStale(b,srvNow()))return it?'✕':'집기';return b.owner===myUid?(b.state==='working'?'연타!':'문제 풀기'):'✕'}
 return 'E';
}
async function deposit(item,rec){if(mode!=='demo')return cloud.deposit(getSide(),item,rec);let gr=getGroup();if(!rec.items.includes(item)||gr.tray[item])return false;gr.tray[item]=true;return true}
async function serve(rec){if(mode!=='demo')return cloud.serve(getSide(),rec,RECIPES);let gr=getGroup();if(!rec.items.every(i=>gr.tray[i]))return false;gr.score+=100;gr.served++;gr.orderIndex++;gr.tray={};return true}
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
  if(q.board){activeQuestion=null;hide('questionOverlay');const r=await stationOp(q.board,s=>boardStart(s,myUid,chopNeed,srvNow()));toast(r?`🔪 정답! 이제 E나 Space를 ${chopNeed}번 눌러 손질해요!`:'도마를 다시 사용해 주세요.');updateUI();return}
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
 else if(st.type==='plate'){fillRounded(x+6,y+6,35,18,4,'#ddd8c5');drawEmoji('🍽️',cx,y+15,24)}
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
 if(ch.held){let it=ch.held.replace('ready:','');if(FOOD[it]){fillRounded(x+4,y-40,30,28,9,ch.held.startsWith('ready:')?'#2d8d70':'#fff8e4');drawEmoji(FOOD[it].emoji,x+19,y-26,19)}}
 if(isMine){g.strokeStyle='#ffd775';g.lineWidth=3;g.beginPath();g.ellipse(x,y+12,20,10,0,0,Math.PI*2);g.stroke()}
 let nm=String(ch.name||'셰프').slice(0,8);g.font='800 11px Nunito,"Noto Sans KR",sans-serif';let width=Math.max(52,g.measureText(nm).width+14);fillRounded(x-width/2,y-53+bounce,width,18,8,isMine?'#4c785d':'#293d53');g.fillStyle='#fff';g.textAlign='center';g.fillText(nm,x,y-40+bounce);
}
function drawGame(t){
 if(use3D&&view3d){
  try{
   const chefs=mode==='demo'?bots.map((b,i)=>({id:'bot'+i,...b})):Object.entries(players).filter(([id])=>id!==myUid).map(([id,ch])=>({id,...ch}));
   if(roundStarted)chefs.push({id:'me',...p,mine:true});
   const foc=roundStarted&&!activeQuestion&&!pickerOpen?nearestStation():null;
   view3d.render({chefs,focus:foc,focusLabel:foc?actionLabel(foc):'',boards:boardViews(),storage:storageList(getStorage()),fx,tray:roundStarted?getGroup().tray:{},particles:particles.map(pt=>({x:(pt.x-OX)/T,y:(pt.y-OY)/T,life:pt.life,color:pt.color})),dim:!roundStarted},t);
   return;
  }catch(e){console.warn('3D 오류 → 2D로 전환',e);set3D(false);toast('3D 화면에 문제가 생겨 2D로 바꿨어요.')}
 }
 drawFloor();let focus=nearestStation();
 for(let st of STATIONS){drawStation(st,t);if(focus===st&&roundStarted&&!activeQuestion){let [x,y]=canvasPos(st.x+.5,st.y+.1);g.strokeStyle='#ffdf94';g.lineWidth=3;g.strokeRect(x-24,y-6,47,43);drawEmoji('E',x+21,y-8,12)}}
 for(const b of boardViews()){let [bx,by]=canvasPos(b.x,b.y);drawEmoji(FOOD[b.kind].emoji,bx+14,by+15,b.ready?20:16);if(b.ready)drawEmoji('✨',bx+34,by+8,11);fillRounded(bx+4,by-9,40,6,3,'#1d2a3d');fillRounded(bx+4,by-9,Math.max(3,40*b.progress),6,3,b.ready?'#61e4a0':b.state==='stale'?'#9aa7b8':'#ffd166');g.font='800 9px Nunito,"Noto Sans KR",sans-serif';g.textAlign='center';g.fillStyle='#fff';g.shadowColor='#182135';g.shadowBlur=4;g.fillText(b.label,bx+24,by-13);g.shadowBlur=0}
 if(mode==='demo'){for(let b of bots)drawChef(b,false,t)}else{let list=Object.entries(players).sort((a,b)=>a[1].y-b[1].y);for(let [id,ch] of list){if(id===myUid)continue;drawChef(ch,false,t)}}
 if(roundStarted)drawChef(p,true,t);
 for(let pt of particles){g.globalAlpha=pt.life;g.fillStyle=pt.color;g.beginPath();g.arc(pt.x,pt.y,4*pt.life+1,0,Math.PI*2);g.fill();g.globalAlpha=1}
 if(!roundStarted){g.fillStyle='#101d3699';g.fillRect(OX,OY,W*T,H*T);g.fillStyle='#fce8c6';g.textAlign='center';g.font='900 26px Nunito,"Noto Sans KR"';g.fillText('주방에 오신 것을 환영합니다!',500,315);g.font='700 14px Nunito,"Noto Sans KR"';g.fillText('시작 화면에서 체험하거나 학급방에 입장하세요.',500,350)}
}
// 화면에 보여줄 도마 상태 (2D·3D 공용)
function boardViews(){
 const now=srvNow(),out=[];
 for(const st of STATIONS){if(st.type!=='cut')continue;const b=boardOf(st);if(!b)continue;const stale=isStale(b,now);
  out.push({x:st.x,y:st.y,kind:b.item.kind,ready:b.state==='ready',state:stale?'stale':b.state,progress:b.state==='working'?b.progress/b.need:b.state==='ready'?1:0,count:b.progress,need:b.need,owner:b.owner===myUid?'me':b.owner,
   label:b.state==='ready'?'완성! E로 집기':stale?'주인 없음 · E로 회수':b.state==='working'?`${b.name||'친구'} 손질 중 ${b.progress}/${b.need}`:`${b.name||'친구'} 문제 푸는 중`});}
 return out;
}
// ── 3D 화면 연결: render3d.js는 그리기만 담당. 불러오기에 실패하거나 WebGL이 없으면 기존 2D 그대로 동작 ──
let view3d=null,use3D=false;
function set3D(on){use3D=!!(on&&view3d);$('game3d').classList.toggle('hidden',!use3D);canvas.classList.toggle('hidden',use3D);setText('viewBtn',use3D?'🖼️ 2D로 보기':'🧊 3D로 보기');$('viewBtn').classList.toggle('hidden',!view3d);try{localStorage.setItem('mathcook-view',use3D?'3d':'2d')}catch{}}
async function init3D(){
 try{const mod=await import('./render3d.js');view3d=mod.createRenderer3D($('game3d'),{W,H,stations:STATIONS,foods:FOOD});let saved='3d';try{saved=localStorage.getItem('mathcook-view')||'3d'}catch{}set3D(saved!=='2d');window.__view3d=view3d}
 catch(e){console.warn('3D를 켤 수 없어 2D로 실행합니다.',e);view3d=null;set3D(false)}
}
window.__game={get p(){return p},get group(){return getGroup()},get use3D(){return use3D},get question(){return activeQuestion},get storage(){return storageList(getStorage())},get boards(){return boardViews()},get chopNeed(){return chopNeed},get pickerOpen(){return pickerOpen}}; // 자동 테스트·디버깅용 읽기 창구
function animate(t){fx=fx.filter(f=>t-f.t<450);let dt=Math.min(.05,(t-last)/1000);last=t;clock+=dt;
 if(roundStarted&&!ended){
  if(!activeQuestion&&!pickerOpen){let dx=0,dy=0;if(keys.has('ArrowLeft')||keys.has('a'))dx--;if(keys.has('ArrowRight')||keys.has('d'))dx++;if(keys.has('ArrowUp')||keys.has('w'))dy--;if(keys.has('ArrowDown')||keys.has('s'))dy++;
   if(dx||dy){let len=Math.hypot(dx,dy);dx/=len;dy/=len;let s=dt*5.2;let nx=p.x+dx*s,ny=p.y+dy*s;if(walkable(nx,p.y))p.x=nx;if(walkable(p.x,ny))p.y=ny;p.dir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');p.updatedAt=Date.now();if(mode!=='demo'&&cloud)cloud.syncPlayer(p).catch(()=>{});}
  }
  if(mode==='demo')for(let b of bots){let dist=Math.hypot(b.tx-b.x,b.ty-b.y);if(dist<.2||Math.random()<dt*.2){b.tx=rnd(4,13)+.5;b.ty=rnd(3,9)+.5}let vx=(b.tx-b.x)/(dist||1),vy=(b.ty-b.y)/(dist||1);let nx=b.x+vx*dt*.9,ny=b.y+vy*dt*.9;if(walkable(nx,b.y))b.x=nx;if(walkable(b.x,ny))b.y=ny;}
  let started=mode==='demo'?meta.startedAt:meta?.startedAt||Date.now();nowTime=Math.max(0,(meta?.duration||180)-(Date.now()+(cloud?.serverOffset||0)-started)/1000);
  setText('timerLabel',`${String(Math.floor(nowTime/60)).padStart(2,'0')}:${String(Math.floor(nowTime%60)).padStart(2,'0')}`);
  elapsed=(meta?.duration||180)-nowTime;
  if(mode==='demo'&&currentMode==='duel'&&Math.floor(elapsed/35)>rivalServed){rivalServed++;let gr=getGroup('B');gr.score+=100;gr.served++;gr.orderIndex++;toast('⚔️ 라이벌 B팀이 요리를 완성했어요!')}
  if(nowTime<=0)finishRound();
  if(clock-ambience>1){ambience=clock;updateUI()}
 }
 for(let pt of particles){pt.x+=pt.vx*dt*60;pt.y+=pt.vy*dt*60;pt.vy+=.09*dt*60;pt.life-=dt*.9}particles=particles.filter(p=>p.life>0);
 if(cloud?.role==='teacher' && cloud.meta?.phase==='playing' && Math.floor(t/1000)!==Math.floor((t-dt*1000)/1000))updateTeacherMonitor();
 drawGame(t);requestAnimationFrame(animate);
}
function finishRound(){if(ended)return;ended=true;sentPhase='ended';roundStarted=false;activeQuestion=null;hide('questionOverlay');const gr=getGroup();setText('endScore',gr.score||0);setText('endServed',gr.served||0);setText('endCorrect',gr.correct||0);
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
   cloud=new CloudRoom();wireCloud(cloud);await cloud.create({name:getName(),count:n,mode:m,unit:$('unitSelect').value,duration:Number($('durationSelect').value)});
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
   let header=['번호','이름(별명)','팀','정답','오답',...Array.from({length:6},(_,i)=>(i+1)+'단원 정답')];
   let lines=[header,...Object.values(cloud.results||{}).sort((a,b)=>a.seat-b.seat).map((v,i)=>[i+1,v.name||'',Number(v.team)+1,v.correct||0,v.wrong||0,...Array.from({length:6},(_,j)=>v.units?.[j+1]?.correct||0)])];
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
