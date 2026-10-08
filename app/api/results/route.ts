import { db, json, requireUser } from "../../../lib/auth";
import { ensureDatabase } from "../../../lib/database";
import { saveConfirmedResult } from "../../../lib/results";

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await requireUser(request, ["admin"]);
  if (!user) return json({ error: "Non autorizzato" }, 403);
  const payload = await request.json() as {gameId?:string;category?:string;result?:string;sets?:string[]};
  const state=String((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value||"planning");if(state!=="live")return json({error:state==="closed"?"Il torneo è concluso.":"Avvia il torneo prima di inserire i risultati."},409);
  try { await saveConfirmedResult({ gameId: payload.gameId || "", category: payload.category || "", result: payload.result || "", sets: payload.sets || [] }, user.id); return json({ ok: true }); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Salvataggio non riuscito" }, 409); }
}
