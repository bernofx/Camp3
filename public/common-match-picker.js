(() => {
  let opened = null;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const text = value => String(value ?? "").trim();
  const clock = value => { const [hour, minute] = text(value).split(":").map(Number); return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0; };

  function close() {
    if (!opened) return;
    opened.panel.hidden = true;
    opened.trigger.setAttribute("aria-expanded", "false");
    opened = null;
  }

  function mount(select, inputItems, options = {}) {
    if (!select) return null;
    const items = [...inputItems];
    const label = options.label || (item => `Gara ${item.gameId} · ${item.category}`);
    const matchup = options.matchup || (item => `${item.homeRef || ""}${item.awayRef ? ` – ${item.awayRef}` : ""}`.trim());
    const day = options.day || (item => item.dayCode || item.date || "Senza giorno");
    const meta = options.meta || (item => `${day(item)} · ${item.time || "--:--"} · Campo ${item.court || "–"}`);
    const tint = options.tint || (() => "#ff9900");
    const groupFor = options.group || (item => `${day(item)} · Campo ${item.court || "–"}`);
    const old = select.nextElementSibling;
    if (old?.classList.contains("common-match-picker")) old.remove();
    select.innerHTML = items.map(item => `<option value="${esc(item.gameId)}">${esc(label(item))}</option>`).join("");
    if (!items.some(item => item.gameId === select.value)) select.value = items[0]?.gameId || "";
    select.classList.add("common-match-picker-native");
    select.hidden = true;
    select.setAttribute("aria-hidden", "true");
    select.tabIndex = -1;

    const root = document.createElement("div");
    root.className = "common-match-picker";
    root.innerHTML = `<button class="common-match-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"></button><section class="common-match-picker-panel" hidden><div class="common-match-picker-search"><input type="search" placeholder="Cerca codice gara, squadra o categoria" aria-label="Cerca gara"><span>⌕</span></div><div class="common-match-picker-filters"><select aria-label="Filtra per giorno"></select><select aria-label="Filtra per campo"></select><select aria-label="Filtra per categoria"></select></div><div class="common-match-picker-results" role="listbox"></div></section>`;
    select.insertAdjacentElement("afterend", root);
    const trigger = root.querySelector(".common-match-picker-trigger"), panel = root.querySelector(".common-match-picker-panel"), search = root.querySelector("input[type=search]"), [dayFilter, courtFilter, categoryFilter] = root.querySelectorAll(".common-match-picker-filters select"), results = root.querySelector(".common-match-picker-results");
    const distinct = key => [...new Map(items.map(item => [key(item), item])).values()];
    const fill = (control, values, blank, value, description) => { const previous = control.value; control.innerHTML = `<option value="">${esc(blank)}</option>${values.map(item => `<option value="${esc(value(item))}">${esc(description(item))}</option>`).join("")}`; control.value = [...control.options].some(option => option.value === previous) ? previous : ""; };
    const refresh = () => {
      const selected = items.find(item => item.gameId === select.value);
      trigger.innerHTML = selected ? `<i style="--common-picker-color:${esc(tint(selected))}"></i><span><strong>${esc(label(selected))}</strong><small>${esc(meta(selected))} · ${esc(matchup(selected))}</small></span><b>⌄</b>` : "<span><strong>Nessuna gara disponibile</strong><small>Modifica i filtri o la configurazione</small></span><b>⌄</b>";
      trigger.disabled = !selected;
      fill(dayFilter, distinct(day), "Tutti i giorni", day, item => day(item));
      fill(courtFilter, distinct(item => String(item.court || "")), "Tutti i campi", item => String(item.court || ""), item => `Campo ${item.court || "–"}`);
      fill(categoryFilter, distinct(item => item.category || ""), "Tutte le categorie", item => item.category || "", item => item.category || "—");
    };
    const render = () => {
      const query = search.value.trim().toLocaleLowerCase("it"); let filtered = items.filter(item => (!query || `${item.gameId} ${item.category || ""} ${matchup(item)} ${day(item)} ${item.court || ""} ${item.time || ""}`.toLocaleLowerCase("it").includes(query)) && (!dayFilter.value || day(item) === dayFilter.value) && (!courtFilter.value || String(item.court || "") === courtFilter.value) && (!categoryFilter.value || (item.category || "") === categoryFilter.value)); if (!options.preserveOrder) filtered = filtered.sort((a,b) => `${a.date || "9999"}|${a.time || "99:99"}|${a.gameId}`.localeCompare(`${b.date || "9999"}|${b.time || "99:99"}|${b.gameId}`));
      let group = "", html = "";
      for (const item of filtered) { const groupName = groupFor(item); if (groupName !== group) { group = groupName; html += `<div class="common-match-picker-group">${esc(group)}</div>`; } html += `<button type="button" class="common-match-picker-option${item.gameId === select.value ? " selected" : ""}" data-game-id="${esc(item.gameId)}" style="--common-picker-color:${esc(tint(item))}"><span class="common-match-picker-time">${esc(item.time || "--:--")}<small>${esc(item.category || "")}</small></span><span><strong>${esc(label(item))}</strong><small>${esc(meta(item))} · ${esc(matchup(item))}</small></span></button>`; }
      results.innerHTML = html || '<p class="common-match-picker-empty">Nessuna gara corrisponde ai filtri.</p>';
    };
    trigger.addEventListener("click", () => { const opening = panel.hidden; close(); if (opening) { panel.hidden = false; trigger.setAttribute("aria-expanded", "true"); opened = {root, trigger, panel}; render(); setTimeout(() => search.focus(), 0); } });
    [search, dayFilter, courtFilter, categoryFilter].forEach(control => control.addEventListener(control === search ? "input" : "change", render));
    results.addEventListener("click", event => { const choice = event.target.closest("[data-game-id]"); if (!choice) return; select.value = choice.dataset.gameId; select.dispatchEvent(new Event("change", {bubbles:true})); refresh(); close(); });
    refresh();
    return { refresh, destroy: () => root.remove() };
  }

  document.addEventListener("click", event => { if (opened && !event.target.closest(".common-match-picker")) close(); });
  window.VolleyStarsMatchPicker = { mount, close, clock };
})();
