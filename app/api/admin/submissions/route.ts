import { db, json, requireUser } from "../../../../lib/auth";
import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../../lib/database";
import { saveConfirmedResult } from "../../../../lib/results";

const text = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request, ["admin"]))) return json({ error: "Non autorizzato" }, 403);
  const status = new URL(request.url).searchParams.get("status") || "pending";
  const query = (new URL(request.url).searchParams.get("q") || "").trim(), normalizedCode = query.replace(/\s/g, "");
  const allowed = ["pending", "approved", "rejected", "duplicate", "all"];
  if (!allowed.includes(status)) return json({ error: "Filtro non valido" }, 400);
  const rows = await db().prepare(`SELECT s.id,s.public_code AS publicCode,s.game_id AS gameId,s.category_code AS category,s.scorekeeper_name AS scorekeeperName,s.referee_name AS refereeName,s.court_manager_name AS courtManagerName,s.result,s.set_1 AS set1,s.set_2 AS set2,s.set_3 AS set3,s.photo_key AS photoKey,s.photo_state AS photoState,s.status,s.submitted_at AS submittedAt,s.reviewed_at AS reviewedAt,s.review_note AS reviewNote,m.match_date AS date,m.match_time AS time,m.court,m.home_ref AS homeRef,m.away_ref AS awayRef,COALESCE(home.name,m.home_ref) AS homeName,COALESCE(away.name,m.away_ref) AS awayName,m.result AS confirmedResult,m.set_1 AS confirmedSet1,m.set_2 AS confirmedSet2,m.set_3 AS confirmedSet3 FROM score_submissions s JOIN matches m ON m.game_id=s.game_id LEFT JOIN teams home ON home.code=m.home_ref LEFT JOIN teams away ON away.code=m.away_ref WHERE (?='all' OR s.status=?) AND (?='' OR REPLACE(s.public_code,' ','') LIKE ? OR s.game_id LIKE ? OR s.category_code LIKE ? OR s.scorekeeper_name LIKE ? OR home.name LIKE ? OR away.name LIKE ?) ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END,s.submitted_at DESC`).bind(status, status, query, `%${normalizedCode}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`).all();
  const pending = await db().prepare("SELECT COUNT(*) AS count FROM score_submissions WHERE status='pending'").first<{count:number}>();
  return json({ ok: true, submissions: rows.results, pendingCount: Number(pending?.count || 0) });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await requireUser(request, ["admin"]); if (!user) return json({ error: "Non autorizzato" }, 403);
  const payload = await request.json() as { id?: number; action?: string; result?: string; sets?: string[]; scorekeeperName?: string; refereeName?: string; courtManagerName?: string; reviewNote?: string; confirmation?: string };
  const id = Number(payload.id), action = text(payload.action);
  if(action==="purgePhotos"){
    if(text(payload.confirmation)!=="ELIMINA FOTO")return json({error:"Conferma non valida."},400);
    const state=text((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value);if(state!=="closed")return json({error:"La pulizia delle fotografie è disponibile soltanto a torneo concluso."},409);
    const photos=(await db().prepare("SELECT id,photo_key AS photoKey FROM score_submissions WHERE photo_state IN ('available','cleanup_failed')").all<{id:number;photoKey:string}>()).results;
    if(!env.BUCKET)return json({error:"Archivio fotografie non disponibile."},503);const done:number[]=[],failed:number[]=[];for(const photo of photos){try{await env.BUCKET.delete(photo.photoKey);done.push(photo.id);}catch{failed.push(photo.id);}}
    const now=new Date().toISOString();if(done.length)await db().batch(done.map(item=>db().prepare("UPDATE score_submissions SET photo_state='purged',photo_purged_at=?,photo_purged_by=? WHERE id=?").bind(now,user.id,item)));if(failed.length)await db().batch(failed.map(item=>db().prepare("UPDATE score_submissions SET photo_state='cleanup_failed' WHERE id=?").bind(item)));
    return json({ok:true,message:`Eliminate ${done.length} fotografie.${failed.length?` ${failed.length} non sono state eliminate e restano da pulire.`:""}`,deleted:done.length,failed:failed.length});
  }
  if (!Number.isInteger(id) || id < 1 || !["approve", "correct", "reject", "duplicate", "deleteRejected"].includes(action)) return json({ error: "Operazione non valida." }, 400);
  const submission = await db().prepare("SELECT id,game_id AS gameId,category_code AS category,scorekeeper_name AS scorekeeperName,referee_name AS refereeName,court_manager_name AS courtManagerName,result,set_1 AS set1,set_2 AS set2,set_3 AS set3,status FROM score_submissions WHERE id=?").bind(id).first<{id:number;gameId:string;category:string;scorekeeperName:string;refereeName:string;courtManagerName:string;result:string;set1:string;set2:string;set3:string;status:string}>();
  if (!submission) return json({ error: "Referto non trovato." }, 404);
  if(action==="deleteRejected"){
    const removable=await db().prepare("SELECT photo_key AS photoKey,photo_state AS photoState,status FROM score_submissions WHERE id=?").bind(id).first<{photoKey:string;photoState:string;status:string}>();if(removable?.status!=="rejected")return json({error:"Puoi eliminare definitivamente soltanto un referto rifiutato."},409);if(removable.photoState==="available"){if(!env.BUCKET)return json({error:"Archivio fotografie non disponibile."},503);try{await env.BUCKET.delete(removable.photoKey);}catch{return json({error:"Non è stato possibile eliminare la fotografia. Il referto è stato conservato."},503);}}await db().prepare("DELETE FROM score_submissions WHERE id=?").bind(id).run();return json({ok:true,message:"Referto rifiutato eliminato definitivamente."});
  }
  if (submission.status !== "pending") return json({ error: "Questo referto è già stato esaminato." }, 409);
  const now = new Date().toISOString(), note = text(payload.reviewNote);
  if (action === "reject" || action === "duplicate") {
    await db().prepare("UPDATE score_submissions SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?").bind(action === "reject" ? "rejected" : "duplicate", now, user.id, note, id).run();
    return json({ ok: true, message: action === "reject" ? "Referto respinto." : "Referto segnato come duplicato." });
  }
  const state = String((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value || "planning");
  if (state !== "live") return json({ error: state === "closed" ? "Il torneo è concluso." : "Avvia il torneo prima di approvare un risultato." }, 409);
  const current = await db().prepare("SELECT result,set_1 AS set1,set_2 AS set2,set_3 AS set3 FROM matches WHERE game_id=? AND category_code=?").bind(submission.gameId, submission.category).first<{result:string;set1:string;set2:string;set3:string}>();
  if (!current) return json({ error: "La gara non esiste più." }, 404);
  const result = action === "correct" ? String(payload.result ?? submission.result) : submission.result;
  const sets = action === "correct" ? Array.from({ length: 3 }, (_, index) => String(payload.sets?.[index] ?? [submission.set1,submission.set2,submission.set3][index] ?? "")) : [submission.set1, submission.set2, submission.set3];
  const staff = {scorekeeperName:text(payload.scorekeeperName ?? submission.scorekeeperName),refereeName:text(payload.refereeName ?? submission.refereeName),courtManagerName:text(payload.courtManagerName ?? submission.courtManagerName)};
  if (action === "approve" && current.result && (current.result !== result || current.set1 !== sets[0] || current.set2 !== sets[1] || current.set3 !== sets[2])) return json({ error: "La gara ha già un risultato diverso. Usa “Correggi e approva” dopo aver confrontato il referto." }, 409);
  try {
    await saveConfirmedResult({ gameId: submission.gameId, category: submission.category, result, sets }, user.id, id);
    const statements=[];if(staff.scorekeeperName)statements.push(db().prepare("INSERT INTO staff(name,can_referee,can_scorekeeper,can_court_manager,active) VALUES(?,0,1,0,1) ON CONFLICT(name) DO UPDATE SET can_scorekeeper=1,active=1").bind(staff.scorekeeperName));if(staff.refereeName)statements.push(db().prepare("INSERT INTO staff(name,can_referee,can_scorekeeper,can_court_manager,active) VALUES(?,1,0,0,1) ON CONFLICT(name) DO UPDATE SET can_referee=1,active=1").bind(staff.refereeName));if(staff.courtManagerName)statements.push(db().prepare("INSERT INTO staff(name,can_referee,can_scorekeeper,can_court_manager,active) VALUES(?,0,0,1,1) ON CONFLICT(name) DO UPDATE SET can_court_manager=1,active=1").bind(staff.courtManagerName));statements.push(db().prepare("UPDATE matches SET scorekeeper=CASE WHEN ?<>'' THEN ? ELSE scorekeeper END,referee=CASE WHEN ?<>'' THEN ? ELSE referee END,court_manager=CASE WHEN ?<>'' THEN ? ELSE court_manager END WHERE game_id=?").bind(staff.scorekeeperName,staff.scorekeeperName,staff.refereeName,staff.refereeName,staff.courtManagerName,staff.courtManagerName,submission.gameId));await db().batch(statements);
    await db().prepare("UPDATE score_submissions SET status='approved',reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?").bind(now, user.id, note, id).run();
    return json({ ok: true, message: action === "correct" ? "Risultato corretto e referto approvato." : "Referto approvato e risultato pubblicato." });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Approvazione non riuscita" }, 409); }
}
