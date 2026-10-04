import { db, requireUser } from "../../../lib/auth";
import { ensureDatabase } from "../../../lib/database";
import { buildXlsx } from "../../../lib/xlsx";

type Match = {gameId:string;category:string;groupCode:string;phase:string;date:string;time:string;court:string;homeRef:string;awayRef:string;scorekeeper:string;referee:string;courtManager:string;result:string;set1:string;set2:string;set3:string;status:string};
type Link = {targetGameId:string;categoryCode:string;sectionTitle:string;sectionOrder:number;targetOrder:number;homeKind:string;homeRef:string;awayKind:string;awayRef:string};
const c=(value:string|number,style=0)=>({value,style});
const styleByCategory:Record<string,number>={U13:4,U14:5,U15:6,U17:7};
const prettyDate=(value:string)=>{const [y,m,d]=value.split("-");return `${d}.${m}.${y}`;};
const matchup=(match:Match)=>match.awayRef?`${match.homeRef} - ${match.awayRef}`:match.homeRef;
const start=(match:Match)=>{const [h,m]=match.time.split(":").map(Number);return h*60+m;};
const intersect=(a:Set<string>,b:Set<string>)=>[...a].some(value=>b.has(value));
const participants=(match:Match)=>new Set([match.homeRef,match.awayRef]
  .filter(value=>/^\d+$|^[A-Z][A-Z0-9_-]*\d+$/.test(value))
  .map(value=>/^\d+$/.test(value)?value:`${match.category}:${value}`));
const assignedStaff=(name:string)=>Boolean(name)&&!/^DA\s+DEFIN/i.test(name.trim());
const staffKey=(name:string,match:Match)=>/^[A-Z][A-Z0-9_-]*\d+$/.test(name)?`${match.category}:${name}`:name;

function checks(matches:Match[],duration:number,links:Link[],courts:Set<string>){
  const issues:{level:string;type:string;message:string}[]=[];
  for(const match of matches){
    if(!courts.has(match.court))issues.push({level:"ERRORE",type:"Campo",message:`Gara ${match.gameId}: campo ${match.court} non configurato.`});
    if(!assignedStaff(match.scorekeeper))issues.push({level:"AVVISO",type:"Staff",message:`Gara ${match.gameId}: refertista non assegnato.`});
    if(!assignedStaff(match.referee))issues.push({level:"AVVISO",type:"Staff",message:`Gara ${match.gameId}: arbitro non assegnato.`});
    const score=match.result.match(/^(\d+)\s*[-–]\s*(\d+)$/),sets=[match.set1,match.set2,match.set3].filter(Boolean);
    if(score&&sets.length&&Number(score[1])+Number(score[2])!==sets.length)issues.push({level:"ERRORE",type:"Risultato",message:`Gara ${match.gameId}: risultato ${match.result} non coerente con ${sets.length} parziali.`});
  }
  for(let i=0;i<matches.length;i++)for(let j=i+1;j<matches.length;j++){
    const a=matches[i],b=matches[j];if(a.date!==b.date||start(a)>=start(b)+duration||start(b)>=start(a)+duration)continue;
    if(a.court===b.court)issues.push({level:"ERRORE",type:"Campo",message:`Gare ${a.gameId} e ${b.gameId}: sovrapposizione sul campo ${a.court}.`});
    if(intersect(participants(a),participants(b)))issues.push({level:"ERRORE",type:"Squadra",message:`Gare ${a.gameId} e ${b.gameId}: stessa squadra o posizione di classifica nella stessa fascia.`});
    const peopleA=[a.scorekeeper,a.referee,a.courtManager].filter(assignedStaff),peopleB=[b.scorekeeper,b.referee,b.courtManager].filter(assignedStaff),busy=peopleA.find(name=>peopleB.some(other=>staffKey(other,b)===staffKey(name,a)));
    if(busy)issues.push({level:"ERRORE",type:"Staff",message:`${busy}: assegnazione contemporanea alle gare ${a.gameId} e ${b.gameId}.`});
  }
  const byId=new Map(matches.map(match=>[match.gameId,match]));
  for(const link of links){const target=byId.get(link.targetGameId);for(const [kind,ref] of [[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]])if(kind==="winner"||kind==="loser"){const source=byId.get(ref);if(!source)issues.push({level:"ERRORE",type:"Finali",message:`Gara ${link.targetGameId}: gara sorgente ${ref} inesistente.`});else if(target&&(source.date>target.date||source.date===target.date&&start(source)>=start(target)))issues.push({level:"ERRORE",type:"Finali",message:`Gara ${link.targetGameId}: la sorgente ${ref} non la precede.`});}}
  return issues;
}

