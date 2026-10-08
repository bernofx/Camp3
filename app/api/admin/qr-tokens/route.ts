import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";
import { createQrToken, hashQrToken } from "../../../../lib/qr";

const text = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request) {
  await ensureDatabase();
  if (!(await requireUser(request, ["admin"]))) return json({ error: "Non autorizzato" }, 403);
  const rows = await db().prepare("SELECT id,kind,reference,label,active,expires_at AS expiresAt,created_at AS createdAt,revoked_at AS revokedAt FROM qr_access_tokens ORDER BY active DESC,created_at DESC").all();
  return json({ ok: true, tokens: rows.results });
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
  const kind = text(payload.kind), reference = text(payload.reference);
  if (!(["court", "match"] as string[]).includes(kind) || !reference) return json({ error: "Seleziona un campo o una gara." }, 400);
  const valid = kind === "court"
    ? await db().prepare("SELECT code,name FROM courts WHERE code=? AND active=1").bind(reference).first<any>()
    : await db().prepare("SELECT game_id AS code,category_code AS name FROM matches WHERE game_id=?").bind(reference).first<any>();
  if (!valid) return json({ error: "Riferimento QR non disponibile." }, 404);
  const token = createQrToken(), tokenHash = await hashQrToken(token), label = text(payload.label) || (kind === "court" ? valid.name : `Gara ${valid.code} · ${valid.name}`), now = new Date().toISOString();
  await db().prepare("INSERT INTO qr_access_tokens(token_hash,kind,reference,label,active,created_by,created_at) VALUES(?,?,?,?,1,?,?)").bind(tokenHash, kind, reference, label, user.id, now).run();
  const url = new URL("/referto.html", request.url); url.searchParams.set("token", token);
  return json({ ok: true, token: { kind, reference, label, url: url.toString() }, message: "QR creato. Stampalo o condividilo sul tavolo del campo." });
}
