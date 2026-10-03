import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const text = (value: unknown) => String(value ?? "").trim();

export async function POST(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request,["admin"]))) return json({error:"Non autorizzato"},403);
  const payload = await request.json() as {entity?:string;action?:string;data?:Record<string,unknown>};
  const entity=text(payload.entity), action=text(payload.action), data=payload.data||{};
  try {
    if (entity==="category" && action==="save") {
      const code=text(data.code).toUpperCase(); if(!/^[A-Z0-9_-]{2,12}$/.test(code)) return json({error:"Codice categoria non valido"},400);
      await db().prepare("INSERT INTO categories(code,name,color,sort_order,active) VALUES(?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,color=excluded.color,sort_order=excluded.sort_order,active=1").bind(code,text(data.name)||code,text(data.color)||"#dff4ea",Number(data.sortOrder)||0).run();
    } else if (entity==="group" && action==="save") {
      const category=text(data.categoryCode).toUpperCase(), code=text(data.code).toUpperCase();
      await db().prepare("INSERT INTO tournament_groups(category_code,code,name,sort_order) VALUES(?,?,?,?) ON CONFLICT(category_code,code) DO UPDATE SET name=excluded.name,sort_order=excluded.sort_order").bind(category,code,text(data.name)||`Girone ${code}`,Number(data.sortOrder)||0).run();
    } else if (entity==="team" && action==="save") {
      const code=text(data.code); if(!code) return json({error:"Codice squadra obbligatorio"},400);
      await db().prepare("INSERT INTO teams(code,name,category_code,group_code,active) VALUES(?,?,?,?,1) ON CONFLICT(code) DO UPDATE SET name=excluded.name,category_code=excluded.category_code,group_code=excluded.group_code,active=1").bind(code,text(data.name),text(data.categoryCode).toUpperCase(),text(data.groupCode).toUpperCase()).run();
    } else if (entity==="match" && action==="save") {
      const gameId=text(data.gameId); if(!/^\d{4}$/.test(gameId)) return json({error:"Numero gara: quattro cifre"},400);
      await db().prepare(`INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,scorekeeper,referee,court_manager,result,set_1,set_2,set_3,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_id) DO UPDATE SET category_code=excluded.category_code,group_code=excluded.group_code,phase=excluded.phase,match_date=excluded.match_date,match_time=excluded.match_time,court=excluded.court,home_ref=excluded.home_ref,away_ref=excluded.away_ref,scorekeeper=excluded.scorekeeper,referee=excluded.referee,court_manager=excluded.court_manager`).bind(gameId,text(data.categoryCode).toUpperCase(),text(data.groupCode).toUpperCase(),text(data.phase)||"girone",text(data.date),text(data.time),text(data.court),text(data.homeRef),text(data.awayRef),text(data.scorekeeper),text(data.referee),text(data.courtManager),"","","","","scheduled").run();
    } else if (action==="delete") {
      if(entity==="match") await db().prepare("DELETE FROM matches WHERE game_id=?").bind(text(data.gameId)).run();
      else if(entity==="team") await db().prepare("UPDATE teams SET active=0 WHERE code=?").bind(text(data.code)).run();
      else if(entity==="category") await db().prepare("UPDATE categories SET active=0 WHERE code=?").bind(text(data.code)).run();
      else if(entity==="group") await db().prepare("DELETE FROM tournament_groups WHERE category_code=? AND code=?").bind(text(data.categoryCode),text(data.code)).run();
      else return json({error:"Operazione non valida"},400);
    } else return json({error:"Operazione non valida"},400);
    return json({ok:true});
  } catch (error) {
    return json({error:error instanceof Error?error.message:"Operazione non riuscita"},400);
  }
}
