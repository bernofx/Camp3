import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const text = (value: unknown) => String(value ?? "").trim();
const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
type Standing = { code:string; points:number; wins:number; setsFor:number; setsAgainst:number; pointsFor:number; pointsAgainst:number };

function score(value:string){const match=value.match(/^(\d+)\s*[-–]\s*(\d+)$/);return match?[Number(match[1]),Number(match[2])] as const:null;}
function exactTie(a:Standing,b:Standing){
  return a.points===b.points&&a.wins===b.wins&&a.setsFor-a.setsAgainst===b.setsFor-b.setsAgainst&&a.setsFor===b.setsFor&&a.pointsFor*b.pointsAgainst===b.pointsFor*a.pointsAgainst;
}

async function validateTie(category:string,groupCode:string,teamA:string,teamB:string){
  const teams=(await db().prepare("SELECT code FROM teams WHERE category_code=? AND group_code=? AND active=1 AND code IN (?,?)").bind(category,groupCode,teamA,teamB).all<{code:string}>()).results;
  if(teams.length!==2)throw new Error("Le squadre non appartengono allo stesso girone.");
  const groupTeams=(await db().prepare("SELECT code FROM teams WHERE category_code=? AND group_code=? AND active=1").bind(category,groupCode).all<{code:string}>()).results.map(item=>item.code);
  const homeAndAway=Number((await db().prepare("SELECT COALESCE(home_and_away,0) AS value FROM category_settings WHERE category_code=?").bind(category).first<{value:number}>())?.value||0);
  const matches=(await db().prepare("SELECT home_ref AS homeRef,away_ref AS awayRef,result,set_1 AS set1,set_2 AS set2,set_3 AS set3 FROM matches WHERE category_code=? AND group_code=? AND phase='girone'").bind(category,groupCode).all<any>()).results;
  const expected=groupTeams.length*(groupTeams.length-1)/2*(homeAndAway?2:1);
  if(matches.length!==expected||matches.some(item=>!score(item.result)))throw new Error("Il girone non è ancora concluso: lo spareggio può essere definito solo dopo tutti i risultati.");
  const stats=new Map(groupTeams.map(code=>[code,{code,points:0,wins:0,setsFor:0,setsAgainst:0,pointsFor:0,pointsAgainst:0}]));
  for(const match of matches){const result=score(match.result);if(!result)continue;const home=stats.get(match.homeRef),away=stats.get(match.awayRef);if(!home||!away)continue;home.setsFor+=result[0];home.setsAgainst+=result[1];away.setsFor+=result[1];away.setsAgainst+=result[0];for(const raw of [match.set1,match.set2,match.set3]){const set=score(raw);if(set){home.pointsFor+=set[0];home.pointsAgainst+=set[1];away.pointsFor+=set[1];away.pointsAgainst+=set[0];}}const winner=result[0]>result[1]?home:away,loser=winner===home?away:home;winner.wins++;if(Math.abs(result[0]-result[1])===1){winner.points+=2;loser.points+=1;}else winner.points+=3;}
  const left=stats.get(teamA)!,right=stats.get(teamB)!;if(!exactTie(left,right))throw new Error("Le due squadre non risultano in parità completa secondo punti, set e QP.");
}