export async function GET(request:Request){
  await ensureDatabase();if(!(await requireUser(request,["admin"])))return Response.json({error:"Non autorizzato"},{status:403});
  const [categoryRows,groupRows,teamRows,courtRows,settingRows,matchRows,linkRows]=await Promise.all([
    db().prepare("SELECT code,name,color,sort_order AS sortOrder FROM categories WHERE active=1 ORDER BY sort_order,code").all<any>(),
    db().prepare("SELECT category_code AS categoryCode,code,name,sort_order AS sortOrder FROM tournament_groups ORDER BY category_code,sort_order,code").all<any>(),
    db().prepare("SELECT code,name,category_code AS categoryCode,group_code AS groupCode FROM teams WHERE active=1 ORDER BY category_code,group_code,name").all<any>(),
    db().prepare("SELECT code,name,sort_order AS sortOrder FROM courts WHERE active=1 ORDER BY sort_order,code").all<any>(),
    db().prepare("SELECT key,value FROM tournament_settings").all<any>(),
    db().prepare(`SELECT game_id AS gameId,category_code AS category,group_code AS groupCode,phase,match_date AS date,match_time AS time,court,home_ref AS homeRef,away_ref AS awayRef,scorekeeper,referee,court_manager AS courtManager,result,set_1 AS set1,set_2 AS set2,set_3 AS set3,status FROM matches ORDER BY match_date,match_time,game_id`).all<Match>(),
    db().prepare(`SELECT target_game_id AS targetGameId,category_code AS categoryCode,section_title AS sectionTitle,section_order AS sectionOrder,target_order AS targetOrder,home_kind AS homeKind,home_ref AS homeRef,away_kind AS awayKind,away_ref AS awayRef FROM final_links ORDER BY category_code,section_order,target_order`).all<Link>(),
  ]);
  const categories=categoryRows.results,groups=groupRows.results,teams=teamRows.results,courts=courtRows.results,matches=matchRows.results,links=linkRows.results,settings=Object.fromEntries(settingRows.results.map(item=>[item.key,item.value])),duration=Number(settings.match_duration_minutes||70),sheets:any[]=[];

  const programRows:any[][]=[[c("PROGRAMMA GARE VOLLEYSTARS 2026",1)], [c("DATA",2),c("ORARIO",2),...courts.map(court=>c(court.name.toUpperCase(),3))]];
  const slots=[...new Set<string>(matches.map(match=>`${match.date}|${match.time}`))].sort();
  for(const slot of slots){const [date,time]=slot.split("|");programRows.push([c(prettyDate(date),2),c(time,2),...courts.map(court=>{const match=matches.find(item=>item.date===date&&item.time===time&&item.court===court.code);if(!match)return c("",8);const details=[`${matchup(match)} / ${match.referee||"ARBITRO DA DEFINIRE"}`,`Referto: ${match.scorekeeper||"da definire"}`,match.courtManager?`Responsabile: ${match.courtManager}`:""].filter(Boolean).join("\n");return c(details,styleByCategory[match.category]||2);})]);}
  programRows.push([], [c("ELENCO SQUADRE",1)]);
  for(const category of categories){programRows.push([c(`${category.code} - ${category.name}`,styleByCategory[category.code]||2)]);for(const group of groups.filter(item=>item.categoryCode===category.code)){programRows.push([c(`Girone ${group.code}`,2),...teams.filter(team=>team.categoryCode===category.code&&team.groupCode===group.code).map(team=>c(`${team.code} = ${team.name}`,styleByCategory[category.code]||2))]);}}
  sheets.push({name:"Programma campi",rows:programRows,widths:[15,10,...courts.map(()=>28)],merges:[`A1:${String.fromCharCode(66+courts.length)}1`],freezeRow:2});

  for(const category of categories){
    const rows:any[][]=[[c(`VOLLEYSTARS 2026 - ${category.code} ${category.name}`,1)],[],["DATA","ORARIO","N. GARA","CAMPO","GARA","REFERTO","ARBITRO","RESP. CAMPO","RISULTATO","1° SET","2° SET","3° SET","FASE"].map(value=>c(value,2))];
    for(const match of matches.filter(item=>item.category===category.code))rows.push([c(prettyDate(match.date),2),c(match.time,2),c(match.gameId,2),c(match.court,2),c(matchup(match),styleByCategory[category.code]||2),match.scorekeeper,match.referee,match.courtManager,match.result,match.set1,match.set2,match.set3,match.phase]);
    sheets.push({name:category.code,rows,widths:[14,10,10,9,30,18,18,20,12,12,12,12,15],merges:["A1:M1"],freezeRow:3});
  }

  const linkRowsOut:any[][]=[[c("ACCOPPIAMENTI FASE FINALE",1)],[],["Categoria","Sezione","Gara destinazione","Origine squadra 1","Riferimento 1","Origine squadra 2","Riferimento 2"].map(value=>c(value,2))];
  for(const link of links)linkRowsOut.push([link.categoryCode,link.sectionTitle,link.targetGameId,link.homeKind,link.homeRef,link.awayKind,link.awayRef]);
  sheets.push({name:"Accoppiamenti",rows:linkRowsOut,widths:[12,26,18,20,18,20,18],merges:["A1:G1"],freezeRow:3});

  const issues=checks(matches,duration,links,new Set(courts.map(court=>court.code))),checkRows:any[][]=[[c("CONTROLLO CONFIGURAZIONE",1)],[],[c("Durata partite",2),c(`${duration} minuti`,2)],[c("Campi disponibili",2),c(courts.map(court=>court.name).join(", "),2)],[c("Partite",2),c(matches.length,2)],[c("Esito",2),c(issues.some(issue=>issue.level==="ERRORE")?"DA CORREGGERE":issues.length?"CON AVVISI":"CONFIGURAZIONE COERENTE",issues.some(issue=>issue.level==="ERRORE")?10:11)],[],["Livello","Tipo","Dettaglio"].map(value=>c(value,2))];
  if(issues.length)for(const issue of issues)checkRows.push([c(issue.level,issue.level==="ERRORE"?10:8),issue.type,issue.message]);else checkRows.push([c("OK",11),"Calendario","Nessuna anomalia rilevata."]);
  sheets.push({name:"Controlli",rows:checkRows,widths:[16,18,90],merges:["A1:C1"],freezeRow:8});

  const file=buildXlsx(sheets),date=new Date().toISOString().slice(0,10);
  return new Response(file,{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="VolleyStars_configurazione_${date}.xlsx"`,"cache-control":"no-store"}});
}
