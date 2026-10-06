import { db, json, requireUser } from "../../../lib/auth";
import { ensureDatabase } from "../../../lib/database";

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await requireUser(request, ["admin"]);
  if (!user) return json({ error: "Non autorizzato" }, 403);
  const payload = await request.json() as {gameId?:string;category?:string;result?:string;sets?:string[]};
  const gameId = String(payload.gameId || "");
  const category = String(payload.category || "");
  const result = String(payload.result || "").trim();
  const sets = Array.from({ length: 3 }, (_, index) => String(payload.sets?.[index] || "").trim());
  if (!/^\d{4}$/.test(gameId)) return json({ error: "Partita non valida" }, 400);
  const state=String((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value||"planning");if(state!=="live")return json({error:state==="closed"?"Il torneo è concluso.":"Avvia il torneo prima di inserire i risultati."},409);
  const current=await db().prepare("SELECT game_id AS gameId,category_code AS category,phase,result,set_1 AS set1,set_2 AS set2,set_3 AS set3 FROM matches WHERE game_id=? AND category_code=?").bind(gameId,category).first<any>();if(!current)return json({error:"Partita non trovata"},404);
  if(result&&!/^\d+\s*[-–]\s*\d+$/.test(result))return json({error:"Inserisci il risultato nel formato 2-0 o 2-1."},400);if(sets.some(value=>value&&!/^\d+\s*[-–]\s*\d+$/.test(value)))return json({error:"Inserisci i parziali nel formato 25-20."},400);
  const score=result.match(/^(\d+)\s*[-–]\s*(\d+)$/),playedSets=sets.filter(Boolean).length;if(score&&playedSets&&Number(score[1])+Number(score[2])!==playedSets)return json({error:"Il risultato non è coerente con il numero di parziali inseriti."},400);
  const changed=result!==current.result||sets[0]!==current.set1||sets[1]!==current.set2||sets[2]!==current.set3;if(changed){let downstream=await db().prepare(`SELECT m.game_id AS gameId FROM final_links f JOIN matches m ON m.game_id=f.target_game_id WHERE ((f.home_kind IN ('winner','loser') AND f.home_ref=?) OR (f.away_kind IN ('winner','loser') AND f.away_ref=?)) AND (m.result<>'' OR m.set_1<>'' OR m.set_2<>'' OR m.set_3<>'') LIMIT 1`).bind(gameId,gameId).first<any>();if(!downstream&&current.phase==="girone")downstream=await db().prepare("SELECT game_id AS gameId FROM matches WHERE category_code=? AND phase<>'girone' AND (result<>'' OR set_1<>'' OR set_2<>'' OR set_3<>'') LIMIT 1").bind(category).first<any>();if(downstream)return json({error:`Non puoi modificare questa gara: la gara dipendente ${downstream.gameId} è già iniziata.`},409);}
  const status = result ? "completed" : sets.some(Boolean) ? "live" : "scheduled";
  const updated = await db().prepare("UPDATE matches SET result=?,set_1=?,set_2=?,set_3=?,status=? WHERE game_id=? AND category_code=?").bind(result,sets[0],sets[1],sets[2],status,gameId,category).run();
  if (!updated.meta.changes) return json({ error: "Partita non trovata" }, 404);
  await db().prepare("INSERT INTO result_audit (game_id, category, result, set_1, set_2, set_3, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(gameId, category, result, sets[0], sets[1], sets[2], user.id, new Date().toISOString()).run();
  return json({ ok: true });
}
