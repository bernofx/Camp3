import { currentUser, db, json } from "../../../../lib/auth";

export async function GET(request: Request) {
  const user = await currentUser(request);
  const count = await db().prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>();
  return json({ user, configured: Number(count?.count || 0) > 0 });
}
