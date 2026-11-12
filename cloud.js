import { firebaseConfig } from './firebase-config.js';
import { storePut, storeTake, applyPenalty } from './items.js';
import { plateWashed } from './stations.js';
import { serveOrder } from './orders.js';
const SDK='https://www.gstatic.com/firebasejs/13.2.0/';
const MAX=25;
const now=()=>Date.now();
const digits=()=>String(100000+Math.floor(Math.random()*900000));
// ── 입장 단계 진단 ─────────────────────────────────────────────
// 각 단계에 시간 제한을 두고, 진행 상황(progress)과 소요 시간을 기록합니다.
// 콘솔 기록([입장 진단])에는 학생 이름·계정 번호·토큰을 남기지 않습니다.
export const STEP_LABEL={sdk:'Firebase 불러오는 중',app:'Firebase 준비 중',authRestore:'로그인 확인 중',authNew:'로그인 확인 중',connect:'Firebase 연결 중',meta:'게임방 확인 중',member:'게임방 확인 중',seat:'학생 자리 배정 중',register:'학생 자리 배정 중',lobby:'입장 완료'};
const LIMIT={sdk:20000,app:5000,authRestore:8000,authNew:15000,connect:12000,meta:10000,member:10000,seat:15000,register:10000};
export class JoinError extends Error{constructor(kind,step,message){super(message);this.kind=kind;this.step=step}}
export const NET_MSG='게임 서버와 연결되지 않았어요. 인터넷 연결을 확인하거나 선생님께 알려주세요.';
const DIAG=[];try{window.__joinDiag=DIAG}catch{}
function diag(step,state,ms,kind){const e={step,state,ms:ms==null?null:Math.round(ms),kind:kind||null,at:Date.now()};DIAG.push(e);if(DIAG.length>200)DIAG.shift();try{console.info('[입장 진단]',STEP_LABEL[step]||step,state,e.ms!=null?e.ms+'ms':'',kind||'')}catch{}}
// 테스트 전용 (localhost에서만): ?delay_단계=ms 로 늦추기, ?hang=단계 로 응답 없이 멈추기
const QSX={get(k){try{return location.hostname==='localhost'?new URLSearchParams(location.search).get(k):null}catch{return null}}};const QS=QSX;
const limitOf=step=>Number(QS.get('limit_'+step))||LIMIT[step];
function testHook(step){if(QS.get('hang')===step)return new Promise(()=>{});const d=Number(QS.get('delay_'+step)||0);return d>0?new Promise(r=>setTimeout(r,d)):null}
// 오류를 네 종류로 나눔: network(연결) / auth(로그인) / permission(권한) / code(방 코드·정원 등) / timeout(시간 초과)
export function classify(e,step){
  if(e instanceof JoinError)return e;
  const code=String(e?.code||''),msg=String(e?.message||e||'');
  if(/permission|denied/i.test(code+msg))return new JoinError('permission',step,'서버가 요청을 거절했어요(권한 오류). 선생님께 알려 주세요. (선생님: Firebase에 최신 보안 규칙이 게시되었는지 확인)');
  if(code==='auth/too-many-requests'||/too-many-requests/.test(msg))return new JoinError('auth',step,'로그인 요청이 너무 많아 Firebase가 잠시 막았어요(익명 로그인 한도). 몇 분 뒤 다시 시도하고, 계속되면 선생님께 알려 주세요.');
  if(code==='auth/operation-not-allowed'||code==='auth/admin-restricted-operation')return new JoinError('auth',step,'Firebase 익명 로그인이 꺼져 있어요. 선생님: 콘솔 → Authentication → 로그인 방법에서 "익명"을 사용 설정해 주세요.');
  if(code==='auth/network-request-failed'||/network|failed to fetch|load failed|dynamically imported/i.test(msg))return new JoinError('network',step,step==='sdk'?'Firebase 프로그램을 불러오지 못했어요(www.gstatic.com). 인터넷 연결을 확인하거나 선생님께 알려주세요.':NET_MSG);
  if(code.startsWith('auth/'))return new JoinError('auth',step,'로그인 중 문제가 생겼어요('+code+'). 다시 시도하거나 선생님께 알려 주세요.');
  return new JoinError('unknown',step,'입장 중 문제가 생겼어요: '+msg.slice(0,80));
}
function withTimeout(p,step){let id;return Promise.race([p,new Promise((_,rej)=>{id=setTimeout(()=>rej(new JoinError(step==='connect'?'network':'timeout',step,step==='connect'?NET_MSG:`"${STEP_LABEL[step]}" 단계에서 서버 응답이 ${Math.round(limitOf(step)/1000)}초 넘게 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.`)),limitOf(step))})]).finally(()=>clearTimeout(id))}
// Firebase 준비(SDK·앱·로그인)는 한 화면에서 한 번만: 다시 시도·새 방에서 재사용 (익명 계정을 새로 만들지 않음)
let SHARED=null,AUTH=null;
// 자리 배정 트랜잭션: 응답이 늦어도 같은 요청을 다시 보내지 않고, 진행 중인 요청의 결과를 이어서 기다림
const SEAT_JOBS=new Map();
export function cloudConfigured(){return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId)}
export function planTeams(n){
  n=Math.min(MAX,Math.max(1,Number(n)||4));
  if(n<=5)return [n];
  const groups=Math.ceil(n/5), result=Array(groups).fill(Math.floor(n/groups));
  for(let i=0;i<n%groups;i++)result[i]++;
  return result;
}
export class CloudRoom{
  // 한 단계 실행: 진행 알림 → (테스트 지연) → 시간 제한 → 기록
  async step(name,fn){
    const t0=performance.now();this.fire('progress',{step:name,label:STEP_LABEL[name]});diag(name,'시작');
    try{const v=await withTimeout((async()=>{const h=testHook(name);if(h)await h;return fn()})(),name);diag(name,'완료',performance.now()-t0);return v}
    catch(e){const je=classify(e,name);diag(name,'실패',performance.now()-t0,je.kind);throw je}
  }
  constructor(){this.uid='';this.code='';this.db=null;this.ops=null;this.unsubs=[];this.seat=-1;this.team=0;this.role='student';this.name='';this.teamMembers={};this.teamData=null;this.meta=null;this.allMembers={};this.allTeams={};this.listeners={};this.localPos=null;this.lastMotion=0;this.connected=false;this.serverOffset=0;this.results={};}
  on(event,handler){this.listeners[event]=handler}
  fire(event,value){this.listeners[event]?.(value)}
  async init(){
    if(!cloudConfigured())throw new JoinError('code','sdk','Firebase 연결 설정이 아직 없습니다. firebase-config.js를 입력해주세요.');
    const EMU=location.hostname==='localhost'&&QS.get('emu')==='1';   // 테스트 전용: 로컬 에뮬레이터
    // ① Firebase 연결 중: SDK → 앱 → 데이터베이스 연결(.info/connected)
    if(!SHARED)SHARED=(async()=>{
      const [a,b,d]=await this.step('sdk',()=>Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-database.js')]));
      const {app,db}=await this.step('app',()=>{const app=a.getApps().length?a.getApp():a.initializeApp(firebaseConfig);return {app,db:d.getDatabase(app)}});
      let emuUid='';
      if(EMU){emuUid=sessionStorage.getItem('emu-uid')||('u'+Math.random().toString(36).slice(2,10));sessionStorage.setItem('emu-uid',emuUid);try{d.connectDatabaseEmulator(db,'127.0.0.1',9000,{mockUserToken:{sub:emuUid,user_id:emuUid}})}catch{}}
      const offset={v:0};d.onValue(d.ref(db,'.info/serverTimeOffset'),s=>{offset.v=s.val()||0});
      return {a,b,d,app,db,offset,emuUid};
    })().catch(e=>{SHARED=null;throw e});   // 실패하면 다음 시도에서 처음부터
    const s=await SHARED;
    this.ops=s.d;this.db=s.db;this.offsetRef=s.offset;
    this.ops.goOnline(this.db);   // 방에서 나갈 때 끊었던 연결을 다시 엶
    // 실제로 서버와 연결됐는지 확인 (연결이 안 되면 get·트랜잭션이 끝없이 기다리므로 먼저 확인)
    await this.step('connect',()=>new Promise(res=>{let off=null;off=this.ops.onValue(this.ops.ref(this.db,'.info/connected'),snap=>{if(snap.val()===true){res();setTimeout(()=>off&&off(),0)}})}));
    // ② 로그인 확인 중: 저장된 로그인 상태가 완전히 복원될 때까지 기다린 뒤 확인 → 이미 로그인한 학생은 같은 계정을 그대로 씀
    if(!AUTH)AUTH=(async()=>{
      if(EMU){await this.step('authRestore',()=>null);return s.emuUid}
      const auth=s.b.getAuth(s.app);
      await this.step('authRestore',()=>auth.authStateReady?auth.authStateReady():null);
      if(auth.currentUser){diag('authRestore','기존 계정 사용');return auth.currentUser.uid}
      return (await this.step('authNew',()=>s.b.signInAnonymously(auth))).user.uid;
    })().catch(e=>{AUTH=null;throw e});
    this.uid=await AUTH;
  }
  get serverOffset(){return this.offsetRef?this.offsetRef.v:0}
  set serverOffset(v){}
  // 입장 뒤 연결 감시: 3초 넘게 끊기면 'net'(false) 알림, 다시 연결되면 'net'(true)
  watchConnection(){
    let timer=null,was=true;
    const u=this.ops.onValue(this.ops.ref(this.db,'.info/connected'),s=>{
      if(s.val()===true){clearTimeout(timer);timer=null;if(!was){was=true;diag('connect','다시 연결됨');this.fire('net',true)}if(this.role==='student'&&this.allMembers?.[this.uid])this.ops.update(this.path('members',this.uid),{online:true}).catch(()=>{})}
      else if(!timer)timer=setTimeout(()=>{was=false;diag('connect','연결 끊김');this.fire('net',false)},3000);
    });
    this.unsubs.push(()=>{u();clearTimeout(timer)});
  }
  path(...path){return this.ops.ref(this.db,['rooms',this.code,...path].join('/'))}
  async create({name,count,mode,unit,duration,orderTime,pin,settings,sizes:given}){
    await this.init();this.name=name;this.role='teacher';
    for(let i=0;i<10;i++){
      this.code=digits();let snap=await this.step('meta',()=>this.ops.get(this.path('meta')));
      if(snap.exists())continue;
      let sizes=Array.isArray(given)&&given.length?given.map(Number):planTeams(count);
      // 교사 핀 번호는 서버 보안 규칙이 확인합니다. 이 파일에도, 공개 저장소에도 핀 번호는 들어 있지 않습니다.
      const max=sizes.reduce((a,b)=>a+b,0)||Number(count),spare=Math.min(25,max+4);   // max: 실제 정원 / count: 연결 끊김 등으로 버려지는 자리 번호를 위한 여유 (최대 25)
      try{await this.ops.update(this.path(),{meta:{hostUid:this.uid,phase:'lobby',count:spare,max,sizes,mode:mode==='duel'&&!sizes.every(s=>s===4)?'coop':mode,unit,duration:Number(duration),orderTime:Number(orderTime)||75000,settings:settings||null,createdAt:now(),startedAt:0},pin:String(pin||'')})}
      catch(e){if(/permission|denied/i.test(e.message))throw new Error('교사 핀 번호가 맞지 않습니다.');throw e}
      this.connected=true;this.subscribeBase();this.watchConnection();this.cleanupOldRooms().catch(()=>{});return this.code;
    }
    throw new Error('방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
  }
  // 학생 입장. 단계마다 시간 제한이 있어 무한 로딩이 생기지 않고, 늦어지면 어느 단계인지 알려 줌
  async join({code,name}){
    this.role='student';this.code=String(code).trim();this.name=name;
    if(!/^\d{6}$/.test(this.code))throw new JoinError('code','meta','방 코드는 숫자 6자리예요. 다시 확인해 주세요.');
    const t0=performance.now();
    await this.init();
    const snap=await this.step('meta',()=>this.ops.get(this.path('meta')));
    if(!snap.exists())throw new JoinError('code','meta','방을 찾지 못했어요. 방 코드를 다시 확인해 주세요.');
    const meta=snap.val();
    if(meta.phase==='ended')throw new JoinError('code','meta','이미 끝난 게임방이에요. 선생님께 새 방 코드를 받아 주세요.');
    const [ban,mine,allSnap]=await this.step('member',()=>Promise.all([this.ops.get(this.path('banned',this.uid)).catch(()=>null),this.ops.get(this.path('members',this.uid)),this.ops.get(this.path('members'))]));
    if(ban&&ban.val())throw new JoinError('code','member','선생님이 이 방에서 내보냈어요. 선생님께 여쭤 보세요.');
    if(mine.exists()){                       // 재접속: 예전 자리·모둠 그대로
      this.seat=mine.val().seat;this.team=Number(mine.val().team);diag('seat','기존 자리 사용');
    }else{
      if(meta.phase==='playing')throw new JoinError('code','member','게임이 이미 진행 중이에요. 다음 판을 기다려 주세요.');
      const all=allSnap.val()||{},cap=meta.max||meta.count;
      if(Object.keys(all).length>=cap)throw new JoinError('code','member',`학급방 정원(${cap}명)이 가득 찼어요. 선생님께 알려 주세요.`);
      this.seat=await this.claimSeat(meta);
      // 모둠: 번갈아 배정, 그 모둠이 꽉 찼으면 가장 빈 모둠으로
      const sizes=meta.sizes||[cap];
      this.team=sizes.every(s=>s===sizes[0])?this.seat%sizes.length:(()=>{let acc=0;return sizes.findIndex(n=>{acc+=n;return this.seat<acc})})();
      const cnt=sizes.map((_,i)=>Object.values(all).filter(m=>Number(m.team)===i).length);
      if(!(this.team>=0)||cnt[this.team]>=sizes[this.team]){const free=cnt.map((c,i)=>[sizes[i]-c,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1])[0];this.team=free?free[1]:0}
      await this.step('register',()=>this.ops.set(this.path('members',this.uid),{name:name.slice(0,12),seat:this.seat,team:String(this.team),joinedAt:now(),online:true}));
      try{localStorage.removeItem(this.seatKey())}catch{}
    }
    this.connected=true;this.subscribeBase();this.watchConnection();
    // 비정상 종료(창 닫힘·인터넷 끊김) 때 서버가 '접속 끊김'으로 표시 → 교사 대기실에서 보임. 다시 들어오면 자리 그대로
    this.ops.onDisconnect(this.path('members',this.uid,'online')).set(false).catch(()=>{});
    this.ops.update(this.path('members',this.uid),{online:true}).catch(()=>{});
    this.ops.update(this.path('results',this.uid),{name:this.name,team:this.team,seat:this.seat}).catch(()=>{});
    diag('lobby','완료',performance.now()-t0);this.fire('progress',{step:'lobby',label:STEP_LABEL.lobby});
    return this.code;
  }
  seatKey(){return 'mathcook-seat-'+this.code+'-'+this.uid}
  // 자리 번호 받기. 중복 배정 방지:
  //  ① 이전 시도에서 받은 자리가 이 컴퓨터에 기록돼 있으면 그대로 사용 (트랜잭션을 다시 보내지 않음)
  //  ② 같은 화면에서 진행 중인 요청이 있으면 새로 보내지 않고 그 결과를 기다림 (시간 초과 뒤 다시 시도해도 같은 요청)
  async claimSeat(meta){
    const key=this.seatKey();
    try{const s=localStorage.getItem(key);if(s!==null&&Number.isInteger(Number(s))){diag('seat','이전 시도의 자리 사용');return Number(s)}}catch{}
    let job=SEAT_JOBS.get(key);
    if(!job){
      job=this.ops.runTransaction(this.path('nextSeat'),num=>{num=num||0;return num>=meta.count?undefined:num+1},{applyLocally:false})
        .then(async tr=>{const h=testHook('seatAck');if(h)await h;if(!tr.committed)throw new JoinError('code','seat','학급방 자리가 모두 찼어요. 선생님께 알려 주세요.');const s=tr.snapshot.val()-1;try{localStorage.setItem(key,String(s))}catch{}return s})
        .finally(()=>SEAT_JOBS.delete(key));
      job.catch(()=>{});SEAT_JOBS.set(key,job);
    }else diag('seat','진행 중인 요청 이어서 기다림');
    return this.step('seat',()=>job);
  }
  subscribeBase(){
    const listen=(p,cb)=>this.unsubs.push(this.ops.onValue(this.path(...p),s=>cb(s.val()),e=>this.fire('error',e.message)));
    let scoresAttached=false;
    listen(['meta'],v=>{
      this.meta=v;this.fire('meta',v);
      if(v && !scoresAttached){
        scoresAttached=true;
        (v.sizes||[]).forEach((_,i)=>listen(['scores',String(i)],d=>{this.allTeams[i]={data:{groups:d||{}}};this.fire('teams',this.allTeams)}));   // 8단계: 다른 팀은 점수만 볼 수 있음
      }
    });
    listen(['members'],v=>{
      this.allMembers=v||{};
      if(this.role==='student'&&this.connected){
        const mine=this.allMembers[this.uid];
        if(!mine){this.fire('kicked');return}                               // 선생님이 내보냄
        const t=Number(mine.team);
        if(t!==this.team){const from=this.team;this.team=t;this.listenTeam();this.fire('moved',{from,to:t})}   // 모둠이 바뀜 → 새 모둠 데이터로
      }
      this.fire('members',this.allMembers);
    });
    if(this.role==='teacher')listen(['results'],v=>{this.results=v||{};this.fire('results',this.results)});
    if(this.role==='student')this.listenTeam();
  }
  // 내 모둠의 요리사 위치와 주방 데이터 구독 (모둠을 옮기면 다시 걸음)
  listenTeam(){
    (this.teamUnsubs||[]).forEach(u=>u());this.teamUnsubs=[];
    const listen=(p,cb)=>{const u=this.ops.onValue(this.path(...p),s=>cb(s.val()),e=>this.fire('error',e.message));this.teamUnsubs.push(u);this.unsubs.push(u)};
    listen(['teams',String(this.team),'players'],v=>{this.teamMembers=v||{};this.fire('players',this.teamMembers)});
    listen(['teams',String(this.team),'data'],v=>{this.teamData=v||null;this.fire('teamData',this.teamData)});
  }
  // ── 대기실에서 모둠 바꾸기 / 내보내기 ──
  // 서버가 거절했을 때 알기 쉬운 말로
  friendly(e){return /permission|denied/i.test(e?.message||'')?new Error('서버가 거절했어요. 선생님이 Firebase에 최신 보안 규칙을 게시했는지 확인해 주세요.'):e}
  // 교사: 두 학생의 모둠을 맞바꾸기 (모든 모둠이 꽉 찼을 때). 한 번에 저장
  async swapMembers(a,b){
    if(this.role!=='teacher')return;
    if(this.meta?.phase==='playing')throw new Error('게임 중에는 모둠을 바꿀 수 없어요. 게임이 끝난 뒤 바꿔 주세요.');
    const A=this.allMembers?.[a],B=this.allMembers?.[b];if(!A||!B||A.team===B.team)return;
    try{await this.ops.update(this.path('members'),{[a+'/team']:B.team,[b+'/team']:A.team})}catch(e){throw this.friendly(e)}
    this.ops.update(this.path('results',a),{team:Number(B.team)}).catch(()=>{});this.ops.update(this.path('results',b),{team:Number(A.team)}).catch(()=>{});
  }
  teamCount(t){return Object.values(this.allMembers||{}).filter(m=>Number(m.team)===t).length}
  // 학생이 스스로 다른 모둠으로 (대기실에서만, 자리가 남은 모둠만)
  async moveSelf(t){
    if(this.role!=='student')return;
    if(this.meta?.phase!=='lobby')throw new Error('게임이 시작되기 전에만 모둠을 바꿀 수 있어요.');
    if(!(t>=0&&t<(this.meta.sizes||[]).length)||t===this.team)return;
    if(this.teamCount(t)>=this.meta.sizes[t])throw new Error(`${t+1}모둠은 자리가 다 찼어요. 선생님께 자리를 바꿔 달라고 해 주세요.`);
    try{await this.ops.update(this.path('members',this.uid),{team:String(t)})}catch(e){throw this.friendly(e)}
    await this.ops.update(this.path('results',this.uid),{team:t}).catch(()=>{});
  }
  // 교사: 학생을 다른 모둠으로 (대기실에서만)
  async moveMember(uid,t){
    if(this.role!=='teacher')return;
    if(this.meta?.phase==='playing')throw new Error('게임 중에는 모둠을 바꿀 수 없어요. 게임이 끝난 뒤 바꿔 주세요.');
    const m=this.allMembers?.[uid];if(!m||Number(m.team)===t)return;
    if(this.teamCount(t)>=this.meta.sizes[t])throw new Error(`${t+1}모둠은 자리가 다 찼어요. 목록에서 "↔ 학생과 바꾸기"를 골라 자리를 맞바꿔 주세요.`);
    try{await this.ops.update(this.path('members',uid),{team:String(t)})}catch(e){throw this.friendly(e)}
    await this.ops.update(this.path('results',uid),{team:t}).catch(()=>{});
  }
  // 교사: 학생 내보내기 (다시 들어올 수 없음). 빈자리만큼 정원을 하나 늘려 다른 학생이 들어올 수 있게 함
  async kick(uid){
    if(this.role!=='teacher')return;
    const m=this.allMembers?.[uid];if(!m)return;
    try{await this.ops.set(this.path('banned',uid),true);await this.ops.remove(this.path('members',uid))}catch(e){throw this.friendly(e)}
    await this.ops.remove(this.path('results',uid)).catch(()=>{});
    await this.ops.remove(this.path('teams',String(m.team),'players',uid)).catch(()=>{});
    if((this.meta?.count||0)<25)await this.ops.update(this.path('meta'),{count:this.meta.count+1}).catch(()=>{});   // 자리 번호 여유 하나 더 (실제 정원 max는 그대로)
  }
  // introMs: 인트로 길이. 시작 시각을 그만큼 뒤로 잡아 모든 학생이 인트로를 보고 같은 순간에 시작
  async begin(introMs=0){
    if(this.role!=='teacher')throw new Error('교사만 시작할 수 있습니다.');
    let teams=this.meta.sizes&&this.meta.sizes.length?this.meta.sizes:planTeams(this.meta.count);
    const blank=()=>({score:0,served:0,correct:0,wrong:0,orderSeq:0});
    const writes={};
    for(let i=0;i<teams.length;i++){writes['teams/'+i+'/data']={groups:{ALL:blank(),A:blank(),B:blank()}};writes['scores/'+i]=null}
    await this.ops.update(this.path(),writes);
    await this.ops.update(this.path('meta'),{phase:'playing',startedAt:introMs>0?Date.now()+(this.serverOffset||0)+introMs:this.ops.serverTimestamp()});
  }
  // 교사: 인트로를 모두 함께 건너뛰기 (시작 시각을 앞당김)
  async skipIntro(leftMs){
    if(this.role!=='teacher'||!this.meta?.startedAt)return;
    const at=Date.now()+(this.serverOffset||0)+leftMs;
    if(at<this.meta.startedAt)await this.ops.update(this.path('meta'),{startedAt:at});
  }
  async finish(){if(this.role==='teacher')await this.ops.update(this.path('meta'),{phase:'ended'})}
  async reLobby(){if(this.role==='teacher')await this.ops.update(this.path('meta'),{phase:'lobby',startedAt:0})}
  async spawn(pos){
    if(this.role!=='student')return;
    const player={name:this.name,seat:this.seat,x:pos.x,y:pos.y,dir:'down',held:'',updatedAt:now()};
    await this.ops.set(this.path('teams',String(this.team),'players',this.uid),player);
    this.localPos=player;
    this.ops.onDisconnect(this.path('teams',String(this.team),'players',this.uid)).remove();
  }
  async syncPlayer(player,force=false){
    if(!this.connected||this.role!=='student')return;
    // 사용량 줄이기: 초당 최대 약 4번, 움직임·든 것이 그대로면 보내지 않음
    if(!force && now()-this.lastMotion<240)return;
    const pos={name:this.name,seat:this.seat,x:+player.x.toFixed(2),y:+player.y.toFixed(2),dir:player.dir,held:player.held||''};
    const L=this.localPos;if(!force&&L&&Math.abs(L.x-pos.x)<0.04&&Math.abs(L.y-pos.y)<0.04&&L.dir===pos.dir&&L.held===pos.held)return;
    this.lastMotion=now();
    this.localPos={...pos,updatedAt:now()};
    await this.ops.update(this.path('teams',String(this.team),'players',this.uid),this.localPos);
  }
  async writeMath(side,correct,unit){
    const path=this.path('teams',String(this.team),'data','groups',side,correct?'correct':'wrong');
    await this.ops.runTransaction(path,old=>(old||0)+1);
    const stat=correct?'correct':'wrong';
    if(correct)this.ops.runTransaction(this.path('teams',String(this.team),'data','solvers',this.uid),v=>(v||0)+1).catch(()=>{});   // 팀원별 정답 수 (참여 보너스·명단 표시용)
    await Promise.all([
      this.ops.runTransaction(this.path('results',this.uid,stat),v=>(v||0)+1),
      this.ops.runTransaction(this.path('results',this.uid,'units',String(unit),stat),v=>(v||0)+1)
    ]);
  }
  // 힌트 사용 기록 (학생별·단원별)
  async writeHint(unit){
    await Promise.all([this.ops.runTransaction(this.path('results',this.uid,'hints'),v=>(v||0)+1),this.ops.runTransaction(this.path('results',this.uid,'units',String(unit),'hints'),v=>(v||0)+1)]);
  }
  async deposit(side,item,recipe){
    let accepted=false;
    const r=this.path('teams',String(this.team),'data','groups',side,'tray');
    const res=await this.ops.runTransaction(r,old=>{
      old=old||{};
      if(!recipe.items.includes(item)||old[item])return;
      accepted=true;return {...old,[item]:true};
    });
    return Boolean(res.committed && accepted);
  }
  async serve(side,recipe,allRecipes){
    let success=false;
    const r=this.path('teams',String(this.team),'data','groups',side);
    const result=await this.ops.runTransaction(r,old=>{
      if(!old)return;
      const current=allRecipes[old.orderIndex%allRecipes.length];
      if(!current.items.every(i=>old.tray?.[i]))return;
      success=true;
      return {...old,orderIndex:old.orderIndex+1,score:(old.score||0)+100,served:(old.served||0)+1,tray:{}};
    });
    return Boolean(result.committed && success);
  }
  // ── 2단계: 팀 공유 보관대·폐기 감점. 규칙은 items.js의 함수를 트랜잭션 안에서 그대로 사용 → 동시에 눌러도 5칸 초과·복제 없음 ──
  async storagePut(item){
    let ok=false;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','storage'),old=>{
      const next=storePut(old||{},item);ok=Boolean(next);
      return next||undefined;
    });
    return Boolean(res.committed && ok);
  }
  async storageTake(id){
    let got=null;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','storage'),old=>{
      const r=storeTake(old||{},id);got=r?r.item:null;
      return r?r.storage:undefined;
    });
    return res.committed?got:null;
  }
  // ── 3단계: 설비(도마) 상태. fn은 stations.js의 순수 함수 → 트랜잭션이라 두 명이 동시에 눌러도 한 명만 성공 ──
  async stationOp(id,fn){
    let out=null;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','stations',id),old=>{
      out=fn(old||null);
      return out?out.next:undefined;
    });
    return res.committed?out:null;
  }
  // ── 5단계: 접시 수 변경과 접시 서빙 (규칙은 plates.js) ──
  async platesOp(fn){
    let ok=false;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','plates'),old=>{const n=fn(old||null);ok=Boolean(n);return n||undefined});
    return Boolean(res.committed&&ok);
  }
  // 6단계: 주문 대기열 갱신(만료·추가)과 서빙. 규칙은 orders.js, 여기서는 트랜잭션으로 저장만 함
  async groupOp(side,fn){
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','groups',side),old=>fn(old||{})||undefined);
    return res.committed?(res.snapshot.val()||{}):null;
  }
  async servePlate(side,contents,allRecipes,nowFn,finish=0,ev=null){
    let out=null;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','groups',side),old=>{out=serveOrder(old||{},contents,allRecipes,nowFn(),finish,ev);return out?out.next:undefined});
    if(!res.committed||!out)return null;
    this.ops.runTransaction(this.path('results',this.uid,'served'),v=>(v||0)+1).catch(()=>{});   // 개인 기여 기록 (팀 점수와 별도)
    this.publishScore(side,out.next);
    return out;
  }
  async plateWashed(){
    let ok=false;
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','plates'),old=>{const n=plateWashed(old);ok=Boolean(n);return n||undefined});
    return Boolean(res.committed&&ok);
  }
  async penalize(side){
    const res=await this.ops.runTransaction(this.path('teams',String(this.team),'data','groups',side,'score'),v=>applyPenalty(v));
    if(res.committed)this.publishScore(side,{score:res.snapshot.val()||0});
  }
  // 공개 점수판: 다른 팀과 교사는 이 값만 봄 (주방 안의 재료·접시·주문은 팀원만 볼 수 있음)
  publishScore(side,g){
    const v={score:Math.max(0,Number(g.score)||0)};if(g.served!==undefined)v.served=Number(g.served)||0;
    this.ops.update(this.path('scores',String(this.team),side),v).catch(()=>{});
  }
  // 방에서 나가면 구독을 끊고 Firebase 연결도 닫음 (무료 요금제의 동시 접속 100개 한도를 아끼기 위해)
  async disconnect(){this.unsubs.forEach(u=>u());this.unsubs=[];this.connected=false;try{if(this.role==='student'&&this.uid)await this.ops.remove(this.path('teams',String(this.team),'players',this.uid))}catch{}try{this.ops.goOffline(this.db)}catch{}}
  // 이 컴퓨터에서 예전에 만든 방 지우기 (새 방을 만들 때). 규칙이 아직 없으면 조용히 건너뜀
  async cleanupOldRooms(){
    let list=[];try{list=JSON.parse(localStorage.getItem('mathcook-myrooms')||'[]')}catch{}
    const keep=[];
    for(const code of list.filter(c=>c!==this.code).slice(-10)){try{const m=(await this.ops.get(this.ops.ref(this.db,'rooms/'+code+'/meta'))).val();if(m&&now()-(m.createdAt||0)<6*3600*1000){keep.push(code);continue}await this.ops.remove(this.ops.ref(this.db,'rooms/'+code))}catch{keep.push(code)}}
    try{localStorage.setItem('mathcook-myrooms',JSON.stringify([...keep.slice(-10),this.code]))}catch{}
  }
}
