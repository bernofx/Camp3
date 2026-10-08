(() => {
  const $ = id => document.getElementById(id), token = new URLSearchParams(location.search).get("token") || "";
  let candidates = [];
  const text = value => String(value || "").trim();
  const escapeHtml = value => text(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"})[char]);
  const palette = {U13:"#ff9900",U14:"#37a9e1",U15:"#80b24b",U17:"#c970ad"};
  const teamLabel = (name, code) => name && name !== code ? `${name} (${code})` : (name || code || "Da definire");
  const gameTeams = game => `${teamLabel(game.homeName,game.homeRef)}${game.awayRef ? ` – ${teamLabel(game.awayName,game.awayRef)}` : ""}`;
  const gameLabel = game => `Gara ${game.gameId} · ${game.category} · ${gameTeams(game)}`;
  const renderReceipts = () => { const list = $("myReceiptList"), receipts = window.VolleyStarsReceipts?.list?.() || []; if (!list) return; $("myReceipts").hidden = !receipts.length; list.innerHTML = receipts.map(item => `<article class="my-receipt"><div><strong>Gara ${escapeHtml(item.gameId)} · ${escapeHtml(item.category)}</strong><small>${escapeHtml(teamLabel(item.homeName,""))} – ${escapeHtml(teamLabel(item.awayName,""))} · ${escapeHtml(item.result)}</small><small>Codice ${escapeHtml(window.VolleyStarsReceipts.formatCode(item.publicCode))} · ${escapeHtml(new Date(item.submittedAt).toLocaleString("it-IT"))}</small></div><div><button type="button" data-download-receipt="${escapeHtml(item.publicCode)}">PDF</button><button type="button" data-remove-receipt="${escapeHtml(item.publicCode)}">Rimuovi</button></div></article>`).join(""); };
  const renderGame = () => { const game = candidates.find(item => item.gameId === $("entryGame").value); $("entryGameInfo").textContent = game ? `${gameLabel(game)} · ${game.date || "data da definire"} ${game.time || ""} · Campo ${game.court || "–"}${game.status === "live" ? " · In corso" : ""}` : ""; };
  const setupStaffSelector = (id, names) => { const select = $(id); select.innerHTML = `<option value="">Non indicato</option>${names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}<option value="__custom__">Inserisci un nome…</option>`; const update = () => { const field = document.querySelector(`[data-staff-custom="${id}"]`); field.hidden = select.value !== "__custom__"; if (field.hidden) field.querySelector("input").value = ""; }; select.addEventListener("change", update); update(); };
  const staffValue = (data, selectName, customName) => { const selected = text(data.get(selectName)); return selected === "__custom__" ? text(data.get(customName)) : selected; };
  async function load() {
    try {
      const response = await fetch(`/api/score-entry?token=${encodeURIComponent(token)}`, { cache: "no-store" }), payload = await response.json();
      if (!response.ok || !payload.candidates?.length) throw new Error(payload.error || "Non ci sono gare disponibili per questo QR.");
      candidates = payload.candidates; $("qrLabel").textContent = payload.label || "Referto torneo";
      setupStaffSelector("scorekeeperName", (payload.staff||[]).filter(item => Number(item.canScorekeeper)).map(item => item.name));
      setupStaffSelector("refereeName", (payload.staff||[]).filter(item => Number(item.canReferee)).map(item => item.name));
      setupStaffSelector("courtManagerName", (payload.staff||[]).filter(item => Number(item.canCourtManager)).map(item => item.name));
      window.VolleyStarsMatchPicker.mount($("entryGame"), candidates, { label: game => `Gara ${game.gameId} · ${game.category}`, matchup: game => gameTeams(game), day: game => game.date || "Senza giorno", meta: game => `${game.date || "data da definire"} · ${game.time || "--:--"} · Campo ${game.court || "–"}`, tint: game => palette[game.category] || "#ff9900" }); renderGame(); $("entryCard").hidden = false;
    } catch (error) { $("entryFailureText").textContent = error.message || "QR non disponibile."; $("entryFailure").hidden = false; }
  }
  $("entryGame").addEventListener("change", renderGame);
  $("scoreEntryForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), error = $("entryError"), button = $("entrySubmit"); error.textContent = ""; button.disabled = true; button.textContent = "Ottimizzo fotografia…";
    try {
      const preparedPhoto = await window.VolleyStarsReceipts.preparePhoto(data.get("photo"));
      button.textContent = "Invio fotografia…";
      const upload = new FormData(); upload.set("token", token); upload.set("photo", preparedPhoto);
      const photoResponse = await fetch("/api/score-entry/upload", { method: "POST", body: upload }), photo = await photoResponse.json(); if (!photoResponse.ok) throw new Error(photo.error || "Fotografia non caricata.");
      button.textContent = "Invio referto…";
      const result=text(data.get("result")),sets=[text(data.get("set1")),text(data.get("set2")),text(data.get("set3")),],scorekeeperName=staffValue(data,"scorekeeperName","scorekeeperCustomName"),refereeName=staffValue(data,"refereeName","refereeCustomName"),courtManagerName=staffValue(data,"courtManagerName","courtManagerCustomName"),response = await fetch("/api/score-entry/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, gameId: data.get("gameId"), scorekeeperName, refereeName, courtManagerName, result, sets, photoKey: photo.photoKey }) }), payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invio non riuscito.");
      const selected=candidates.find(item=>item.gameId===data.get("gameId"))||{},receipt={...(payload.receipt||{}),publicCode:payload.publicCode,gameId:selected.gameId||data.get("gameId"),category:selected.category||"",homeName:selected.homeName,awayName:selected.awayName,homeRef:selected.homeRef,awayRef:selected.awayRef,date:selected.date,time:selected.time,court:selected.court,result,sets,scorekeeperName,refereeName,courtManagerName};try{const stored=await window.VolleyStarsReceipts.save(receipt,preparedPhoto);window.VolleyStarsReceipts.download(stored);renderReceipts();}catch{}$("entryCard").hidden = true; $("entrySuccessText").textContent = `${payload.message} Codice: ${window.VolleyStarsReceipts.formatCode(payload.publicCode)}. Ricevuta PDF salvata su questo telefono.`; $("entrySuccess").hidden = false;
    } catch (reason) { error.textContent = reason.message || "Invio non riuscito. Riprova."; button.disabled = false; button.textContent = "Invia per verifica"; }
  });
  $("myReceiptList").addEventListener("click",async event=>{const download=event.target.closest("[data-download-receipt]"),remove=event.target.closest("[data-remove-receipt]");if(download){const receipt=await window.VolleyStarsReceipts.get(download.dataset.downloadReceipt);if(receipt)window.VolleyStarsReceipts.download(receipt);}if(remove){await window.VolleyStarsReceipts.remove(remove.dataset.removeReceipt);renderReceipts();}});renderReceipts();load();
})();
