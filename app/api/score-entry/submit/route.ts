import { database, ensureDatabase } from "../../../../lib/database";
import { json } from "../../../../lib/auth";
import { createPublicCode } from "../../../../lib/qr";
import { normalizeScoreData } from "../../../../lib/results";
import { resolveQrToken } from "../route";

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as { token?: string; gameId?: string; scorekeeperName?: string; refereeName?: string; courtManagerName?: string; result?: string; sets?: string[]; photoKey?: string };
  const access = payload.token ? await resolveQrToken(payload.token) : null;
  if (!access) return json({ error: "QR non valido o revocato." }, 404);
  const state = String((await database().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value || "planning");
  if (state !== "live") return json({ error: state === "closed" ? "Il torneo è concluso." : "Il torneo non è ancora iniziato." }, 409);
  const scorekeeperName = String(payload.scorekeeperName || "").trim();
  const refereeName = String(payload.refereeName || "").trim(), courtManagerName = String(payload.courtManagerName || "").trim();
  if ([scorekeeperName, refereeName, courtManagerName].some(value => value.length > 80)) return json({ error: "I nomi dello staff possono contenere al massimo 80 caratteri." }, 400);
  let score; try { score = normalizeScoreData({ gameId: payload.gameId || "", category: "in attesa", result: payload.result || "", sets: payload.sets || [] }); } catch (error) { return json({ error: error instanceof Error ? error.message : "Risultato non valido" }, 400); }
  if (!score.result) return json({ error: "Inserisci il risultato finale." }, 400);
  const match = await database().prepare("SELECT game_id AS gameId,category_code AS category,result,status FROM matches WHERE game_id=?").bind(score.gameId).first<any>();
  if (!match || match.result || match.status === "completed") return json({ error: "La gara selezionata non è più disponibile per l’invio." }, 409);
  if (access.kind === "match" && access.reference !== score.gameId) return json({ error: "Questo QR è associato a un’altra gara." }, 409);
  const photoKey = String(payload.photoKey || ""), upload = await database().prepare("SELECT photo_key AS photoKey,photo_mime AS mime,photo_size AS size FROM score_uploads WHERE photo_key=? AND token_hash=? AND consumed_at IS NULL AND expires_at>?").bind(photoKey, access.tokenHash, new Date().toISOString()).first<any>();
  if (!upload) return json({ error: "Fotografia mancante o scaduta: allegala nuovamente." }, 409);
  let publicCode = createPublicCode();
  while (await database().prepare("SELECT id FROM score_submissions WHERE public_code=?").bind(publicCode).first()) publicCode = createPublicCode();
  const now = new Date().toISOString();
  await database().batch([
    database().prepare("INSERT INTO score_submissions(public_code,game_id,category_code,scorekeeper_name,referee_name,court_manager_name,result,set_1,set_2,set_3,photo_key,photo_mime,photo_size,status,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)").bind(publicCode, score.gameId, match.category, scorekeeperName, refereeName, courtManagerName, score.result, score.sets[0], score.sets[1], score.sets[2], upload.photoKey, upload.mime, upload.size, now),
    database().prepare("UPDATE score_uploads SET consumed_at=? WHERE photo_key=?").bind(now, upload.photoKey),
  ]);
  return json({ ok: true, publicCode, message: "Referto inviato: un amministratore verificherà fotografia e risultato." });
}
