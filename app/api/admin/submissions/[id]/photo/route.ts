import { env } from "cloudflare:workers";
import { db, requireUser } from "../../../../../../lib/auth";
import { ensureDatabase } from "../../../../../../lib/database";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  if (!(await requireUser(request, ["admin"]))) return new Response("Non autorizzato", { status: 403 });
  const id = Number((await context.params).id); if (!Number.isInteger(id) || id < 1) return new Response("Referto non valido", { status: 400 });
  const submission = await db().prepare("SELECT photo_key AS photoKey,photo_mime AS mime FROM score_submissions WHERE id=?").bind(id).first<{photoKey:string;mime:string}>();
  if (!submission || !env.BUCKET) return new Response("Fotografia non disponibile", { status: 404 });
  const object = await env.BUCKET.get(submission.photoKey); if (!object) return new Response("Fotografia non disponibile", { status: 404 });
  return new Response(object.body, { headers: { "content-type": submission.mime, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
