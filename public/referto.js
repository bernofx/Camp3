(() => {
  const $ = id => document.getElementById(id), token = new URLSearchParams(location.search).get("token") || "";
  let candidates = [];
  const text = value => String(value || "").trim();
  const escapeHtml = value => text(value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"})[char]);
  const palette = {U13:"#ff9900",U14:"#37a9e1",U15:"#80b24b",U17:"#c970ad"};
  const gameLabel = game => `Gara ${game.gameId} · ${game.category} · ${game.homeRef}${game.awayRef ? ` – ${game.awayRef}` : ""}`;
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
      window.VolleyStarsMatchPicker.mount($("entryGame"), candidates, { label: game => `Gara ${game.gameId} · ${game.category}`, matchup: game => `${game.homeRef}${game.awayRef ? ` – ${game.awayRef}` : ""}`, day: game => game.date || "Senza giorno", meta: game => `${game.date || "data da definire"} · ${game.time || "--:--"} · Campo ${game.court || "–"}`, tint: game => palette[game.category] || "#ff9900" }); renderGame(); $("entryCard").hidden = false;
    } catch (error) { $("entryFailureText").textContent = error.message || "QR non disponibile."; $("entryFailure").hidden = false; }
  }
  $("entryGame").addEventListener("change", renderGame);
  $("scoreEntryForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form), error = $("entryError"), button = $("entrySubmit"); error.textContent = ""; button.disabled = true; button.textContent = "Invio fotografia…";
    try {
      const upload = new FormData(); upload.set("token", token); upload.set("photo", data.get("photo"));
      const photoResponse = await fetch("/api/score-entry/upload", { method: "POST", body: upload }), photo = await photoResponse.json(); if (!photoResponse.ok) throw new Error(photo.error || "Fotografia non caricata.");
      button.textContent = "Invio referto…";
      const response = await fetch("/api/score-entry/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, gameId: data.get("gameId"), scorekeeperName: staffValue(data,"scorekeeperName","scorekeeperCustomName"), refereeName: staffValue(data,"refereeName","refereeCustomName"), courtManagerName: staffValue(data,"courtManagerName","courtManagerCustomName"), result: text(data.get("result")), sets: [text(data.get("set1")),text(data.get("set2")),text(data.get("set3"))], photoKey: photo.photoKey }) }), payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Invio non riuscito.");
      $("entryCard").hidden = true; $("entrySuccessText").textContent = `${payload.message} Codice: ${payload.publicCode}.`; $("entrySuccess").hidden = false;
    } catch (reason) { error.textContent = reason.message || "Invio non riuscito. Riprova."; button.disabled = false; button.textContent = "Invia per verifica"; }
  });
  load();
})();
