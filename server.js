const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const PORT=process.env.PORT||3000;
const srv=http.createServer((q,s)=>fs.readFile(path.join(__dirname,'index.html'),(e,d)=>{s.writeHead(e?500:200,{'Content-Type':'text/html; charset=utf-8'});s.end(d)}));
const wss=new WebSocketServer({server:srv});
const T=['🪳 바퀴벌레','🦇 박쥐','🪰 파리','🐀 쥐','🦂 전갈','🕷️ 거미','🐸 두꺼비','🐛 노린재'];
const NM=['바퀴벌레','박쥐','파리','쥐','전갈','거미','두꺼비','노린재'];
const ctext=cl=>{const k=cl%8;return cl>=8?`이건 ${NM[k]}${k===4?'이':'가'} 아니야`:`이건 ${NM[k]}${k===4?'이야':'야'}`};
const isTrue=(card,cl)=>cl<8?card===cl:card!==cl-8;
const BOTS=[['민준',.65,.3],['서연',.35,.15],['지후',.5,.5],['하윤',.55,.4],['도윤',.4,.25],['예은',.6,.2]];
const rooms={},rnd=n=>Math.floor(Math.random()*n),pick=a=>a[rnd(a.length)];
const ctrl=p=>p.bot||!p.ws;
const mk=(name,bot,b=.5,t=.4)=>({name,bot,bluff:b,trust:t,hand:[],table:Array(8).fill(0),ws:null,token:Math.random().toString(36).slice(2)});
const others=(r,i,seen)=>r.players.map((_,k)=>k).filter(k=>k!==i&&!seen.includes(k));
const log=(r,t)=>{r.log.unshift(t);r.log.length=40};
const later=(r,ms,f)=>{clearTimeout(r.timer);const g=r.gen;r.timer=setTimeout(()=>{if(g===r.gen)f()},ms)};
const send=(ws,o)=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
function view(r,p){
  const me=r.players.indexOf(p),c=r.chain,cnt=Array(8).fill(0);p.hand.forEach(x=>cnt[x]++);
  let targets=[],peek=null;
  if(r.phase==='offer'&&r.cur===me)targets=others(r,me,[me]);
  if(r.phase==='pass'&&c.to===me){targets=others(r,me,c.seen);peek=c.card}
  return{type:'state',code:r.code,phase:r.phase,me,cur:r.cur,host:r.players.findIndex(x=>!x.bot),
    players:r.players.map(x=>({name:x.name,bot:x.bot,off:!x.bot&&!x.ws,n:x.hand.length,table:x.table})),
    hand:cnt,targets,peek,log:r.log,result:r.result,over:r.over&&{...r.over,lname:r.players[r.over.loser].name},
    chain:c&&{from:c.from,to:c.to,claim:c.claim,seen:c.seen,canPass:others(r,c.to,[...c.seen,c.to]).length>0,card:r.phase==='reveal'?c.card:null}};
}
const bc=r=>r.players.forEach(p=>send(p.ws,view(r,p)));
function begin(r){
  r.gen++;r.players=r.players.filter(p=>!p.left);const n=r.players.length,d=[];
  for(let i=0;i<64;i++)d.push(i%8);
  for(let i=63;i>0;i--){const j=rnd(i+1);[d[i],d[j]]=[d[j],d[i]]}
  const k=Math.floor(64/n);
  r.players.forEach((p,i)=>{p.hand=d.slice(i*k,i*k+k);p.table=Array(8).fill(0)});
  r.log=[];r.over=null;r.result=null;log(r,`게임 시작! (${n}명, ${k}장씩)`);turn(r,rnd(n));
}
function aiTarget(r,c){return c.map(k=>({k,w:Math.max(...r.players[k].table)*2+r.players[k].table.reduce((a,b)=>a+b,0)*.3+Math.random()*2})).sort((a,b)=>b.w-a.w)[0].k}
function aiClaim(p,r,card,t){
  const tb=r.players[t].table,pool=[0,1,2,3,4,5,6,7].filter(k=>k!==card),hot=pool.filter(k=>tb[k]>=2);
  if(Math.random()>p.bluff)return Math.random()<.7?card:pick(pool)+8;
  return Math.random()<.6?pick(hot.length&&Math.random()<.6?hot:pool):card+8;
}
function aiRespond(r,p,c){
  const me=r.players.indexOf(p),canPass=others(r,me,[...c.seen,me]).length>0;
  const ty=c.claim%8,neg=c.claim>=8;
  const known=r.players.reduce((a,q)=>a+q.table[ty],0)+p.hand.filter(x=>x===ty).length,rem=8-known;
  const pT=neg?(rem<=0?1:.4+.4*p.trust):(rem<=0?0:.15+.45*p.trust+.03*rem);
  if(canPass&&((neg?p.table.includes(3):p.table[ty]===3)||Math.random()<.28))return'pass';
  return Math.random()<pT?'true':'false';
}
function turn(r,i){
  const p=r.players[i];r.cur=i;r.chain=null;
  if(!p.hand.length)return end(r,i,`${p.name}님은 낼 카드가 없어요.`);
  r.phase='offer';bc(r);
  if(ctrl(p))later(r,1000,()=>{const card=pick(p.hand),t=aiTarget(r,others(r,i,[i]));offer(r,i,card,t,aiClaim(p,r,card,t))});
}
function drive(r){
  const ph=r.phase;
  if(ph==='offer'){const i=r.cur,q=r.players[i];if(ctrl(q))later(r,1000,()=>{const card=pick(q.hand),t=aiTarget(r,others(r,i,[i]));offer(r,i,card,t,aiClaim(q,r,card,t))})}
  else if(ph==='respond'){const i=r.chain.to,q=r.players[i];if(ctrl(q))later(r,1000,()=>respond(r,i,aiRespond(r,q,r.chain)))}
  else if(ph==='pass'){const i=r.chain.to,q=r.players[i];if(ctrl(q))later(r,1000,()=>{const tg=aiTarget(r,others(r,i,r.chain.seen));pass(r,i,tg,aiClaim(q,r,r.chain.card,tg))})}
}
function dropRoom(r){clearTimeout(r.timer);r.gen++;delete rooms[r.code]}
function offer(r,i,card,t,cl){
  const p=r.players[i];
  if(r.phase!=='offer'||r.cur!==i||!p.hand.includes(card)||!others(r,i,[i]).includes(t)||!(cl>=0&&cl<16))return;
  p.hand.splice(p.hand.indexOf(card),1);
  r.chain={from:i,to:t,card,claim:cl,seen:[i]};
  log(r,`${p.name} → ${r.players[t].name}: “${ctext(cl)}.”`);ask(r);
}
function ask(r){
  r.phase='respond';bc(r);const c=r.chain,t=r.players[c.to];
  if(ctrl(t))later(r,1400,()=>respond(r,c.to,aiRespond(r,t,c)));
}
function respond(r,i,a){
  const c=r.chain;if(r.phase!=='respond'||c.to!==i)return;
  const t=r.players[i];
  if(a==='pass'){
    if(!others(r,i,[...c.seen,i]).length)return;
    c.seen.push(i);r.phase='pass';log(r,`${t.name}님이 카드를 살짝 보고 넘기려 해요.`);bc(r);
    if(ctrl(t))later(r,1200,()=>{const tg=aiTarget(r,others(r,i,c.seen));pass(r,i,tg,aiClaim(t,r,c.card,tg))});
    return;
  }
  if(a!=='true'&&a!=='false')return;
  const ok=(a==='true')===isTrue(c.card,c.claim),loser=ok?c.from:c.to,lp=r.players[loser];
  lp.table[c.card]++;r.phase='reveal';
  r.result=`${t.name}: “${a==='true'?'맞아':'거짓말!'}” → 진짜는 ${T[c.card]}! ${ok?'정답':'오답'}, ${lp.name}님이 가져가요.`;
  log(r,r.result);bc(r);
  later(r,2800,()=>{r.result=null;lp.table[c.card]>=4?end(r,loser,`${lp.name}님이 ${T[c.card]} 4마리를 모았어요!`):turn(r,loser)});
}
function pass(r,i,tg,cl){
  const c=r.chain;if(r.phase!=='pass'||c.to!==i||!others(r,i,c.seen).includes(tg)||!(cl>=0&&cl<16))return;
  c.from=i;c.to=tg;c.claim=cl;
  log(r,`${r.players[i].name} → ${r.players[tg].name}: “${ctext(cl)}.”`);ask(r);
}
function end(r,loser,why){r.phase='over';r.over={loser,why};log(r,'게임 종료: '+why);bc(r)}
function code(){let c;do c=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[rnd(24)]).join('');while(rooms[c]);return c}
function attach(ws,r,p){
  ws.r=r;ws.p=p;p.ws=ws;send(ws,{type:'joined',code:r.code,token:p.token});bc(r);
}
wss.on('connection',ws=>{
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    const name=String(m.name||'손님').slice(0,10);
    if(m.t==='create'){
      const r={code:code(),players:[],phase:'lobby',gen:0,log:[],chain:null};rooms[r.code]=r;
      const p=mk(name,false);r.players.push(p);return attach(ws,r,p);
    }
    if(m.t==='join'){
      const r=rooms[String(m.code||'').toUpperCase()];
      if(!r)return send(ws,{type:'err',msg:'방을 찾을 수 없어요.'});
      if(r.phase!=='lobby')return send(ws,{type:'err',msg:'이미 시작된 게임이에요.'});
      if(r.players.length>=6)return send(ws,{type:'err',msg:'방이 가득 찼어요 (최대 6명).'});
      const p=mk(name,false);r.players.push(p);return attach(ws,r,p);
    }
    if(m.t==='rejoin'){
      const r=rooms[m.code],p=r&&r.players.find(x=>x.token===m.token);
      if(!p)return send(ws,{type:'err',msg:'다시 입장할 수 없어요.',reset:true});
      return attach(ws,r,p);
    }
    const r=ws.r,p=ws.p;if(!r)return;const me=r.players.indexOf(p),host=r.players.findIndex(x=>!x.bot)===me;
    if(m.t==='leave'){
      send(ws,{type:'left'});ws.r=null;ws.p=null;p.ws=null;
      if(r.phase==='lobby')r.players.splice(me,1);
      else{p.bot=true;p.left=true;p.name='🤖 '+p.name.replace(/^🤖 /,'');p.token=Math.random().toString(36).slice(2);log(r,`${p.name}님이 나가서 봇이 대신해요.`)}
      if(!r.players.some(x=>!x.bot))return dropRoom(r);
      bc(r);drive(r);return;
    }
    if(r.phase==='lobby'||r.phase==='over'){
      if(m.t==='addBot'&&r.phase==='lobby'&&host&&r.players.length<6){
        const b=BOTS.find(x=>!r.players.some(q=>q.name==='🤖 '+x[0]))||BOTS[0];
        r.players.push(mk('🤖 '+b[0],true,b[1],b[2]));bc(r);
      }
      if(m.t==='rmBot'&&r.phase==='lobby'&&host&&r.players[m.i]&&r.players[m.i].bot){r.players.splice(m.i,1);bc(r)}
      if(m.t==='start'&&host&&r.players.filter(x=>!x.left).length>=2)begin(r);
      return;
    }
    if(m.t==='offer')offer(r,me,m.card,m.target,m.claim);
    if(m.t==='respond')respond(r,me,m.a);
    if(m.t==='pass')pass(r,me,m.target,m.claim);
  });
  ws.on('close',()=>{
    const r=ws.r,p=ws.p;if(!r||p.ws!==ws)return;p.ws=null;
    if(r.phase==='lobby')setTimeout(()=>{if(!p.ws&&r.players.includes(p)){r.players.splice(r.players.indexOf(p),1);bc(r)}},20000);
    bc(r);
    if(!r.players.some(x=>x.ws))setTimeout(()=>{if(!r.players.some(x=>x.ws))dropRoom(r)},r.phase==='lobby'?25000:300000);
    else drive(r);
  });
});
srv.listen(PORT,()=>console.log('http://localhost:'+PORT));
