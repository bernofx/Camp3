import { cleanUsername, createSession, db, hashPassword, json, verifyPassword } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as {username?:string;password?:string};
  const username = cleanUsername(payload.username);
  let row = await db().prepare("SELECT id, username, password_hash AS passwordHash, password_salt AS passwordSalt, role, active FROM users WHERE username = ?").bind(username).first<{id:number;username:string;passwordHash:string;passwordSalt:string;role:string;active:number}>();
  const count = await db().prepare("SELECT COUNT(*) AS count FROM users").first<{count:number}>();
  if (!row && Number(count?.count || 0) === 0 && username === "intercomunale" && String(payload.password || "") === "volleystars2026") {
    const credentials = await hashPassword(String(payload.password));
    const created = await db().prepare("INSERT INTO users(username,password_hash,password_salt,role,active,created_at) VALUES(?,?,?,'admin',1,?) RETURNING id").bind(username,credentials.hash,credentials.salt,new Date().toISOString()).first<{id:number}>();
    row = {id:created!.id,username,passwordHash:credentials.hash,passwordSalt:credentials.salt,role:"admin",active:1};
  }
  if (!row || !row.active || !(await verifyPassword(String(payload.password || ""), row.passwordSalt, row.passwordHash))) return json({ error: "Credenziali non valide" }, 401);
  const cookie = await createSession(row.id);
  return json({ user: { id: row.id, username: row.username, role: row.role } }, 200, { "set-cookie": cookie });
}
