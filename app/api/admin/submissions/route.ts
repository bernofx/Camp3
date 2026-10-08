import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";
import { saveConfirmedResult } from "../../../../lib/results";

const text = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request, ["admin"]))) return json({ error: "Non autorizzato" }, 403);
  const status = new URL(request.url).searchParams.get("status") || "pending";
  const allowed = ["pending", "approved", "rejected", "duplicate", "all"];
  if (!allowed.includes(status)) return json({ error: "Filtro non valido" }, 400);
  const rows = await db().prepare(`SELECT s.id,s.public_code AS publicCode,s.game_id AS gameId,s.category_code AS category,s.scorekeeper_name AS scorekeeperName,s.referee_name AS refereeName,s.court_manager_name AS courtManagerName,s.result,s.set_1 AS set1,s.set_2 AS set2,s.set_3 AS set3,s.photo_key AS photoKey,s.status,s.submitted_at AS submittedAt,s.reviewed_at AS reviewedAt,s.review_note AS reviewNote,m.match_date AS date,m.match_time AS time,m.court,m.home_ref AS homeRef,m.away_ref AS awayRef,m.result AS confirmedResult,m.set_1 AS confirmedSet1,m.set_2 AS confirmedSet2,m.set_3 AS confirmedSet3 FROM score_submissions s JOIN matches m ON m.game_id=s.game_id WHERE (?='all' OR s.status=?) ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END,s.submitted_at DESC`).bind(status, status).all();
  const pending = await db().prepare("SELECT COUNT(*) AS count FROM score_submissions WHERE status='pending'").first<{count:number}>();
  return json({ ok: true, submissions: rows.results, pendingCount: Number(pending?.count || 0) });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await requireUser(request, ["admin"]); if (!user) return json({ error: "Non autorizzato" }, 403);
  const payload = await request.json() as { id?: number; action?: string; result?: string; sets?: string[]; scorekeeperName?: string; refereeName?: string; courtManagerName?: string; reviewNote?: string };
  const id = Number(payload.id), action = text(payload.action);
  if (!Number.isInteger(id) || id < 1 || !["approve", "correct", "reject", "duplicate"].includes(action)) return json({ error: "Operazione non valida." }, 400);
  const submission = await db().prepare("SELECT id,game_id AS gameId,category_code AS category,scorekeeper_name AS scorekeeperName,referee_name AS refereeName,court_manager_name AS courtManagerName,result,set_1 AS set1,set_2 AS set2,set_3 AS set3,status FROM score_submissions WHERE id=?").bind(id).first<any>();
  if (!submission) return json({ error: "Referto non trovato." }, 404);
  if (submission.status !== "pending") return json({ error: "Questo referto è già stato esaminato." }, 409);
  const now = new Date().toISOString(), note = text(payload.reviewNote);
  if (action === "reject" || action === "duplicate") {
    await db().prepare("UPDATE score_submissions SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=?").bind(action === "reject" ? "rejected" : "duplicate", now, user.id, note, id).run();
    return json({ ok: true, message: action === "reject" ? "Referto respinto." : "Referto segnato come duplicato." });
  }
  const state = String((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value || "planning");
  if (state !== "live") return json({ error: state === "closed" ? "Il torneo è concluso." : "Avvia il torneo prima di approvare un risultato." }, 409);
  const current = await db().prepare("SELECT result,set_1 AS set1,set_2 AS set2,set_3 AS set3 FROM matches WHERE game_id=? AND category_code=?").bind(submission.gameId, submission.category).first<any>();
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
