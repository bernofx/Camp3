import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

export async function GET(request:Request){
  await ensureDatabase();
  if(!(await requireUser(request,["admin"])))return json({error:"Non autorizzato"},403);
  const rows=await db().prepare("SELECT id,incident_type AS type,title,summary,payload,created_at AS createdAt FROM incident_audit ORDER BY created_at DESC,id DESC LIMIT 30").all<any>();
  return json({ok:true,incidents:rows.results.map(item=>({...item,payload:JSON.parse(item.payload||"{}")}))});
}
