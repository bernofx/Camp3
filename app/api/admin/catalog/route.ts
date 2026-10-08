import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";
import { dependencyOrderError, type ScheduleGroup } from "../../../../lib/schedule-dependencies";

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const person = (value: unknown) => text(value).toLocaleLowerCase("it").replace(/\s+/g, " ");
const timeMinutes = (value:string) => {const [hour,minute]=value.split(":").map(Number);return hour*60+minute;};

type MatchRow = {gameId:string;category:string;groupCode:string;phase:string;date:string;time:string;court:string;homeRef:string;awayRef:string;scorekeeper:string;referee:string;courtManager:string;result:string;status:string};
type LinkRow = {targetGameId:string;categoryCode:string;homeKind:string;homeRef:string;awayKind:string;awayRef:string};

function startMinutes(match: Pick<MatchRow,"date"|"time">) {
  const [year,month,day]=match.date.split("-").map(Number), [hour,minute]=match.time.split(":").map(Number);
  return Date.UTC(year,month-1,day,hour,minute)/60000;
}
function allocated(match:Pick<MatchRow,"date"|"time"|"court">){return Boolean(match.date&&match.time&&match.court);}
function overlaps(a:MatchRow,b:MatchRow,duration:number) { if(!allocated(a)||!allocated(b))return false;const x=startMinutes(a),y=startMinutes(b);return x<y+duration&&y<x+duration; }
function sourceTokens(kind:string,ref:string,category:string,matches:Map<string,MatchRow>,links:Map<string,LinkRow>,seen:Set<string>):Set<string>{
  if(kind==="winner"||kind==="loser")return new Set([`outcome:${ref}:${kind}`]);
  const value=upper(ref);if(/^\d+$/.test(value))return new Set([`team:${value}`]);
  if(/^[A-Z][A-Z0-9_-]*\d+$/.test(value))return new Set([`rank:${category}:${value}`]);
  return new Set([`ref:${category}:${value}`]);
}
function matchTokens(gameId:string,matches:Map<string,MatchRow>,links:Map<string,LinkRow>,seen=new Set<string>()):Set<string>{
  if(seen.has(gameId))return new Set([`cycle:${gameId}`]);seen=new Set(seen);seen.add(gameId);
  const match=matches.get(gameId);if(!match)return new Set();const link=links.get(gameId);
  if(link)return new Set([...sourceTokens(link.homeKind,link.homeRef,match.category,matches,links,seen),...sourceTokens(link.awayKind,link.awayRef,match.category,matches,links,seen)]);
  return new Set([...sourceTokens("ref",match.homeRef,match.category,matches,links,seen),...sourceTokens("ref",match.awayRef,match.category,matches,links,seen)]);
}
async function scheduleData(){
  const [matchRows,linkRows]=await Promise.all([
    db().prepare(`SELECT game_id AS gameId,category_code AS category,group_code AS groupCode,phase,match_date AS date,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef,scorekeeper,referee,court_manager AS courtManager,result,status FROM matches`).all<MatchRow>(),
    db().prepare(`SELECT target_game_id AS targetGameId,category_code AS categoryCode,home_kind AS homeKind,home_ref AS homeRef,away_kind AS awayKind,away_ref AS awayRef FROM final_links`).all<LinkRow>(),
  ]);
  return {matches:new Map<string,MatchRow>((matchRows.results as MatchRow[]).map(item=>[item.gameId,item])),links:new Map<string,LinkRow>((linkRows.results as LinkRow[]).map(item=>[item.targetGameId,item]))};
}
function scheduleConflict(candidate:MatchRow,all:Map<string,MatchRow>,links:Map<string,LinkRow>,duration:number){
  const combined=new Map(all);combined.set(candidate.gameId,candidate);const tokens=matchTokens(candidate.gameId,combined,links);
  for(const other of all.values()){
    if(other.gameId===candidate.gameId||!overlaps(candidate,other,duration))continue;
    if(candidate.court===other.court)return `Il campo ${candidate.court} è già occupato dalla gara ${other.gameId} in questa fascia oraria.`;
    if([...tokens].some(token=>matchTokens(other.gameId,combined,links).has(token)))return `Una squadra potrebbe essere impegnata anche nella gara ${other.gameId} nella stessa fascia oraria.`;
    const people=[candidate.referee,candidate.courtManager].map(person).filter(Boolean),otherPeople=[other.referee,other.courtManager].map(person).filter(Boolean),busy=people.find(value=>otherPeople.includes(value));
    if(busy)return `${busy} risulta già assegnato alla gara ${other.gameId} nella stessa fascia oraria.`;
  }return "";
}
async function validateWholeSchedule(duration:number){
  const {matches,links}=await scheduleData(),values=[...matches.values()];
  for(let i=0;i<values.length;i++)for(let j=i+1;j<values.length;j++){
    const a=values[i],b=values[j];if(!overlaps(a,b,duration))continue;
    if(a.court===b.court)return `Con ${duration} minuti le gare ${a.gameId} e ${b.gameId} si sovrappongono sul campo ${a.court}.`;
    const first=matchTokens(a.gameId,matches,links),second=matchTokens(b.gameId,matches,links);if([...first].some(token=>second.has(token)))return `Con ${duration} minuti una squadra si sovrappone tra le gare ${a.gameId} e ${b.gameId}.`;
  }return "";
}

