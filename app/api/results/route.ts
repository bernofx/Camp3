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
  if (!/^\d{4}$/.test(gameId) || !["U13", "U14", "U15", "U17"].includes(category)) return json({ error: "Partita non valida" }, 400);
  const status = result ? "completed" : sets.some(Boolean) ? "live" : "scheduled";
  const updated = await db().prepare("UPDATE matches SET result=?,set_1=?,set_2=?,set_3=?,status=? WHERE game_id=? AND category_code=?").bind(result,sets[0],sets[1],sets[2],status,gameId,category).run();
  if (!updated.meta.changes) return json({ error: "Partita non trovata" }, 404);
  await db().prepare("INSERT INTO result_audit (game_id, category, result, set_1, set_2, set_3, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(gameId, category, result, sets[0], sets[1], sets[2], user.id, new Date().toISOString()).run();
  return json({ ok: true });
}
