import { database, ensureDatabase } from "../../../lib/database";
import { json } from "../../../lib/auth";
import { hashQrToken } from "../../../lib/qr";

const text = (value: unknown) => String(value ?? "").trim();

export async function resolveQrToken(token: string) {
  const tokenHash = await hashQrToken(token);
  const row = await database().prepare("SELECT id,token_hash AS tokenHash,kind,reference,label FROM qr_access_tokens WHERE token_hash=? AND active=1 AND (expires_at IS NULL OR expires_at>?)").bind(tokenHash, new Date().toISOString()).first<any>();
  return row || null;
}

export async function GET(request: Request) {
  await ensureDatabase();
  const token = new URL(request.url).searchParams.get("token") || "", access = token ? await resolveQrToken(token) : null;
  if (!access) return json({ error: "QR non valido o revocato." }, 404);
  const state = String((await database().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value || "planning");
  if (state !== "live") return json({ error: state === "closed" ? "Il torneo è concluso." : "Il torneo non è ancora iniziato." }, 409);
  const [all,staff] = await Promise.all([
    database().prepare("SELECT m.game_id AS gameId,m.category_code AS category,m.phase,m.match_date AS date,m.match_time AS time,m.court,m.home_ref AS homeRef,m.away_ref AS awayRef,COALESCE(home.name,m.home_ref) AS homeName,COALESCE(away.name,m.away_ref) AS awayName,m.status,c.name AS categoryName FROM matches m LEFT JOIN categories c ON c.code=m.category_code LEFT JOIN teams home ON home.code=m.home_ref AND home.active=1 LEFT JOIN teams away ON away.code=m.away_ref AND away.active=1 WHERE m.result='' AND m.status<>'completed' ORDER BY CASE WHEN m.status='live' THEN 0 ELSE 1 END,m.match_date,m.match_time,m.game_id").all<any>(),
    database().prepare("SELECT name,can_referee AS canReferee,can_scorekeeper AS canScorekeeper,can_court_manager AS canCourtManager FROM staff WHERE active=1 ORDER BY name").all<any>(),
  ]);
  const now = new Date(), parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const nowValue = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const plausibility = (game: any) => { const [year, month, day] = String(game.date || "9999-12-31").split("-").map(Number), [hour, minute] = String(game.time || "23:59").split(":").map(Number); return game.status === "live" ? -1 : Math.abs(Date.UTC(year, month - 1, day, hour, minute) - nowValue); };
  const games = (all.results as any[]).map(game => ({ ...game, isPrimaryCourt: access.kind === "court" && String(game.court) === access.reference })).sort((a, b) => Number(!a.isPrimaryCourt) - Number(!b.isPrimaryCourt) || plausibility(a) - plausibility(b) || String(a.gameId).localeCompare(String(b.gameId)));
  const candidates = access.kind === "match" ? games.filter(game => game.gameId === access.reference) : games;
  return json({ ok: true, label: access.label, kind: access.kind, reference: access.reference, candidates, staff: staff.results });
}