export async function POST(request:Request){
  await ensureDatabase();if(!(await requireUser(request,["admin"])))return json({error:"Non autorizzato"},403);
  const payload=await request.json() as {entity?:string;action?:string;data?:Record<string,unknown>},entity=text(payload.entity),action=text(payload.action),data=payload.data||{},state=text((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value)||"planning";
  if(state==="closed")return json({error:"Il torneo è concluso. Riaprilo prima di apportare modifiche."},409);
  if(state!=="planning"&&!['staff','allocation'].includes(entity))return json({error:"Riapri la pianificazione prima di modificare la struttura del torneo."},409);
  try{
    if(entity==="settings"&&action==="save"){
      const duration=Number(data.matchDurationMinutes);if(!Number.isInteger(duration)||duration<30||duration>180)return json({error:"La durata deve essere compresa tra 30 e 180 minuti."},400);
      const conflict=await validateWholeSchedule(duration);if(conflict)return json({error:conflict},409);
      const schedule=await scheduleData(),dependency=dependencyOrderError([...schedule.matches.values()],[...schedule.links.values()].map(link=>({...link,category:link.categoryCode})),(await db().prepare("SELECT category_code AS category,code,sort_order AS sortOrder FROM tournament_groups").all<ScheduleGroup>()).results,duration);if(dependency)return json({error:dependency},409);
      await db().prepare("INSERT INTO tournament_settings(key,value) VALUES('match_duration_minutes',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(duration)).run();
    }else if(entity==="court"&&action==="save"){
      const code=text(data.code);if(!/^[A-Za-z0-9_-]{1,12}$/.test(code))return json({error:"Codice campo non valido."},400);
      await db().prepare("INSERT INTO courts(code,name,sort_order,active) VALUES(?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order,active=1").bind(code,text(data.name)||`Campo ${code}`,Number(data.sortOrder)||0).run();
    }else if(entity==="day"&&action==="save"){
      let code=upper(data.code);if(!code){const rows=await db().prepare("SELECT code FROM tournament_days").all<{code:string}>();let index=1;const used=new Set(rows.results.map(item=>item.code));while(used.has(`G${index}`))index++;code=`G${index}`;}
      const italian=text(data.date),parts=italian.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!parts)return json({error:"Inserisci la data nel formato gg/MM/aaaa."},400);const day=Number(parts[1]),month=Number(parts[2]),year=Number(parts[3]),parsed=new Date(Date.UTC(year,month-1,day));if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return json({error:"La data inserita non esiste."},400);const date=`${parts[3]}-${parts[2]}-${parts[1]}`,startTime=text(data.startTime),endTime=text(data.endTime);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime))return json({error:"Ora iniziale non valida."},400);if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||timeMinutes(endTime)<=timeMinutes(startTime))return json({error:"La fine attività deve essere successiva al primo orario."},400);
      const current=await db().prepare("SELECT day_date AS date FROM tournament_days WHERE code=?").bind(code).first<{date:string}>();if(current&&current.date!==date&&await db().prepare("SELECT game_id FROM matches WHERE match_date=? LIMIT 1").bind(current.date).first())return json({error:"La giornata contiene già gare: spostale prima di cambiarne la data."},409);
      const duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70),outside=await db().prepare("SELECT game_id AS gameId,match_time AS time FROM matches WHERE match_date=? ORDER BY match_time").bind(date).all<{gameId:string;time:string}>(),invalid=outside.results.find(match=>timeMinutes(match.time)<timeMinutes(startTime)||timeMinutes(match.time)+duration>timeMinutes(endTime));if(invalid)return json({error:`La gara ${invalid.gameId} non rientra nel nuovo intervallo ${startTime}–${endTime}.`},409);
      await db().prepare("INSERT INTO tournament_days(code,name,day_date,start_time,end_time,sort_order) VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,day_date=excluded.day_date,start_time=excluded.start_time,end_time=excluded.end_time,sort_order=excluded.sort_order").bind(code,text(data.name)||code,date,startTime,endTime,Number(data.sortOrder)||0).run();
    }else if(entity==="staff"&&action==="save"){
      const id=Number(data.id)||0,name=text(data.name);if(!name)return json({error:"Nome dello staff obbligatorio."},400);
      const referee=data.canReferee?1:0,scorekeeper=data.canScorekeeper?1:0,manager=data.canCourtManager?1:0;if(!referee&&!scorekeeper&&!manager)return json({error:"Seleziona almeno un ruolo."},400);
      if(id)await db().prepare("UPDATE staff SET name=?,can_referee=?,can_scorekeeper=?,can_court_manager=?,active=1 WHERE id=?").bind(name,referee,scorekeeper,manager,id).run();
      else await db().prepare("INSERT INTO staff(name,can_referee,can_scorekeeper,can_court_manager,active) VALUES(?,?,?,?,1) ON CONFLICT(name) DO UPDATE SET can_referee=excluded.can_referee,can_scorekeeper=excluded.can_scorekeeper,can_court_manager=excluded.can_court_manager,active=1").bind(name,referee,scorekeeper,manager).run();
    }else if(entity==="category"&&action==="save"){
      const code=upper(data.code);if(!/^[A-Z0-9_-]{2,12}$/.test(code))return json({error:"Codice categoria non valido"},400);
      const admissionMethod=text(data.admissionMethod)||"top2_each",allowedMethods=["top2_each","top4_each","top8_each","winners_plus_best_second","winners_round_robin"];
      if(!allowedMethods.includes(admissionMethod))return json({error:"Seleziona una modalità di ammissione valida."},400);
      const placementMode=text(data.placementMode)||"top2",allowedPlacements=["top2","top4","top8"];
      if(!allowedPlacements.includes(placementMode))return json({error:"Seleziona quali posizioni determinare nella fase finale."},400);
      const entryRound=text(data.entryRound)||"semifinals",allowedRounds=["final","semifinals","quarterfinals","round_of_16"];
      if(!allowedRounds.includes(entryRound))return json({error:"Seleziona il turno iniziale della fase finale."},400);
      await db().prepare("INSERT INTO categories(code,name,color,sort_order,active) VALUES(?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,color=excluded.color,sort_order=excluded.sort_order,active=1").bind(code,text(data.name)||code,text(data.color)||"#dff4ea",Number(data.sortOrder)||0).run();
      const homeAndAway=data.homeAndAway?1:0;
      const currentSetting=await db().prepare("SELECT COALESCE(home_and_away,0) AS homeAndAway FROM category_settings WHERE category_code=?").bind(code).first<{homeAndAway:number}>(),groupMatches=await db().prepare("SELECT COUNT(*) AS count FROM matches WHERE category_code=? AND phase='girone'").bind(code).first<{count:number}>();
      if(Number(groupMatches?.count||0)&&Number(currentSetting?.homeAndAway||0)!==homeAndAway)return json({error:"Per cambiare andata/ritorno devi prima svuotare tutte le gare della categoria."},409);
      await db().prepare("INSERT INTO category_settings(category_code,admission_method,placement_mode,entry_round,home_and_away) VALUES(?,?,?,?,?) ON CONFLICT(category_code) DO UPDATE SET admission_method=excluded.admission_method,placement_mode=excluded.placement_mode,entry_round=excluded.entry_round,home_and_away=excluded.home_and_away").bind(code,admissionMethod,placementMode,entryRound,homeAndAway).run();
    }else if(entity==="group"&&action==="save"){
      const category=upper(data.categoryCode);let code=upper(data.code);if(!code){const rows=await db().prepare("SELECT code FROM tournament_groups WHERE category_code=? ORDER BY sort_order,code").bind(category).all<{code:string}>();const used=new Set(rows.results.map(item=>item.code));code="ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find(item=>!used.has(item))||"";}if(!code)return json({error:"Numero massimo di gironi raggiunto."},400);await db().prepare("INSERT INTO tournament_groups(category_code,code,name,sort_order) VALUES(?,?,?,?) ON CONFLICT(category_code,code) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order").bind(category,code,text(data.name)||`Girone ${code}`,Number(data.sortOrder)||0).run();
    }else if(entity==="team"&&action==="save"){
      let code=text(data.code);if(!code){const rows=await db().prepare("SELECT code FROM teams").all<{code:string}>();const next=Math.max(100,...rows.results.map(item=>/^\d+$/.test(item.code)?Number(item.code):0))+1;code=String(next).padStart(3,"0");}
      const category=upper(data.categoryCode),existing=await db().prepare("SELECT category_code AS categoryCode,group_code AS groupCode FROM teams WHERE code=?").bind(code).first<{categoryCode:string;groupCode:string}>(),group=existing?.categoryCode===category?existing.groupCode:"";
      await db().prepare("INSERT INTO teams(code,name,category_code,group_code,active) VALUES(?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,category_code=excluded.category_code,group_code=excluded.group_code,active=1").bind(code,text(data.name),category,group).run();
    }else if(entity==="teamGroup"&&action==="save"){
      const code=text(data.code),category=upper(data.categoryCode),group=upper(data.groupCode),team=await db().prepare("SELECT code,group_code AS groupCode FROM teams WHERE code=? AND category_code=? AND active=1").bind(code,category).first<{code:string;groupCode:string}>();if(!team)return json({error:"Squadra non valida per questa categoria."},400);
      const matches=await db().prepare("SELECT game_id FROM matches LIMIT 1").first<any>();if(matches&&team.groupCode!==group&&team.groupCode)return json({error:"Per spostare una squadra già assegnata devi prima svuotare completamente le gare."},409);if(matches&&!group)return json({error:"Per togliere una squadra dal girone devi prima svuotare completamente le gare."},409);
      if(group&&!(await db().prepare("SELECT id FROM tournament_groups WHERE category_code=? AND code=?").bind(category,group).first()))return json({error:"Girone non valido per questa categoria."},400);
      await db().prepare("UPDATE teams SET group_code=? WHERE code=?").bind(group,code).run();
    }else if(entity==="allocation"&&action==="save"){
      const gameId=text(data.gameId),existing=await db().prepare("SELECT game_id AS gameId,category_code AS category,group_code AS groupCode,phase,home_ref AS homeRef,away_ref AS awayRef,result,status FROM matches WHERE game_id=?").bind(gameId).first<any>();if(!existing)return json({error:"Seleziona una gara esistente."},400);if(state==="live"&&(existing.status==="live"||existing.status==="completed"))return json({error:"Una gara iniziata o conclusa non può essere riallocata."},409);
      const italian=text(data.date),parts=italian.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!parts)return json({error:"Inserisci la data nel formato gg/MM/aaaa."},400);const day=Number(parts[1]),month=Number(parts[2]),year=Number(parts[3]),parsed=new Date(Date.UTC(year,month-1,day));if(parsed.getUTCFullYear()!==year||parsed.getUTCMonth()!==month-1||parsed.getUTCDate()!==day)return json({error:"La data inserita non esiste."},400);const date=`${parts[3]}-${parts[2]}-${parts[1]}`;
      const court=text(data.court),time=text(data.time),timeParts=time.match(/^(\d{2}):(\d{2})$/);if(!timeParts||Number(timeParts[1])>23||Number(timeParts[2])>59)return json({error:"Ora non valida."},400);if(!(await db().prepare("SELECT code FROM courts WHERE code=? AND active=1").bind(court).first()))return json({error:"Seleziona un campo disponibile."},400);const duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70),configuredDay=await db().prepare("SELECT name,start_time AS startTime,end_time AS endTime FROM tournament_days WHERE day_date=?").bind(date).first<{name:string;startTime:string;endTime:string}>();if(!configuredDay)return json({error:"La data scelta non corrisponde a una giornata configurata."},409);if(timeMinutes(time)<timeMinutes(configuredDay.startTime)||timeMinutes(time)+duration>timeMinutes(configuredDay.endTime))return json({error:`La gara deve iniziare e terminare tra ${configuredDay.startTime} e ${configuredDay.endTime}.`},409);
      const candidate:MatchRow={...existing,date,time,court,scorekeeper:text(data.scorekeeper),referee:text(data.referee),courtManager:text(data.courtManager)};
      for(const [name,column,label] of [[candidate.scorekeeper,"can_scorekeeper","refertista"],[candidate.referee,"can_referee","arbitro"],[candidate.courtManager,"can_court_manager","responsabile di campo"]])if(name){const allowed=await db().prepare(`SELECT id FROM staff WHERE name=? AND ${column}=1 AND active=1`).bind(name).first();if(!allowed)return json({error:`${name} non è configurato come ${label}.`},400);}
      const schedule=await scheduleData(),conflict=scheduleConflict(candidate,schedule.matches,schedule.links,duration);if(conflict)return json({error:conflict},409);const combined=new Map(schedule.matches);combined.set(candidate.gameId,candidate);const dependency=dependencyOrderError([...combined.values()],[...schedule.links.values()].map(link=>({...link,category:link.categoryCode})),(await db().prepare("SELECT category_code AS category,code,sort_order AS sortOrder FROM tournament_groups").all<ScheduleGroup>()).results,duration);if(dependency)return json({error:dependency},409);
      await db().prepare("UPDATE matches SET match_date=?,match_time=?,court=?,scorekeeper=?,referee=?,court_manager=?,status=CASE WHEN result<>'' THEN 'completed' ELSE 'scheduled' END WHERE game_id=?").bind(date,time,court,candidate.scorekeeper,candidate.referee,candidate.courtManager,gameId).run();
    }else if(entity==="match"&&action==="save"){
      const gameId=text(data.gameId);if(!/^\d{4}$/.test(gameId))return json({error:"Numero gara: quattro cifre"},400);
      const court=text(data.court),category=upper(data.categoryCode),homeRef=text(data.homeRef),awayRef=text(data.awayRef);if(!homeRef||!awayRef||upper(homeRef)===upper(awayRef))return json({error:"Le due partecipanti devono essere diverse."},400);
      if(!(await db().prepare("SELECT code FROM courts WHERE code=? AND active=1").bind(court).first()))return json({error:"Seleziona un campo disponibile nella configurazione."},400);
      if(!(await db().prepare("SELECT code FROM categories WHERE code=? AND active=1").bind(category).first()))return json({error:"Categoria non valida."},400);
      const candidate:MatchRow={gameId,category,groupCode:upper(data.groupCode),phase:text(data.phase)||"girone",date:text(data.date),time:text(data.time),court,homeRef,awayRef,scorekeeper:text(data.scorekeeper),referee:text(data.referee),courtManager:text(data.courtManager),result:"",status:"scheduled"};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)||!/^\d{2}:\d{2}$/.test(candidate.time))return json({error:"Data o ora non valida."},400);
      const duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70),configuredDay=await db().prepare("SELECT name,start_time AS startTime,end_time AS endTime FROM tournament_days WHERE day_date=?").bind(candidate.date).first<{name:string;startTime:string;endTime:string}>();if(!configuredDay)return json({error:"La data scelta non corrisponde a una giornata configurata."},409);if(timeMinutes(candidate.time)<timeMinutes(configuredDay.startTime)||timeMinutes(candidate.time)+duration>timeMinutes(configuredDay.endTime))return json({error:`La gara deve iniziare e terminare tra ${configuredDay.startTime} e ${configuredDay.endTime}.`},409);
      for(const [name,column,label] of [[candidate.scorekeeper,"can_scorekeeper","refertista"],[candidate.referee,"can_referee","arbitro"],[candidate.courtManager,"can_court_manager","responsabile di campo"]])if(name){const allowed=await db().prepare(`SELECT id FROM staff WHERE name=? AND ${column}=1 AND active=1`).bind(name).first();if(!allowed)return json({error:`${name} non è configurato come ${label}.`},400);}
      const schedule=await scheduleData(),conflict=scheduleConflict(candidate,schedule.matches,schedule.links,duration);if(conflict)return json({error:conflict},409);const combined=new Map(schedule.matches);combined.set(candidate.gameId,candidate);const dependency=dependencyOrderError([...combined.values()],[...schedule.links.values()].map(link=>({...link,category:link.categoryCode})),(await db().prepare("SELECT category_code AS category,code,sort_order AS sortOrder FROM tournament_groups").all<ScheduleGroup>()).results,duration);if(dependency)return json({error:dependency},409);
      await db().prepare(`INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,scorekeeper,referee,court_manager,result,set_1,set_2,set_3,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET category_code=excluded.category_code,group_code=excluded.group_code,phase=excluded.phase,match_date=excluded.match_date,match_time=excluded.match_time,court=excluded.court,home_ref=excluded.home_ref,away_ref=excluded.away_ref,scorekeeper=excluded.scorekeeper,referee=excluded.referee,court_manager=excluded.court_manager`).bind(gameId,category,upper(data.groupCode),text(data.phase)||"girone",candidate.date,candidate.time,court,homeRef,awayRef,candidate.scorekeeper,candidate.referee,candidate.courtManager,"","","","","scheduled").run();
    }else if(entity==="finalLink"&&action==="save"){
      const targetGameId=text(data.targetGameId),categoryCode=upper(data.categoryCode),homeKind=text(data.homeKind),awayKind=text(data.awayKind),homeRef=text(data.homeRef),awayRef=text(data.awayRef),allowed=["winner","loser","team","rank","literal"];
      if(!/^\d{4}$/.test(targetGameId)||!allowed.includes(homeKind)||!allowed.includes(awayKind)||!homeRef||!awayRef)return json({error:"Accoppiamento non valido."},400);
      const target=await db().prepare("SELECT game_id AS gameId,category_code AS category,match_date AS date,match_time AS time FROM matches WHERE game_id=?").bind(targetGameId).first<any>();if(!target)return json({error:"La gara di destinazione non esiste."},400);
      if(categoryCode!==target.category)return json({error:"La categoria deve coincidere con quella della gara di destinazione."},400);
      for(const [kind,ref] of [[homeKind,homeRef],[awayKind,awayRef]])if(kind==="winner"||kind==="loser"){
        if(ref===targetGameId)return json({error:"Una gara non può dipendere da se stessa."},400);const source=await db().prepare("SELECT game_id AS gameId,category_code AS category,match_date AS date,match_time AS time FROM matches WHERE game_id=?").bind(ref).first<any>();
        if(!source||source.category!==target.category)return json({error:`La gara sorgente ${ref} non esiste nella stessa categoria.`},400);if(startMinutes(source)>=startMinutes(target))return json({error:`La gara sorgente ${ref} deve precedere la gara ${targetGameId}.`},400);
      }
      const schedule=await scheduleData();schedule.links.set(targetGameId,{targetGameId,categoryCode:target.category,homeKind,homeRef,awayKind,awayRef});
      const targetMatch=schedule.matches.get(targetGameId),duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70);
      if(targetMatch){const others=new Map(schedule.matches);others.delete(targetGameId);const conflict=scheduleConflict(targetMatch,others,schedule.links,duration);if(conflict)return json({error:conflict},409);const dependency=dependencyOrderError([...schedule.matches.values()],[...schedule.links.values()].map(link=>({...link,category:link.categoryCode})),(await db().prepare("SELECT category_code AS category,code,sort_order AS sortOrder FROM tournament_groups").all<ScheduleGroup>()).results,duration);if(dependency)return json({error:dependency},409);}
      await db().prepare(`INSERT INTO final_links(target_game_id,category_code,section_title,section_order,target_order,home_kind,home_ref,away_kind,away_ref) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(target_game_id) DO UPDATE SET category_code=excluded.category_code,section_title=excluded.section_title,section_order=excluded.section_order,target_order=excluded.target_order,home_kind=excluded.home_kind,home_ref=excluded.home_ref,away_kind=excluded.away_kind,away_ref=excluded.away_ref`).bind(targetGameId,target.category,text(data.sectionTitle)||"Fase finale",Number(data.sectionOrder)||0,Number(data.targetOrder)||0,homeKind,homeRef,awayKind,awayRef).run();
    }else if(action==="delete"){
      if(entity==="match"){const used=await db().prepare("SELECT target_game_id FROM final_links WHERE home_ref=? OR away_ref=? LIMIT 1").bind(text(data.gameId),text(data.gameId)).first<any>();if(used)return json({error:`La gara alimenta la gara ${used.target_game_id}: elimina prima l’accoppiamento.`},409);await db().prepare("DELETE FROM final_links WHERE target_game_id=?").bind(text(data.gameId)).run();await db().prepare("DELETE FROM matches WHERE game_id=?").bind(text(data.gameId)).run();}
      else if(entity==="finalLink")await db().prepare("DELETE FROM final_links WHERE target_game_id=?").bind(text(data.targetGameId)).run();
      else if(entity==="court"){const used=await db().prepare("SELECT game_id FROM matches WHERE court=? LIMIT 1").bind(text(data.code)).first<any>();if(used)return json({error:`Il campo è usato dalla gara ${used.game_id}.`},409);await db().prepare("UPDATE courts SET active=0 WHERE code=?").bind(text(data.code)).run();}
      else if(entity==="staff"){const member=await db().prepare("SELECT name FROM staff WHERE id=?").bind(Number(data.id)).first<{name:string}>(),used=member&&await db().prepare("SELECT game_id FROM matches WHERE scorekeeper=? OR referee=? OR court_manager=? LIMIT 1").bind(member.name,member.name,member.name).first<any>();if(used)return json({error:`La persona è assegnata alla gara ${used.game_id}.`},409);await db().prepare("UPDATE staff SET active=0 WHERE id=?").bind(Number(data.id)).run();}
      else if(entity==="team")await db().prepare("UPDATE teams SET active=0 WHERE code=?").bind(text(data.code)).run();
      else if(entity==="category")await db().prepare("UPDATE categories SET active=0 WHERE code=?").bind(text(data.code)).run();
      else if(entity==="group"){const match=await db().prepare("SELECT game_id FROM matches WHERE category_code=? AND group_code=? LIMIT 1").bind(text(data.categoryCode),text(data.code)).first<any>();if(match)return json({error:`Il girone è usato dalla gara ${match.game_id}.`},409);await db().batch([db().prepare("UPDATE teams SET group_code='' WHERE category_code=? AND group_code=?").bind(text(data.categoryCode),text(data.code)),db().prepare("DELETE FROM tournament_groups WHERE category_code=? AND code=?").bind(text(data.categoryCode),text(data.code))]);}
      else if(entity==="day"){const row=await db().prepare("SELECT day_date AS date FROM tournament_days WHERE code=?").bind(text(data.code)).first<{date:string}>(),used=row&&await db().prepare("SELECT game_id FROM matches WHERE match_date=? LIMIT 1").bind(row.date).first<any>();if(used)return json({error:`La giornata contiene la gara ${used.game_id}.`},409);await db().prepare("DELETE FROM tournament_days WHERE code=?").bind(text(data.code)).run();}
      else return json({error:"Operazione non valida"},400);
    }else return json({error:"Operazione non valida"},400);
    if(state==="planning"&&["settings","court","day","category","group","team","teamGroup","allocation","match","finalLink"].includes(entity))await db().prepare("INSERT INTO tournament_settings(key,value) VALUES('plan_confirmed','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
    return json({ok:true});
  }catch(error){return json({error:error instanceof Error?error.message:"Operazione non riuscita"},400);}
}
