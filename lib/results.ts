import { database } from "./database";

export type ScoreData = { gameId: string; category: string; result: string; sets: string[] };

export function normalizeScoreData(input: Partial<ScoreData>) {
  const gameId = String(input.gameId || "").trim();
  const category = String(input.category || "").trim();
  const result = String(input.result || "").trim();
  const sets = Array.from({ length: 3 }, (_, index) => String(input.sets?.[index] || "").trim());
  if (!/^\d{4}$/.test(gameId)) throw new Error("Partita non valida");
  if (!category) throw new Error("Categoria non valida");
  if (result && !/^\d+\s*[-–]\s*\d+$/.test(result)) throw new Error("Inserisci il risultato nel formato 2-0 o 2-1.");
  if (sets.some(value => value && !/^\d+\s*[-–]\s*\d+$/.test(value))) throw new Error("Inserisci i parziali nel formato 25-20.");
  const score = result.match(/^(\d+)\s*[-–]\s*(\d+)$/), playedSets = sets.filter(Boolean).length;
  if (score && playedSets && Number(score[1]) + Number(score[2]) !== playedSets) throw new Error("Il risultato non è coerente con il numero di parziali inseriti.");
  return { gameId, category, result, sets };
}

export async function saveConfirmedResult(input: Partial<ScoreData>, userId: number, submissionId?: number) {
  const { gameId, category, result, sets } = normalizeScoreData(input);
  const db = database();
  const current = await db.prepare("SELECT game_id AS gameId,category_code AS category,phase,result,set_1 AS set1,set_2 AS set2,set_3 AS set3 FROM matches WHERE game_id=? AND category_code=?").bind(gameId, category).first<any>();
  if (!current) throw new Error("Partita non trovata");
  const changed = result !== current.result || sets[0] !== current.set1 || sets[1] !== current.set2 || sets[2] !== current.set3;
  if (changed) {
    let downstream = await db.prepare(`SELECT m.game_id AS gameId FROM final_links f JOIN matches m ON m.game_id=f.target_game_id WHERE ((f.home_kind IN ('winner','loser') AND f.home_ref=?) OR (f.away_kind IN ('winner','loser') AND f.away_ref=?)) AND (m.result<>'' OR m.set_1<>'' OR m.set_2<>'' OR m.set_3<>'') LIMIT 1`).bind(gameId, gameId).first<any>();
    if (!downstream && current.phase === "girone") downstream = await db.prepare("SELECT game_id AS gameId FROM matches WHERE category_code=? AND phase<>'girone' AND (result<>'' OR set_1<>'' OR set_2<>'' OR set_3<>'') LIMIT 1").bind(category).first<any>();
    if (downstream) throw new Error(`Non puoi modificare questa gara: la gara dipendente ${downstream.gameId} è già iniziata.`);
  }
  const status = result ? "completed" : sets.some(Boolean) ? "live" : "scheduled";
  await db.prepare("UPDATE matches SET result=?,set_1=?,set_2=?,set_3=?,status=? WHERE game_id=? AND category_code=?").bind(result, sets[0], sets[1], sets[2], status, gameId, category).run();
  await db.prepare("INSERT INTO result_audit (game_id, category, result, set_1, set_2, set_3, user_id, submission_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(gameId, category, result, sets[0], sets[1], sets[2], userId, submissionId || null, new Date().toISOString()).run();
  return { gameId, category, result, sets, status, changed };
}
