import { firebaseConfig } from './firebase-config.js';
import { storePut, storeTake, applyPenalty } from './items.js';
import { plateWashed } from './stations.js';
import { serveOrder } from './orders.js';
const SDK='https://www.gstatic.com/firebasejs/13.2.0/';
const MAX=25;
const now=()=>Date.now();
const digits=()=>String(100000+Math.floor(Math.random()*900000));
export function cloudConfigured(){return Boolean(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId)}
export function planTeams(n){
  n=Math.min(MAX,Math.max(1,Number(n)||4));
  if(n<=5)return [n];
  const groups=Math.ceil(n/5), result=Array(groups).fill(Math.floor(n/groups));
  for(let i=0;i<n%groups;i++)result[i]++;
  return result;
}
export class CloudRoom{
  constructor(){this.uid='';this.code='';this.db=null;this.ops=null;this.unsubs=[];this.seat=-1;this.team=0;this.role='student';this.name='';this.teamMembers={};this.teamData=null;this.meta=null;this.allMembers={};this.allTeams={};this.listeners={};this.localPos=null;this.lastMotion=0;this.connected=false;this.serverOffset=0;this.results={};}
  on(event,handler){this.listeners[event]=handler}
  fire(event,value){this.listeners[event]?.(value)}
  async init(){
    if(!cloudConfigured())throw new Error('Firebase 연결 설정이 아직 없습니다. firebase-config.js를 입력해주세요.');
    if(!this.db){
      const [a,b,d]=await Promise.all([import(SDK+'firebase-app.js'),import(SDK+'firebase-auth.js'),import(SDK+'firebase-database.js')]);
      this.ops=d; const app=a.getApps().length?a.getApp():a.initializeApp(firebaseConfig);this.db=d.getDatabase(app);
      const EMU=location.hostname==='localhost'&&new URLSearchParams(location.search).get('emu')==='1';   // 테스트 전용: 로컬 에뮬레이터
      if(EMU){this.uid=sessionStorage.getItem('emu-uid')||('u'+Math.random().toString(36).slice(2,10));sessionStorage.setItem('emu-uid',this.uid);try{d.connectDatabaseEmulator(this.db,'127.0.0.1',9000,{mockUserToken:{sub:this.uid,user_id:this.uid}})}catch{}}
      d.onValue(d.ref(this.db,'.info/serverTimeOffset'),snap=>this.serverOffset=snap.val()||0);
      // 테스트 전용: 이 컴퓨터(localhost)에서 주소에 ?emu=1 이면 실제 서버 대신 로컬 에뮬레이터에 연결
      if(!EMU){
      const auth=b.getAuth(app);let credential=auth.currentUser;
      if(!credential) credential=(await b.signInAnonymously(auth)).user;
      this.uid=credential.uid;
      }
    }
    this.ops.goOnline(this.db);   // 방에서 나갈 때 끊었던 연결을 다시 엶
  }
  path(...path){return this.ops.ref(this.db,['rooms',this.code,...path].join('/'))}
  async create({name,count,mode,unit,duration,orderTime,pin,settings,sizes:given}){
    await this.init();this.name=name;this.role='teacher';
    for(let i=0;i<10;i++){
      this.code=digits();let snap=await this.ops.get(this.path('meta'));
      if(snap.exists())continue;
      let sizes=Array.isArray(given)&&given.length?given.map(Number):planTeams(count);
      // 교사 핀 번호는 서버 보안 규칙이 확인합니다. 이 파일에도, 공개 저장소에도 핀 번호는 들어 있지 않습니다.
      try{await this.ops.update(this.path(),{meta:{hostUid:this.uid,phase:'lobby',count:Number(count),sizes,mode:mode==='duel'&&!sizes.every(s=>s===4)?'coop':mode,unit,duration:Number(duration),orderTime:Number(orderTime)||75000,settings:settings||null,createdAt:now(),startedAt:0},pin:String(pin||'')})}
      catch(e){if(/permission|denied/i.test(e.message))throw new Error('교사 핀 번호가 맞지 않습니다.');throw e}
      this.connected=true;this.subscribeBase();this.cleanupOldRooms().catch(()=>{});return this.code;
    }
    throw new Error('방 코드를 만들지 못했습니다. 다시 시도해 주세요.');
  }
  async join({code,name}){
    await this.init();this.code=String(code).trim();this.name=name;this.role='student';
    const snap=await this.ops.get(this.path('meta'));
    if(!snap.exists())throw new Error('방을 찾지 못했습니다. 코드를 다시 확인해 주세요.');
    const meta=snap.val();
    if(meta.phase==='ended')throw new Error('종료된 게임방입니다. 새 방을 만들어 주세요.');
    const ban=await this.ops.get(this.path('banned',this.uid)).catch(()=>null);
    if(ban&&ban.val())throw new Error('선생님이 이 방에서 내보냈어요. 선생님께 여쭤 보세요.');
    const mine=await this.ops.get(this.path('members',this.uid));
    if(meta.phase==='playing'&&!mine.exists())throw new Error('게임이 이미 진행 중입니다. 다음 게임을 기다려 주세요.');   // 이미 입장했던 학생은 끊겼다가 다시 들어올 수 있음
    if(mine.exists()){this.seat=mine.val().seat;this.team=Number(mine.val().team);}
    else{
      const trans=await this.ops.runTransaction(this.path('nextSeat'),num=>{
        num=num||0;return num>=meta.count?undefined:num+1;
      });
      if(!trans.committed)throw new Error('학급방 정원이 가득 찼습니다.');
      this.seat=trans.snapshot.val()-1;
      // 모둠 인원이 같으면 들어오는 순서대로 번갈아 배정 (몇 명만 와도 모둠마다 고르게), 아니면 앞 모둠부터 채움
      if(meta.sizes.every(s=>s===meta.sizes[0]))this.team=this.seat%meta.sizes.length;
      else{let acc=0;this.team=meta.sizes.findIndex(n=>{acc+=n;return this.seat<acc});}
      if(this.team<0)throw new Error('팀을 배정하지 못했습니다.');
      // 학생이 모둠을 옮겼거나 내보내진 자리가 있으면, 차례의 모둠이 꽉 찼을 수 있음 → 가장 빈 모둠으로
      try{const all=(await this.ops.get(this.path('members'))).val()||{},cnt=meta.sizes.map((_,i)=>Object.values(all).filter(m=>Number(m.team)===i).length);if(cnt[this.team]>=meta.sizes[this.team]){const free=cnt.map((c,i)=>[meta.sizes[i]-c,i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1])[0];if(free&&free[0]>0)this.team=free[1]}}catch{}
      await this.ops.set(this.path('members',this.uid),{name:name.slice(0,12),seat:this.seat,team:String(this.team),joinedAt:now()});
    }
    this.connected=true;this.subscribeBase();
    await this.ops.update(this.path('results',this.uid),{name:this.name,team:this.team,seat:this.seat});
    return this.code;
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
  teamCount(t){return Object.values(this.allMembers||{}).filter(m=>Number(m.team)===t).length}
  // 학생이 스스로 다른 모둠으로 (대기실에서만, 자리가 남은 모둠만)
  async moveSelf(t){
    if(this.role!=='student')return;
    if(this.meta?.phase!=='lobby')throw new Error('게임이 시작되기 전에만 모둠을 바꿀 수 있어요.');
    if(!(t>=0&&t<(this.meta.sizes||[]).length)||t===this.team)return;
    if(this.teamCount(t)>=this.meta.sizes[t])throw new Error(`${t+1}모둠은 자리가 다 찼어요.`);
    await this.ops.update(this.path('members',this.uid),{team:String(t)});
    await this.ops.update(this.path('results',this.uid),{team:t}).catch(()=>{});
  }
  // 교사: 학생을 다른 모둠으로 (대기실에서만)
  async moveMember(uid,t){
    if(this.role!=='teacher')return;
    if(this.meta?.phase==='playing')throw new Error('게임 중에는 모둠을 바꿀 수 없어요. 게임이 끝난 뒤 바꿔 주세요.');
    const m=this.allMembers?.[uid];if(!m||Number(m.team)===t)return;
    if(this.teamCount(t)>=this.meta.sizes[t])throw new Error(`${t+1}모둠은 자리가 다 찼어요. 먼저 그 모둠의 학생을 옮겨 주세요.`);
    await this.ops.update(this.path('members',uid),{team:String(t)});
    await this.ops.update(this.path('results',uid),{team:t}).catch(()=>{});
  }
  // 교사: 학생 내보내기 (다시 들어올 수 없음). 빈자리만큼 정원을 하나 늘려 다른 학생이 들어올 수 있게 함
  async kick(uid){
    if(this.role!=='teacher')return;
    const m=this.allMembers?.[uid];if(!m)return;
    await this.ops.set(this.path('banned',uid),true);
    await this.ops.remove(this.path('members',uid));
    await this.ops.remove(this.path('results',uid)).catch(()=>{});
    await this.ops.remove(this.path('teams',String(m.team),'players',uid)).catch(()=>{});
    if((this.meta?.count||0)<25)await this.ops.update(this.path('meta'),{count:this.meta.count+1}).catch(()=>{});
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
    for(const code of list.filter(c=>c!==this.code).slice(-10)){try{await this.ops.remove(this.ops.ref(this.db,'rooms/'+code))}catch{keep.push(code)}}
    try{localStorage.setItem('mathcook-myrooms',JSON.stringify([...keep.slice(-10),this.code]))}catch{}
  }
}
