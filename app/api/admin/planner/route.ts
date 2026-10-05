import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const text=(value:unknown)=>String(value??"").trim();
type Match={gameId:string;category:string;date:string;time:string;court:string;homeRef:string;awayRef:string;referee:string;courtManager:string;result:string};
type Link={targetGameId:string;category:string;homeKind:string;homeRef:string;awayKind:string;awayRef:string};
const minutes=(value:string)=>{const [h,m]=value.split(":").map(Number);return h*60+m;};
const clock=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
function sourceTokens(kind:string,ref:string,category:string,matches:Map<string,Match>,links:Map<string,Link>,seen:Set<string>):Set<string>{
  if(kind==="winner"||kind==="loser")return matchTokens(ref,matches,links,seen);const value=ref.toUpperCase();if(/^\d+$/.test(value))return new Set([`team:${value}`]);if(/^[A-Z][A-Z0-9_-]*\d+$/.test(value))return new Set([`rank:${category}:${value}`]);return new Set([`ref:${category}:${value}`]);
}
function matchTokens(gameId:string,matches:Map<string,Match>,links:Map<string,Link>,seen=new Set<string>()):Set<string>{
  if(seen.has(gameId))return new Set([`cycle:${gameId}`]);seen=new Set(seen);seen.add(gameId);const match=matches.get(gameId);if(!match)return new Set();const link=links.get(gameId);if(link)return new Set([...sourceTokens(link.homeKind,link.homeRef,match.category,matches,links,seen),...sourceTokens(link.awayKind,link.awayRef,match.category,matches,links,seen)]);return new Set([...sourceTokens("ref",match.homeRef,match.category,matches,links,seen),...sourceTokens("ref",match.awayRef,match.category,matches,links,seen)]);
}
function validate(rows:Match[],links:Map<string,Link>,duration:number){
  const matches=new Map<string,Match>(rows.map(item=>[item.gameId,item]));
  const active=rows.filter(item=>item.date&&item.time&&item.court);
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],b=active[j];if(a.date!==b.date||minutes(a.time)>=minutes(b.time)+duration||minutes(b.time)>=minutes(a.time)+duration)continue;if(a.court===b.court)return `Le gare ${a.gameId} e ${b.gameId} si sovrappongono sul campo ${a.court}.`;const ta=matchTokens(a.gameId,matches,links),tb=matchTokens(b.gameId,matches,links);if([...ta].some(value=>tb.has(value)))return `Una squadra risulta impegnata nelle gare ${a.gameId} e ${b.gameId}.`;const people=[a.referee,a.courtManager].filter(Boolean),busy=[b.referee,b.courtManager].find(value=>value&&people.includes(value));if(busy)return `${busy} risulta assegnato alle gare ${a.gameId} e ${b.gameId}.`;}
  return "";
}

export async function POST(request:Request){
  await ensureDatabase();if(!(await requireUser(request,["admin"])))return json({error:"Non autorizzato"},403);
  const payload=await request.json() as any,action=text(payload.action);
  if(action==="clearAll"){if(text(payload.confirmation)!=="SVUOTA")return json({error:"Conferma non valida."},400);await db().batch([db().prepare("DELETE FROM final_links"),db().prepare("DELETE FROM result_audit"),db().prepare("DELETE FROM matches")]);return json({ok:true,message:"Tutte le gare sono state eliminate."});}
  const day=await db().prepare("SELECT code,day_date AS date,start_time AS startTime FROM tournament_days WHERE code=?").bind(text(payload.dayCode)).first<any>();if(!day)return json({error:"Seleziona una giornata valida."},400);
  const duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70);
  const rows=(await db().prepare("SELECT game_id AS gameId,category_code AS category,match_date AS date,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef,referee,court_manager AS courtManager,result FROM matches").all<Match>()).results as Match[],linkRows=(await db().prepare("SELECT target_game_id AS targetGameId,category_code AS category,home_kind AS homeKind,home_ref AS homeRef,away_kind AS awayKind,away_ref AS awayRef FROM final_links").all<Link>()).results as Link[],links=new Map<string,Link>(linkRows.map(item=>[item.targetGameId,item]));
  if(action==="applyDay"){
    const lanes=payload.lanes&&typeof payload.lanes==="object"?payload.lanes:{},courtRows=await db().prepare("SELECT code FROM courts WHERE active=1").all<{code:string}>(),validCourts=new Set(courtRows.results.map(item=>item.code)),seen=new Set<string>(),updates:{gameId:string;court:string;time:string}[]=[];
    for(const [court,value] of Object.entries(lanes)){if(!validCourts.has(court))return json({error:`Campo ${court} non valido.`},400);if(!Array.isArray(value))return json({error:"Pianificazione non valida."},400);for(const [index,idValue] of value.entries()){const gameId=text(idValue);if(seen.has(gameId))return json({error:`La gara ${gameId} compare più volte.`},400);if(!rows.some(item=>item.gameId===gameId))return json({error:`Gara ${gameId} inesistente.`},400);seen.add(gameId);updates.push({gameId,court,time:clock(minutes(day.startTime)+index*duration)});}}
    const simulated=rows.map(item=>{const update=updates.find(row=>row.gameId===item.gameId);if(update)return {...item,date:day.date,time:update.time,court:update.court};if(item.date===day.date)return {...item,date:"",time:"",court:""};return item;}),conflict=validate(simulated,links,duration);if(conflict)return json({error:conflict},409);
    const statements=[...updates.map(item=>db().prepare("UPDATE matches SET match_date=?,match_time=?,court=?,status=CASE WHEN result<>'' THEN 'completed' ELSE 'scheduled' END WHERE game_id=?").bind(day.date,item.time,item.court,item.gameId)),...rows.filter(item=>item.date===day.date&&!seen.has(item.gameId)).map(item=>db().prepare("UPDATE matches SET match_date='',match_time='',court='',status='draft' WHERE game_id=?").bind(item.gameId))];if(statements.length)await db().batch(statements);return json({ok:true,message:"Pianificazione della giornata salvata."});
  }
  if(action==="shift"){
    const court=text(payload.court),source=rows.find(item=>item.gameId===text(payload.fromGameId));const delta=Number(payload.deltaMinutes);if(!source||source.date!==day.date||source.court!==court)return json({error:"Seleziona una gara della corsia."},400);if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>360)return json({error:"Spostamento non valido."},400);const threshold=minutes(source.time),affected=rows.filter(item=>item.date===day.date&&item.court===court&&minutes(item.time)>=threshold),simulated=rows.map(item=>affected.some(row=>row.gameId===item.gameId)?{...item,time:clock(minutes(item.time)+delta)}:item);if(simulated.some(item=>item.date&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))))return json({error:"Lo spostamento uscirebbe dalla giornata."},409);const conflict=validate(simulated,links,duration);if(conflict)return json({error:conflict},409);await db().batch(affected.map(item=>db().prepare("UPDATE matches SET match_time=? WHERE game_id=?").bind(clock(minutes(item.time)+delta),item.gameId)));return json({ok:true,message:`Spostate ${affected.length} gare di ${delta>0?"+":""}${delta} minuti.`});
  }
  return json({error:"Operazione non valida."},400);
}
