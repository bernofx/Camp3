(function () {
  const config = window.VOLLEYSTARS_CONFIG;
  const staticData = window.VOLLEYSTARS_STATIC;
  let matches = staticData.matches.map(x => ({...x}));
  let matchesCatalog = matches.map(x => ({...x,status:x.status||"scheduled"}));
  let notices = [];
  let sheetStandings = {};
  let currentUser = null;
  let categoriesCatalog = [];
  let groupsCatalog = [];
  let courtsCatalog = [];
  let daysCatalog = [];
  let staffCatalog = [];
  let settingsCatalog = {match_duration_minutes:"70",plan_confirmed:"0",tournament_state:"planning"};
  let finalLinksCatalog = [];
  let teamsCatalog = Object.entries(staticData.teams).map(([code,name])=>({code,name,categoryCode:`U${code.slice(0,2)}`,groupCode:""}));
  let teamNames = {...staticData.teams};
  let toastTimer;
  const locallySavedResultIds=new Set();
  let actionToastTimer;
  let syncing = false;
  const selectionKey = "volleystars-v1-db-selections";
  const themeDefaults={preset:"default",primary:"#11263f",secondary:"#193957",accent:"#ff6b57",background:"#f6f2e9",surface:"#ffffff",text:"#17202b",muted:"#68717c",line:"#dedbd3",typography:"classic",density:"comfortable",radius:"17",shadow:"soft"};
  const themePresets={
    default:{...themeDefaults,label:"Attuale"},
    energy:{...themeDefaults,preset:"energy",primary:"#14213d",secondary:"#263d67",accent:"#f04e3e",background:"#f7f3ea",surface:"#ffffff",label:"Energia"},
    ocean:{...themeDefaults,preset:"ocean",primary:"#073b4c",secondary:"#0b6175",accent:"#ef476f",background:"#eef8f7",surface:"#ffffff",typography:"modern",label:"Oceano"},
    minimal:{...themeDefaults,preset:"minimal",primary:"#24282d",secondary:"#4d5964",accent:"#2b7a65",background:"#f3f5f4",surface:"#ffffff",text:"#202428",muted:"#626b72",line:"#d6dcda",typography:"modern",radius:"10",shadow:"none",label:"Minimal"}
  };
  let qualificationGroups = {
    U13:{C:["131","132","133","134"],D:["135","136","137","138"]},
    U14:{C:["141","142","143","144"]},
    U15:{C:["161","162","163","164"],D:["165","166","167","168"]},
    U17:{C:["181","182","183","184"],D:["185","186","187","188"]}
  };
  let finalFlows = {};
  let finalBrackets = {};
  let plannerLanes = {};
  let plannerTimes = {};
  let plannerSelectedCourt = "";
  let plannerDayCode = "";
  let plannerDirty = false;
  let desktopDraft = new Map();
  let desktopDirty = false;
  let desktopBaseFingerprint = "";
  let desktopSaveState = {kind:"saved",message:"Piano salvato nel database.",warnings:[]};
  let desktopDragOffsetMinutes = 0;
  let configurationCandidate = null;
  let bulkStaffSelection = new Set();
  let themePreviewDirty = false;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const normalizeMatchup = value => String(value || "").replace(/\s*[-–]\s*/g," - ").trim();
  const dateTime = match => new Date(`${match.date}T${match.time}:00+02:00`);
  const dateLabel = value => new Intl.DateTimeFormat("it-IT", {weekday:"long",day:"numeric",month:"long"}).format(new Date(`${value}T12:00:00+02:00`));
  const categoryColor=code=>categoriesCatalog.find(item=>item.code===code)?.color||"#dff4ea";
  const tournamentState=()=>settingsCatalog.tournament_state||"planning";
  const tint=(hex,alpha=.14)=>{const value=String(hex||"").replace("#","");if(!/^[0-9a-f]{6}$/i.test(value))return `rgba(223,244,234,${alpha})`;return `rgba(${parseInt(value.slice(0,2),16)},${parseInt(value.slice(2,4),16)},${parseInt(value.slice(4,6),16)},${alpha})`;};

  function themeFromSettings(settings=settingsCatalog){return {preset:settings.ui_theme_preset||themeDefaults.preset,primary:settings.ui_primary||themeDefaults.primary,secondary:settings.ui_secondary||themeDefaults.secondary,accent:settings.ui_accent||themeDefaults.accent,background:settings.ui_background||themeDefaults.background,surface:settings.ui_surface||themeDefaults.surface,text:settings.ui_text||themeDefaults.text,muted:settings.ui_muted||themeDefaults.muted,line:settings.ui_line||themeDefaults.line,typography:settings.ui_typography||themeDefaults.typography,density:settings.ui_density||themeDefaults.density,radius:settings.ui_radius||themeDefaults.radius,shadow:settings.ui_shadow||themeDefaults.shadow};}
  function applyTheme(theme){
    const root=document.documentElement,fonts={classic:[`Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif`,`Georgia,serif`],modern:[`"Segoe UI",Inter,ui-sans-serif,system-ui,sans-serif`,`"Segoe UI",Inter,ui-sans-serif,system-ui,sans-serif`],rounded:[`"Trebuchet MS",Inter,ui-sans-serif,system-ui,sans-serif`,`"Trebuchet MS",Inter,ui-sans-serif,system-ui,sans-serif`]},font=fonts[theme.typography]||fonts.classic;
    const radius=Math.min(28,Math.max(6,Number(theme.radius)||17));
    [["--navy",theme.primary],["--navy-2",theme.secondary],["--coral",theme.accent],["--paper",theme.background],["--white",theme.surface],["--ink",theme.text],["--muted",theme.muted],["--line",theme.line],["--app-font",font[0]],["--display-font",font[1]],["--ui-radius",`${radius}px`],["--ui-radius-delta",`${radius-17}px`]].forEach(([name,value])=>root.style.setProperty(name,value));
    root.dataset.uiDensity=theme.density||"comfortable";root.dataset.uiShadow=theme.shadow||"soft";
  }

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
    categoriesCatalog=payload.categories||[];groupsCatalog=payload.groups||[];teamsCatalog=payload.teams||[];courtsCatalog=payload.courts||[];daysCatalog=payload.days||[];staffCatalog=payload.staff||[];settingsCatalog=payload.settings||{match_duration_minutes:"70",plan_confirmed:"0",tournament_state:"planning"};finalLinksCatalog=payload.finalLinks||[];applyTheme(themeFromSettings(settingsCatalog));
    teamNames=Object.fromEntries(teamsCatalog.map(team=>[team.code,team.name]));
    qualificationGroups={};
    categoriesCatalog.forEach(category=>{
      const groups=groupsCatalog.filter(group=>group.categoryCode===category.code);
      qualificationGroups[category.code]={};
      groups.forEach((group,index)=>{const codes=teamsCatalog.filter(team=>team.categoryCode===category.code&&team.groupCode===group.code).map(team=>team.code),legacy=String.fromCharCode(67+index);qualificationGroups[category.code][legacy]=codes;});
    });
    finalFlows={};finalBrackets={};const phaseByGame=new Map(payload.matches.map(item=>[item.gameId,item.phase]));
    finalLinksCatalog.forEach(link=>{
      (finalFlows[link.categoryCode]??={})[link.targetGameId]={home:[link.homeKind,link.homeRef],away:[link.awayKind,link.awayRef]};
      const sections=finalBrackets[link.categoryCode]??=[];let section=sections.find(item=>item.title===link.sectionTitle);
      if(!section){section={title:link.sectionTitle,sectionOrder:Number(link.sectionOrder)||0,early:{ottavi:[],quarti:[]},semis:[],finals:[]};sections.push(section);finalBrackets[link.categoryCode]=sections;}
      const phase=phaseByGame.get(link.targetGameId);
      if(phase==="ottavi"||phase==="quarti")section.early[phase].push({id:link.targetGameId,order:Number(link.targetOrder)||0});
      else if(phase==="fase-finale")section.semis.push(link.targetGameId);
      else if(phase==="finale"){
        [[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]].forEach(([kind,ref])=>{if((kind==="winner"||kind==="loser")&&phaseByGame.get(ref)==="fase-finale"&&!section.semis.includes(ref))section.semis.push(ref);});
        section.finals.push({id:link.targetGameId,order:Number(link.targetOrder)||0});
      }
    });
    Object.values(finalBrackets).forEach(sections=>{sections.sort((a,b)=>a.sectionOrder-b.sectionOrder);sections.forEach(section=>{Object.keys(section.early).forEach(key=>{section.early[key].sort((a,b)=>a.order-b.order);section.early[key]=[...new Set(section.early[key].map(item=>item.id))];});section.semis=[...new Set(section.semis)];section.finals.sort((a,b)=>a.order-b.order);section.finals=[...new Set(section.finals.map(item=>item.id))];});});
    sheetStandings={};
    matchesCatalog=payload.matches.map(match=>({category:match.category,date:match.date,time:match.time,gameId:match.gameId,court:match.court,matchup:match.awayRef?`${match.homeRef} - ${match.awayRef}`:match.homeRef,scorekeeper:match.scorekeeper,referee:match.referee,courtManager:match.courtManager,result:match.result,sets:[match.set1||"",match.set2||"",match.set3||""],phase:match.phase,status:match.status,groupCode:match.groupCode}));notices=(payload.notices||[]).map(item=>({...item,accent:Boolean(item.accent)}));
    updatePlanVisibility();
    return matchesCatalog.filter(match=>match.status!=="draft"&&match.date&&match.time&&match.court);
  }

  async function fetchNotices() { return notices; }

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

  function bestSecond(category,sourceMatches=matches){
    const candidates=[];
    Object.entries(qualificationGroups[category]||{}).forEach(([letter,codes])=>{
      const ranking=rankGroup(codes,sourceMatches,category,letter);if(!ranking||ranking.length<2)return;
      const stats=groupStandings(codes,sourceMatches,category,letter),item=stats.find(row=>row.code===ranking[1]);if(item)candidates.push(item);
    });
    candidates.sort((a,b)=>b.points-a.points||b.wins-a.wins||(b.setsFor-b.setsAgainst)-(a.setsFor-a.setsAgainst)||b.setsFor-a.setsFor||pointRatio(b)-pointRatio(a)||a.code.localeCompare(b.code));
    return candidates[0]?.code||null;
  }

  function resolveQualificationText(value,category,sourceMatches=matches) {
    const qualified=qualificationMap(category,sourceMatches);
    return String(value||"").replace(/\bBEST2\b/g,bestSecond(category,sourceMatches)||"Migliore seconda").replace(/\b([A-Z][A-Z0-9_-]*\d+)\b/g,placeholder=>{
      if(qualified.has(placeholder))return qualified.get(placeholder);
      const parts=placeholder.match(/^(.+?)(\d+)$/),groups=groupsCatalog.filter(group=>group.categoryCode===category),index=parts&&groups.findIndex(group=>group.code===parts[1]);
      return index>=0?qualified.get(`${String.fromCharCode(67+index)}${parts[2]}`)||placeholder:placeholder;
    });
  }

  function stageParticipant(gameId,side,category,sourceMatches=matches,seen=new Set()) {
    if(seen.has(gameId))return null;seen=new Set(seen);seen.add(gameId);
    const source=sourceMatches.find(match=>match.gameId===gameId), score=source&&matchScore(source);
    if(!source||!score||score[0]===score[1])return null;
    const codes=teamCodes(resolvedMatchup(source,sourceMatches,seen));
    if(codes.length!==2)return null;
    const winner=score[0]>score[1]?codes[0]:codes[1], loser=winner===codes[0]?codes[1]:codes[0];
    return side==="winner"?winner:loser;
  }

  function resolvedMatchup(match,sourceMatches=matches,seen=new Set()) {
    const flow=finalFlows[match.category]?.[match.gameId];
    if(flow){
      const resolve=([kind,ref])=>{
        if(kind==="winner"||kind==="loser")return stageParticipant(ref,kind,match.category,sourceMatches,seen)||`${kind==="winner"?"Vincente":"Perdente"} gara ${ref}`;
        return resolveQualificationText(ref,match.category,sourceMatches);
      };
      return `${resolve(flow.home)} - ${resolve(flow.away)}`;
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
    const edit=currentUser&&tournamentState()==="live"?`<button class="edit-result" type="button" data-edit-game="${esc(match.gameId)}" aria-label="Modifica risultato gara ${esc(match.gameId)}">✎</button>`:"";
    return `<article class="match-card${hasDetails?" has-details":""}" style="--match-tint:${tint(categoryColor(match.category),.18)}" data-game-id="${esc(match.gameId)}" ${interaction}><div class="time-block">${esc(match.time)}<small>Campo ${esc(match.court)}</small><small>Gara ${esc(match.gameId)}</small></div><div class="match-main"><strong>${esc(expandMatchup(resolvedMatchup(match)))}</strong>${result?`<p class="result">${esc(result)}</p>`:""}<p>Referto: ${esc(match.scorekeeper||"da definire")} · Arbitro: ${esc(match.referee||"da definire")}${manager}</p></div><span class="category-chip ${esc(categoryClass)}">${esc(match.category)}</span>${setDetails}${edit}</article>`;
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
    return value.replace(/\b(\d{3})\b/g, code => teamNames[code] ? `${teamNames[code]} (${code})` : code);
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

  function teamCodes(matchup){return String(matchup).match(/\b\d{3}\b/g)||[];}
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
      .map(([code,name])=>{const category=categoryByCode.get(code)||"";return `<option value="${code}" style="background-color:${esc(tint(categoryColor(category),.28))};color:#11263f">${esc(category||"—")} · ${esc(name)} · ${code}</option>`;}).join("");
    updateTeamSelectColor();
  }

  function updateTeamSelectColor(){const select=$("teamSelect"),team=teamsCatalog.find(item=>item.code===select?.value);if(select)select.style.backgroundColor=team?tint(categoryColor(team.categoryCode),.28):"#fff";}

  function renderStandings(){
    const category=$("standingsCategory").value;
    $("standingsView").style.backgroundColor=tint(categoryColor(category),.13);
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
    $("finalsView").style.backgroundColor=tint(categoryColor(category),.13);
    const sections=finalBrackets[category]||[];
    const bracket=sections.map(section=>{
      const early=[["Ottavi","Ottavo",section.early?.ottavi||[]],["Quarti","Quarto",section.early?.quarti||[]]].filter(([,singular,ids])=>ids.length).map(([label,singular,ids])=>`<div class="bracket-early-round"><h4>${label}</h4><div>${ids.map(id=>bracketMatch(id,singular)).join("")}</div></div>`).join("");
      const semis=section.semis.map(id=>bracketMatch(id,"Semifinale")).join("");
      const finals=section.finals.map(id=>bracketMatch(id,finalLabel(matches.find(match=>match.gameId===id)))).join("");
      const titleFinal=section.finals.find(id=>/FINALE\s+1°\s*-\s*2°/i.test(matches.find(match=>match.gameId===id)?.matchup||""));
      const championCode=titleFinal&&stageParticipant(titleFinal,"winner",category);
      const champion=championCode?`<div class="champion-banner"><span aria-hidden="true">🏆</span><div><small>Campione ${esc(category)}</small><strong>${esc(teamNames[championCode]||championCode)}</strong></div></div>`:"";
      return `<section class="bracket-section"><h3>${esc(section.title)}</h3>${champion}${early?`<div class="bracket-early">${early}</div>`:""}<div class="bracket-headings"><span>Semifinali</span><span>Finali</span></div><div class="bracket-grid"><div class="bracket-round">${semis}</div><div class="bracket-lines" aria-hidden="true"><i></i></div><div class="bracket-round">${finals}</div></div></section>`;
    }).join("");
    const finalRound=matches.filter(item=>item.category===category&&item.phase==="finale-girone");
    $("finalsBracket").innerHTML=bracket||(finalRound.length?`<section class="bracket-section"><h3>Girone finale tra le vincitrici</h3><div class="card-list">${finalRound.map(card).join("")}</div></section>`:'<div class="empty">Fase finale non prevista.</div>');
  }

  function populateCategorySelectors(){
    const categories=categoriesCatalog.length?categoriesCatalog:[{code:"U13"},{code:"U14"},{code:"U15"},{code:"U17"}];
    const options=categories.map(item=>`<option value="${esc(item.code)}">${esc(item.code)}${item.name&&item.name!==item.code?` · ${esc(item.name)}`:""}</option>`).join("");
    const agendaValue=$("categoryFilter").value;
    $("categoryFilter").innerHTML=`<option value="all">Tutte</option>${options}`;
    if([...$("categoryFilter").options].some(option=>option.value===agendaValue))$("categoryFilter").value=agendaValue;
    ["standingsCategory","finalsCategory","groupPlannerCategory"].forEach(id=>{const select=$(id),value=select.value;select.innerHTML=options;if([...select.options].some(option=>option.value===value))select.value=value;});
    document.querySelectorAll('#adminView select[name="categoryCode"]').forEach(select=>{const value=select.value;select.innerHTML=options;if([...select.options].some(option=>option.value===value))select.value=value;});
    const courtOptions=courtsCatalog.map(item=>`<option value="${esc(item.code)}">${esc(item.name||`Campo ${item.code}`)}</option>`).join("");
    const filterValue=$("courtFilter").value;$("courtFilter").innerHTML=`<option value="all">Tutti</option>${courtOptions}`;if([...$("courtFilter").options].some(option=>option.value===filterValue))$("courtFilter").value=filterValue;
    document.querySelectorAll('select[name="court"]').forEach(select=>{const value=select.value;select.innerHTML=courtOptions;if([...select.options].some(option=>option.value===value))select.value=value;});
    const staffOptions=(role)=>`<option value="">Da definire</option>${staffCatalog.filter(item=>item[role]).map(item=>`<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
    [["scorekeeper","canScorekeeper"],["referee","canReferee"],["courtManager","canCourtManager"]].forEach(([name,role])=>document.querySelectorAll(`select[name="${name}"]`).forEach(select=>{const value=select.value;select.innerHTML=staffOptions(role);if([...select.options].some(option=>option.value===value))select.value=value;}));
    populateAllocationSelector();updateAdmissionAdvice();
  }

  function populateAllocationSelector(){
    const select=$("allocationForm")?.elements.gameId;if(!select)return;const value=select.value;
    select.innerHTML=matchesCatalog.slice().sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999")||(a.time||"99:99").localeCompare(b.time||"99:99")||a.gameId.localeCompare(b.gameId)).map(item=>`<option value="${esc(item.gameId)}">Gara ${esc(item.gameId)} · ${esc(item.category)} · ${esc(expandMatchup(item.matchup))}${item.status==="draft"?" · BOZZA":""}</option>`).join("");
    if([...select.options].some(option=>option.value===value))select.value=value;
  }

  function updateAdmissionAdvice(){
    const form=$("categoryForm"),category=form?.elements.code.value.toUpperCase()||form?.elements.code.value,method=form?.elements.admissionMethod.value,placement=form?.elements.placementMode.value,entry=form?.elements.entryRound.value,box=$("admissionAdvice");if(!box)return;
    const count=groupsCatalog.filter(item=>item.categoryCode===category).length;
    let advice="";
    if(count>1&&count%2===1&&method==="top2_each")advice=`${count} gironi: le prime 2 produrrebbero ${count*2} qualificate. Puoi scegliere un girone finale tra le vincitrici; con 3 gironi puoi anche ammettere le 3 vincitrici e la migliore seconda.`;
    else if(method==="winners_plus_best_second")advice="Per 3 gironi della stessa dimensione accedono le 3 vincitrici e la migliore seconda, confrontata con punti, set e QP.";
    else if(method==="winners_round_robin")advice="Le vincitrici disputano un girone finale: usa il livello 1°–2°, perché il titolo viene determinato dalla classifica.";
    else advice=`Accedono le prime ${method==="top8_each"?8:method==="top4_each"?4:2} di ciascun girone.`;
    const qualified=method==="top8_each"?count*8:method==="top4_each"?count*4:method==="top2_each"?count*2:method==="winners_plus_best_second"?4:count,needed=entry==="round_of_16"?16:entry==="quarterfinals"?8:entry==="final"?2:placement==="top8"?8:4;
    if(method!=="winners_round_robin"&&count&&qualified!==needed)advice+=` La configurazione produce ${qualified} qualificate, mentre il turno scelto ne richiede ${needed}.`;
    else if(placement==="top8"&&entry==="semifinals")advice+=" Come nel modello VolleyStars 2026: semifinali C1–D2/D1–C2 e C3–D4/D3–C4, poi quattro finali di piazzamento.";
    else if(placement==="top8")advice+=" Le perdenti dei quarti alimenteranno le semifinali 5°–8° e le finali 5°–6° e 7°–8°.";
    else if(placement==="top4")advice+=" Verranno generate le finali 1°–2° e 3°–4°.";
    else if(method!=="winners_round_robin")advice+=" Verrà generata soltanto la finale 1°–2°.";
    box.textContent=advice;
  }

  const italianDate=value=>{if(!value)return "";const [y,m,d]=value.split("-");return y&&m&&d?`${d}/${m}/${y}`:value;};

  function updatePlanVisibility(){
    const confirmed=String(settingsCatalog.plan_confirmed||"0")==="1",hasMatches=matchesCatalog.length>0,standingsTab=$("standingsTab"),plannerTab=$("plannerTab"),desktopTab=$("desktopPlannerTab");if(standingsTab)standingsTab.hidden=!confirmed;if(plannerTab)plannerTab.hidden=!currentUser||!hasMatches;if(desktopTab)desktopTab.hidden=!currentUser||!hasMatches;
    if((!confirmed&&$("standingsView")?.classList.contains("active"))||(!hasMatches&&[$("plannerView"),$("desktopPlannerView")].some(view=>view?.classList.contains("active")))){document.querySelectorAll(".nav-item,.view").forEach(el=>el.classList.remove("active"));$("agendaTab").classList.add("active");$("agendaView").classList.add("active");}
  }

  function renderGroupPlanner(){
    const select=$("groupPlannerCategory");if(!select)return;const category=select.value||categoriesCatalog[0]?.code||"",groups=groupsCatalog.filter(item=>item.categoryCode===category),teams=teamsCatalog.filter(item=>item.categoryCode===category),hasMatches=matchesCatalog.length>0,canEdit=tournamentState()==="planning",unassigned=teams.filter(team=>!team.groupCode),areas=[{code:"",name:"Non assegnate"},...groups],options=`<option value="">Non assegnata</option>${groups.map(item=>`<option value="${esc(item.code)}">${esc(item.name)}</option>`).join("")}`;
    const status=$("groupPlannerStatus");status.classList.toggle("complete",!unassigned.length);status.innerHTML=hasMatches?(unassigned.length?`<strong>${unassigned.length} ${unassigned.length===1?"squadra da assegnare":"squadre da assegnare"}</strong><br>Puoi collocare le nuove squadre. Le squadre già assegnate restano bloccate finché non svuoti le gare.`:"<strong>Composizione protetta</strong><br>Per spostare una squadra già assegnata devi prima svuotare completamente le gare da Gestione."):"<strong>Composizione modificabile</strong><br>Assegna tutte le squadre prima di generare le gare.";
    $("groupPlannerBoards").innerHTML=areas.map(area=>{const members=teams.filter(team=>(team.groupCode||"")==area.code);return `<section class="group-board" data-group-drop="${esc(area.code)}"><h3>${esc(area.name)} <span>${members.length}</span></h3><div class="group-team-list">${members.map(team=>{const teamLocked=!canEdit||hasMatches&&Boolean(team.groupCode);return `<article class="group-team" data-group-team="${esc(team.code)}" draggable="${teamLocked?"false":"true"}" style="--match-tint:${tint(categoryColor(category),.20)}"><div><strong>${esc(team.name)}</strong><small>${esc(team.code)}</small></div><label>Sposta in<select data-team-group-select="${esc(team.code)}" ${teamLocked?"disabled":""}>${options}</select></label></article>`;}).join("")||'<div class="planner-empty">Nessuna squadra</div>'}</div></section>`;}).join("")||'<div class="empty">Configura prima i gironi della categoria.</div>';
    document.querySelectorAll("[data-team-group-select]").forEach(control=>control.value=teams.find(team=>team.code===control.dataset.teamGroupSelect)?.groupCode||"");
  }

  async function moveTeamToGroup(teamCode,groupCode){
    const category=$("groupPlannerCategory").value;showActionToast("Aggiornamento del girone…","busy");try{await apiPost("/api/admin/catalog",{entity:"teamGroup",action:"save",data:{code:teamCode,categoryCode:category,groupCode}});await sync();renderGroupPlanner();showActionToast("Squadra assegnata al girone.");}catch(error){showActionToast(error.message,"error");renderGroupPlanner();}
  }

  function plannerDay(){return daysCatalog.find(item=>item.code===$("plannerDay")?.value);}
  function initializePlanner(force=false){
    const select=$("plannerDay");if(!select)return;const current=select.value||plannerDayCode,options=daysCatalog.map(item=>`<option value="${esc(item.code)}">${esc(item.name)} · ${esc(italianDate(item.date))}</option>`).join("");select.innerHTML=options;if(daysCatalog.some(item=>item.code===current))select.value=current;plannerDayCode=select.value;
    if(force||!plannerDirty){const day=plannerDay(),scheduled=matchesCatalog.filter(item=>day&&item.date===day.date&&item.time&&item.court);plannerLanes=Object.fromEntries(courtsCatalog.map(court=>[court.code,scheduled.filter(item=>String(item.court)===String(court.code)).sort((a,b)=>a.time.localeCompare(b.time)).map(item=>item.gameId)]));plannerTimes=Object.fromEntries(scheduled.map(item=>[item.gameId,item.time]));plannerSelectedCourt=plannerLanes[plannerSelectedCourt]?plannerSelectedCourt:(courtsCatalog[0]?.code||"");plannerDirty=false;}
  }

  function plannerLabel(item){return `Gara ${item.gameId} · ${item.category} · ${expandMatchup(item.matchup)}`;}
  function scheduleWarningMap(){
    const warnings=new Map(),duration=Number(settingsCatalog.match_duration_minutes||70),day=plannerDay(),add=(id,message)=>warnings.set(id,[...(warnings.get(id)||[]),message]),at=value=>{const [h,m]=String(value||"").split(":").map(Number);return h*60+m;},scheduled=[];
    for(const [court,ids] of Object.entries(plannerLanes))for(const id of ids){const item=matchesCatalog.find(match=>match.gameId===id),time=plannerTimes[id];if(item&&time)scheduled.push({...item,date:day?.date||item.date,time,court});}
    if(day)for(const item of scheduled)if(at(item.time)<at(day.startTime)||at(item.time)+duration>at(day.endTime||"23:59"))add(item.gameId,`Fuori dall’orario ${day.startTime}–${day.endTime||"23:59"}`);
    for(let i=0;i<scheduled.length;i++)for(let j=i+1;j<scheduled.length;j++){const a=scheduled[i],b=scheduled[j];if(a.date!==b.date||at(a.time)>=at(b.time)+duration||at(b.time)>=at(a.time)+duration)continue;if(a.court===b.court){add(a.gameId,`Sovrapposta alla gara ${b.gameId}`);add(b.gameId,`Sovrapposta alla gara ${a.gameId}`);}const first=new Set(teamCodes(a.matchup)),second=new Set(teamCodes(b.matchup));if([...first].some(code=>second.has(code))){add(a.gameId,`Squadra impegnata anche nella gara ${b.gameId}`);add(b.gameId,`Squadra impegnata anche nella gara ${a.gameId}`);}const people=[a.referee,a.courtManager].filter(Boolean),busy=[b.referee,b.courtManager].find(name=>people.includes(name));if(busy){add(a.gameId,`${busy} impegnato anche nella gara ${b.gameId}`);add(b.gameId,`${busy} impegnato anche nella gara ${a.gameId}`);}}
    const all=matchesCatalog.map(item=>scheduled.find(row=>row.gameId===item.gameId)||item),byId=new Map(all.map(item=>[item.gameId,item])),stamp=item=>item?.date&&item?.time?Date.parse(`${item.date}T${item.time}:00Z`)/60000:NaN,where=item=>{const itemDay=daysCatalog.find(entry=>entry.date===item?.date);return `${itemDay?.code||italianDate(item?.date)} · Campo ${item?.court||"da assegnare"}`;};
    for(const link of finalLinksCatalog){const target=byId.get(link.targetGameId);if(!target||!Number.isFinite(stamp(target)))continue;for(const [kind,ref] of [[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]])if(kind==="winner"||kind==="loser"){const source=byId.get(ref);if(!source||!Number.isFinite(stamp(source))){add(target.gameId,`Gara sorgente ${ref} non allocata`);continue;}if(stamp(target)<stamp(source)+duration){const end=at(source.time)+duration,endTime=`${String(Math.floor(end/60)).padStart(2,"0")}:${String(end%60).padStart(2,"0")}`;add(target.gameId,`Deve iniziare dopo la gara ${ref} · ${where(source)} · fine prevista ${endTime}`);}}}
    return warnings;
  }
  function renderPlanner(force=false){
    initializePlanner(force);const state=tournamentState(),editable=state==="planning",operational=state==="planning"||state==="live",day=plannerDay(),duration=Number(settingsCatalog.match_duration_minutes||70),assigned=new Set(Object.values(plannerLanes).flat()),pool=matchesCatalog.filter(item=>!assigned.has(item.gameId)&&(!item.date||item.status==="draft"||(day&&item.date===day.date)));
    $("plannerCourts").innerHTML=courtsCatalog.map(court=>`<button type="button" class="planner-court${court.code===plannerSelectedCourt?" active":""}" data-planner-court="${esc(court.code)}"><strong>${esc(court.name)}</strong><span>${(plannerLanes[court.code]||[]).length} gare</span></button>`).join("");
    $("plannerPool").innerHTML=pool.map(item=>`<article class="planner-game" draggable="${editable}" data-planner-game="${esc(item.gameId)}" style="--match-tint:${tint(categoryColor(item.category),.20)}"><span>${esc(plannerLabel(item))}</span><button type="button" data-planner-add="${esc(item.gameId)}" ${editable&&plannerSelectedCourt?"":"disabled"}>Aggiungi</button></article>`).join("")||'<div class="planner-empty">Nessuna gara non allocata.</div>';
    const court=courtsCatalog.find(item=>item.code===plannerSelectedCourt),ids=plannerLanes[plannerSelectedCourt]||[],start=day?day.startTime:"09:00",end=day?.endTime||"23:59",startMinutes=start.split(":").reduce((sum,value,index)=>sum+Number(value)*(index?1:60),0),endMinutes=end.split(":").reduce((sum,value,index)=>sum+Number(value)*(index?1:60),0),slotMinutes=(id,index)=>{const value=plannerTimes[id];if(value){const [hour,minute]=value.split(":").map(Number);return hour*60+minute;}return startMinutes+index*duration;},warningMap=scheduleWarningMap(),warningList=[...warningMap].flatMap(([id,items])=>{const match=matchesCatalog.find(entry=>entry.gameId===id),plannedCourt=Object.entries(plannerLanes).find(([,gameIds])=>gameIds.includes(id))?.[0],plannedHere=Boolean(plannedCourt),itemDay=plannedHere?day:daysCatalog.find(entry=>entry.date===match?.date),location=`${itemDay?.code||italianDate(match?.date)} · Campo ${plannedCourt||match?.court||"da assegnare"}`;return items.map(message=>({id,message,location}));}),outsideLimit=ids.some((id,index)=>slotMinutes(id,index)+duration>endMinutes),warningSummary=warningList.length?`<aside class="planner-warning-summary"><strong>⚠ ${warningList.length} ${warningList.length===1?"avviso nel piano":"avvisi nel piano"}</strong><ul>${warningList.slice(0,8).map(item=>`<li><b>Gara ${esc(item.id)} · ${esc(item.location)}</b>: ${esc(item.message)}</li>`).join("")}</ul>${warningList.length>8?`<small>Altri ${warningList.length-8} avvisi sono evidenziati sulle gare.</small>`:""}</aside>`:"";
    $("plannerLane").innerHTML=court?`${warningSummary}<div class="planner-lane-head"><div><small>${day?esc(day.name):"Giornata"}</small><h4>${esc(court.name)}</h4></div><span>Slot da ${duration} min · limite ${esc(end)}</span></div>${outsideLimit?'<p class="planner-limit-warning">Questa corsia supera la fine attività. Puoi salvare la bozza, ma dovrai correggerla prima della conferma.</p>':""}<div class="planner-drop" data-planner-drop="${esc(court.code)}">${ids.map((id,index)=>{const item=matchesCatalog.find(match=>match.gameId===id),total=slotMinutes(id,index),time=`${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`,warnings=warningMap.get(id)||[];return item?`<article class="planner-game scheduled${warnings.length?" has-warning":""}" draggable="${editable}" data-planner-game="${esc(id)}" style="--match-tint:${tint(categoryColor(item.category),.20)}"><time>${esc(time)}</time><span>${esc(plannerLabel(item))}${warnings.length?`<small class="planner-game-warning" title="${esc(warnings.join(" · "))}">⚠ ${esc(warnings[0])}</small>`:""}</span><div><button type="button" data-planner-move="up" data-game="${esc(id)}" aria-label="Sposta su" ${editable?"":"disabled"}>↑</button><button type="button" data-planner-move="down" data-game="${esc(id)}" aria-label="Sposta giù" ${editable?"":"disabled"}>↓</button><button type="button" data-planner-remove="${esc(id)}" aria-label="Rimuovi" ${editable?"":"disabled"}>×</button></div></article>`:"";}).join("")||'<div class="planner-empty">Trascina qui le gare.</div>'}</div>`:'<div class="planner-empty">Configura almeno un campo.</div>';
    const shift=$("shiftForm"),shiftSelect=shift.elements.fromGameId;shiftSelect.innerHTML=ids.map(id=>`<option value="${esc(id)}">Gara ${esc(id)}</option>`).join("");shift.querySelector("button").disabled=!ids.length||!operational;$("plannerHint").textContent=day?`${day.name}: ${italianDate(day.date)} · attività ${day.startTime}–${day.endTime||"23:59"}`:"Configura prima una giornata.";$("autoAllocate").disabled=!editable;$("savePlanner").disabled=!editable;$("confirmPlan").hidden=!editable;const labels={planning:"Pianificazione",confirmed:"Piano confermato",live:"Torneo in corso",closed:"Torneo concluso"},helps={planning:"Completa e valida il calendario.",confirmed:"Il piano è bloccato e pronto per l’avvio.",live:"Risultati e correzioni operative sulle gare future sono abilitati.",closed:"Dati in sola consultazione."};$("tournamentStateLabel").textContent=labels[state]||labels.planning;$("tournamentStateHelp").textContent=helps[state]||helps.planning;$("reopenPlan").hidden=state==="planning"||state==="closed";$("startTournament").hidden=state!=="confirmed";$("closeTournament").hidden=state!=="live";$("reopenTournament").hidden=state!=="closed";renderWorkflowGuide();renderBulkStaff();
  }

  function renderBulkStaff(){
    const list=$("bulkStaffList"),form=$("bulkStaffForm");if(!list||!form)return;const valid=new Set(matchesCatalog.map(item=>item.gameId));bulkStaffSelection=new Set([...bulkStaffSelection].filter(id=>valid.has(id)));
    const ordered=matchesCatalog.filter(item=>item.date&&item.time&&item.court).slice().sort((a,b)=>String(a.court).localeCompare(String(b.court),"it",{numeric:true})||a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.gameId.localeCompare(b.gameId));let lastGroup="";
    list.innerHTML=ordered.map(item=>{const groupKey=`${item.court}|${item.date}`,day=daysCatalog.find(entry=>entry.date===item.date),heading=groupKey!==lastGroup?(lastGroup=groupKey,`<div class="bulk-field-title">Campo ${esc(item.court)} · ${esc(day?.name||italianDate(item.date))}${day?.name?` · ${esc(italianDate(item.date))}`:""}</div>`):"";return `${heading}<label class="bulk-staff-game" style="--match-tint:${tint(categoryColor(item.category),.20)}"><input type="checkbox" data-bulk-game="${esc(item.gameId)}" ${bulkStaffSelection.has(item.gameId)?"checked":""}><time>${esc(item.time)}</time><span><strong>Gara ${esc(item.gameId)} · ${esc(item.category)}</strong><br>${esc(expandMatchup(item.matchup))}</span></label>`;}).join("")||'<div class="planner-empty">Alloca prima almeno una gara.</div>';
    const options=role=>`<option value="__keep__">Non modificare</option><option value="">Da definire</option>${staffCatalog.filter(item=>item[role]).map(item=>`<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("")}`;
    [["scorekeeper","canScorekeeper"],["referee","canReferee"],["courtManager","canCourtManager"]].forEach(([name,role])=>{const select=form.elements[name],value=select.value||"__keep__";select.innerHTML=options(role);select.value=[...select.options].some(item=>item.value===value)?value:"__keep__";});
    const locked=tournamentState()==="closed";document.querySelectorAll("[data-bulk-game]").forEach(input=>input.disabled=locked);[...form.elements].forEach(control=>control.disabled=locked);$("bulkSelectAll").disabled=locked;$("bulkSelectNone").disabled=locked;
  }

  async function saveBulkStaff(form){const box=$("bulkStaffMessage"),staff={},data=Object.fromEntries(new FormData(form).entries());for(const key of ["scorekeeper","referee","courtManager"])if(data[key]!=="__keep__")staff[key]=data[key];if(!bulkStaffSelection.size){box.textContent="Seleziona almeno una gara.";showActionToast(box.textContent,"error");return;}if(!Object.keys(staff).length){box.textContent="Scegli almeno un ruolo da modificare.";showActionToast(box.textContent,"error");return;}box.textContent="Salvataggio…";showActionToast("Assegnazione dello staff alle gare selezionate…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"bulkStaff",gameIds:[...bulkStaffSelection],staff});box.textContent=payload.message;bulkStaffSelection.clear();form.reset();await sync();showActionToast(payload.message||"Staff assegnato alle gare selezionate.");}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}}

  function plannerAdd(gameId){if(!plannerSelectedCourt)return;Object.values(plannerLanes).forEach(ids=>{const index=ids.indexOf(gameId);if(index>=0)ids.splice(index,1);});plannerLanes[plannerSelectedCourt]??=[];const ids=plannerLanes[plannerSelectedCourt],day=plannerDay(),duration=Number(settingsCatalog.match_duration_minutes||70),last=ids[ids.length-1],base=last&&plannerTimes[last]?plannerTimes[last]:day?.startTime||"09:00",[h,m]=base.split(":").map(Number),total=h*60+m+(last?duration:0);plannerTimes[gameId]=`${String(Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;ids.push(gameId);plannerDirty=true;renderPlanner();}
  function plannerRemove(gameId){Object.values(plannerLanes).forEach(ids=>{const index=ids.indexOf(gameId);if(index>=0)ids.splice(index,1);});delete plannerTimes[gameId];plannerDirty=true;renderPlanner();}
  function plannerMove(gameId,direction){const ids=plannerLanes[plannerSelectedCourt]||[],index=ids.indexOf(gameId),target=direction==="up"?index-1:index+1;if(index<0||target<0||target>=ids.length)return;const other=ids[target],currentTime=plannerTimes[gameId];plannerTimes[gameId]=plannerTimes[other];plannerTimes[other]=currentTime;[ids[index],ids[target]]=[ids[target],ids[index]];plannerDirty=true;renderPlanner();}

  async function savePlanner(){const box=$("plannerMessage");box.textContent="Salvataggio…";showActionToast("Salvataggio della pianificazione…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"applyDay",dayCode:$("plannerDay").value,lanes:plannerLanes,times:plannerTimes});plannerDirty=false;box.textContent=payload.message;await sync();renderPlanner(true);showActionToast(payload.message||"Pianificazione salvata.",payload.warnings?.length?"warning":undefined);}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}}
  async function confirmPlan(){const box=$("plannerMessage");box.textContent="Controllo del piano…";showActionToast("Controllo di tutti i vincoli del piano…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"confirmPlan"});box.textContent=payload.message;await sync();showActionToast(payload.message||"Piano confermato.");}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}}
  async function setTournamentState(state){const box=$("plannerMessage");box.textContent="Aggiornamento stato…";showActionToast("Aggiornamento dello stato del torneo…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"setState",state});box.textContent=payload.message;plannerDirty=false;await sync();renderPlanner(true);showActionToast(payload.message||"Stato del torneo aggiornato.");}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}}
  async function autoAllocate(){const box=$("plannerMessage"),button=$("autoAllocate");button.disabled=true;box.textContent="Calcolo della proposta…";showActionToast("Calcolo della proposta automatica…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"autoAllocate"});plannerDirty=false;box.textContent=payload.message;await sync();renderPlanner(true);showActionToast(payload.message||"Proposta automatica completata.");}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}finally{button.disabled=false;}}

  const timeValue=value=>{const [hour,minute]=String(value||"00:00").split(":").map(Number);return hour*60+minute;};
  const clockValue=value=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
  const scheduleFingerprint=rows=>rows.map(item=>`${item.gameId}|${item.date||""}|${item.time||""}|${item.court||""}`).sort().join("\n");
  function initializeDesktopDraft(force=false){if(desktopDirty&&!force)return;desktopDraft=new Map(matchesCatalog.map(item=>[item.gameId,{date:item.date||"",time:item.time||"",court:String(item.court||"")} ]));desktopBaseFingerprint=scheduleFingerprint(matchesCatalog);desktopDirty=false;}
  function desktopRows(){return matchesCatalog.map(item=>({...item,...(desktopDraft.get(item.gameId)||{})}));}
  function desktopWarningMap(){
    const rows=desktopRows(),warnings=new Map(),duration=Number(settingsCatalog.match_duration_minutes||70),add=(id,message)=>warnings.set(id,[...(warnings.get(id)||[]),message]),active=rows.filter(item=>item.date&&item.time&&item.court),byId=new Map(rows.map(item=>[item.gameId,item]));
    for(const item of active){const day=daysCatalog.find(entry=>entry.date===item.date);if(!day)add(item.gameId,"Giornata non configurata");else if(timeValue(item.time)<timeValue(day.startTime)||timeValue(item.time)+duration>timeValue(day.endTime||"23:59"))add(item.gameId,`Fuori dall’orario ${day.startTime}–${day.endTime}`);}
    for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++){const a=active[i],b=active[j];if(a.date!==b.date||timeValue(a.time)>=timeValue(b.time)+duration||timeValue(b.time)>=timeValue(a.time)+duration)continue;if(a.court===b.court){add(a.gameId,`Sovrapposta alla gara ${b.gameId} sul campo ${a.court}`);add(b.gameId,`Sovrapposta alla gara ${a.gameId} sul campo ${a.court}`);}const first=new Set(teamCodes(a.matchup)),second=new Set(teamCodes(b.matchup));if([...first].some(code=>second.has(code))){add(a.gameId,`Squadra impegnata anche nella gara ${b.gameId}`);add(b.gameId,`Squadra impegnata anche nella gara ${a.gameId}`);}}
    const stamp=item=>item?.date&&item?.time?Date.parse(`${item.date}T${item.time}:00Z`)/60000:NaN;for(const link of finalLinksCatalog){const target=byId.get(link.targetGameId);if(!target||!Number.isFinite(stamp(target)))continue;for(const [kind,ref] of [[link.homeKind,link.homeRef],[link.awayKind,link.awayRef]])if(kind==="winner"||kind==="loser"){const source=byId.get(ref);if(!source||!Number.isFinite(stamp(source)))add(target.gameId,`Gara sorgente ${ref} non allocata`);else if(stamp(target)<stamp(source)+duration)add(target.gameId,`Deve iniziare dopo la gara ${ref}`);}}
    return warnings;
  }
  function desktopMatchCard(item,warnings=[],positionStyle=""){return `<article class="desktop-game${warnings.length?" has-warning":""}" draggable="${tournamentState()==="planning"}" data-global-game="${esc(item.gameId)}" title="Trascina per spostare · clicca per assegnare lo staff" style="--match-tint:${tint(categoryColor(item.category),.22)};${positionStyle}"><div><strong>${esc(item.gameId)}</strong><span class="category-chip category-${esc(String(item.category).toLowerCase())}">${esc(item.category)}</span></div><p>${esc(expandMatchup(item.matchup))}</p><label>Ora <input class="desktop-time-24" type="text" inputmode="numeric" maxlength="5" pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]" placeholder="HH:MM" aria-label="Ora in formato 24 ore" data-global-time="${esc(item.gameId)}" value="${esc(item.time||"")}" ${tournamentState()==="planning"?"":"disabled"}></label>${warnings.length?`<small title="${esc(warnings.join(" · "))}">⚠ ${esc(warnings[0])}</small>`:""}</article>`;}
  function desktopDayHtml(day,rows,warnings,matchesFilter){const duration=Number(settingsCatalog.match_duration_minutes||70),dragStep=15,start=timeValue(day.startTime),end=timeValue(day.endTime||"23:59"),pixelsPerMinute=96/duration,height=Math.max(96,(end-start)*pixelsPerMinute),labels=[];for(let value=start;value<=end;value+=60)labels.push(value);if(labels.at(-1)!==end)labels.push(end);return `<section class="desktop-day"><header><div><span>${esc(day.code)}</span><h3>${esc(day.name)} · ${esc(italianDate(day.date))}</h3></div><small>${esc(day.startTime)}–${esc(day.endTime)}</small></header><div class="desktop-timeline"><aside class="desktop-time-axis"><div class="desktop-axis-head">Ora</div><div class="desktop-axis-body" style="height:${height}px">${labels.map(value=>`<time style="top:${Math.min(height,(value-start)*pixelsPerMinute)}px">${esc(clockValue(value))}</time>`).join("")}</div></aside><div class="desktop-court-grid" style="--court-count:${Math.max(1,courtsCatalog.length)};--minute-height:${pixelsPerMinute}px;--quarter-height:${dragStep*pixelsPerMinute}px;--match-height:${Math.max(38,duration*pixelsPerMinute-7)}px">${courtsCatalog.map(court=>{const lane=rows.filter(item=>item.date===day.date&&String(item.court)===String(court.code)&&matchesFilter(item)).sort((a,b)=>a.time.localeCompare(b.time)||a.gameId.localeCompare(b.gameId));return `<section class="desktop-court"><div class="desktop-court-head"><strong>${esc(court.name)}</strong><span>${lane.length}</span></div><div class="desktop-drop-zone" style="height:${height}px" data-global-drop="${esc(day.code)}|${esc(court.code)}">${lane.map(item=>desktopMatchCard(item,warnings.get(item.gameId)||[],`--timeline-top:${Math.max(0,(timeValue(item.time)-start)*pixelsPerMinute)}px`)).join("")||'<div class="desktop-empty-slot">Trascina qui</div>'}</div></section>`;}).join("")}</div></div></section>`;}
  function renderDesktopPlanner(force=false){
    const board=$("desktopBoard");if(!board)return;initializeDesktopDraft(force);const rows=desktopRows(),warnings=desktopWarningMap(),category=$("desktopCategoryFilter")?.value||"all",search=$("desktopSearch")?.value.trim().toLocaleLowerCase("it")||"",matchesFilter=item=>(category==="all"||item.category===category)&&(!search||`${item.gameId} ${expandMatchup(item.matchup)} ${item.category}`.toLocaleLowerCase("it").includes(search)),unallocated=rows.filter(item=>!item.date||!item.time||!item.court),allocated=rows.length-unallocated.length;
    const categorySelect=$("desktopCategoryFilter"),selected=categorySelect.value||"all";categorySelect.innerHTML=`<option value="all">Tutte</option>${categoriesCatalog.map(item=>`<option value="${esc(item.code)}">${esc(item.code)} · ${esc(item.name)}</option>`).join("")}`;categorySelect.value=[...categorySelect.options].some(option=>option.value===selected)?selected:"all";
    $("desktopTournamentState").textContent={planning:"Pianificazione",confirmed:"Piano confermato",live:"Torneo in corso",closed:"Torneo concluso"}[tournamentState()]||tournamentState();$("desktopAllocatedCount").textContent=allocated;$("desktopDraftCount").textContent=unallocated.length;$("desktopWarningCount").textContent=[...warnings.values()].reduce((sum,list)=>sum+list.length,0);$("desktopPoolCount").textContent=unallocated.length;
    $("desktopPool").innerHTML=unallocated.filter(matchesFilter).map(item=>desktopMatchCard(item,warnings.get(item.gameId)||[])).join("")||'<div class="planner-empty">Nessuna gara da allocare.</div>';
    board.innerHTML=daysCatalog.map(day=>desktopDayHtml(day,rows,warnings,matchesFilter)).join("")||'<div class="empty">Configura prima giornate e campi.</div>';
    const editable=tournamentState()==="planning";$("desktopSavePlan").disabled=!editable||!desktopDirty;$("desktopAutoAllocate").disabled=!editable;$("desktopResetDraft").disabled=!desktopDirty;renderDesktopPlanStatus();
  }
  function renderDesktopPlanStatus(){const message=$("desktopPlanMessage");if(!message)return;const state=["saving","error"].includes(desktopSaveState.kind)?desktopSaveState:desktopDirty?{kind:"draft",message:"Bozza locale: le modifiche non sono ancora state salvate.",warnings:[]}:desktopSaveState,warnings=state.warnings||[];message.className=`desktop-plan-state ${state.kind}`;message.innerHTML=`<strong>${state.kind==="draft"?"● Bozza":state.kind==="saving"?"◌ Salvataggio":state.kind==="error"?"! Salvataggio non riuscito":state.kind==="warning"?"⚠ Piano salvato con avvisi":"✓ Piano salvato"}</strong><span>${esc(state.message)}</span>${warnings.length?`<ul>${warnings.map(item=>`<li>${esc(item)}</li>`).join("")}</ul>`:""}`;}
  function markDesktopDraft(){desktopDirty=true;desktopSaveState={kind:"draft",message:"Bozza locale: le modifiche non sono ancora state salvate.",warnings:[]};}
  function moveDesktopGame(gameId,dayCode,courtCode,beforeGameId="",requestedTime=""){const day=daysCatalog.find(item=>item.code===dayCode);if(!day||tournamentState()!=="planning")return;const duration=Number(settingsCatalog.match_duration_minutes||70),lane=desktopRows().filter(item=>item.gameId!==gameId&&item.date===day.date&&String(item.court)===String(courtCode)).sort((a,b)=>a.time.localeCompare(b.time)||a.gameId.localeCompare(b.gameId)),beforeIndex=beforeGameId?lane.findIndex(item=>item.gameId===beforeGameId):-1;if(beforeIndex<0){const last=lane.at(-1),next=requestedTime?timeValue(requestedTime):last?timeValue(last.time)+duration:timeValue(day.startTime);desktopDraft.set(gameId,{date:day.date,time:clockValue(next),court:String(courtCode)});}else{const target=lane[beforeIndex],previous=lane[beforeIndex-1],targetTime=timeValue(target.time),previousTime=previous?timeValue(previous.time):timeValue(day.startTime)-duration;if(targetTime-previousTime>=duration*2){desktopDraft.set(gameId,{date:day.date,time:clockValue(targetTime-duration),court:String(courtCode)});}else{desktopDraft.set(gameId,{date:day.date,time:clockValue(targetTime),court:String(courtCode)});lane.slice(beforeIndex).forEach((item,index)=>{const current=desktopDraft.get(item.gameId)||{};desktopDraft.set(item.gameId,{...current,date:day.date,time:clockValue(targetTime+duration*(index+1)),court:String(courtCode)});});}}markDesktopDraft();renderDesktopPlanner();}
  async function saveDesktopPlan(){const schedule=[...desktopDraft].map(([gameId,value])=>({gameId,...value}));desktopSaveState={kind:"saving",message:"Salvataggio del piano completo in corso…",warnings:[]};renderDesktopPlanStatus();showActionToast("Salvataggio del piano completo…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"applyGlobal",schedule,baseFingerprint:desktopBaseFingerprint}),savedState={kind:payload.warnings?.length?"warning":"saved",message:payload.message||"Piano salvato nel database.",warnings:payload.warnings||[]};desktopDirty=false;desktopSaveState=savedState;await sync();desktopSaveState=savedState;renderDesktopPlanner(true);showActionToast(payload.message,payload.warnings?.length?"warning":undefined);}catch(error){desktopSaveState={kind:"error",message:error.message,warnings:[]};renderDesktopPlanStatus();showActionToast(error.message,"error");}}
  function openDesktopStaffEditor(gameId){const item=matchesCatalog.find(match=>match.gameId===gameId);if(!item||!currentUser)return;const form=$("desktopStaffForm"),roleOptions=(role,current)=>`<option value="">Da definire</option>${staffCatalog.filter(person=>person[role]).map(person=>`<option value="${esc(person.name)}" ${person.name===current?"selected":""}>${esc(person.name)}</option>`).join("")}`;form.elements.gameId.value=item.gameId;form.elements.scorekeeper.innerHTML=roleOptions("canScorekeeper",item.scorekeeper||"");form.elements.referee.innerHTML=roleOptions("canReferee",item.referee||"");form.elements.courtManager.innerHTML=roleOptions("canCourtManager",item.courtManager||"");$("desktopStaffDialogTitle").textContent=`Staff gara ${item.gameId}`;$("desktopStaffMatchup").textContent=expandMatchup(item.matchup);$("desktopStaffError").textContent="";$("desktopStaffDialog").showModal();}
  async function saveDesktopStaff(form){const data=Object.fromEntries(new FormData(form).entries()),error=$("desktopStaffError");error.textContent="";try{const payload=await apiPost("/api/admin/planner",{action:"bulkStaff",gameIds:[data.gameId],staff:{scorekeeper:data.scorekeeper,referee:data.referee,courtManager:data.courtManager}});$("desktopStaffDialog").close();await sync();desktopSaveState={kind:"saved",message:`Staff della gara ${data.gameId} salvato. Il piano rimane salvato.`,warnings:[]};renderDesktopPlanStatus();showActionToast(payload.message||"Staff salvato.");}catch(err){error.textContent=err.message;}}
  async function inspectConfiguration(file){const status=$("configurationImportStatus");configurationCandidate=null;$("applyConfiguration").disabled=true;if(!file){status.textContent="Nessun file selezionato.";return;}status.textContent="Analisi della configurazione…";try{const configuration=JSON.parse(await file.text()),payload=await apiPost("/api/admin/configuration",{action:"validate",configuration});configurationCandidate=configuration;const summary=payload.summary||{},warnings=payload.warnings||[];status.innerHTML=`<strong>Configurazione valida</strong><span>${summary.categories||0} categorie · ${summary.groups||0} gironi · ${summary.teams||0} squadre · ${summary.matches||0} gare · ${summary.days||0} giornate · ${summary.courts||0} campi</span>${warnings.length?`<small>⚠ ${esc(warnings.join(" · "))}</small>`:""}`;$("applyConfiguration").disabled=tournamentState()!=="planning";}catch(error){status.textContent=error.message;showActionToast(error.message,"error");}}
  async function applyConfiguration(){if(!configurationCandidate)return;if(!confirm("Sostituire la configurazione corrente? Prima dell’importazione conserva una copia tramite ‘Scarica configurazione’."))return;showActionToast("Importazione della configurazione…","busy");try{const payload=await apiPost("/api/admin/configuration",{action:"apply",configuration:configurationCandidate});configurationCandidate=null;$("configurationFile").value="";$("applyConfiguration").disabled=true;$("configurationImportStatus").textContent=payload.message;desktopDirty=false;plannerDirty=false;await sync();showActionToast(payload.message);}catch(error){showActionToast(error.message,"error");}}

  function configurationIssues(){
    const issues=[],unallocated=matchesCatalog.filter(item=>!item.date||!item.time||!item.court||item.status==="draft");
    if(unallocated.length)issues.push(`${unallocated.length} gare ancora da allocare.`);const unassigned=teamsCatalog.filter(team=>!team.groupCode);if(unassigned.length)issues.push(`${unassigned.length} squadre non ancora assegnate a un girone.`);
    categoriesCatalog.forEach(category=>{
      const groups=groupsCatalog.filter(group=>group.categoryCode===category.code);if(!groups.length)issues.push(`${category.code}: nessun girone.`);
      const depth=category.admissionMethod==="top8_each"?8:category.admissionMethod==="top4_each"?4:2;
      groups.forEach(group=>{const count=teamsCatalog.filter(team=>team.categoryCode===category.code&&team.groupCode===group.code).length;if(count<2)issues.push(`${category.code} ${group.name}: servono almeno 2 squadre.`);else if(category.admissionMethod?.endsWith("_each")&&count<depth)issues.push(`${category.code} ${group.name}: servono almeno ${depth} squadre per l’ammissione scelta.`);});
      const qualified=category.admissionMethod==="top8_each"?groups.length*8:category.admissionMethod==="top4_each"?groups.length*4:category.admissionMethod==="top2_each"?groups.length*2:category.admissionMethod==="winners_plus_best_second"?4:groups.length,needed=category.entryRound==="round_of_16"?16:category.entryRound==="quarterfinals"?8:category.entryRound==="final"?2:category.placementMode==="top8"?8:4;
      if(category.admissionMethod!=="winners_round_robin"&&groups.length&&qualified!==needed)issues.push(`${category.code}: ${qualified} qualificate, ma il formato scelto ne richiede ${needed}.`);
      if(category.entryRound==="final"&&category.placementMode!=="top2")issues.push(`${category.code}: la finale diretta può determinare soltanto 1° e 2° posto.`);
      if(category.admissionMethod==="winners_round_robin"&&category.placementMode!=="top2")issues.push(`${category.code}: il girone finale tra le vincitrici richiede il livello 1°–2°.`);
      const expected=groups.reduce((sum,group)=>{const n=teamsCatalog.filter(team=>team.categoryCode===category.code&&team.groupCode===group.code).length;return sum+n*(n-1)/2;},0),actual=matchesCatalog.filter(item=>item.category===category.code&&item.phase==="girone").length;
      if(actual<expected)issues.push(`${category.code}: mancano ${expected-actual} gare di girone da generare.`);
      if(expected&&actual>=expected&&!matchesCatalog.some(item=>item.category===category.code&&item.phase!=="girone"))issues.push(`${category.code}: fase finale da generare.`);
    });
    const duration=Number(settingsCatalog.match_duration_minutes||70),allocated=matchesCatalog.filter(item=>item.date&&item.time&&item.court&&item.status!=="draft"),minutes=item=>{const [h,m]=item.time.split(":").map(Number);return h*60+m;};
    allocated.forEach(item=>{const day=daysCatalog.find(entry=>entry.date===item.date);if(!day)issues.push(`Gara ${item.gameId}: la data non appartiene a una giornata configurata.`);else{const start=minutes({time:day.startTime}),end=minutes({time:day.endTime||"23:59"}),at=minutes(item);if(at<start||at+duration>end)issues.push(`Gara ${item.gameId}: non rientra nell’orario ${day.startTime}–${day.endTime||"23:59"} di ${day.name}.`);}});
    for(let i=0;i<allocated.length;i++)for(let j=i+1;j<allocated.length;j++){const a=allocated[i],b=allocated[j];if(a.date!==b.date||minutes(a)>=minutes(b)+duration||minutes(b)>=minutes(a)+duration)continue;if(a.court===b.court)issues.push(`Gare ${a.gameId} e ${b.gameId}: stesso campo nella stessa fascia.`);const first=new Set(teamCodes(a.matchup)),second=new Set(teamCodes(b.matchup));if([...first].some(code=>second.has(code)))issues.push(`Gare ${a.gameId} e ${b.gameId}: stessa squadra nella stessa fascia.`);const people=[a.referee,a.courtManager].filter(Boolean),busy=[b.referee,b.courtManager].filter(Boolean).find(name=>people.includes(name));if(busy)issues.push(`${busy}: assegnazione contemporanea nelle gare ${a.gameId} e ${b.gameId}.`);}
    return [...new Set(issues)];
  }

  function workflowSteps(){
    const issues=configurationIssues(),unassigned=teamsCatalog.filter(team=>!team.groupCode).length,unallocated=matchesCatalog.filter(item=>!item.date||!item.time||!item.court||item.status==="draft").length;
    const structureReady=categoriesCatalog.length>0&&courtsCatalog.length>0&&daysCatalog.length>0,teamsReady=teamsCatalog.length>0&&categoriesCatalog.every(category=>teamsCatalog.some(team=>team.categoryCode===category.code)),groupsReady=groupsCatalog.length>0&&teamsCatalog.length>0&&!unassigned;
    const generationIssues=issues.filter(item=>/mancano .* gare di girone|fase finale da generare/i.test(item)),matchesReady=matchesCatalog.length>0&&!generationIssues.length;
    const planIssues=issues.filter(item=>!/squadre non ancora assegnate|mancano .* gare di girone|fase finale da generare/i.test(item)),allocationReady=matchesReady&&!unallocated&&!planIssues.length,confirmed=allocationReady&&String(settingsCatalog.plan_confirmed||"0")==="1"&&tournamentState()!=="planning",done=[structureReady,false,false,false,false,false];done[1]=done[0]&&teamsReady;done[2]=done[1]&&groupsReady;done[3]=done[2]&&matchesReady;done[4]=done[3]&&allocationReady;done[5]=done[4]&&confirmed;
    return [
      {title:"Struttura del torneo",done:done[0],detail:structureReady?`${categoriesCatalog.length} categorie, ${courtsCatalog.length} campi e ${daysCatalog.length} giornate configurati.`:"Configura almeno una categoria, un campo e una giornata nel tab Gestione."},
      {title:"Squadre",done:done[1],detail:teamsReady?`${teamsCatalog.length} squadre inserite.`:"Inserisci almeno una squadra per ciascuna categoria configurata."},
      {title:"Composizione dei gironi",done:done[2],detail:!done[1]?"Completa prima l’inserimento delle squadre.":groupsReady?"Tutte le squadre sono state assegnate.":unassigned?`Assegna ancora ${unassigned} ${unassigned===1?"squadra":"squadre"} dal tab Gironi.`:"Crea i gironi e assegna tutte le squadre."},
      {title:"Generazione delle gare",done:done[3],detail:!done[2]?"Completa prima la composizione dei gironi.":matchesReady?`${matchesCatalog.length} gare generate, comprese le fasi finali.`:"Da Gestione usa “Genera tutte le gare” per ogni categoria."},
      {title:"Campi, giorni e orari",done:done[4],detail:!done[3]?"Diventa disponibile dopo la generazione delle gare.":allocationReady?"Tutte le gare sono allocate e i controlli di coerenza sono superati.":unallocated?`Restano ${unallocated} ${unallocated===1?"gara da allocare":"gare da allocare"} nel tab Pianifica.`:planIssues[0]||"Completa la pianificazione e risolvi i controlli indicati."},
      {title:"Conferma del piano",done:done[5],detail:confirmed?`Piano confermato · ${tournamentState()==="live"?"torneo in corso":tournamentState()==="closed"?"torneo concluso":"pronto per l’avvio"}.`:allocationReady?"Nel tab Pianifica seleziona “Valida e conferma il piano”.":"Diventa disponibile dopo il completamento dei passaggi precedenti."}
    ];
  }
  function renderWorkflowGuide(){
    const steps=workflowSteps(),completed=steps.filter(step=>step.done).length,current=Math.max(0,steps.findIndex(step=>!step.done)),html=steps.map((step,index)=>`<li class="workflow-step ${step.done?"done":index===current?"current":"pending"}"><span class="workflow-step-number">${step.done?"✓":index+1}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.detail)}</small></div><span class="workflow-step-status">${step.done?"Fatto":index===current?"Adesso":"Dopo"}</span></li>`).join("");
    [["workflowChecklist","workflowProgress"],["plannerWorkflowChecklist","plannerWorkflowProgress"]].forEach(([listId,progressId])=>{if($(listId))$(listId).innerHTML=html;if($(progressId))$(progressId).textContent=`${completed} di ${steps.length}`;});
  }

  function themeFormValues(){const data=Object.fromEntries(new FormData($("themeForm")).entries());return {...themeDefaults,...data,radius:String(data.radius||themeDefaults.radius)};}
  function renderThemePresets(active){$("themePresetList").innerHTML=Object.values(themePresets).map(theme=>`<button type="button" class="preset-card${active===theme.preset?" active":""}" data-theme-preset="${esc(theme.preset)}"><span class="preset-swatches"><i style="background:${esc(theme.primary)}"></i><i style="background:${esc(theme.accent)}"></i><i style="background:${esc(theme.background)}"></i></span><strong>${esc(theme.label)}</strong></button>`).join("");}
  function fillThemeForm(theme,preview=true){const form=$("themeForm");Object.entries(theme).forEach(([name,value])=>{if(form.elements[name])form.elements[name].value=value;});$("themeRadiusValue").textContent=`${theme.radius} px`;renderThemePresets(theme.preset);if(preview)applyTheme(theme);}
  function renderThemeEditor(){if(!currentUser||themePreviewDirty)return;fillThemeForm(themeFromSettings(settingsCatalog),false);}
  async function saveTheme(action="save"){
    const box=$("themeMessage");box.textContent=action==="reset"?"Ripristino dello stile attuale…":"Salvataggio dello stile…";
    showActionToast(box.textContent,"busy");try{const payload=await apiPost("/api/admin/theme",action==="reset"?{action:"reset"}:{action:"save",theme:themeFormValues()});Object.entries(payload.theme||{}).forEach(([key,value])=>settingsCatalog[`ui_${key==="preset"?"theme_preset":key}`]=String(value));themePreviewDirty=false;fillThemeForm(payload.theme||themeDefaults);box.textContent=payload.message;showActionToast(payload.message);}
    catch(error){box.textContent=error.message;applyTheme(themeFromSettings(settingsCatalog));showActionToast(error.message,"error");}
  }

  function setAuth(user){
    currentUser=user?.role==="admin"?user:null;
    $("adminTab").hidden=!currentUser;
    $("groupsTab").hidden=!currentUser;
    $("themeTab").hidden=!currentUser;
    $("noticeAdmin").hidden=!currentUser;
    updatePlanVisibility();
    document.body.classList.toggle("admin-visible",Boolean(currentUser));
    $("loginButton").textContent=currentUser?`Esci · ${currentUser.username}`:"Accesso admin";
    if(!currentUser&&[$("adminView"),$("groupsView"),$("plannerView"),$("desktopPlannerView"),$("themeView")].some(view=>view.classList.contains("active"))){document.querySelectorAll(".nav-item,.view").forEach(el=>el.classList.remove("active"));$("agendaTab").classList.add("active");$("agendaView").classList.add("active");}
    renderAgenda();renderTeams();
    if(currentUser){renderAdmin();renderGroupPlanner();renderDesktopPlanner();renderThemeEditor();}
  }

  async function loadSession(){
    try{const response=await fetch("/api/auth/session",{cache:"no-store"});const payload=await response.json();setAuth(payload.user||null);}catch{setAuth(null);}
  }

  function openResultEditor(gameId){
    const match=matches.find(item=>item.gameId===gameId);if(!match||!currentUser||tournamentState()!=="live")return;
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
    $("dayAdminList").innerHTML=daysCatalog.map(item=>adminRow(`<strong>${esc(item.name)}</strong> · ${esc(italianDate(item.date))} · ${esc(item.startTime)}–${esc(item.endTime||"23:59")}`,"day",item.code)).join("");
    $("categoryAdminList").innerHTML=categoriesCatalog.map(item=>{const admission=item.admissionMethod==="top8_each"?"prime 8 per girone":item.admissionMethod==="top4_each"?"prime 4 per girone":item.admissionMethod==="top2_each"?"prime 2 per girone":item.admissionMethod==="winners_plus_best_second"?"vincitrici + migliore seconda":"girone finale vincitrici",placement=item.placementMode==="top8"?"posti 1°–8°":item.placementMode==="top4"?"posti 1°–4°":"posti 1°–2°",entry=item.entryRound==="round_of_16"?"dagli ottavi":item.entryRound==="quarterfinals"?"dai quarti":item.entryRound==="final"?"finale diretta":"dalle semifinali";return adminRow(`<strong>${esc(item.code)}</strong> · ${esc(item.name)} · ${esc(admission)} · ${esc(entry)} · ${esc(placement)}`,"category",item.code);}).join("");
    $("groupAdminList").innerHTML=groupsCatalog.map(item=>adminRow(`<strong>${esc(item.categoryCode)} ${esc(item.code)}</strong> · ${esc(item.name)}`,"group",`${item.categoryCode}|${item.code}`)).join("");
    $("teamAdminList").innerHTML=teamsCatalog.map(item=>adminRow(`<strong>${esc(item.code)}</strong> · ${esc(item.name)} · ${esc(item.categoryCode)} · ${item.groupCode?`girone ${esc(item.groupCode)}`:"non assegnata"}`,"team",item.code)).join("");
    $("staffAdminList").innerHTML=staffCatalog.map(item=>{const roles=[item.canReferee&&"arbitro",item.canScorekeeper&&"refertista",item.canCourtManager&&"responsabile"].filter(Boolean).join(", ");return adminRow(`<strong>${esc(item.name)}</strong> · ${esc(roles)}`,"staff",item.id);}).join("");
    const state=tournamentState();$("matchAdminList").innerHTML=matchesCatalog.map(item=>{const allocationLocked=state==="confirmed"||state==="closed"||state==="live"&&(item.status==="live"||item.status==="completed");return `<div style="--match-tint:${tint(categoryColor(item.category),.18)}"><span><strong>${esc(item.gameId)}</strong> · ${item.date?esc(italianDate(item.date)):"da allocare"} ${esc(item.time||"")} · ${esc(item.category)} · ${esc(expandMatchup(item.matchup))}${item.status==="draft"?'<span class="draft-badge">bozza</span>':""}</span><span class="admin-row-actions"><button type="button" data-admin-edit="allocation" data-admin-key="${esc(item.gameId)}" ${allocationLocked?"disabled":""}>Alloca</button><button type="button" data-admin-delete="match" data-admin-key="${esc(item.gameId)}" ${state!=="planning"?"disabled":""}>Elimina</button></span></div>`;}).join("");
    $("finalLinkAdminList").innerHTML=finalLinksCatalog.map(item=>`<div><span><strong>Gara ${esc(item.targetGameId)}</strong> · ${esc(item.sectionTitle)} · ${esc(item.homeKind)} ${esc(item.homeRef)} / ${esc(item.awayKind)} ${esc(item.awayRef)}</span></div>`).join("");
    const issues=configurationIssues(),status=$("configurationStatus"),shown=issues.slice(0,8),remaining=issues.length-shown.length,confirmed=String(settingsCatalog.plan_confirmed||"0")==="1";status.classList.toggle("complete",!issues.length);status.innerHTML=issues.length?`<strong>Configurazione incompleta · ${issues.length} controlli da risolvere</strong><ul>${shown.map(item=>`<li>${esc(item)}</li>`).join("")}${remaining?`<li>Altri ${remaining} dettagli sono riportati nell’Excel di controllo.</li>`:""}</ul>`:confirmed?`Piano confermato · stato: ${esc(state==="live"?"torneo in corso":state==="closed"?"torneo concluso":"pronto per l’avvio")}.`:"Configurazione completa: usa “Valida e conferma il piano” nel tab Pianifica.";
    const structural=["settingsForm","courtForm","dayForm","categoryForm","groupForm","teamForm"];structural.forEach(id=>[...$(id).elements].forEach(control=>control.disabled=state!=="planning"));[...$("staffForm").elements].forEach(control=>control.disabled=state==="closed");[...$("allocationForm").elements].forEach(control=>control.disabled=state==="confirmed"||state==="closed");document.querySelectorAll("[data-generate]").forEach(button=>button.disabled=state!=="planning");$("clearMatches").disabled=state!=="planning";
    renderWorkflowGuide();renderPlanner();renderGroupPlanner();
  }

  function entityData(entity,key){
    if(entity==="category")return categoriesCatalog.find(item=>item.code===key);
    if(entity==="group"){const [categoryCode,code]=key.split("|");return groupsCatalog.find(item=>item.categoryCode===categoryCode&&item.code===code);}
    if(entity==="team")return teamsCatalog.find(item=>item.code===key);
    if(entity==="court")return courtsCatalog.find(item=>item.code===key);
    if(entity==="day"){const item=daysCatalog.find(row=>row.code===key);return item&&{...item,date:italianDate(item.date)};}
    if(entity==="staff")return staffCatalog.find(item=>String(item.id)===String(key));
    if(entity==="finalLink")return finalLinksCatalog.find(item=>item.targetGameId===key);
    if(entity==="allocation"){const item=matchesCatalog.find(match=>match.gameId===key);if(!item)return null;return {gameId:item.gameId,date:italianDate(item.date),time:item.time,court:item.court,scorekeeper:item.scorekeeper,referee:item.referee,courtManager:item.courtManager||""};}
    return null;
  }

  function formForEntity(entity){return $(`${entity}Form`);}
  function fillAdminForm(entity,key){const data=entityData(entity,key),form=formForEntity(entity);if(!data||!form)return;Object.entries(data).forEach(([name,value])=>{if(form.elements[name]){if(form.elements[name].type==="checkbox")form.elements[name].checked=Boolean(value);else form.elements[name].value=value??"";}});if(entity==="category")updateAdmissionAdvice();if(entity==="allocation")$("allocationDetails").open=true;form.scrollIntoView({behavior:"smooth",block:"center"});}

  async function saveAdminEntity(entity,form){
    const labels={settings:"Impostazioni salvate.",court:"Campo salvato.",day:"Giornata salvata.",category:"Categoria salvata.",group:"Girone salvato.",team:"Squadra salvata.",staff:"Persona dello staff salvata.",allocation:"Dettagli della gara salvati."},data=Object.fromEntries(new FormData(form).entries());showActionToast("Salvataggio in corso…","busy");const payload=await apiPost("/api/admin/catalog",{entity,action:"save",data});form.reset();await sync();renderAdmin();showActionToast(payload.message||labels[entity]||"Dati salvati.");
  }

  async function generateSchedule(scope){
    const categoryCode=$("generationForm").elements.categoryCode.value,box=$("generationMessage");box.textContent="Generazione in corso…";
    showActionToast(`Generazione delle gare ${categoryCode}…`,"busy");try{let messages=[];if(scope==="all"){const groups=await apiPost("/api/admin/generate",{scope:"groups",categoryCode});messages.push(groups.message);await sync();if(!matchesCatalog.some(item=>item.category===categoryCode&&item.phase!=="girone")){const finals=await apiPost("/api/admin/generate",{scope:"finals",categoryCode});messages.push(finals.message);}}else{const payload=await apiPost("/api/admin/generate",{scope,categoryCode});messages.push(payload.message);}box.textContent=messages.filter(Boolean).join(" ")||"Generazione completata.";await sync();renderAdmin();showActionToast(box.textContent);}
    catch(error){box.textContent=error.message;showActionToast(error.message,"error");throw error;}
  }

  async function deleteAdminEntity(entity,key){
    if(!confirm("Eliminare questo elemento dall’ambiente di test?"))return;
    const data=entity==="group"?{categoryCode:key.split("|")[0],code:key.split("|")[1]}:entity==="match"?{gameId:key}:entity==="finalLink"?{targetGameId:key}:entity==="staff"?{id:key}:{code:key};
    showActionToast("Eliminazione in corso…","busy");await apiPost("/api/admin/catalog",{entity,action:"delete",data});await sync();renderAdmin();showActionToast("Elemento eliminato.");
  }

  function restoreSelections(){
    try{
      const saved=JSON.parse(localStorage.getItem(selectionKey)||"{}");
      ["categoryFilter","courtFilter","teamSelect","standingsCategory","finalsCategory","groupPlannerCategory"].forEach(id=>{
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
      groupPlannerCategory:$("groupPlannerCategory").value,
      upcomingOnly:$("upcomingOnly").checked
    }));
  }

  function renderNotices(){
    $("noticeList").innerHTML=notices.map(item=>`<article class="info-card${item.accent?" accent":""}"><div class="notice-head"><h3>${esc(item.title)}</h3>${currentUser?`<button type="button" data-delete-notice="${esc(item.id)}">Rimuovi</button>`:""}</div><p>${esc(item.message)}</p>${item.createdAt?`<small>${esc(new Date(item.createdAt).toLocaleString("it-IT",{dateStyle:"short",timeStyle:"short"}))}</small>`:""}</article>`).join("")||'<article class="info-card"><p>Nessun avviso pubblicato.</p></article>';
  }

  function changedResults(previous,current){
    const oldById=new Map((previous||[]).map(match=>[match.gameId,resultText(match)]));
    return current.filter(match=>{const value=resultText(match);return value && value!==oldById.get(match.gameId);});
  }

  function hideActionToast(){clearTimeout(actionToastTimer);$("actionToast").classList.remove("visible");$("actionToast").setAttribute("aria-hidden","true");}
  function showActionToast(message,type="success",title=""){
    const toast=$("actionToast"),labels={success:"Operazione completata",warning:"Bozza salvata con avvisi",error:"Operazione non riuscita",busy:"Operazione in corso"},icons={success:"✓",warning:"⚠",error:"!",busy:"…"};clearTimeout(actionToastTimer);toast.className=`action-toast ${type}`;$("actionToastTitle").textContent=title||labels[type]||labels.success;$("actionToastMessage").textContent=message;$("actionToastIcon").textContent=icons[type]||icons.success;toast.classList.add("visible");toast.setAttribute("aria-hidden","false");if(type!=="busy")actionToastTimer=setTimeout(hideActionToast,type==="error"?7000:4500);
  }

  function hideResultToast(){
    clearTimeout(toastTimer);$("resultToast").classList.remove("visible");$("resultToast").setAttribute("aria-hidden","true");
  }

  function showResultToast(changes){
    if(!changes.length)return;
    const visible=changes.slice(0,3).map(match=>`<button type="button" class="result-update-card" data-result-destination="${match.phase==="girone"?"standings":"finals"}" data-result-category="${esc(match.category)}" style="--match-tint:${tint(categoryColor(match.category),.20)}" aria-label="Apri ${match.phase==="girone"?"la classifica":"la fase finale"} ${esc(match.category)}"><div class="result-update-time">${esc(match.time)}<small>Campo ${esc(match.court)} · gara ${esc(match.gameId)}</small></div><div class="result-update-main"><strong>${esc(expandMatchup(resolvedMatchup(match)))}</strong><p>${esc(resultText(match))}</p></div><span class="category-chip category-${esc(String(match.category).toLowerCase())}">${esc(match.category)}</span></button>`).join("");
    const more=changes.length>3?`<p class="result-toast-more">Altri ${changes.length-3} risultati aggiornati</p>`:"";
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
    try{const live=await fetchLiveMatches();mergeLive(live);populateCategorySelectors();populateTeams();const detected=cached?.matches?changedResults(cached.matches,matches):[];const changes=detected.filter(match=>!locallySavedResultIds.delete(String(match.gameId))),knownNoticeIds=new Set((cached?.notices||[]).map(item=>String(item.id))),newNotice=notices.find(item=>item.id&&!knownNoticeIds.has(String(item.id))&&!sessionStorage.getItem(`volleystars-authored-notice-${item.id}`));localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),matches,notices,standings:sheetStandings}));setSync("live",`Aggiornato ora · ${config.label}`);showResultToast(changes);if(newNotice)showActionToast(newNotice.message,"warning",newNotice.title);}
    catch(error){notices=cached?.notices||[];if(cached?.matches){matches=cached.matches;sheetStandings=cached.standings||{};setSync("error",`Offline · dati salvati ${new Date(cached.at).toLocaleString("it-IT")}`);}else setSync("error",`Calendario offline · risultati non sincronizzati (${config.label})`);}
    finally{syncing=false;}
    renderAgenda();renderTeams();renderStandings();renderFinals();renderNotices();if(currentUser){renderAdmin();renderGroupPlanner();renderDesktopPlanner();renderThemeEditor();}
  }

  $("environmentInfo").textContent=`Configurazione attiva: ${config.label}. Database interno D1.`;
  document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item,.view").forEach(el=>el.classList.remove("active"));button.classList.add("active");$(button.dataset.view).classList.add("active");}));
  document.addEventListener("click",event=>{
    const destination=event.target.closest("[data-result-destination]");if(destination){const finals=destination.dataset.resultDestination==="finals",select=$(finals?"finalsCategory":"standingsCategory"),category=destination.dataset.resultCategory;if([...select.options].some(option=>option.value===category))select.value=category;saveSelections();finals?renderFinals():renderStandings();$(finals?"finalsTab":"standingsTab").click();hideResultToast();window.scrollTo({top:0,behavior:"smooth"});return;}
    const edit=event.target.closest("[data-edit-game]");if(edit){event.stopPropagation();openResultEditor(edit.dataset.editGame);return;}
    const editAdmin=event.target.closest("[data-admin-edit]");if(editAdmin){fillAdminForm(editAdmin.dataset.adminEdit,editAdmin.dataset.adminKey);return;}
    const deleteAdmin=event.target.closest("[data-admin-delete]");if(deleteAdmin){deleteAdminEntity(deleteAdmin.dataset.adminDelete,deleteAdmin.dataset.adminKey).catch(error=>showActionToast(error.message,"error"));return;}
    const deleteNotice=event.target.closest("[data-delete-notice]");if(deleteNotice){if(confirm("Rimuovere questo avviso dalla bacheca?"))apiPost("/api/admin/notices",{action:"delete",data:{id:deleteNotice.dataset.deleteNotice}}).then(sync).catch(error=>showActionToast(error.message,"error"));return;}
    const generator=event.target.closest("[data-generate]");if(generator){generateSchedule(generator.dataset.generate).catch(()=>{});return;}
    const court=event.target.closest("[data-planner-court]");if(court){plannerSelectedCourt=court.dataset.plannerCourt;renderPlanner();return;}
    const add=event.target.closest("[data-planner-add]");if(add){plannerAdd(add.dataset.plannerAdd);return;}
    const remove=event.target.closest("[data-planner-remove]");if(remove){plannerRemove(remove.dataset.plannerRemove);return;}
    const move=event.target.closest("[data-planner-move]");if(move){plannerMove(move.dataset.game,move.dataset.plannerMove);return;}
    const desktopGame=event.target.closest("[data-global-game]");if(desktopGame&&!event.target.closest("input")&&!event.target.closest("button")){openDesktopStaffEditor(desktopGame.dataset.globalGame);return;}
    const preset=event.target.closest("[data-theme-preset]");if(preset){themePreviewDirty=true;fillThemeForm(themePresets[preset.dataset.themePreset]||themeDefaults);$("themeMessage").textContent="Anteprima applicata. Salva per renderla visibile a tutti.";return;}
    const closer=event.target.closest("[data-close-dialog]");if(closer){$(closer.dataset.closeDialog).close();return;}
    const card=event.target.closest(".match-card");if(card)toggleMatchCard(card);
  });
  document.addEventListener("keydown",event=>{const card=event.target.closest(".match-card");if(card&&(event.key==="Enter"||event.key===" ")){event.preventDefault();toggleMatchCard(card);}});
  document.addEventListener("dragstart",event=>{const globalGame=event.target.closest("[data-global-game]"),game=event.target.closest("[data-planner-game]"),team=event.target.closest("[data-group-team]");if(globalGame&&event.dataTransfer){const duration=Number(settingsCatalog.match_duration_minutes||70),pixelsPerMinute=96/duration,rect=globalGame.getBoundingClientRect();desktopDragOffsetMinutes=Math.max(0,(event.clientY-rect.top)/pixelsPerMinute);event.dataTransfer.setData("text/plain",`global:${globalGame.dataset.globalGame}`);event.dataTransfer.effectAllowed="move";}else if(game&&event.dataTransfer){event.dataTransfer.setData("text/plain",game.dataset.plannerGame);event.dataTransfer.effectAllowed="move";}else if(team&&event.dataTransfer){event.dataTransfer.setData("text/plain",`team:${team.dataset.groupTeam}`);event.dataTransfer.effectAllowed="move";}});
  document.addEventListener("dragover",event=>{if(event.target.closest("[data-planner-drop],[data-group-drop],[data-global-drop]")){event.preventDefault();event.dataTransfer.dropEffect="move";}});
  document.addEventListener("drop",event=>{if(!event.dataTransfer)return;const value=event.dataTransfer.getData("text/plain"),globalZone=event.target.closest("[data-global-drop]");if(globalZone&&value.startsWith("global:")){event.preventDefault();const [dayCode,court]=globalZone.dataset.globalDrop.split("|"),day=daysCatalog.find(item=>item.code===dayCode),duration=Number(settingsCatalog.match_duration_minutes||70),pixelsPerMinute=96/duration,rawMinutes=day?timeValue(day.startTime)+(event.clientY-globalZone.getBoundingClientRect().top)/pixelsPerMinute-desktopDragOffsetMinutes:0,snappedMinutes=Math.max(0,Math.round(rawMinutes/15)*15),requested=day?clockValue(snappedMinutes):"";desktopDragOffsetMinutes=0;moveDesktopGame(value.slice(7),dayCode,court,"",requested);return;}const groupZone=event.target.closest("[data-group-drop]");if(groupZone&&value.startsWith("team:")){event.preventDefault();moveTeamToGroup(value.slice(5),groupZone.dataset.groupDrop);return;}const zone=event.target.closest("[data-planner-drop]");if(!zone||value.startsWith("team:")||value.startsWith("global:"))return;event.preventDefault();plannerSelectedCourt=zone.dataset.plannerDrop;plannerAdd(value);});
  document.addEventListener("change",event=>{const time=event.target.closest("[data-global-time]");if(time){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)){showActionToast("Inserisci l’orario nel formato 24 ore HH:MM, per esempio 14:30.","error");renderDesktopPlanner();return;}const current=desktopDraft.get(time.dataset.globalTime)||{};desktopDraft.set(time.dataset.globalTime,{...current,time:time.value});markDesktopDraft();renderDesktopPlanner();return;}const select=event.target.closest("[data-team-group-select]");if(select)moveTeamToGroup(select.dataset.teamGroupSelect,select.value);const bulk=event.target.closest("[data-bulk-game]");if(bulk){bulk.checked?bulkStaffSelection.add(bulk.dataset.bulkGame):bulkStaffSelection.delete(bulk.dataset.bulkGame);}});
  $("categoryFilter").addEventListener("change",()=>{saveSelections();renderAgenda();});$("courtFilter").addEventListener("change",()=>{saveSelections();renderAgenda();});$("upcomingOnly").addEventListener("change",()=>{saveSelections();renderAgenda();});$("teamSelect").addEventListener("change",()=>{saveSelections();updateTeamSelectColor();renderTeams();});$("standingsCategory").addEventListener("change",()=>{saveSelections();renderStandings();});$("finalsCategory").addEventListener("change",()=>{saveSelections();renderFinals();});$("groupPlannerCategory").addEventListener("change",()=>{saveSelections();renderGroupPlanner();});$("refreshButton").addEventListener("click",sync);$("resultToastClose").addEventListener("click",hideResultToast);$("actionToastClose").addEventListener("click",hideActionToast);
  $("loginButton").addEventListener("click",async()=>{if(currentUser){await apiPost("/api/auth/logout",{});setAuth(null);}else{$("loginError").textContent="";$("loginDialog").showModal();}});
  $("loginForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());try{const payload=await apiPost("/api/auth/login",data);$("loginDialog").close();form.reset();setAuth(payload.user);}catch(error){$("loginError").textContent=error.message;}});
  $("noticeForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());showActionToast("Pubblicazione dell’avviso…","busy");try{const payload=await apiPost("/api/admin/notices",{action:"create",data});if(payload.noticeId)sessionStorage.setItem(`volleystars-authored-notice-${payload.noticeId}`,"1");form.reset();await sync();showActionToast(payload.message||"Avviso pubblicato.");}catch(error){showActionToast(error.message,"error");}});
  $("resultForm").addEventListener("submit",async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries());showActionToast("Salvataggio del risultato…","busy");try{await apiPost("/api/results",{gameId:data.gameId,category:data.category,result:data.result,sets:[data.set1,data.set2,data.set3]});locallySavedResultIds.add(String(data.gameId));$("resultDialog").close();await sync();showActionToast(`Risultato della gara ${data.gameId} salvato.`);}catch(error){$("resultError").textContent=error.message;showActionToast(error.message,"error");}});
  [["settingsForm","settings"],["courtForm","court"],["dayForm","day"],["categoryForm","category"],["groupForm","group"],["teamForm","team"],["staffForm","staff"],["allocationForm","allocation"]].forEach(([id,entity])=>$(id).addEventListener("submit",async event=>{event.preventDefault();try{await saveAdminEntity(entity,event.currentTarget);}catch(error){showActionToast(error.message,"error");}}));
  $("categoryForm").elements.code.addEventListener("input",updateAdmissionAdvice);$("categoryForm").elements.admissionMethod.addEventListener("change",updateAdmissionAdvice);$("categoryForm").elements.entryRound.addEventListener("change",updateAdmissionAdvice);$("categoryForm").elements.placementMode.addEventListener("change",updateAdmissionAdvice);
  $("allocationForm").elements.gameId.addEventListener("change",event=>fillAdminForm("allocation",event.currentTarget.value));
  $("plannerDay").addEventListener("change",()=>{plannerDirty=false;plannerDayCode=$("plannerDay").value;renderPlanner(true);});$("savePlanner").addEventListener("click",savePlanner);$("confirmPlan").addEventListener("click",confirmPlan);$("autoAllocate").addEventListener("click",autoAllocate);
  $("desktopCategoryFilter").addEventListener("change",()=>renderDesktopPlanner());$("desktopSearch").addEventListener("input",()=>renderDesktopPlanner());$("desktopResetDraft").addEventListener("click",()=>{desktopSaveState={kind:"saved",message:"Bozza annullata: è mostrato il piano salvato nel database.",warnings:[]};renderDesktopPlanner(true);});$("desktopSavePlan").addEventListener("click",saveDesktopPlan);$("desktopAutoAllocate").addEventListener("click",async()=>{await autoAllocate();renderDesktopPlanner(true);});
  $("desktopStaffForm").addEventListener("submit",event=>{event.preventDefault();saveDesktopStaff(event.currentTarget);});
  $("configurationFile").addEventListener("change",event=>inspectConfiguration(event.target.files?.[0]));$("applyConfiguration").addEventListener("click",applyConfiguration);
  $("reopenPlan").addEventListener("click",()=>{if(confirm("Riaprire la pianificazione? La Classifica verrà nascosta finché il piano non sarà riconfermato."))setTournamentState("planning");});$("startTournament").addEventListener("click",()=>setTournamentState("live"));$("closeTournament").addEventListener("click",()=>{if(confirm("Concludere il torneo e bloccare tutte le modifiche?"))setTournamentState("closed");});$("reopenTournament").addEventListener("click",()=>{if(confirm("Riaprire il torneo per correggere i risultati?"))setTournamentState("live");});
  $("bulkSelectAll").addEventListener("click",()=>{document.querySelectorAll("[data-bulk-game]").forEach(input=>{input.checked=true;bulkStaffSelection.add(input.dataset.bulkGame);});});$("bulkSelectNone").addEventListener("click",()=>{bulkStaffSelection.clear();document.querySelectorAll("[data-bulk-game]").forEach(input=>input.checked=false);});$("bulkStaffForm").addEventListener("submit",event=>{event.preventDefault();saveBulkStaff(event.currentTarget);});
  $("themeForm").addEventListener("input",event=>{const form=event.currentTarget;themePreviewDirty=true;if(event.target.name!=="preset")form.elements.preset.value="custom";const theme=themeFormValues();$("themeRadiusValue").textContent=`${theme.radius} px`;renderThemePresets(theme.preset);applyTheme(theme);$("themeMessage").textContent="Anteprima locale non ancora salvata.";});
  $("themeForm").addEventListener("submit",event=>{event.preventDefault();saveTheme("save");});$("resetTheme").addEventListener("click",()=>saveTheme("reset"));$("reloadSavedTheme").addEventListener("click",()=>{themePreviewDirty=false;fillThemeForm(themeFromSettings(settingsCatalog));$("themeMessage").textContent="Stile salvato ricaricato.";});
  $("shiftForm").addEventListener("submit",async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget).entries()),box=$("plannerMessage");showActionToast("Spostamento delle gare…","busy");try{const payload=await apiPost("/api/admin/planner",{action:"shift",dayCode:$("plannerDay").value,court:plannerSelectedCourt,fromGameId:data.fromGameId,deltaMinutes:Number(data.deltaMinutes)});box.textContent=payload.message;plannerDirty=false;await sync();renderPlanner(true);showActionToast(payload.message||"Orari aggiornati.",payload.warnings?.length?"warning":undefined);}catch(error){box.textContent=error.message;showActionToast(error.message,"error");}});
  $("clearMatches").addEventListener("click",async()=>{const confirmation=prompt("Questa operazione elimina tutte le gare, i risultati e gli accoppiamenti. Digita SVUOTA per continuare.");if(confirmation!=="SVUOTA")return;showActionToast("Eliminazione di tutte le gare…","busy");try{await apiPost("/api/admin/planner",{action:"clearAll",confirmation});plannerDirty=false;await sync();showActionToast("Tutte le gare sono state eliminate.");}catch(error){showActionToast(error.message,"error");}});
  applyTheme(themeDefaults);populateTeams();restoreSelections();renderAgenda();renderTeams();renderStandings();renderFinals();renderNotices();loadSession();sync();setInterval(sync,60000);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

  window.VolleyStarsTestApi={parseCsv,parseSheetCsv,parseSheetRows,parseGvizTable,parseNoticeTable,normalizeMatchup,resultOutcome,changedResults,matchScore,rankGroup,resolveQualificationText,resolvedMatchup};
})();