export async function POST(request:Request){
  await ensureDatabase();const user=await requireUser(request,["admin"]);if(!user)return json({error:"Non autorizzato"},403);
  const payload=await request.json() as any,action=text(payload.action),category=text(payload.category).toUpperCase(),groupCode=text(payload.groupCode).toUpperCase(),ordered=[text(payload.teamA),text(payload.teamB)].sort(),teamA=ordered[0],teamB=ordered[1];
  if(!category||!groupCode||!teamA||!teamB||teamA===teamB)return json({error:"Parità non valida."},400);
  try{await validateTie(category,groupCode,teamA,teamB);}catch(error){return json({error:error instanceof Error?error.message:"Parità non valida."},409);}
  const state=text((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value)||"planning";if(state!=="live")return json({error:"La parità si risolve durante il torneo, dopo la chiusura del girone."},409);
  const now=new Date().toISOString();
  if(action==="agreement"){
    const preferred=text(payload.preferredTeamCode),note=text(payload.note);if(![teamA,teamB].includes(preferred))return json({error:"Seleziona la squadra che deve precedere in classifica."},400);if(!note)return json({error:"Indica la motivazione o il riferimento all’accordo."},400);
    await db().prepare("INSERT INTO ranking_resolutions(category_code,group_code,team_a,team_b,resolution_type,preferred_team_code,playoff_game_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,? ,?,'',?,?,?,?) ON CONFLICT(category_code,group_code,team_a,team_b) DO UPDATE SET resolution_type='agreement',preferred_team_code=excluded.preferred_team_code,playoff_game_id='',note=excluded.note,created_by=excluded.created_by,updated_at=excluded.updated_at").bind(category,groupCode,teamA,teamB,"agreement",preferred,note,user.id,now,now).run();
    return json({ok:true,message:"Ordine concordato registrato. La classifica e le qualificate sono ora determinate."});
  }
  if(action!=="playoff")return json({error:"Operazione non valida."},400);
  const date=text(payload.date),time=text(payload.time),court=text(payload.court);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return json({error:"Completa data e ora dello spareggio."},400);
  const day=await db().prepare("SELECT start_time AS startTime,end_time AS endTime FROM tournament_days WHERE day_date=?").bind(date).first<{startTime:string;endTime:string}>(),courtRow=await db().prepare("SELECT code FROM courts WHERE code=? AND active=1").bind(court).first();if(!day||!courtRow)return json({error:"Seleziona una giornata e un campo configurati."},400);
  const duration=Number((await db().prepare("SELECT value FROM tournament_settings WHERE key='match_duration_minutes'").first<{value:string}>())?.value||70),start=minutes(time);if(start<minutes(day.startTime)||start+duration>minutes(day.endTime))return json({error:`Lo spareggio deve rientrare nell’intervallo ${day.startTime}–${day.endTime}.`},409);
  const scheduled=(await db().prepare("SELECT game_id AS gameId,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef FROM matches WHERE match_date=? AND match_time<>'' AND court<>''").bind(date).all<any>()).results,conflict=scheduled.find(item=>{const other=minutes(item.time),overlap=start<other+duration&&other<start+duration;return overlap&&(item.court===court||[item.homeRef,item.awayRef].some((team:string)=>team===teamA||team===teamB));});if(conflict)return json({error:`Lo spareggio si sovrappone alla gara ${conflict.gameId} sul campo o per una delle squadre.`},409);
  const existing=await db().prepare("SELECT playoff_game_id AS gameId FROM ranking_resolutions WHERE category_code=? AND group_code=? AND team_a=? AND team_b=?").bind(category,groupCode,teamA,teamB).first<{gameId:string}>();if(existing?.gameId)return json({error:`È già presente lo spareggio ${existing.gameId}.`},409);
  const max=await db().prepare("SELECT MAX(CAST(game_id AS INTEGER)) AS value FROM matches WHERE game_id GLOB '[0-9][0-9][0-9][0-9]'").first<{value:number}>(),gameId=String(Number(max?.value||0)+1).padStart(4,"0");
  await db().batch([
    db().prepare("INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,status) VALUES(?,?,?,'spareggio',?,?,?,?,?,'scheduled')").bind(gameId,category,groupCode,date,time,court,teamA,teamB),
    db().prepare("INSERT INTO ranking_resolutions(category_code,group_code,team_a,team_b,resolution_type,preferred_team_code,playoff_game_id,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'',?,'',?,?,?) ON CONFLICT(category_code,group_code,team_a,team_b) DO UPDATE SET resolution_type='playoff',preferred_team_code='',playoff_game_id=excluded.playoff_game_id,note='',created_by=excluded.created_by,updated_at=excluded.updated_at").bind(category,groupCode,teamA,teamB,"playoff",gameId,user.id,now,now),
  ]);
  return json({ok:true,gameId,message:`Spareggio ${gameId} creato e programmato. La classifica resterà sospesa fino al risultato.`});
}
