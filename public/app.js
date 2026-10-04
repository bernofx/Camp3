(function () {
  const config = window.VOLLEYSTARS_CONFIG;
  const staticData = window.VOLLEYSTARS_STATIC;
  let matches = staticData.matches.map(x => ({...x}));
  let notices = [];
  let sheetStandings = {};
  let currentUser = null;
  let categoriesCatalog = [];
  let groupsCatalog = [];
  let courtsCatalog = [];
  let staffCatalog = [];
  let settingsCatalog = {match_duration_minutes:"70"};
  let finalLinksCatalog = [];
  let teamsCatalog = Object.entries(staticData.teams).map(([code,name])=>({code,name,categoryCode:`U${code.slice(0,2)}`,groupCode:""}));
  let teamNames = {...staticData.teams};
  let toastTimer;
  let syncing = false;
  const selectionKey = "volleystars-v1-db-selections";
  let qualificationGroups = {
    U13:{C:["131","132","133","134"],D:["135","136","137","138"]},
    U14:{C:["141","142","143","144"]},
    U15:{C:["161","162","163","164"],D:["165","166","167","168"]},
    U17:{C:["181","182","183","184"],D:["185","186","187","188"]}
  };
  let finalFlows = {};
  let finalBrackets = {};

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalizeMatchup = value => String(value || "").replace(/\s*[-–]\s*/g," - ").trim();
  const dateTime = match => new Date(`${match.date}T${match.time}:00+02:00`);
  const dateLabel = value => new Intl.DateTimeFormat("it-IT", {weekday:"long",day:"numeric",month:"long"}).format(new Date(`${value}T12:00:00+02:00`));

  function parseCsv(text) {
    const rows=[]; let row=[], cell="", quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i], next=text[i+1];
      if(ch==='"' && quoted && next==='"'){cell+='"';i++;}
      else if(ch==='"'){quoted=!quoted;}
      else if(ch===',' && !quoted){row.push(cell);cell="";}
      else if((ch==='\n'||ch==='\r') && !quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>v!==""))rows.push(row);row=[];cell="";}
      else cell+=ch;
    }
    if(cell||row.length){row.push(cell);rows.push(row);}
    return rows;
  }

  function sheetDate(raw, fallback) {
    const value=String(raw||"").toLowerCase();
    const m=value.match(/(\d{1,2})\.(\d{1,2})/);
    return m ? `2026-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : fallback;
  }

  function parseSheetCsv(category, text) {
    let currentDate="";
    return parseCsv(text).slice(3).map(row => {
      currentDate=sheetDate(row[0],currentDate);
      const gameId=String(row[2]||"").trim();
      if(!/^\d{4}$/.test(gameId) || !currentDate) return null;
      return {category,date:currentDate,time:String(row[1]||"").padStart(5,"0"),gameId,court:String(row[3]||""),matchup:normalizeMatchup(row[4]),scorekeeper:String(row[5]||""),referee:String(row[6]||""),result:String(row[7]||""),sets:[row[8]||"",row[9]||"",row[10]||""]};
    }).filter(Boolean);
  }

  function parseSheetRows(category, rows) {
    let currentDate="";
    return (rows||[]).slice(3).map(row=>{
      currentDate=sheetDate(row[0],currentDate);
      const gameId=String(row[2]||"").trim();
      if(!/^\d{4}$/.test(gameId)||!currentDate)return null;
      return {category,date:currentDate,time:String(row[1]||"").padStart(5,"0"),gameId,court:String(row[3]||""),matchup:normalizeMatchup(row[4]),scorekeeper:String(row[5]||""),referee:String(row[6]||""),result:String(row[7]||""),sets:[row[8]||"",row[9]||"",row[10]||""]};
    }).filter(Boolean);
  }

  function markerValue(value) {
    const text=String(value||"").trim();
    if(/^\d+$/.test(text))return Number(text);
    return (text.match(/x/gi)||[]).length;
  }

  function parseStandingsRows(category, rows) {
    const groups={}; let group="";
    (rows||[]).forEach(row=>{
      const label=String(row[1]||"").trim();
      if(/girone\s+a/i.test(label)){group="C";groups[group]=[];return;}
      if(/girone\s+b/i.test(label)){group="D";groups[group]=[];return;}
      const team=label.match(/^(1\d{2})\s*=/);
      if(!group||!team)return;
      groups[group].push({code:team[1],played:markerValue(row[2]),wins:markerValue(row[3]),setsFor:markerValue(row[5]),setsAgainst:markerValue(row[6]),points:markerValue(row[7])});
    });
    return groups;
  }

  function tableValue(cell) {
    if (!cell) return "";
    if (cell.f != null) return String(cell.f);
    if (cell.v == null) return "";
    return String(cell.v);
  }

  function parseGvizTable(category, table) {
    let currentDate="";
    return (table?.rows || []).map(entry => {
      const row=(entry.c || []).map(tableValue);
      currentDate=sheetDate(row[0],currentDate);
      const gameId=String(row[2]||"").trim();
      if(!/^\d{4}$/.test(gameId) || !currentDate) return null;
      return {category,date:currentDate,time:String(row[1]||"").padStart(5,"0"),gameId,court:String(row[3]||""),matchup:normalizeMatchup(row[4]),scorekeeper:String(row[5]||""),referee:String(row[6]||""),result:String(row[7]||""),sets:[row[8]||"",row[9]||"",row[10]||""]};
    }).filter(Boolean);
  }

  function gvizRows(table){return (table?.rows||[]).map(entry=>(entry.c||[]).map(tableValue));}

  function parseNoticeTable(table) {
    const enabled = value => ["si","sì","true","1","yes"].includes(String(value || "").trim().toLowerCase());
    return (table?.rows || []).map(entry => {
      const row=(entry.c || []).map(tableValue);
      return {title:String(row[0]||"").trim(),message:String(row[1]||"").trim(),accent:enabled(row[2]),active:enabled(row[3])};
    }).filter(item=>item.active && item.title && item.message);
  }

  function fetchGvizTable(label, gid, headers) {
    return new Promise((resolve,reject) => {
      const callback=`vsGviz_${label}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement("script");
      const timer=setTimeout(()=>finish(new Error(`${label}: timeout`)),10000);
      function finish(error,value){clearTimeout(timer);delete window[callback];script.remove();error?reject(error):resolve(value);}
      window[callback]=payload=>payload?.status==="error"?finish(new Error(`${label}: risposta Google non valida`)):finish(null,payload.table);
      script.onerror=()=>finish(new Error(`${label}: foglio non accessibile`));
      script.src=`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/gviz/tq?tqx=responseHandler:${callback}&headers=${headers}&gid=${gid}`;
      document.head.appendChild(script);
    });
  }

  function fetchGviz(category, gid) {
    return fetchGvizTable(category,gid,3).then(table=>({matches:parseGvizTable(category,table),standings:parseStandingsRows(category,gvizRows(table))}));
  }

  async function fetchLiveMatches() {
    const response=await fetch("/api/data",{cache:"no-store"});
    if(!response.ok)throw new Error("Database non disponibile");
    const payload=await response.json();
    if(!payload.ok||!Array.isArray(payload.matches))throw new Error("Dati non validi");
    categoriesCatalog=payload.categories||[];groupsCatalog=payload.groups||[];teamsCatalog=payload.teams||[];courtsCatalog=payload.courts||[];staffCatalog=payload.staff||[];settingsCatalog=payload.settings||{match_duration_minutes:"70"};finalLinksCatalog=payload.finalLinks||[];
    teamNames=Object.fromEntries(teamsCatalog.map(team=>[team.code,team.name]));
    qualificationGroups={};
    categoriesCatalog.forEach(category=>{
      const groups=groupsCatalog.filter(group=>group.categoryCode===category.code);
      qualificationGroups[category.code]={};
      groups.forEach((group,index)=>{const codes=teamsCatalog.filter(team=>team.categoryCode===category.code&&team.groupCode===group.code).map(team=>team.code),legacy=String.fromCharCode(67+index);qualificationGroups[category.code][legacy]=codes;});
    });
    finalFlows={};finalBrackets={};
    finalLinksCatalog.forEach(link=>{
      (finalFlows[link.categoryCode]??={})[link.targetGameId]={home:[link.homeKind,link.homeRef],away:[link.awayKind,link.awayRef]};
      const sections=finalBrackets[link.categoryCode]??=[];let section=sections.find(item=>item.title===link.sectionTitle);
      if(!section){section={title:link.sectionTitle,sectionOrder:Number(link.sectionOrder)||0,semis:[],finals:[]};sections.push(section);finalBrackets[link.categoryCode]=sections;}
      [[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]].forEach(([kind,ref])=>{if((kind==="winner"||kind==="loser")&&!section.semis.includes(ref))section.semis.push(ref);});
      section.finals.push({id:link.targetGameId,order:Number(link.targetOrder)||0});
    });
    Object.values(finalBrackets).forEach(sections=>{sections.sort((a,b)=>a.sectionOrder-b.sectionOrder);sections.forEach(section=>{section.finals.sort((a,b)=>a.order-b.order);section.finals=section.finals.map(item=>item.id);});});
    sheetStandings={};
    return payload.matches.map(match=>({category:match.category,date:match.date,time:match.time,gameId:match.gameId,court:match.court,matchup:match.awayRef?`${match.homeRef} - ${match.awayRef}`:match.homeRef,scorekeeper:match.scorekeeper,referee:match.referee,courtManager:match.courtManager,result:match.result,sets:[match.set1||"",match.set2||"",match.set3||""],phase:match.phase,status:match.status,groupCode:match.groupCode}));
  }

  async function fetchNotices() {
    if (config.noticesGid == null) return [];
    return parseNoticeTable(await fetchGvizTable("notices",config.noticesGid,1));
  }

  function mergeLive(live) {
    matches=live.map(item=>({...item}));
  }

  function matchScore(match) {
    const direct=String(match.result||"").match(/(\d+)\s*[-–]\s*(\d+)/);
    if(direct)return [+direct[1],+direct[2]];
    return null;
  }

  function groupStandings(codes,sourceMatches=matches,category="",groupKey="") {
    const codeSet=new Set(codes);
    const stats=new Map(codes.map(code=>[code,{code,played:0,points:0,wins:0,setsFor:0,setsAgainst:0,pointsFor:0,pointsAgainst:0}]));
    sourceMatches.forEach(match=>{
      const found=teamCodes(match.matchup), score=matchScore(match);
      if(found.length!==2||!found.every(code=>codeSet.has(code))||!score||score[0]===score[1])return;
      const [left,right]=found, a=stats.get(left), b=stats.get(right);
      a.played++;b.played++;a.setsFor+=score[0];a.setsAgainst+=score[1];b.setsFor+=score[1];b.setsAgainst+=score[0];
      (match.sets||[]).forEach(set=>{const points=String(set).match(/(\d+)\s*[-–]\s*(\d+)/);if(points){a.pointsFor+=+points[1];a.pointsAgainst+=+points[2];b.pointsFor+=+points[2];b.pointsAgainst+=+points[1];}});
      const winner=score[0]>score[1]?a:b, loser=winner===a?b:a;winner.wins++;
      if(Math.abs(score[0]-score[1])===1){winner.points+=2;loser.points+=1;}else winner.points+=3;
    });
    const official=new Map((sheetStandings[category]?.[groupKey]||[]).map(item=>[item.code,item]));
    official.forEach((item,code)=>{if(stats.has(code))Object.assign(stats.get(code),item);});
    return [...stats.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||(b.setsFor-b.setsAgainst)-(a.setsFor-a.setsAgainst)||b.setsFor-a.setsFor||pointRatio(b)-pointRatio(a)||a.code.localeCompare(b.code));
  }

  function pointRatio(item){return item.pointsAgainst?item.pointsFor/item.pointsAgainst:(item.pointsFor?Number.POSITIVE_INFINITY:0);}
  function ratioText(item){const ratio=pointRatio(item);return ratio===Number.POSITIVE_INFINITY?"∞":item.pointsFor||item.pointsAgainst?ratio.toFixed(3).replace(".",","):"—";}

  function rankGroup(codes,sourceMatches=matches,category="",groupKey="") {
    const codeSet=new Set(codes);
    const groupMatches=sourceMatches.filter(match=>{const found=teamCodes(match.matchup);return found.length===2&&found.every(code=>codeSet.has(code));});
    const expected=(codes.length*(codes.length-1))/2;
    if(groupMatches.length!==expected||groupMatches.some(match=>!matchScore(match)))return null;
    return groupStandings(codes,sourceMatches,category,groupKey).map(item=>item.code);
  }

  function qualificationMap(category,sourceMatches=matches) {
    const map=new Map();
    Object.entries(qualificationGroups[category]||{}).forEach(([letter,codes])=>{
      const ranking=rankGroup(codes,sourceMatches,category,letter);
      if(ranking)ranking.forEach((code,index)=>map.set(`${letter}${index+1}`,code));
    });
    return map;
  }

  function resolveQualificationText(value,category,sourceMatches=matches) {
    const qualified=qualificationMap(category,sourceMatches);
    return String(value||"").replace(/\b([A-Z][A-Z0-9_-]*\d+)\b/g,placeholder=>{
      if(qualified.has(placeholder))return qualified.get(placeholder);
      const parts=placeholder.match(/^(.+?)(\d+)$/),groups=groupsCatalog.filter(group=>group.categoryCode===category),index=parts&&groups.findIndex(group=>group.code===parts[1]);
      return index>=0?qualified.get(`${String.fromCharCode(67+index)}${parts[2]}`)||placeholder:placeholder;
    });
  }

  function stageParticipant(gameId,side,category,sourceMatches=matches) {
    const source=sourceMatches.find(match=>match.gameId===gameId), score=source&&matchScore(source);
    if(!source||!score||score[0]===score[1])return null;
    const codes=teamCodes(resolveQualificationText(source.matchup,category,sourceMatches));
    if(codes.length!==2)return null;
    const winner=score[0]>score[1]?codes[0]:codes[1], loser=winner===codes[0]?codes[1]:codes[0];
    return side==="winner"?winner:loser;
  }

  function resolvedMatchup(match,sourceMatches=matches) {
    const flow=finalFlows[match.category]?.[match.gameId];
    if(flow){
      const resolve=([kind,ref])=>(kind==="winner"||kind==="loser")?stageParticipant(ref,kind,match.category,sourceMatches):resolveQualificationText(ref,match.category,sourceMatches);
      const a=resolve(flow.home),b=resolve(flow.away);if(a&&b)return `${a} - ${b}`;
    }
    return resolveQualificationText(match.matchup,match.category,sourceMatches);
  }

  function card(match) {
    const result=resultText(match);
    const categoryClass=`category-${String(match.category).toLowerCase()}`;
    const sets=(match.sets||[]).map(value=>String(value||"").trim()).filter(score=>{const pair=score.match(/(\d+)\s*[-–]\s*(\d+)/);return pair&&(+pair[1]>0||+pair[2]>0);});
    const hasDetails=sets.length>0&&(Boolean(result)||dateTime(match)<=new Date());
    const interaction=hasDetails?'role="button" tabindex="0" aria-expanded="false" aria-label="Mostra i parziali della gara '+esc(match.gameId)+'"':'';
    const setDetails=hasDetails?`<span class="details-label">Parziali <span class="card-chevron" aria-hidden="true">⌄</span></span><div class="set-details" hidden>${sets.map((score,index)=>`<span><strong>${index+1}° set</strong>${esc(score)}</span>`).join("")}</div>`:"";
    const manager=match.courtManager?` · Responsabile: ${esc(match.courtManager)}`:"";
    const edit=currentUser?`<button class="edit-result" type="button" data-edit-game="${esc(match.gameId)}" aria-label="Modifica risultato gara ${esc(match.gameId)}">✎</button>`:"";
    return `<article class="match-card${hasDetails?" has-details":""}" data-game-id="${esc(match.gameId)}" ${interaction}><div class="time-block">${esc(match.time)}<small>Campo ${esc(match.court)}</small><small>Gara ${esc(match.gameId)}</small></div><div class="match-main"><strong>${esc(expandMatchup(resolvedMatchup(match)))}</strong>${result?`<p class="result">${esc(result)}</p>`:""}<p>Referto: ${esc(match.scorekeeper||"da definire")} · Arbitro: ${esc(match.referee||"da definire")}${manager}</p></div><span class="category-chip ${esc(categoryClass)}">${esc(match.category)}</span>${setDetails}${edit}</article>`;
  }

  function toggleMatchCard(card){
    const details=card.querySelector(".set-details");
    if(!details)return;
    const expanded=card.getAttribute("aria-expanded")==="true";
    card.setAttribute("aria-expanded",String(!expanded));
    card.classList.toggle("expanded",!expanded);
    details.hidden=expanded;
  }

  function resultText(match) { return String(match.result || "").trim(); }

  function expandMatchup(value) {
    return value.replace(/\b(1\d{2})\b/g, code => teamNames[code] ? `${teamNames[code]} (${code})` : code);
  }

  function renderAgenda() {
    const filter=$("categoryFilter").value;
    const court=$("courtFilter").value;
    const upcomingOnly=$("upcomingOnly").checked;
    const now=new Date();
    const selected=m=>(filter==="all"||m.category===filter) && (court==="all"||String(m.court)===court);
    const visible=matches.filter(m=>selected(m) && (!upcomingOnly || dateTime(m)>=now)).sort((a,b)=>dateTime(a)-dateTime(b));
    let previous="";
    $("upcomingList").innerHTML=visible.map(m=>{const divider=m.date!==previous?`<div class="date-divider">${esc(dateLabel(m.date))}</div>`:"";previous=m.date;return divider+card(m);}).join("") || '<div class="empty">Nessun appuntamento disponibile.</div>';
  }

  function teamCodes(matchup){return String(matchup).match(/\b1\d{2}\b/g)||[];}
  function resultOutcome(match, code){
    const codes=teamCodes(resolvedMatchup(match)); if(codes.length!==2) return null;
    const parts=String(match.result).match(/(\d+)\s*[-–]\s*(\d+)/);if(!parts)return null;
    const side=codes.indexOf(code); if(side<0)return null; const ours=+(parts[side+1]), theirs=+(parts[side===0?2:1]); return ours===theirs?"draw":ours>theirs?"win":"loss";
  }

  function renderTeams(){
    const code=$("teamSelect").value; const selected=matches.filter(m=>teamCodes(resolvedMatchup(m)).includes(code)).sort((a,b)=>dateTime(a)-dateTime(b));
    const completed=selected.map(m=>resultOutcome(m,code)).filter(Boolean); const wins=completed.filter(x=>x==="win").length;
    $("teamSummary").innerHTML=`<div class="stat"><strong>${completed.length}</strong><span>giocate</span></div><div class="stat"><strong>${wins}</strong><span>vinte</span></div><div class="stat"><strong>${selected.length-completed.length}</strong><span>da giocare</span></div>`;
    let previous=""; $("teamMatches").innerHTML=selected.map(m=>{const d=m.date!==previous?`<div class="date-divider">${esc(dateLabel(m.date))}</div>`:"";previous=m.date;return d+card(m);}).join("")||'<div class="empty">Nessuna partita trovata.</div>';
  }

  function populateTeams(){
    const categoryByCode=new Map();
    teamsCatalog.forEach(team=>categoryByCode.set(team.code,team.categoryCode));
    const categoryOrder={U13:13,U14:14,U15:15,U17:17};
    $("teamSelect").innerHTML=Object.entries(teamNames)
      .sort((a,b)=>(categoryOrder[categoryByCode.get(a[0])]||99)-(categoryOrder[categoryByCode.get(b[0])]||99)||a[1].localeCompare(b[1],"it")||a[0].localeCompare(b[0]))
      .map(([code,name])=>`<option value="${code}">${esc(categoryByCode.get(code)||"—")} · ${esc(name)} · ${code}</option>`).join("");
  }

  function renderStandings(){
    const category=$("standingsCategory").value;
    const groups=qualificationGroups[category]||{};
    $("standingsList").innerHTML=Object.entries(groups).map(([letter,codes])=>{
      const rows=groupStandings(codes,matches,category,letter).map((item,index)=>`<tr><td class="standing-position">${index+1}</td><td><strong>${esc(teamNames[item.code]||item.code)}</strong><small>${esc(item.code)}</small></td><td>${item.played}</td><td>${item.wins}</td><td>${item.setsFor}-${item.setsAgainst}</td><td class="standing-ratio">${ratioText(item)}</td><td class="standing-points">${item.points}</td></tr>`).join("");
      const groupName=letter==="C"?"A":letter==="D"?"B":letter;
      return `<section class="standings-card"><h3>Girone ${esc(groupName)}</h3><div class="table-scroll"><table><thead><tr><th>#</th><th>Squadra</th><th>G</th><th>V</th><th>Set</th><th title="Quoziente punti fatti/punti subiti">QP</th><th>Pt</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }).join("")||'<div class="empty">Classifica non disponibile.</div>';
  }

  function bracketMatch(gameId,kind){
    const match=matches.find(item=>item.gameId===gameId);
    if(!match)return "";
    const matchup=expandMatchup(resolvedMatchup(match));
    const flow=finalFlows[match.category]?.[gameId];
    const unresolved=flow&&/^FINALE\b/i.test(matchup);
    const teams=unresolved
      ? [flow.home,flow.away].map(([kind,ref])=>kind==="winner"?`Vincente gara ${ref}`:kind==="loser"?`Perdente gara ${ref}`:ref)
      : matchup.split(/\s+-\s+/);
    const score=matchScore(match);
    const isFinal=/^Finale\b/i.test(kind), isChampionship=/1°\s*-\s*2°/.test(kind);
    const rows=teams.map((team,index)=>{
      const winner=score&&score[index]>score[1-index];
      const badge=winner&&isFinal?`<small>${isChampionship?"🏆 Campione":"✓ Vincente"}</small>`:"";
      return `<div class="bracket-team${winner?" winner":""}${winner&&isChampionship?" champion":""}"><span>${esc(team)}${badge}</span>${score?`<strong>${score[index]}</strong>`:""}</div>`;
    }).join("");
    return `<article class="bracket-match"><div class="bracket-meta"><span>${esc(kind)}</span><span>${esc(match.time)} · gara ${esc(match.gameId)}</span></div>${rows}</article>`;
  }

  function finalLabel(match){
    const label=String(match?.matchup||"").match(/FINALE\s+(.+)/i);
    return label?`Finale ${label[1].toLowerCase()}`:"Finale";
  }

  function renderFinals(){
    const category=$("finalsCategory").value;
    const sections=finalBrackets[category]||[];
    $("finalsBracket").innerHTML=sections.map(section=>{
      const semis=section.semis.map(id=>bracketMatch(id,"Semifinale")).join("");
      const finals=section.finals.map(id=>bracketMatch(id,finalLabel(matches.find(match=>match.gameId===id)))).join("");
      const titleFinal=section.finals.find(id=>/FINALE\s+1°\s*-\s*2°/i.test(matches.find(match=>match.gameId===id)?.matchup||""));
      const championCode=titleFinal&&stageParticipant(titleFinal,"winner",category);
      const champion=championCode?`<div class="champion-banner"><span aria-hidden="true">🏆</span><div><small>Campione ${esc(category)}</small><strong>${esc(teamNames[championCode]||championCode)}</strong></div></div>`:"";
      return `<section class="bracket-section"><h3>${esc(section.title)}</h3>${champion}<div class="bracket-headings"><span>Semifinali</span><span>Finali</span></div><div class="bracket-grid"><div class="bracket-round">${semis}</div><div class="bracket-lines" aria-hidden="true"><i></i></div><div class="bracket-round">${finals}</div></div></section>`;
    }).join("")||'<div class="empty">Fase finale non prevista.</div>';
  }

  function populateCategorySelectors(){
    const categories=categoriesCatalog.length?categoriesCatalog:[{code:"U13"},{code:"U14"},{code:"U15"},{code:"U17"}];
    const options=categories.map(item=>`<option value="${esc(item.code)}">${esc(item.code)}${item.name&&item.name!==item.code?` · ${esc(item.name)}`:""}</option>`).join("");
    const agendaValue=$("categoryFilter").value;
    $("categoryFilter").innerHTML=`<option value="all">Tutte</option>${options}`;
    if([...$("categoryFilter").options].some(option=>option.value===agendaValue))$("categoryFilter").value=agendaValue;
    ["standingsCategory","finalsCategory"].forEach(id=>{const select=$(id),value=select.value;select.innerHTML=options;if([...select.options].some(option=>option.value===value))select.value=value;});
    document.querySelectorAll('#adminView select[name="categoryCode"]').forEach(select=>{const value=select.value;select.innerHTML=options;if([...select.options].some(option=>option.value===value))select.value=value;});
    const courtOptions=courtsCatalog.map(item=>`<option value="${esc(item.code)}">${esc(item.name||`Campo ${item.code}`)}</option>`).join("");
    const filterValue=$("courtFilter").value;$("courtFilter").innerHTML=`<option value="all">Tutti</option>${courtOptions}`;if([...$("courtFilter").options].some(option=>option.value===filterValue))$("courtFilter").value=filterValue;
    document.querySelectorAll('#adminView select[name="court"]').forEach(select=>{const value=select.value;select.innerHTML=courtOptions;if([...select.options].some(option=>option.value===value))select.value=value;});
    const staffOptions=(role)=>`<option value="">Da definire</option>${staffCatalog.filter(item=>item[role]).map(item=>`<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
    [["scorekeeper","canScorekeeper"],["referee","canReferee"],["courtManager","canCourtManager"]].forEach(([name,role])=>document.querySelectorAll(`#adminView select[name="${name}"]`).forEach(select=>{const value=select.value;select.innerHTML=staffOptions(role);if([...select.options].some(option=>option.value===value))select.value=value;}));
  }

  function setAuth(user){
    currentUser=user?.role==="admin"?user:null;
    $("adminTab").hidden=!currentUser;
    document.body.classList.toggle("admin-visible",Boolean(currentUser));
    $("loginButton").textContent=currentUser?`Esci · ${currentUser.username}`:"Accesso admin";
    renderAgenda();renderTeams();
    if(currentUser)renderAdmin();
  }

  async function loadSession(){
    try{const response=await fetch("/api/auth/session",{cache:"no-store"});const payload=await response.json();setAuth(payload.user||null);}catch{setAuth(null);}
  }

  function openResultEditor(gameId){
    const match=matches.find(item=>item.gameId===gameId);if(!match||!currentUser)return;
    const form=$("resultForm");form.elements.gameId.value=match.gameId;form.elements.category.value=match.category;form.elements.result.value=match.result||"";form.elements.set1.value=match.sets?.[0]||"";form.elements.set2.value=match.sets?.[1]||"";form.elements.set3.value=match.sets?.[2]||"";
    $("resultDialogTitle").textContent=`Gara ${match.gameId} · ${expandMatchup(resolvedMatchup(match))}`;$("resultError").textContent="";$("resultDialog").showModal();
  }

  async function apiPost(url,body){
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const payload=await response.json().catch(()=>({error:"Risposta non valida"}));if(!response.ok)throw new Error(payload.error||"Operazione non riuscita");return payload;
  }

  function adminRow(label,entity,key){return `<div><span>${label}</span><span class="admin-row-actions"><button type="button" data-admin-edit="${entity}" data-admin-key="${esc(key)}">Modifica</button><button type="button" data-admin-delete="${entity}" data-admin-key="${esc(key)}">Elimina</button></span></div>`;}

  function renderAdmin(){
    if(!currentUser)return;
    populateCategorySelectors();
    $("settingsForm").elements.matchDurationMinutes.value=settingsCatalog.match_duration_minutes||70;
    $("courtAdminList").innerHTML=courtsCatalog.map(item=>adminRow(`<strong>${esc(item.name)}</strong> · codice ${esc(item.code)}`,"court",item.code)).join("");
    $("categoryAdminList").innerHTML=categoriesCatalog.map(item=>adminRow(`<strong>${esc(item.code)}</strong> · ${esc(item.name)}`,"category",item.code)).join("");
    $("groupAdminList").innerHTML=groupsCatalog.map(item=>adminRow(`<strong>${esc(item.categoryCode)} ${esc(item.code)}</strong> · ${esc(item.name)}`,"group",`${item.categoryCode}|${item.code}`)).join("");
    $("teamAdminList").innerHTML=teamsCatalog.map(item=>adminRow(`<strong>${esc(item.code)}</strong> · ${esc(item.name)} · ${esc(item.categoryCode)} ${esc(item.groupCode)}`,"team",item.code)).join("");
    $("staffAdminList").innerHTML=staffCatalog.map(item=>{const roles=[item.canReferee&&"arbitro",item.canScorekeeper&&"refertista",item.canCourtManager&&"responsabile"].filter(Boolean).join(", ");return adminRow(`<strong>${esc(item.name)}</strong> · ${esc(roles)}`,"staff",item.id);}).join("");
    $("matchAdminList").innerHTML=matches.map(item=>adminRow(`<strong>${esc(item.gameId)}</strong> · ${esc(item.date)} ${esc(item.time)} · ${esc(item.category)} · ${esc(expandMatchup(item.matchup))}`,"match",item.gameId)).join("");
    $("finalLinkAdminList").innerHTML=finalLinksCatalog.map(item=>adminRow(`<strong>Gara ${esc(item.targetGameId)}</strong> · ${esc(item.sectionTitle)} · ${esc(item.homeKind)} ${esc(item.homeRef)} / ${esc(item.awayKind)} ${esc(item.awayRef)}`,"finalLink",item.targetGameId)).join("");
  }

  function entityData(entity,key){
    if(entity==="category")return categoriesCatalog.find(item=>item.code===key);
    if(entity==="group"){const [categoryCode,code]=key.split("|");return groupsCatalog.find(item=>item.categoryCode===categoryCode&&item.code===code);}
    if(entity==="team")return teamsCatalog.find(item=>item.code===key);
    if(entity==="court")return courtsCatalog.find(item=>item.code===key);
    if(entity==="staff")return staffCatalog.find(item=>String(item.id)===String(key));
    if(entity==="finalLink")return finalLinksCatalog.find(item=>item.targetGameId===key);
    if(entity==="match"){const item=matches.find(match=>match.gameId===key);if(!item)return null;const parts=item.matchup.split(/\s+-\s+/);return {gameId:item.gameId,categoryCode:item.category,groupCode:item.groupCode||"",phase:item.phase||"girone",date:item.date,time:item.time,court:item.court,homeRef:parts[0]||item.matchup,awayRef:parts[1]||"",scorekeeper:item.scorekeeper,referee:item.referee,courtManager:item.courtManager||""};}
    return null;
  }

  function formForEntity(entity){return $(`${entity}Form`);}
  function fillAdminForm(entity,key){const data=entityData(entity,key),form=formForEntity(entity);if(!data||!form)return;Object.entries(data).forEach(([name,value])=>{if(form.elements[name]){if(form.elements[name].type==="checkbox")form.elements[name].checked=Boolean(value);else form.elements[name].value=value??"";}});form.scrollIntoView({behavior:"smooth",block:"center"});}

  async function saveAdminEntity(entity,form){
    const data=Object.fromEntries(new FormData(form).entries());await apiPost("/api/admin/catalog",{entity,action:"save",data});form.reset();await sync();renderAdmin();
  }

  async function deleteAdminEntity(entity,key){
    if(!confirm("Eliminare questo elemento dall’ambiente di test?"))return;
    const data=entity==="group"?{categoryCode:key.split("|")[0],code:key.split("|")[1]}:entity==="match"?{gameId:key}:entity==="finalLink"?{targetGameId:key}:entity==="staff"?{id:key}:{code:key};
    await apiPost("/api/admin/catalog",{entity,action:"delete",data});await sync();renderAdmin();
  }

  function restoreSelections(){
    try{
      const saved=JSON.parse(localStorage.getItem(selectionKey)||"{}");
      ["categoryFilter","courtFilter","teamSelect","standingsCategory","finalsCategory"].forEach(id=>{
        const select=$(id), value=saved[id];
        if(value && [...select.options].some(option=>option.value===value))select.value=value;
      });
      $("upcomingOnly").checked=Boolean(saved.upcomingOnly);
    }catch(error){console.warn("Impossibile ripristinare i filtri",error);}
  }

  function saveSelections(){
    localStorage.setItem(selectionKey,JSON.stringify({
      categoryFilter:$("categoryFilter").value,
      courtFilter:$("courtFilter").value,
      teamSelect:$("teamSelect").value,
      standingsCategory:$("standingsCategory").value,
      finalsCategory:$("finalsCategory").value,
      upcomingOnly:$("upcomingOnly").checked
    }));
  }

  function renderNotices(){
    $("noticeList").innerHTML=notices.map(item=>`<article class="info-card${item.accent?" accent":""}"><h3>${esc(item.title)}</h3><p>${esc(item.message)}</p></article>`).join("");
  }

  function changedResults(previous,current){
    const oldById=new Map((previous||[]).map(match=>[match.gameId,resultText(match)]));
    return current.filter(match=>{const value=resultText(match);return value && value!==oldById.get(match.gameId);});
  }

  function hideResultToast(){
    clearTimeout(toastTimer);$("resultToast").classList.remove("visible");$("resultToast").setAttribute("aria-hidden","true");
  }

  function showResultToast(changes){
    if(!changes.length)return;
    const visible=changes.slice(0,3).map(match=>`<p><strong>${esc(match.category)}</strong> · ${esc(expandMatchup(resolvedMatchup(match)))}: ${esc(resultText(match))}</p>`).join("");
    const more=changes.length>3?`<p>e altri ${changes.length-3} aggiornamenti</p>`:"";
    $("resultToastBody").innerHTML=visible+more;
    $("resultToast").classList.add("visible");$("resultToast").setAttribute("aria-hidden","false");
    clearTimeout(toastTimer);toastTimer=setTimeout(hideResultToast,10000);
  }

  function setSync(state,text){$("syncBanner").className=`sync-banner ${state}`;$("syncText").textContent=text;}
  async function sync(){
    if(syncing)return; syncing=true;
    setSync("","Sincronizzazione con il database…");
    const cacheKey=`volleystars-${config.activeName}`;
    const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");
    const noticeRequest=fetchNotices().catch(()=>cached?.notices||[]);
    try{const live=await fetchLiveMatches();mergeLive(live);populateCategorySelectors();populateTeams();notices=await noticeRequest;const changes=cached?.matches?changedResults(cached.matches,matches):[];localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),matches,notices,standings:sheetStandings}));setSync("live",`Aggiornato ora · ${config.label}`);showResultToast(changes);}
    catch(error){notices=await noticeRequest;if(cached?.matches){matches=cached.matches;sheetStandings=cached.standings||{};setSync("error",`Offline · dati salvati ${new Date(cached.at).toLocaleString("it-IT")}`);}else setSync("error",`Calendario offline · risultati non sincronizzati (${config.label})`);}
    finally{syncing=false;}
    renderAgenda();renderTeams();renderStandings();renderFinals();renderNotices();if(currentUser)renderAdmin();
  }

  $("environmentInfo").textContent=`Configurazione attiva: ${config.label}. Database interno D1.`;
  document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item,.view").forEach(el=>el.classList.remove("active"));button.classList.add("active");$(button.dataset.view).classList.add("active");}));
  document.addEventListener("click",event=>{
    const edit=event.target.closest("[data-edit-game]");if(edit){event.stopPropagation();openResultEditor(edit.dataset.editGame);return;}
    const editAdmin=event.target.closest("[data-admin-edit]");if(editAdmin){fillAdminForm(editAdmin.dataset.adminEdit,editAdmin.dataset.adminKey);return;}
    const deleteAdmin=event.target.closest("[data-admin-delete]");if(deleteAdmin){deleteAdminEntity(deleteAdmin.dataset.adminDelete,deleteAdmin.dataset.adminKey).catch(error=>alert(error.message));return;}
    const closer=event.target.closest("[data-close-dialog]");if(closer){$(closer.dataset.closeDialog).close();return;}
    const card=event.target.closest(".match-card");if(card)toggleMatchCard(card);
  });
  document.addEventListener("keydown",event=>{const card=event.target.closest(".match-card");if(card&&(event.key==="Enter"||event.key===" ")){event.preventDefault();toggleMatchCard(card);}});
  $("categoryFilter").addEventListener("change",()=>{saveSelections();renderAgenda();});$("courtFilter").addEventListener("change",()=>{saveSelections();renderAgenda();});$("upcomingOnly").addEventListener("change",()=>{saveSelections();renderAgenda();});$("teamSelect").addEventListener("change",()=>{saveSelections();renderTeams();});$("standingsCategory").addEventListener("change",()=>{saveSelections();renderStandings();});$("finalsCategory").addEventListener("change",()=>{saveSelections();renderFinals();});$("refreshButton").addEventListener("click",sync);$("resultToastClose").addEventListener("click",hideResultToast);
  $("loginButton").addEventListener("click",async()=>{if(currentUser){await apiPost("/api/auth/logout",{});setAuth(null);}else{$("loginError").textContent="";$("loginDialog").showModal();}});
  $("loginForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());try{const payload=await apiPost("/api/auth/login",data);$("loginDialog").close();form.reset();setAuth(payload.user);}catch(error){$("loginError").textContent=error.message;}});
  $("resultForm").addEventListener("submit",async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());try{await apiPost("/api/results",{gameId:data.gameId,category:data.category,result:data.result,sets:[data.set1,data.set2,data.set3]});$("resultDialog").close();await sync();}catch(error){$("resultError").textContent=error.message;}});
  [["settingsForm","settings"],["courtForm","court"],["categoryForm","category"],["groupForm","group"],["teamForm","team"],["staffForm","staff"],["matchForm","match"],["finalLinkForm","finalLink"]].forEach(([id,entity])=>$(id).addEventListener("submit",async event=>{event.preventDefault();try{await saveAdminEntity(entity,event.currentTarget);}catch(error){alert(error.message);}}));
  populateTeams();restoreSelections();renderAgenda();renderTeams();renderStandings();renderFinals();renderNotices();loadSession();sync();setInterval(sync,60000);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

  window.VolleyStarsTestApi={parseCsv,parseSheetCsv,parseSheetRows,parseGvizTable,parseNoticeTable,normalizeMatchup,resultOutcome,changedResults,matchScore,rankGroup,resolveQualificationText,resolvedMatchup};
})();
