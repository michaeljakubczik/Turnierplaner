export type TournamentTeam = {id:string;name:string;seed?:number};
export type Entrant = {kind:'team';id:string}|{kind:'group';group:string;rank:number}|{kind:'winner'|'loser';match:string};
export type TournamentMatch = {id:string;teamAId:string;teamBId:string;scoreA?:number;scoreB?:number;winnerId?:string;isDraw?:boolean;group?:string;stage:'GROUP'|'SEMI'|'FINAL'|'THIRD_PLACE'|'QUARTER'|'KO';time?:string;field?:number;day?:number;placeholderA?:string;placeholderB?:string;sourceA?:Entrant;sourceB?:Entrant;round?:number;decidingWinnerId?:string};
export type TournamentGroup = {name:string;teamIds:string[]};
export type StandingsEntry = {teamId:string;games:number;wins:number;draws:number;losses:number;goalsFor:number;goalsAgainst:number;goalDiff:number;points:number};
export type TournamentConfig = {teams:TournamentTeam[];format:'ROUND_ROBIN'|'GROUPS_FINAL'|'GROUPS_SEMI_FINAL'|'FULL_KO'|'AUTO';hasThirdPlace:boolean;durationMode:'FIXED'|'AUTO';numDays:number;startTime:string;endTime:string;matchDuration:number;breakDuration:number;numFields:number;hasAwardCeremony:boolean;awardCeremonyDuration:number};
export function standingsFor(teams:TournamentTeam[],matches:TournamentMatch[]):StandingsEntry[] {
  const stats=Object.fromEntries(teams.map(t=>[t.id,{teamId:t.id,games:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,goalDiff:0,points:0}]));
  for(const m of matches.filter(m=>m.stage==='GROUP'&&m.scoreA!==undefined&&m.scoreB!==undefined)) {
    const a=stats[m.teamAId],b=stats[m.teamBId];if(!a||!b)continue;
    a.games++;b.games++;a.goalsFor+=m.scoreA!;a.goalsAgainst+=m.scoreB!;b.goalsFor+=m.scoreB!;b.goalsAgainst+=m.scoreA!;a.goalDiff=a.goalsFor-a.goalsAgainst;b.goalDiff=b.goalsFor-b.goalsAgainst;
    if(m.scoreA!>m.scoreB!){a.wins++;a.points+=3;b.losses++;}else if(m.scoreB!>m.scoreA!){b.wins++;b.points+=3;a.losses++;}else{a.draws++;b.draws++;a.points++;b.points++;}
  }
  return Object.values(stats).sort((a,b)=>b.points-a.points||b.goalDiff-a.goalDiff||b.goalsFor-a.goalsFor);
}
function groupOrder(group:TournamentGroup,teams:TournamentTeam[],matches:TournamentMatch[]) {
  const relevant=matches.filter(m=>m.stage==='GROUP'&&m.group===group.name);
  if(relevant.some(m=>m.scoreA===undefined||m.scoreB===undefined))return null;
  return standingsFor(teams.filter(t=>group.teamIds.includes(t.id)),relevant);
}
export function resolveBracket(original:TournamentMatch[],teams:TournamentTeam[],groups:TournamentGroup[], qualifiers:Record<string,string[]> = {}):TournamentMatch[] {
  const next=original.map(m=>({...m}));
  const resolve=(source:Entrant|undefined,fallback:string):string=>{
    if(!source)return fallback;if(source.kind==='team')return source.id;
    if(source.kind==='group'){
      const group=groups.find(g=>g.name===source.group);if(!group)return '';
      const order=groupOrder(group,teams,next);if(!order)return '';
      const chosen = qualifiers[group.name];
      if (chosen && chosen.every(id=>!id||group.teamIds.includes(id)) && new Set(chosen.filter(Boolean)).size===chosen.filter(Boolean).length && chosen[source.rank-1]) return chosen[source.rank-1];
      const candidate=order[source.rank-1];if(!candidate)return '';
      // Do not silently choose a qualifier when the configured tie-breaks remain tied.
      if(order.some((s,i)=>i!==source.rank-1&&s.points===candidate.points&&s.goalDiff===candidate.goalDiff&&s.goalsFor===candidate.goalsFor))return '';
      return candidate.teamId;
    }
    const game=next.find(m=>m.id===source.match);if(!game?.winnerId)return '';
    return source.kind==='winner'?game.winnerId:game.winnerId===game.teamAId?game.teamBId:game.teamAId;
  };
  // Generation is topological. Repeat to also support schedules stored in chronological order.
  for(let pass=0;pass<=next.length;pass++) {
    let changed=false;
    for(const m of next){
      const a=resolve(m.sourceA,m.teamAId),b=resolve(m.sourceB,m.teamBId);
      if(a!==m.teamAId||b!==m.teamBId){m.teamAId=a;m.teamBId=b;delete m.scoreA;delete m.scoreB;delete m.decidingWinnerId;changed=true;}
      m.winnerId=undefined;m.isDraw=false;
      if(a&&b&&m.scoreA!==undefined&&m.scoreB!==undefined){if(m.scoreA>m.scoreB)m.winnerId=a;else if(m.scoreB>m.scoreA)m.winnerId=b;else if(m.stage!=='GROUP'&&[a,b].includes(m.decidingWinnerId||''))m.winnerId=m.decidingWinnerId;else m.isDraw=true;}
    }
    if(!changed)break;
  }
  return next;
}
export function makeTournament(config:TournamentConfig):{groups:TournamentGroup[];matches:TournamentMatch[]} {
  const {teams}=config;
  if(teams.length<2||teams.some(t=>!t.name.trim())||new Set(teams.map(t=>t.id)).size!==teams.length)throw new Error('Mindestens zwei Teams mit eindeutigen IDs und ausgefüllten Namen benötigt.');
  let format=config.format;if(format==='AUTO')format=teams.length<=5?'ROUND_ROBIN':teams.length<=10?'GROUPS_FINAL':'GROUPS_SEMI_FINAL';
  const groups:TournamentGroup[]=[],matches:TournamentMatch[]=[];
  const entrantLabel=(e:Entrant)=>e.kind==='team'?teams.find(t=>t.id===e.id)?.name||e.id:e.kind==='group'?`${e.rank}. ${e.group}`:`${e.kind==='winner'?'Sieger':'Verlierer'} ${e.match}`;
  const add=(id:string,a:Entrant,b:Entrant,stage:TournamentMatch['stage'],round:number)=>{
    matches.push({id,teamAId:a.kind==='team'?a.id:'',teamBId:b.kind==='team'?b.id:'',sourceA:a,sourceB:b,placeholderA:entrantLabel(a),placeholderB:entrantLabel(b),stage,round});return {kind:'winner',match:id} as Entrant;
  };
  const buildKnockout=(entrants:Entrant[],startRound:number)=>{
    const power=2**Math.ceil(Math.log2(entrants.length));const byes=power-entrants.length;
    let current:Entrant[]=entrants.slice(0,byes);let round=startRound;
    for(let i=byes;i<entrants.length;i+=2)current.push(add(`KO-${round}-${i}`,entrants[i],entrants[i+1],power===2?'FINAL':power===4?'SEMI':power===8?'QUARTER':'KO',round));
    while(current.length>1){round++;const previous=current;current=[];
      if(previous.length===2&&config.hasThirdPlace&&previous.every(e=>e.kind==='winner'))add('Platz-3',{kind:'loser',match:(previous[0] as {match:string}).match},{kind:'loser',match:(previous[1] as {match:string}).match},'THIRD_PLACE',round);
      for(let i=0;i<previous.length;i+=2)current.push(add(`KO-${round}-${i}`,previous[i],previous[i+1],previous.length===2?'FINAL':previous.length===4?'SEMI':previous.length===8?'QUARTER':'KO',round));
    }
  };
  if(format==='FULL_KO'){buildKnockout(teams.map(t=>({kind:'team',id:t.id})),1);return {groups,matches};}
  const count=format==='ROUND_ROBIN'?1:2;
  if(format==='GROUPS_SEMI_FINAL'&&teams.length<4)throw new Error('Gruppen mit Halbfinale benötigen mindestens vier Teams.');
  for(let i=0;i<count;i++)groups.push({name:`Gruppe ${String.fromCharCode(65+i)}`,teamIds:[]});
  teams.forEach((t,i)=>groups[i%count].teamIds.push(t.id));
  for(const g of groups)for(let i=0;i<g.teamIds.length;i++)for(let j=i+1;j<g.teamIds.length;j++)matches.push({id:`G-${g.name}-${i}-${j}`,teamAId:g.teamIds[i],teamBId:g.teamIds[j],stage:'GROUP',group:g.name,round:0});
  if(format==='GROUPS_FINAL')add('Finale',{kind:'group',group:groups[0].name,rank:1},{kind:'group',group:groups[1].name,rank:1},'FINAL',1);
  if(format==='GROUPS_SEMI_FINAL')buildKnockout([{kind:'group',group:groups[0].name,rank:1},{kind:'group',group:groups[1].name,rank:2},{kind:'group',group:groups[1].name,rank:1},{kind:'group',group:groups[0].name,rank:2}],1);
  return {groups,matches};
}
const timeMinutes=(s:string)=>{if(!/^\d\d:\d\d$/.test(s))return NaN;const [h,m]=s.split(':').map(Number);return h<24&&m<60?h*60+m:NaN;};
export function scheduleTournament(matches:TournamentMatch[],config:TournamentConfig,limitMs=4000):TournamentMatch[] {
  const start=timeMinutes(config.startTime),end=timeMinutes(config.endTime);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isInteger(config.matchDuration)||config.matchDuration<1||!Number.isInteger(config.breakDuration)||config.breakDuration<0||!Number.isInteger(config.numFields)||config.numFields<1||config.numFields>4||!Number.isInteger(config.numDays)||config.numDays<1||config.numDays>31||!Number.isInteger(config.awardCeremonyDuration)||config.awardCeremonyDuration<0)throw new Error('Bitte gültige Zeiten, Spieldauer (mindestens 1 Minute), Pausen, Tage und Felder einstellen.');
  const slotSize=config.matchDuration+config.breakDuration,ceremony=config.hasAwardCeremony?config.awardCeremonyDuration:0;
  const dailyEnd=config.durationMode==='FIXED'?end:1440;
  const slotsByDay=Array.from({length:config.numDays},(_,day)=>Math.max(0,Math.floor((dailyEnd-start-(day===config.numDays-1?ceremony:0)+config.breakDuration)/slotSize)));
  if(slotsByDay.some(n=>n===0))throw new Error('Der Zeitraum reicht nicht für ein Spiel und die eingestellte Siegerehrung.');
  const slots=slotsByDay.flatMap((n,day)=>Array.from({length:n},(_,i)=>({day:day+1,time:start+i*slotSize})));
  if(matches.length>slots.length*config.numFields)throw new Error('Zu wenig Zeit für alle Spiele einschließlich Siegerehrung. Zeitraum, Tage oder Felder erhöhen.');
  const byId=new Map(matches.map(m=>[m.id,m]));
  const participants=(m:TournamentMatch,visited=new Set<string>()):Set<string>=>{
    if(visited.has(m.id))return new Set();const next=new Set(visited).add(m.id);const result=new Set<string>();
    for(const [source,fallback] of [[m.sourceA,m.teamAId],[m.sourceB,m.teamBId]] as const){
      if(!source){if(fallback)result.add(fallback);}else if(source.kind==='team')result.add(source.id);else if(source.kind==='group')config.teams.forEach(t=>result.add(t.id));else{const parent=byId.get(source.match);if(parent)participants(parent,next).forEach(t=>result.add(t));}
    }return result;
  };
  const possible=new Map(matches.map(m=>[m.id,participants(m)]));
  const dependencies=(m:TournamentMatch)=>[m.sourceA,m.sourceB].flatMap(source=>!source?[]:source.kind==='winner'||source.kind==='loser'?[source.match]:source.kind==='group'?matches.filter(g=>g.stage==='GROUP').map(g=>g.id):[]);
  const started=performance.now();let limited=false,iterations=0;
  let result:TournamentMatch[]|null=null;
  const search=(remaining:TournamentMatch[],assigned:TournamentMatch[],slot:number,last:Record<string,{slot:number;streak:number}>)=>{
    if(++iterations%200===0&&performance.now()-started>limitMs){limited=true;return false;}
    if(!remaining.length){const last=assigned.at(-1);if(last&&timeMinutes(last.time!)+config.matchDuration+ceremony>dailyEnd)return false;result=assigned;return true;}if(slot>=slots.length||remaining.length>(slots.length-slot)*config.numFields)return false;
    const done=new Map(assigned.map(m=>[m.id,m]));
    const available=remaining.filter(m=>dependencies(m).every(id=>{const p=done.get(id);return !!p&&(p.day!<slots[slot].day||p.day===slots[slot].day&&timeMinutes(p.time!)+config.matchDuration+config.breakDuration<=slots[slot].time);})&&[...possible.get(m.id)!].every(id=>{const l=last[id];return !l||slots[l.slot].day!==slots[slot].day||l.slot!==slot-1||l.streak<2;}));
    const combinations:TournamentMatch[][]=[];
    const choose=(index:number,picked:TournamentMatch[],used:Set<string>)=>{
      if (performance.now()-started>limitMs) {limited=true;return;}
      if(picked.length)combinations.push(picked);
      if(picked.length===config.numFields)return;
      for(let i=index;i<available.length;i++){const m=available[i],ids=possible.get(m.id)!;if(picked.some(p=>!(p.stage!=='GROUP'&&m.stage!=='GROUP'&&p.round===m.round)&&[...ids].some(id=>possible.get(p.id)!.has(id))))continue;choose(i+1,[...picked,m],new Set([...used,...ids]));}
    };
    choose(0,[],new Set());combinations.sort((a,b)=>b.length-a.length||Math.min(...a.map(m=>m.round??0))-Math.min(...b.map(m=>m.round??0)));
    // Bounded search includes alternative assignments and idle slots, avoiding false greedy failures.
    for(const batch of [...combinations,[]]){
      if(limited)return false;
      const ids=new Set(batch.map(m=>m.id));const nextLast={...last};
      batch.forEach(m=>possible.get(m.id)!.forEach(id=>{const old=last[id];nextLast[id]={slot,streak:old&&old.slot===slot-1&&slots[old.slot].day===slots[slot].day?old.streak+1:1};}));
      const scheduled=batch.map((m,i)=>({...m,day:slots[slot].day,time:`${String(Math.floor(slots[slot].time/60)).padStart(2,'0')}:${String(slots[slot].time%60).padStart(2,'0')}`,field:i+1}));
      if(search(remaining.filter(m=>!ids.has(m.id)),[...assigned,...scheduled],slot+1,nextLast))return true;
    }return false;
  };
  search(matches,[],0,{});
  if(!result)throw new Error(limited?'Suchlimit erreicht: Noch kein Zeitplan gefunden. Das beweist keine Unmöglichkeit. Zeitraum erweitern oder erneut suchen.':'Kein Zeitplan unter diesen Bedingungen. Zeiten, Felder, Pausen und Siegerehrung prüfen.');
  return result;
}
