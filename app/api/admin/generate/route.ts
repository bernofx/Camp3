import { db, json, requireUser } from "../../../../lib/auth";
import { ensureDatabase } from "../../../../lib/database";

const text=(value:unknown)=>String(value??"").trim();
type Team={code:string;groupCode:string};
type Existing={gameId:string;phase:string;homeRef:string;awayRef:string};

async function nextIds(count:number){
  const rows=await db().prepare("SELECT game_id AS gameId FROM matches").all<{gameId:string}>();
  let next=Math.max(0,...rows.results.map(item=>/^\d{4}$/.test(item.gameId)?Number(item.gameId):0))+1;
  if(next+count-1>9999)throw new Error("Numerazione gare esaurita.");
  return Array.from({length:count},()=>String(next++).padStart(4,"0"));
}
const pairKey=(a:string,b:string)=>[a,b].sort().join("|");

export async function POST(request:Request){
  await ensureDatabase();if(!(await requireUser(request,["admin"])))return json({error:"Non autorizzato"},403);
  const payload=await request.json() as {scope?:string;categoryCode?:string},scope=text(payload.scope),category=text(payload.categoryCode).toUpperCase();
  const categoryRow=await db().prepare("SELECT c.code,COALESCE(s.admission_method,'') AS admissionMethod FROM categories c LEFT JOIN category_settings s ON s.category_code=c.code WHERE c.code=? AND c.active=1").bind(category).first<any>();
  if(!categoryRow)return json({error:"Seleziona una categoria valida."},400);if(!categoryRow.admissionMethod)return json({error:"Configura prima la modalità di ammissione della categoria."},409);
  const [groupRows,teamRows,existingRows]=await Promise.all([
    db().prepare("SELECT code,name FROM tournament_groups WHERE category_code=? ORDER BY sort_order,code").bind(category).all<any>(),
    db().prepare("SELECT code,group_code AS groupCode FROM teams WHERE category_code=? AND active=1 ORDER BY group_code,code").bind(category).all<Team>(),
    db().prepare("SELECT game_id AS gameId,phase,home_ref AS homeRef,away_ref AS awayRef FROM matches WHERE category_code=?").bind(category).all<Existing>(),
  ]);
  const groups=groupRows.results,teams=teamRows.results,existing=existingRows.results;
  try{
    if(scope==="groups"){
      if(!groups.length)return json({error:"La categoria non contiene gironi."},409);
      const invalid=groups.filter(group=>teams.filter(team=>team.groupCode===group.code).length<2);if(invalid.length)return json({error:`Servono almeno due squadre in: ${invalid.map(item=>item.name).join(", ")}.`},409);
      const known=new Set(existing.filter(item=>item.phase==="girone").map(item=>pairKey(item.homeRef,item.awayRef))),drafts:{group:string;home:string;away:string}[]=[];
      for(const group of groups){const members=teams.filter(team=>team.groupCode===group.code);for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const key=pairKey(members[i].code,members[j].code);if(!known.has(key)){known.add(key);drafts.push({group:group.code,home:members[i].code,away:members[j].code});}}}
      const ids=await nextIds(drafts.length);if(drafts.length)await db().batch(drafts.map((item,index)=>db().prepare("INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,status) VALUES(?,?,?,'girone','','','',?,?,'draft')").bind(ids[index],category,item.group,item.home,item.away)));
      return json({ok:true,message:drafts.length?`Create ${drafts.length} gare di girone in bozza.`:"Il calendario dei gironi era già completo.",created:drafts.length});
    }
    if(scope==="finals"){
      if(existing.some(item=>item.phase!=="girone"))return json({error:"La fase finale della categoria è già presente. Elimina le gare finali esistenti prima di rigenerarla."},409);
      const expected=groups.reduce((sum,group)=>{const n=teams.filter(team=>team.groupCode===group.code).length;return sum+n*(n-1)/2;},0),roundRobin=existing.filter(item=>item.phase==="girone").length;
      if(roundRobin<expected)return json({error:"Genera prima tutte le gare dei gironi."},409);
      const letters=groups.map((_,index)=>String.fromCharCode(67+index)),method=categoryRow.admissionMethod;
      if(groups.length%2===1&&groups.length>1&&method==="top2_each")return json({error:"Con un numero dispari di gironi, ‘prime 2 di ogni girone’ produce un tabellone non simmetrico. Scegli nella categoria ‘vincitrici + migliore seconda’ oppure ‘girone finale tra le vincitrici’."},409);
      const drafts:{phase:string;home:string;away:string;label?:string}[]=[],links:{target:number;homeKind:string;homeRef:number|string;awayKind:string;awayRef:number|string;title:string;order:number}[]=[];
      if(groups.length===1){drafts.push({phase:"finale",home:"FINALE 1° - 2°",away:"",label:"FINALE 1° - 2°"});links.push({target:0,homeKind:"rank",homeRef:`${letters[0]}1`,awayKind:"rank",awayRef:`${letters[0]}2`,title:"Titolo",order:1});}
      else if(groups.length===2){drafts.push({phase:"fase-finale",home:`${letters[0]}1`,away:`${letters[1]}2`},{phase:"fase-finale",home:`${letters[1]}1`,away:`${letters[0]}2`},{phase:"finale",home:"FINALE 1° - 2°",away:"",label:"FINALE 1° - 2°"},{phase:"finale",home:"FINALE 3° - 4°",away:"",label:"FINALE 3° - 4°"});links.push({target:2,homeKind:"winner",homeRef:0,awayKind:"winner",awayRef:1,title:"Titolo e podio",order:1},{target:3,homeKind:"loser",homeRef:0,awayKind:"loser",awayRef:1,title:"Titolo e podio",order:2});}
      else if(groups.length===4&&method==="top2_each"){drafts.push({phase:"quarti",home:"C1",away:"F2"},{phase:"quarti",home:"D1",away:"E2"},{phase:"quarti",home:"E1",away:"D2"},{phase:"quarti",home:"F1",away:"C2"},{phase:"fase-finale",home:"SEMIFINALE",away:"",label:"SEMIFINALE"},{phase:"fase-finale",home:"SEMIFINALE",away:"",label:"SEMIFINALE"},{phase:"finale",home:"FINALE 1° - 2°",away:"",label:"FINALE 1° - 2°"},{phase:"finale",home:"FINALE 3° - 4°",away:"",label:"FINALE 3° - 4°"});links.push({target:4,homeKind:"winner",homeRef:0,awayKind:"winner",awayRef:1,title:"Titolo e podio",order:0},{target:5,homeKind:"winner",homeRef:2,awayKind:"winner",awayRef:3,title:"Titolo e podio",order:0},{target:6,homeKind:"winner",homeRef:4,awayKind:"winner",awayRef:5,title:"Titolo e podio",order:1},{target:7,homeKind:"loser",homeRef:4,awayKind:"loser",awayRef:5,title:"Titolo e podio",order:2});}
      else if(groups.length===3&&method==="winners_plus_best_second"){const sizes=groups.map(group=>teams.filter(team=>team.groupCode===group.code).length);if(new Set(sizes).size!==1)return json({error:"La migliore seconda è confrontabile automaticamente solo con gironi dello stesso numero di squadre."},409);drafts.push({phase:"fase-finale",home:"C1",away:"BEST2"},{phase:"fase-finale",home:"D1",away:"E1"},{phase:"finale",home:"FINALE 1° - 2°",away:"",label:"FINALE 1° - 2°"},{phase:"finale",home:"FINALE 3° - 4°",away:"",label:"FINALE 3° - 4°"});links.push({target:2,homeKind:"winner",homeRef:0,awayKind:"winner",awayRef:1,title:"Titolo e podio",order:1},{target:3,homeKind:"loser",homeRef:0,awayKind:"loser",awayRef:1,title:"Titolo e podio",order:2});}
      else if(groups.length>=3&&method==="winners_round_robin"){for(let i=0;i<letters.length;i++)for(let j=i+1;j<letters.length;j++)drafts.push({phase:"finale-girone",home:`${letters[i]}1`,away:`${letters[j]}1`});}
      else return json({error:"Non esiste ancora un modello automatico sicuro per questa combinazione di gironi e modalità. Scegli un’altra modalità nella categoria."},409);
      const ids=await nextIds(drafts.length);await db().batch(drafts.map((item,index)=>db().prepare("INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,status) VALUES(?,?,? ,?,'','','',?,?,'draft')").bind(ids[index],category,"",item.phase,item.label||item.home,item.label?"":item.away)));
      if(links.length)await db().batch(links.map(link=>db().prepare("INSERT INTO final_links(target_game_id,category_code,section_title,section_order,target_order,home_kind,home_ref,away_kind,away_ref) VALUES(?,?,?,1,?,?,?,?,?)").bind(ids[link.target],category,link.title,link.order,link.homeKind,typeof link.homeRef==="number"?ids[link.homeRef]:link.homeRef,link.awayKind,typeof link.awayRef==="number"?ids[link.awayRef]:link.awayRef)));
      return json({ok:true,message:`Create ${drafts.length} gare della fase finale in bozza.`,created:drafts.length});
    }
    return json({error:"Operazione non valida."},400);
  }catch(error){return json({error:error instanceof Error?error.message:"Generazione non riuscita"},400);}
}
