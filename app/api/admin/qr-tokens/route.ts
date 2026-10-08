import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";
import { createQrToken, hashQrToken } from "../../../../lib/qr";

const text = (value: unknown) => String(value ?? "").trim();

function printableMetadata(row: any) {
  if (row.kind === "court") return {
    printTitle: `QR Campo ${row.reference}`,
    printSubtitle: row.courtName || row.label || `Campo ${row.reference}`,
  };
  return {
    printTitle: `${row.category || "Gara"} · Gara ${row.reference}`,
    printSubtitle: `${row.homeName || row.homeRef || "Da definire"} – ${row.awayName || row.awayRef || "Da definire"} · ${row.date || "data da definire"} ${row.time || ""} · Campo ${row.court || "–"}`,
  };
}

function publicToken(row: any, request: Request) {
  const tokenValue = text(row.tokenValue);
  const url = tokenValue ? new URL("/referto.html", request.url) : null;
  if (url) url.searchParams.set("token", tokenValue);
  return { ...row, ...printableMetadata(row), tokenValue: undefined, url: url?.toString() || "", printable: Boolean(url) };
}

async function tokenReference(kind: string, reference: string) {
  return kind === "court"
    ? db().prepare("SELECT code,name FROM courts WHERE code=? AND active=1").bind(reference).first<any>()
    : db().prepare("SELECT m.game_id AS code,m.category_code AS category,m.match_date AS date,m.match_time AS time,m.court,m.home_ref AS homeRef,m.away_ref AS awayRef,COALESCE(h.name,m.home_ref) AS homeName,COALESCE(a.name,m.away_ref) AS awayName FROM matches m LEFT JOIN teams h ON h.code=m.home_ref LEFT JOIN teams a ON a.code=m.away_ref WHERE m.game_id=?").bind(reference).first<any>();
}

async function createStoredToken(request: Request, userId: number, kind: string, reference: string, labelOverride = "") {
  const valid = await tokenReference(kind, reference);
  if (!valid) return null;
  const token = createQrToken(), tokenHash = await hashQrToken(token), label = labelOverride || (kind === "court" ? valid.name : `Gara ${valid.code} · ${valid.category}`), now = new Date().toISOString();
  const inserted = await db().prepare("INSERT INTO qr_access_tokens(token_hash,token_value,kind,reference,label,active,created_by,created_at) VALUES(?,?,?,?,?,1,?,?) RETURNING id").bind(tokenHash, token, kind, reference, label, userId, now).first<{id:number}>();
  return publicToken({ id: inserted?.id, kind, reference, label, active: 1, createdAt: now, tokenValue: token, ...(kind === "court" ? { courtName: valid.name } : valid) }, request);
}

export async function GET(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request, ["admin"]))) return json({ error: "Non autorizzato" }, 403);
  const rows = await db().prepare(`SELECT q.id,q.kind,q.reference,q.label,q.active,q.expires_at AS expiresAt,q.created_at AS createdAt,q.revoked_at AS revokedAt,q.token_value AS tokenValue,
    c.name AS courtName,m.category_code AS category,m.match_date AS date,m.match_time AS time,m.court,m.home_ref AS homeRef,m.away_ref AS awayRef,
    COALESCE(h.name,m.home_ref) AS homeName,COALESCE(a.name,m.away_ref) AS awayName
    FROM qr_access_tokens q
    LEFT JOIN courts c ON q.kind='court' AND c.code=q.reference
    LEFT JOIN matches m ON q.kind='match' AND m.game_id=q.reference
    LEFT JOIN teams h ON h.code=m.home_ref
    LEFT JOIN teams a ON a.code=m.away_ref
    ORDER BY q.active DESC,q.created_at DESC`).all();
  return json({ ok: true, tokens: rows.results.map(row => publicToken(row, request)) });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const user = await requireUser(request, ["admin"]); if (!user) return json({ error: "Non autorizzato" }, 403);
  const payload = await request.json() as { action?: string; kind?: string; reference?: string; label?: string; id?: number };
  if (payload.action === "revoke") {
    const id = Number(payload.id); if (!Number.isInteger(id) || id < 1) return json({ error: "QR non valido" }, 400);
    await db().prepare("UPDATE qr_access_tokens SET active=0,revoked_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
    return json({ ok: true, message: "QR revocato." });
  }
  let kind = text(payload.kind), reference = text(payload.reference), label = text(payload.label);
  if (payload.action === "reissue") {
    const id = Number(payload.id); if (!Number.isInteger(id) || id < 1) return json({ error: "QR non valido" }, 400);
    const previous = await db().prepare("SELECT kind,reference,label,active FROM qr_access_tokens WHERE id=?").bind(id).first<any>();
    if (!previous || !previous.active) return json({ error: "Il QR non è più attivo e non può essere ristampato." }, 409);
    kind = previous.kind; reference = previous.reference; label = previous.label;
  }
  if (!(["court", "match"] as string[]).includes(kind) || !reference) return json({ error: "Seleziona un campo o una gara." }, 400);
  const token = await createStoredToken(request, user.id, kind, reference, label);
  if (!token) return json({ error: "Riferimento QR non disponibile." }, 404);
  const reissued = payload.action === "reissue";
  return json({ ok: true, token, message: reissued ? "Creata una copia ristampabile del QR. Il codice precedente resta valido." : "QR creato e salvato. Potrai ristamparlo anche in seguito." });
}
