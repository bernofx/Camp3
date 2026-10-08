(() => {
  const DB_NAME = "volleystars-referti", STORE = "receipts", META_KEY = "volleystars-referti-meta";
  const NAVY = [17 / 255, 38 / 255, 63 / 255], CORAL = [239 / 255, 106 / 255, 91 / 255];
  const CATEGORY_COLORS = { U13: [1, .6, 0], U14: [.22, .66, .88], U15: [.5, .7, .29], U17: [.79, .44, .68] };
  const open = () => new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "publicCode" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  const transaction = (mode, work) => open().then(database => new Promise((resolve, reject) => { const request = work(database.transaction(STORE, mode).objectStore(STORE)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }).finally(() => database.close()));
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META_KEY) || "[]"); } catch { return []; } };
  const writeMeta = items => localStorage.setItem(META_KEY, JSON.stringify(items.slice(0, 30)));
  const formatCode = value => /^\d{6}$/.test(String(value || "")) ? String(value).replace(/(\d{3})(\d{3})/, "$1 $2") : String(value || "–");
  const safeText = value => String(value || "–").replace(/[\r\n]+/g, " ").replace(/[\\()]/g, "\\$&").replace(/[^\x20-\xff]/g, "?");
  const bytes = text => new TextEncoder().encode(text);
  const join = parts => { const length = parts.reduce((total, part) => total + part.length, 0), output = new Uint8Array(length); let cursor = 0; parts.forEach(part => { output.set(part, cursor); cursor += part.length; }); return output; };
  const rgb = color => color.map(value => value.toFixed(3)).join(" ");

  async function preparePhoto(file) {
    if (!(file instanceof Blob)) throw new Error("Fotografia non disponibile.");
    let source;
    try { source = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { source = await new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Fotografia non leggibile.")); }; image.src = url; }); }
    const originalWidth = source.width || source.naturalWidth, originalHeight = source.height || source.naturalHeight, scale = Math.min(1, 1800 / Math.max(originalWidth, originalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(originalWidth * scale)); canvas.height = Math.max(1, Math.round(originalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false }); context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height); if (typeof source.close === "function") source.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Compressione della fotografia non riuscita.")), "image/jpeg", .82));
    return new File([blob], "referto.jpg", { type: "image/jpeg", lastModified: Date.now() });
  }
  const loadPhoto = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
  const jpegSize = source => { const raw = atob(source.split(",")[1] || ""), data = Uint8Array.from(raw, char => char.charCodeAt(0)); for (let index = 2; index < data.length - 9; index++) { if (data[index] !== 255) continue; const marker = data[index + 1]; if ([192,193,194,195,197,198,199,201,202,203].includes(marker)) return { width: (data[index + 7] << 8) + data[index + 8], height: (data[index + 5] << 8) + data[index + 6], data }; } return null; };
  const clip = (value, limit = 74) => { const source = String(value || "–"); return source.length > limit ? `${source.slice(0, limit - 1)}…` : source; };

  function pdfFor(receipt) {
    let image = null; try { image = jpegSize(receipt.photoDataUrl || ""); } catch {}
    const categoryColor = CATEGORY_COLORS[receipt.category] || CORAL;
    const commands = [
      `${rgb(NAVY)} rg 0 0 595 842 re f`, "1 1 1 rg 24 28 547 728 re f", `${rgb(categoryColor)} rg 24 690 547 66 re f`, `${rgb(CORAL)} rg 24 756 547 6 re f`,
      "BT /F2 11 Tf 1 1 1 rg 42 810 Td (VOLLEYSTARS 2026) Tj ET", `BT /F2 22 Tf ${rgb(NAVY)} rg 42 718 Td (Ricevuta invio referto) Tj ET`,
      `BT /F2 12 Tf 1 1 1 rg 500 718 Td (${safeText(receipt.category)}) Tj ET`, `BT /F2 13 Tf ${rgb(CORAL)} rg 42 662 Td (CODICE ${safeText(formatCode(receipt.publicCode))}) Tj ET`,
      `BT /F2 15 Tf ${rgb(NAVY)} rg 42 632 Td (${safeText(clip(`Gara ${receipt.gameId || "–"} · ${receipt.homeName || receipt.homeRef || "–"} - ${receipt.awayName || receipt.awayRef || "–"}`, 68))}) Tj ET`,
    ];
    const detailLines = [`${receipt.dayCode || ""} · ${receipt.date || "data da definire"} ${receipt.time || ""} · Campo ${receipt.court || "–"}`, `Risultato proposto: ${receipt.result || "–"}    Parziali: ${(receipt.sets || []).filter(Boolean).join(" / ") || "non indicati"}`, `Refertista: ${receipt.scorekeeperName || "non indicato"}`, `Arbitro: ${receipt.refereeName || "non indicato"}    Responsabile campo: ${receipt.courtManagerName || "non indicato"}`, `Inviato: ${new Date(receipt.submittedAt || Date.now()).toLocaleString("it-IT")}`, "Stato: in attesa di verifica dell'amministratore."];
    commands.push(`BT /F1 10 Tf ${rgb(NAVY)} rg 42 606 Td ${detailLines.flatMap((line, index) => [index ? "0 -16 Td" : "", `(${safeText(clip(line, 92))}) Tj`].filter(Boolean)).join(" ")} ET`);
    if (image) { const maxWidth = 500, maxHeight = 430, scale = Math.min(maxWidth / image.width, maxHeight / image.height), width = image.width * scale, height = image.height * scale, x = (595 - width) / 2, y = 64 + (430 - height) / 2; commands.push(`${rgb(NAVY)} RG 2 w ${x - 4} ${y - 4} ${width + 8} ${height + 8} re S`, `q ${width.toFixed(1)} 0 0 ${height.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)} cm /Im1 Do Q`); }
    else commands.push(`BT /F1 11 Tf ${rgb(NAVY)} rg 205 300 Td (Fotografia non disponibile) Tj ET`);
    const contentBody = bytes(commands.join("\n")), objects = [];
    objects[1] = bytes("<< /Type /Catalog /Pages 2 0 R >>"); objects[2] = bytes("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    objects[3] = bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 7 0 R >>${image ? " /XObject << /Im1 5 0 R >>" : ""} >> /Contents 6 0 R >>`); objects[4] = bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects[5] = image ? join([bytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`), image.data, bytes("\nendstream")]) : bytes("<< >>");
    objects[6] = join([bytes(`<< /Length ${contentBody.length} >>\nstream\n`), contentBody, bytes("\nendstream")]); objects[7] = bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const parts = [bytes("%PDF-1.4\n")], offsets = [0]; for (let index = 1; index <= 7; index++) { offsets[index] = parts.reduce((total, part) => total + part.length, 0); parts.push(bytes(`${index} 0 obj\n`), objects[index], bytes("\nendobj\n")); }
    const xref = parts.reduce((total, part) => total + part.length, 0); parts.push(bytes(`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`)); return new Blob([join(parts)], { type: "application/pdf" });
  }
  const download = async receipt => { let printable = receipt; if (receipt.photoDataUrl && !receipt.photoDataUrl.startsWith("data:image/jpeg")) { try { const converted = await preparePhoto(await (await fetch(receipt.photoDataUrl)).blob()); printable = { ...receipt, photoDataUrl: await loadPhoto(converted) }; } catch {} } const url = URL.createObjectURL(pdfFor(printable)), anchor = document.createElement("a"); anchor.href = url; anchor.download = `referto-${String(receipt.publicCode || "ricevuta").replace(/\s/g, "")}.pdf`; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); };
  async function save(receipt, file) { const photoDataUrl = await loadPhoto(file), stored = { ...receipt, photoDataUrl }; await transaction("readwrite", store => store.put(stored)); const metas = readMeta().filter(item => item.publicCode !== receipt.publicCode); metas.unshift({ publicCode: receipt.publicCode, gameId: receipt.gameId, category: receipt.category, homeName: receipt.homeName, awayName: receipt.awayName, result: receipt.result, submittedAt: receipt.submittedAt }); writeMeta(metas); return stored; }
  async function get(code) { return transaction("readonly", store => store.get(code)); }
  async function remove(code) { await transaction("readwrite", store => store.delete(code)); writeMeta(readMeta().filter(item => item.publicCode !== code)); }
  window.VolleyStarsReceipts = { preparePhoto, save, get, remove, download, formatCode, list: readMeta };
})();
