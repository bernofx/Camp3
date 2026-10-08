import { env } from "cloudflare:workers";
import { database, ensureDatabase } from "../../../../lib/database";
import { json } from "../../../../lib/auth";
import { createQrToken } from "../../../../lib/qr";
import { resolveQrToken } from "../route";

const MAX_SIZE = 8 * 1024 * 1024;

function imageType(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)) return "image/png";
  return "";
}

export async function POST(request: Request) {
  await ensureDatabase();
  const form = await request.formData(), token = String(form.get("token") || ""), file = form.get("photo"), access = token ? await resolveQrToken(token) : null;
  if (!access) return json({ error: "QR non valido o revocato." }, 404);
  if (!(file instanceof File) || !file.size) return json({ error: "Allega una fotografia del referto." }, 400);
  if (file.size > MAX_SIZE) return json({ error: "La fotografia supera il limite di 8 MB." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer()), mime = imageType(bytes);
  if (!mime) return json({ error: "Sono accettate solo immagini JPEG o PNG." }, 400);
  if (!env.BUCKET) return json({ error: "Archivio fotografie non disponibile." }, 503);
  const photoKey = `score-submissions/${new Date().toISOString().slice(0, 10)}/${createQrToken()}.${mime === "image/jpeg" ? "jpg" : "png"}`, now = new Date(), expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  await env.BUCKET.put(photoKey, bytes, { httpMetadata: { contentType: mime, cacheControl: "private, no-store" } });
  await database().prepare("INSERT INTO score_uploads(photo_key,token_hash,photo_mime,photo_size,created_at,expires_at) VALUES(?,?,?,?,?,?)").bind(photoKey, access.tokenHash, mime, file.size, now.toISOString(), expiresAt.toISOString()).run();
  return json({ ok: true, photoKey, mime, size: file.size });
}
