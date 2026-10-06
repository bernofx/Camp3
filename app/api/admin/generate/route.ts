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
  const state=text((await db().prepare("SELECT value FROM tournament_settings WHERE key='tournament_state'").first<{value:string}>())?.value)||"planning";if(state!=="planning")return json({error:"Riapri la pianificazione prima di generare nuove gare."},409);
  const payload=await request.json() as {scope?:string;categoryCode?:string},scope=text(payload.scope),category=text(payload.categoryCode).toUpperCase();
  const categoryRow=await db().prepare("SELECT c.code,COALESCE(s.admission_method,'') AS admissionMethod,COALESCE(s.placement_mode,'') AS placementMode,COALESCE(s.entry_round,'') AS entryRound FROM categories c LEFT JOIN category_settings s ON s.category_code=c.code WHERE c.code=? AND c.active=1").bind(category).first<any>();
  if(!categoryRow)return json({error:"Seleziona una categoria valida."},400);if(!categoryRow.admissionMethod)return json({error:"Configura prima la modalità di ammissione della categoria."},409);
  if(!["top2","top4","top8"].includes(categoryRow.placementMode))return json({error:"Configura prima le posizioni da determinare nella fase finale."},409);
  if(!["final","semifinals","quarterfinals","round_of_16"].includes(categoryRow.entryRound))return json({error:"Configura prima il turno iniziale della fase finale."},409);
  const [groupRows,teamRows,existingRows]=await Promise.all([
    db().prepare("SELECT code,name FROM tournament_groups WHERE category_code=? ORDER BY sort_order,code").bind(category).all<any>(),
    db().prepare("SELECT code,group_code AS groupCode FROM teams WHERE category_code=? AND active=1 ORDER BY group_code,code").bind(category).all<Team>(),
    db().prepare("SELECT game_id AS gameId,phase,home_ref AS homeRef,away_ref AS awayRef FROM matches WHERE category_code=?").bind(category).all<Existing>(),
  ]);
  const groups=groupRows.results,teams=teamRows.results,existing=existingRows.results;
  try{
    if(scope==="groups"){
      if(!groups.length)return json({error:"La categoria non contiene gironi."},409);
      const unassigned=teams.filter(team=>!team.groupCode);if(unassigned.length)return json({error:`Assegna prima tutte le squadre ai gironi (${unassigned.length} mancanti).`},409);
      const invalid=groups.filter(group=>teams.filter(team=>team.groupCode===group.code).length<2);if(invalid.length)return json({error:`Servono almeno due squadre in: ${invalid.map(item=>item.name).join(", ")}.`},409);
      const known=new Set(existing.filter(item=>item.phase==="girone").map(item=>pairKey(item.homeRef,item.awayRef))),drafts:{group:string;home:string;away:string}[]=[];
      for(const group of groups){const members=teams.filter(team=>team.groupCode===group.code);for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const key=pairKey(members[i].code,members[j].code);if(!known.has(key)){known.add(key);drafts.push({group:group.code,home:members[i].code,away:members[j].code});}}}
      const ids=await nextIds(drafts.length);if(drafts.length)await db().batch([...drafts.map((item,index)=>db().prepare("INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,status) VALUES(?,?,?,'girone','','','',?,?,'draft')").bind(ids[index],category,item.group,item.home,item.away)),db().prepare("INSERT INTO tournament_settings(key,value) VALUES('plan_confirmed','0') ON CONFLICT(key) DO UPDATE SET value='0'")]);
      return json({ok:true,message:drafts.length?`Create ${drafts.length} gare di girone in bozza.`:"Il calendario dei gironi era già completo.",created:drafts.length});
    }
    if(scope==="finals"){
      if(existing.some(item=>item.phase!=="girone"))return json({error:"La fase finale della categoria è già presente. Elimina le gare finali esistenti prima di rigenerarla."},409);
      const expected=groups.reduce((sum,group)=>{const n=teams.filter(team=>team.groupCode===group.code).length;return sum+n*(n-1)/2;},0),roundRobin=existing.filter(item=>item.phase==="girone").length;
      if(roundRobin<expected)return json({error:"Genera prima tutte le gare dei gironi."},409);
      const letters=groups.map((_,index)=>String.fromCharCode(67+index)),method=categoryRow.admissionMethod,placement=categoryRow.placementMode,entry=categoryRow.entryRound;
      const drafts:{phase:string;home:string;away:string;label?:string}[]=[],links:{target:number;homeKind:string;homeRef:number|string;awayKind:string;awayRef:number|string;title:string;sectionOrder:number;order:number}[]=[];
      const addMatch=(phase:string,label:string,homeKind:string,homeRef:number|string,awayKind:string,awayRef:number|string,title:string,sectionOrder:number,order:number)=>{const direct=homeKind==="rank"&&awayKind==="rank",target=drafts.push({phase,home:direct?String(homeRef):label,away:direct?String(awayRef):"",label:direct?undefined:label})-1;links.push({target,homeKind,homeRef,awayKind,awayRef,title,sectionOrder,order});return target;};
      const pairSeeds=(seeds:string[])=>Array.from({length:seeds.length/2},(_,index)=>[seeds[index],seeds[seeds.length-1-index]] as [string,string]);
      if(method==="winners_round_robin"){
        if(placement!=="top2")return json({error:"Il girone finale tra le vincitrici determina il titolo tramite classifica: seleziona ‘Finale 1°–2° posto’ come livello di piazzamento."},409);
        for(let i=0;i<letters.length;i++)for(let j=i+1;j<letters.length;j++)drafts.push({phase:"finale-girone",home:`${letters[i]}1`,away:`${letters[j]}1`});
      }else{
        let seeds:string[]=[];
        if(method==="winners_plus_best_second"){
          if(groups.length!==3)return json({error:"‘Vincitrici + migliore seconda’ richiede esattamente tre gironi."},409);const sizes=groups.map(group=>teams.filter(team=>team.groupCode===group.code).length);if(new Set(sizes).size!==1)return json({error:"La migliore seconda è confrontabile automaticamente solo con gironi dello stesso numero di squadre."},409);seeds=["C1","D1","E1","BEST2"];
        }else{
          const depth=method==="top8_each"?8:method==="top4_each"?4:method==="top2_each"?2:0;if(!depth)return json({error:"Modalità di ammissione non supportata."},409);
          const short=groups.filter(group=>teams.filter(team=>team.groupCode===group.code).length<depth);if(short.length)return json({error:`Non ci sono ${depth} squadre in: ${short.map(item=>item.name).join(", ")}.`},409);
          for(let rank=1;rank<=depth;rank++)for(const letter of letters)seeds.push(`${letter}${rank}`);
        }
        const needed=entry==="round_of_16"?16:entry==="quarterfinals"?8:entry==="final"?2:placement==="top8"?8:4;
        if(seeds.length!==needed)return json({error:`La configurazione ammette ${seeds.length} squadre, ma ${entry==="round_of_16"?"gli ottavi richiedono 16":entry==="quarterfinals"?"i quarti richiedono 8":entry==="final"?"la finale diretta richiede 2":placement==="top8"?"le semifinali per i posti 1°–8° richiedono 8":"le semifinali richiedono 4"}.`},409);
        if(entry==="final"&&placement!=="top2")return json({error:"Con la finale diretta si possono determinare soltanto il 1° e il 2° posto."},409);
        const title=placement==="top2"?"Titolo":"Titolo e podio";let championshipSemis:number[]=[],placementSemis:number[]=[];
        if(entry==="final")addMatch("finale","FINALE 1° - 2°","rank",seeds[0],"rank",seeds[1],title,1,1);
        else if(entry==="semifinals"){
          const topSeeds=seeds.slice(0,4);championshipSemis=pairSeeds(topSeeds).map(([home,away],index)=>addMatch("fase-finale","SEMIFINALE","rank",home,"rank",away,title,1,index+1));
          if(placement==="top8"){const lowerSeeds=seeds.slice(4,8);placementSemis=pairSeeds(lowerSeeds).map(([home,away],index)=>addMatch("fase-finale","SEMIFINALE 5° - 8°","rank",home,"rank",away,"Dal 5° all’8° posto",2,index+1));}
        }else{
          const firstPhase=entry==="round_of_16"?"ottavi":"quarti",firstLabel=entry==="round_of_16"?"OTTAVO DI FINALE":"QUARTO DI FINALE";
          let round=pairSeeds(seeds).map(([home,away],index)=>addMatch(firstPhase,firstLabel,"rank",home,"rank",away,title,1,index+1));
          if(entry==="round_of_16")round=Array.from({length:4},(_,index)=>addMatch("quarti","QUARTO DI FINALE","winner",round[index*2],"winner",round[index*2+1],title,1,index+1));
          const quarterfinals=round;championshipSemis=Array.from({length:2},(_,index)=>addMatch("fase-finale","SEMIFINALE","winner",quarterfinals[index*2],"winner",quarterfinals[index*2+1],title,1,index+1));
          if(placement==="top8")placementSemis=Array.from({length:2},(_,index)=>addMatch("fase-finale","SEMIFINALE 5° - 8°","loser",quarterfinals[index*2],"loser",quarterfinals[index*2+1],"Dal 5° all’8° posto",2,index+1));
        }
        if(entry!=="final")addMatch("finale","FINALE 1° - 2°","winner",championshipSemis[0],"winner",championshipSemis[1],title,1,1);
        if(entry!=="final"&&placement!=="top2")addMatch("finale","FINALE 3° - 4°","loser",championshipSemis[0],"loser",championshipSemis[1],title,1,2);
        if(entry!=="final"&&placement==="top8"){
          addMatch("finale","FINALE 5° - 6°","winner",placementSemis[0],"winner",placementSemis[1],"Dal 5° all’8° posto",2,1);
          addMatch("finale","FINALE 7° - 8°","loser",placementSemis[0],"loser",placementSemis[1],"Dal 5° all’8° posto",2,2);
        }
      }
      const ids=await nextIds(drafts.length);await db().batch(drafts.map((item,index)=>db().prepare("INSERT INTO matches(game_id,category_code,group_code,phase,match_date,match_time,court,home_ref,away_ref,status) VALUES(?,?,? ,?,'','','',?,?,'draft')").bind(ids[index],category,"",item.phase,item.label||item.home,item.label?"":item.away)));
      if(links.length)await db().batch(links.map(link=>db().prepare("INSERT INTO final_links(target_game_id,category_code,section_title,section_order,target_order,home_kind,home_ref,away_kind,away_ref) VALUES(?,?,?,?,?,?,?,?,?)").bind(ids[link.target],category,link.title,link.sectionOrder,link.order,link.homeKind,typeof link.homeRef==="number"?ids[link.homeRef]:link.homeRef,link.awayKind,typeof link.awayRef==="number"?ids[link.awayRef]:link.awayRef)));
      await db().prepare("INSERT INTO tournament_settings(key,value) VALUES('plan_confirmed','0') ON CONFLICT(key) DO UPDATE SET value='0'").run();
      return json({ok:true,message:`Create ${drafts.length} gare della fase finale in bozza.`,created:drafts.length});
    }
    return json({error:"Operazione non valida."},400);
  }catch(error){return json({error:error instanceof Error?error.message:"Generazione non riuscita"},400);}
}
