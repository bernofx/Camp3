(function () {
  const config = window.VOLLEYSTARS_CONFIG;
  const staticData = window.VOLLEYSTARS_STATIC;
  let matches = staticData.matches.map(x => ({...x}));
  let notices = [];
  let toastTimer;
  let syncing = false;
  const qualificationGroups = {
    U13:{C:["131","132","133","134"],D:["135","136","137","138"]},
    U14:{C:["141","142","143","144"]},
    U15:{C:["161","162","163","164"],D:["165","166","167","168"]},
    U17:{C:["181","182","183","184"],D:["185","186","187","188"]}
  };
  const finalFlows = {
    U13:{"0116":["loser","0112","0113"],"0117":["winner","0112","0113"],"0118":["loser","0114","0115"],"0119":["winner","0114","0115"]},
    U14:{"0208":["loser","0206","0207"],"0209":["winner","0206","0207"]},
    U15:{"0316":["loser","0312","0313"],"0317":["winner","0312","0313"],"0318":["loser","0314","0315"],"0319":["winner","0314","0315"]},
    U17:{"0416":["loser","0412","0413"],"0417":["winner","0412","0413"],"0418":["loser","0414","0415"],"0419":["winner","0414","0415"]}
  };

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
    return fetchGvizTable(category,gid,3).then(table=>parseGvizTable(category,table));
  }

  async function fetchLiveMatches() {
    const requests=Object.entries(config.tabs).map(([category,gid])=>fetchGviz(category,gid));
    return (await Promise.all(requests)).flat();
  }

  async function fetchNotices() {
    if (config.noticesGid == null) return [];
    return parseNoticeTable(await fetchGvizTable("notices",config.noticesGid,1));
  }

  function mergeLive(live) {
    const byId=new Map(live.map(x=>[x.gameId,x]));
    matches=staticData.matches.map(base=>({...base,...(byId.get(base.gameId)||{}),date:base.date,time:base.time,court:base.court}));
  }

  function matchScore(match) {
    const direct=String(match.result||"").match(/(\d+)\s*[-–]\s*(\d+)/);
    if(direct)return [+direct[1],+direct[2]];
    const wins=[0,0];
    (match.sets||[]).forEach(set=>{const score=String(set).match(/(\d+)\s*[-–]\s*(\d+)/);if(score){if(+score[1]>+score[2])wins[0]++;else if(+score[2]>+score[1])wins[1]++;}});
    return wins[0]||wins[1]?wins:null;
  }

  function rankGroup(codes,sourceMatches=matches) {
    const codeSet=new Set(codes);
    const groupMatches=sourceMatches.filter(match=>{const found=teamCodes(match.matchup);return found.length===2&&found.every(code=>codeSet.has(code));});
    const expected=(codes.length*(codes.length-1))/2;
    if(groupMatches.length!==expected||groupMatches.some(match=>!matchScore(match)))return null;
    const stats=new Map(codes.map(code=>[code,{code,points:0,wins:0,setsFor:0,setsAgainst:0,pointsFor:0,pointsAgainst:0}]));
    groupMatches.forEach(match=>{
      const [left,right]=teamCodes(match.matchup), score=matchScore(match), a=stats.get(left), b=stats.get(right);
      a.setsFor+=score[0];a.setsAgainst+=score[1];b.setsFor+=score[1];b.setsAgainst+=score[0];
      (match.sets||[]).forEach(set=>{const points=String(set).match(/(\d+)\s*[-–]\s*(\d+)/);if(points){a.pointsFor+=+points[1];a.pointsAgainst+=+points[2];b.pointsFor+=+points[2];b.pointsAgainst+=+points[1];}});
      const winner=score[0]>score[1]?a:b, loser=winner===a?b:a;winner.wins++;
      if(Math.abs(score[0]-score[1])===1){winner.points+=2;loser.points+=1;}else winner.points+=3;
    });
    return [...stats.values()].sort((a,b)=>b.points-a.points||b.wins-a.wins||(b.setsFor-b.setsAgainst)-(a.setsFor-a.setsAgainst)||b.setsFor-a.setsFor||(b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)||a.code.localeCompare(b.code)).map(item=>item.code);
  }

  function qualificationMap(category,sourceMatches=matches) {
    const map=new Map();
    Object.entries(qualificationGroups[category]||{}).forEach(([letter,codes])=>{
      const ranking=rankGroup(codes,sourceMatches);
      if(ranking)ranking.forEach((code,index)=>map.set(`${letter}${index+1}`,code));
    });
    return map;
  }

  function resolveQualificationText(value,category,sourceMatches=matches) {
    const qualified=qualificationMap(category,sourceMatches);
    return String(value||"").replace(/\b([CD][1-4])\b/g,placeholder=>qualified.get(placeholder)||placeholder);
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
    if(flow){const [side,first,second]=flow,a=stageParticipant(first,side,match.category,sourceMatches),b=stageParticipant(second,side,match.category,sourceMatches);if(a&&b)return `${a} - ${b}`;}
    return resolveQualificationText(match.matchup,match.category,sourceMatches);
  }

  function card(match) {
    const result=resultText(match);
    const categoryClass=`category-${String(match.category).toLowerCase()}`;
    return `<article class="match-card"><div class="time-block">${esc(match.time)}<small>Campo ${esc(match.court)}</small></div><div class="match-main"><strong>${esc(expandMatchup(resolvedMatchup(match)))}</strong>${result?`<p class="result">${esc(result)}</p>`:""}<p>Referto: ${esc(match.scorekeeper||"da definire")} · Arbitro: ${esc(match.referee||"da definire")}</p></div><span class="category-chip ${esc(categoryClass)}">${esc(match.category)}</span></article>`;
  }

  function resultText(match) { return String(match.result || "").trim() || (match.sets || []).filter(Boolean).join(" · "); }

  function expandMatchup(value) {
    return value.replace(/\b(1\d{2})\b/g, code => staticData.teams[code] ? `${staticData.teams[code]} (${code})` : code);
  }

  function renderAgenda() {
    const filter=$("categoryFilter").value;
    const court=$("courtFilter").value;
    const now=new Date();
    const selected=m=>(filter==="all"||m.category===filter) && (court==="all"||String(m.court)===court);
    let visible=matches.filter(m=>selected(m) && dateTime(m)>=now).sort((a,b)=>dateTime(a)-dateTime(b));
    if(!visible.length) visible=matches.filter(selected).sort((a,b)=>dateTime(a)-dateTime(b)).slice(-8);
    let previous="";
    $("upcomingList").innerHTML=visible.slice(0,12).map(m=>{const divider=m.date!==previous?`<div class="date-divider">${esc(dateLabel(m.date))}</div>`:"";previous=m.date;return divider+card(m);}).join("") || '<div class="empty">Nessun appuntamento disponibile.</div>';
  }

  function teamCodes(matchup){return String(matchup).match(/\b1\d{2}\b/g)||[];}
  function resultOutcome(match, code){
    const codes=teamCodes(resolvedMatchup(match)); if(codes.length!==2) return null;
    let parts=String(match.result).match(/(\d+)\s*[-–]\s*(\d+)/);
    if(!parts){const wins=[0,0];match.sets.forEach(set=>{const s=String(set).match(/(\d+)\s*[-–]\s*(\d+)/);if(s){if(+s[1]>+s[2])wins[0]++;else wins[1]++;}});if(!wins[0]&&!wins[1])return null;parts=["",wins[0],wins[1]];}
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
    staticData.matches.forEach(match=>teamCodes(match.matchup).forEach(code=>categoryByCode.set(code,match.category)));
    const categoryOrder={U13:13,U14:14,U15:15,U17:17};
    $("teamSelect").innerHTML=Object.entries(staticData.teams)
      .sort((a,b)=>(categoryOrder[categoryByCode.get(a[0])]||99)-(categoryOrder[categoryByCode.get(b[0])]||99)||a[1].localeCompare(b[1],"it")||a[0].localeCompare(b[0]))
      .map(([code,name])=>`<option value="${code}">${esc(categoryByCode.get(code)||"—")} · ${esc(name)} · ${code}</option>`).join("");
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
    setSync("","Sincronizzazione con il foglio…");
    const cacheKey=`volleystars-${config.activeName}`;
    const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");
    const noticeRequest=fetchNotices().catch(()=>cached?.notices||[]);
    try{const live=await fetchLiveMatches();if(live.length<20)throw new Error("Dati insufficienti");mergeLive(live);notices=await noticeRequest;const changes=cached?.matches?changedResults(cached.matches,matches):[];localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),matches,notices}));setSync("live",`Aggiornato ora · ${config.label}`);showResultToast(changes);}
    catch(error){notices=await noticeRequest;if(cached?.matches){matches=cached.matches;setSync("error",`Offline · dati salvati ${new Date(cached.at).toLocaleString("it-IT")}`);}else setSync("error",`Calendario offline · risultati non sincronizzati (${config.label})`);}
    finally{syncing=false;}
    renderAgenda();renderTeams();renderNotices();
  }

  $("resultsLink").href=config.editUrl;
  $("environmentInfo").textContent=`Configurazione attiva: ${config.label}. Foglio ${config.spreadsheetId}.`;
  document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll(".nav-item,.view").forEach(el=>el.classList.remove("active"));button.classList.add("active");$(button.dataset.view).classList.add("active");}));
  $("categoryFilter").addEventListener("change",renderAgenda);$("courtFilter").addEventListener("change",renderAgenda);$("teamSelect").addEventListener("change",renderTeams);$("refreshButton").addEventListener("click",sync);$("resultToastClose").addEventListener("click",hideResultToast);
  populateTeams();renderAgenda();renderTeams();renderNotices();sync();setInterval(sync,60000);
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(()=>{});

  window.VolleyStarsTestApi={parseCsv,parseSheetCsv,parseGvizTable,parseNoticeTable,normalizeMatchup,resultOutcome,changedResults,matchScore,rankGroup,resolveQualificationText,resolvedMatchup};
})();
