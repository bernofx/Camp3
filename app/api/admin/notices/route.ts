import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const text=(value:unknown)=>String(value??"").trim();

export async function POST(request:Request){
  await ensureDatabase();
  const user=await requireUser(request,["admin"]);
  if(!user)return json({error:"Non autorizzato"},403);
  const payload=await request.json() as {action?:string;data?:Record<string,unknown>};
  if(payload.action==="create"){
    const title=text(payload.data?.title),message=text(payload.data?.message);
    if(!title||!message)return json({error:"Titolo e messaggio sono obbligatori."},400);
    if(title.length>90||message.length>500)return json({error:"L’avviso è troppo lungo."},400);
    const result=await db().prepare("INSERT INTO notices(title,message,accent,created_at,created_by) VALUES(?,?,?,?,?)").bind(title,message,payload.data?.accent?1:0,new Date().toISOString(),user.id).run();
    return json({ok:true,message:"Avviso pubblicato.",noticeId:result.meta.last_row_id});
  }
  if(payload.action==="delete"){
    const id=Number(payload.data?.id);
    if(!Number.isInteger(id)||id<1)return json({error:"Avviso non valido."},400);
    await db().prepare("DELETE FROM notices WHERE id=?").bind(id).run();
    return json({ok:true,message:"Avviso rimosso."});
  }
  return json({error:"Operazione non valida."},400);
}
