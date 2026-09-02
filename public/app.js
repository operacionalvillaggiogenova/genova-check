const $ = id => document.getElementById(id);
const photoTemplateSelect = $('photoTemplate');
if (photoTemplateSelect && !photoTemplateSelect.querySelector('[value="six"]')) photoTemplateSelect.insertAdjacentHTML('beforeend', '<option value="six">6 por página (compacto)</option>');
const DB_NAME = 'blexo-check-medicoes', STORE = 'reports';
const LINKED_ACTIVITY_ID = new URLSearchParams(location.search).get('activity') || null;
const DEFAULT_SEAL_CONFIG = 'Antes|texto|#123047\nDepois|texto|#176d9a\nVerde|bolinha|#36a269\nAmarelo|bolinha|#e5b22e\nVermelho|bolinha|#cb4c4c';
let currentReport, saveTimer;
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
function meterTitles(){const c=typeof blexoConfig==='function'?blexoConfig():{blockCount:26,commonAreas:['Área Comum 01','Área Comum 02']};return [...Array.from({length:Number(c.blockCount)||0},(_,i)=>`Bloco ${String(i+1).padStart(2,'0')}`),...(c.commonAreas||[])];}
function METER_BLOCKS(){return meterTitles();}
const newBlock = (title = '') => ({ id: newId(), title, photos: [], gas: '', water: '' });
const newMeterGroups = () => meterTitles().map(title => newBlock(title));
const defaultSettings = () => { const c=typeof blexoConfig==='function'?blexoConfig():{}; return { watermark:c.watermark!==false, template:c.checkPhotoTemplate||c.photoTemplate||'two', company:'', sealConfig:c.sealConfig||DEFAULT_SEAL_CONFIG }; };
const blankReport = () => ({ id: newId(), activityId: LINKED_ACTIVITY_ID, name: 'Novo relatório', reportDate: new Date().toISOString().slice(0,10), reference: new Date().toISOString().slice(0,7), client: '', location: '', service: '', technician: '', notes: '', settings: defaultSettings(), groups: newMeterGroups(), updatedAt: new Date().toISOString() });

function openDatabase() { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function withStore(mode, work) { const db = await openDatabase(); return new Promise((resolve, reject) => { const transaction = db.transaction(STORE, mode), result = work(transaction.objectStore(STORE)); transaction.oncomplete = () => { db.close(); resolve(result); }; transaction.onerror = () => { db.close(); reject(transaction.error); }; }); }
const saveReport = report => withStore('readwrite', store => store.put(report));
const getAllReports = () => new Promise(async (resolve, reject) => { try { const db = await openDatabase(), request = db.transaction(STORE).objectStore(STORE).getAll(); request.onsuccess = () => { db.close(); resolve(request.result); }; request.onerror = () => reject(request.error); } catch (error) { reject(error); } });
const deleteReport = id => withStore('readwrite', store => store.delete(id));

function formatDate(date = new Date()) { return new Date(date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function escapeHtml(value = '') { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function countPhotos() { return currentReport.groups.reduce((total, group) => total + group.photos.length, 0); }
function settings() { return currentReport.settings; }
function renderModuleColors(){}
function saveModuleColors(){}
function ensureReportShape(report) {
  report.reportDate ||= new Date(report.updatedAt || Date.now()).toISOString().slice(0,10); report.reference ||= report.reportDate.slice(0,7); report.settings = { ...defaultSettings(), ...(report.settings || {}) };
  const oldGroups = Array.isArray(report.groups) ? report.groups : [];
  const byTitle = new Map(oldGroups.map(group => [group.title, group]));
  report.groups = meterTitles().map((title, index) => {
    const group = byTitle.get(title) || oldGroups[index] || newBlock(title);
    group.id ||= newId();
    group.title = title;
    group.photos ||= [];
    group.gas ??= '';
    group.water ??= '';
    group.photos.forEach(photo => {
      photo.note ||= '';
      photo.seal ||= '';
      photo.insertedAt ||= photo.date || new Date().toISOString();
    });
    return group;
  });
  return report;
}
function scheduleSave(message = 'Salvo neste aparelho') { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { currentReport.updatedAt = new Date().toISOString(); await saveReport(currentReport); $('feedback').textContent = message; }, 350); }
function sealOptions() { return settings().sealConfig.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => { const [label, kind = 'texto', color = '#123047'] = line.split('|').map(part => part.trim()); return { label, kind: kind.toLowerCase() === 'bolinha' ? 'dot' : 'text', color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#123047' }; }).filter(option => option.label); }
function syncFields() { currentReport.reportDate = $('reportDate')?.value || currentReport.reportDate || new Date().toISOString().slice(0,10); currentReport.reference = $('reference')?.value || currentReport.reportDate.slice(0,7); ['reportName', 'client', 'location', 'service', 'technician', 'notes'].forEach(id => { currentReport[id === 'reportName' ? 'name' : id] = $(id).value.trim(); }); currentReport.settings = { watermark: $('watermark').checked, template: $('photoTemplate').value, company: $('company').value.trim(), sealConfig: $('sealConfig').value.trim() || DEFAULT_SEAL_CONFIG }; $('reportHeading').textContent = currentReport.name || 'Novo relatório'; }
function renderReport() { const r = ensureReportShape(currentReport); ['reportName', 'client', 'location', 'service', 'technician', 'notes'].forEach(id => { $(id).value = r[id === 'reportName' ? 'name' : id] || ''; }); if($('reportDate')) $('reportDate').value=r.reportDate||''; if($('reference')) $('reference').value=r.reference||''; $('watermark').checked = r.settings.watermark; $('photoTemplate').value = r.settings.template; $('company').value = r.settings.company; $('sealConfig').value = r.settings.sealConfig; $('reportHeading').textContent = r.name || 'Novo relatório'; renderBlocks(); }

async function sendToCloud(){
  if(!window.BlexoCloud) throw new Error('Integração com o banco não carregada.');
  await saveNow();
  $('feedback').textContent='Enviando leituras para o banco…';
  const synced=await BlexoCloud.syncLeiturista(currentReport);
  const cycleIds=Object.values(synced.cycles||{});
  const pdf=window.__blexoLastPdfReportId===currentReport.id && window.__blexoLastPdfBlob instanceof Blob ? window.__blexoLastPdfBlob : null;
  if(!pdf && countReportPhotos(currentReport)) throw new Error('Gere o PDF de evidências antes de enviar ao banco.');
  for(let i=0;i<cycleIds.length;i++){
    const cycleId=cycleIds[i];
    const utility = synced.cycles.gas===cycleId?'gas':'water';
    const photos=currentReport.groups.flatMap(g=>(g.photos||[]).filter(p=>p.meter===utility).map(p=>({...p,blockCode:g.title})));
    await BlexoCloud.uploadEvidence(cycleId,currentReport,i===0?pdf:null,photos);
  }
  $('feedback').textContent='✓ Leituras e evidências enviadas ao banco. Agora o fechamento é feito no Adm-Rateio.';
  return synced;
}
function findGroup(id) { return currentReport.groups.find(group => group.id === id); }
function photoPicker(group, photo, photoIndex) { const options = sealOptions(); return `<article class="photo"><img src="${photo.src}" alt="Foto ${photoIndex + 1}"><span class="tag">${escapeHtml(group.title || 'Evidência')}</span><select class="seal-picker" data-seal="${group.id}:${photo.id}" aria-label="Selo da foto"><option value="">Selo</option>${options.map(option => `<option value="${escapeHtml(option.label)}" ${photo.seal === option.label ? 'selected' : ''}>${option.kind === 'dot' ? '● ' : ''}${escapeHtml(option.label)}</option>`).join('')}</select><button class="remove" data-remove-photo="${group.id}:${photo.id}" aria-label="Excluir foto">×</button><textarea class="photo-note" data-note="${group.id}:${photo.id}" placeholder="Observação desta foto">${escapeHtml(photo.note)}</textarea></article>`; }
function renderBlocks() {
  const total = countPhotos();
  $('photoCount').textContent = `${total} ${total === 1 ? 'foto' : 'fotos'}`;
  $('generateButton').disabled = !total;
  $('evidenceBlocks').innerHTML = currentReport.groups.map((group, groupIndex) => `
    <article class="evidence-block meter-block">
      <div class="evidence-block-header">
        <strong>${escapeHtml(group.title)}</strong>
      </div>
      <div class="meter-readings">${(()=>{const c=typeof blexoConfig==='function'?blexoConfig():{enableGas:true,enableWater:true};return `${c.enableGas?`<label>Leitura GAS<input class="meter-input" data-reading="gas:${group.id}" inputmode="decimal" type="text" placeholder="Leitura do gás" value="${escapeHtml(group.gas)}"></label>`:''}${c.enableWater?`<label>Leitura ÁGUA<input class="meter-input" data-reading="water:${group.id}" inputmode="decimal" type="text" placeholder="Leitura da água" value="${escapeHtml(group.water)}"></label>`:''}`})()}</div>
      <div class="capture-actions">
        <label class="capture-button primary"><input class="photo-input" data-group="${group.id}" data-meter="gas" data-source="camera" type="file" accept="image/*" capture="environment" multiple>⌾ Foto do gás</label>
        <label class="capture-button"><input class="photo-input" data-group="${group.id}" data-meter="gas" data-source="gallery" type="file" accept="image/*" multiple>▧ Galeria gás</label>
        <label class="capture-button primary"><input class="photo-input" data-group="${group.id}" data-meter="water" data-source="camera" type="file" accept="image/*" capture="environment" multiple>⌾ Foto da água</label>
        <label class="capture-button"><input class="photo-input" data-group="${group.id}" data-meter="water" data-source="gallery" type="file" accept="image/*" multiple>▧ Galeria água</label>
      </div>
      <p class="block-hint">Registre as leituras e, se necessário, fotografe o relógio.</p>
      <div class="photo-grid">${group.photos.map((photo, index) => photoPicker(group, photo, index)).join('')}</div>
    </article>`).join('');

  document.querySelectorAll('.meter-input').forEach(field => field.oninput = event => {
    const [kind, groupId] = event.target.dataset.reading.split(':');
    const group = findGroup(groupId);
    if (group) group[kind] = event.target.value;
    scheduleSave();
  });
  document.querySelectorAll('.photo-input').forEach(input => input.onchange = event => {
    addFiles(event.target.dataset.group, event.target.dataset.source, event.target.files, event.target.dataset.meter);
    event.target.value = '';
  });
  document.querySelectorAll('[data-remove-photo]').forEach(button => button.onclick = () => {
    const [groupId, photoId] = button.dataset.removePhoto.split(':');
    const group = findGroup(groupId);
    if (group) group.photos = group.photos.filter(photo => photo.id !== photoId);
    renderBlocks();
    scheduleSave();
  });
  document.querySelectorAll('[data-note]').forEach(field => field.oninput = event => {
    const [groupId, photoId] = event.target.dataset.note.split(':');
    const group = findGroup(groupId);
    const photo = group?.photos.find(photo => photo.id === photoId);
    if (photo) photo.note = event.target.value;
    scheduleSave();
  });
  document.querySelectorAll('[data-seal]').forEach(field => field.onchange = event => {
    const [groupId, photoId] = event.target.dataset.seal.split(':');
    const group = findGroup(groupId);
    const photo = group?.photos.find(photo => photo.id === photoId);
    if (photo) photo.seal = event.target.value;
    scheduleSave();
  });
}

function exifDateText(file) { return file.arrayBuffer().then(buffer => { const view = new DataView(buffer); if (view.byteLength < 14 || view.getUint16(0, false) !== 0xffd8) return null; let offset = 2; while (offset + 4 < view.byteLength) { if (view.getUint8(offset) !== 0xff) { offset++; continue; } const marker = view.getUint8(offset + 1), length = view.getUint16(offset + 2, false); if (marker === 0xe1 && offset + 10 < view.byteLength && String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4)) === 'Exif') { const tiff = offset + 10, endian = view.getUint16(tiff, false), little = endian === 0x4949; if (!(little || endian === 0x4d4d) || view.getUint16(tiff + 2, little) !== 42) return null; const read16 = pos => view.getUint16(pos, little), read32 = pos => view.getUint32(pos, little); const readIfd = pos => { if (pos < tiff || pos + 2 > view.byteLength) return []; const count = read16(pos), entries = []; for (let i = 0; i < count; i++) { const entry = pos + 2 + i * 12; if (entry + 12 > view.byteLength) break; entries.push({ tag: read16(entry), type: read16(entry + 2), count: read32(entry + 4), value: entry + 8 }); } return entries; }; const ascii = entry => { if (!entry || entry.type !== 2) return null; const pos = entry.count <= 4 ? entry.value : tiff + read32(entry.value); if (pos + entry.count > view.byteLength) return null; return new TextDecoder('ascii').decode(new Uint8Array(buffer, pos, entry.count)).replace(/\0/g, '').trim(); }; const ifd0 = readIfd(tiff + read32(tiff + 4)); const exifPointer = ifd0.find(entry => entry.tag === 0x8769); const exifIfd = exifPointer ? readIfd(tiff + read32(exifPointer.value)) : []; const raw = ascii(exifIfd.find(entry => entry.tag === 0x9003)) || ascii(exifIfd.find(entry => entry.tag === 0x9004)); const match = raw?.match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/); return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : null; } if (length < 2) break; offset += 2 + length; } return null; }).catch(() => null); }
function drawWatermark(image, text) {
  // Aceita tanto HTMLImageElement quanto HTMLCanvasElement.
  // No Android, normalizePhoto() entrega um canvas; canvas não possui
  // naturalWidth/naturalHeight, o que podia gerar uma imagem vazia.
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error('Não foi possível identificar o tamanho da imagem.');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  if (settings().watermark && text) {
    const size = Math.max(22, Math.round(canvas.width / 34));
    const padding = Math.round(size * .65);
    const inset = Math.max(padding, Math.round(canvas.width * .018));
    ctx.font = `600 ${size}px Arial`;

    const boxWidth = Math.ceil(ctx.measureText(text).width + padding * 2);
    const boxHeight = size + padding * 2;
    const x = canvas.width - boxWidth - inset;
    const y = canvas.height - boxHeight - inset;

    ctx.fillStyle = 'rgba(0,0,0,.70)';
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.fillStyle = 'white';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + padding, y + boxHeight / 2);
    ctx.textBaseline = 'alphabetic';
  }

  return window.BlexoPhoto ? BlexoPhoto.encode(canvas) : canvas.toDataURL('image/jpeg', .72);
}
async function decodePhoto(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) throw new Error('Arquivo de imagem inválido.');
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' });
      if (bitmap.width && bitmap.height) return bitmap;
      bitmap.close?.();
    } catch (error) { console.warn('Blexo: createImageBitmap falhou, usando decodificador alternativo.', error); }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (!image.naturalWidth || !image.naturalHeight) return reject(new Error('Imagem sem dimensões válidas.'));
      resolve(image);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível decodificar a imagem.')); };
    image.src = url;
  });
}
function normalizePhoto(image, maxSide = 1280) {
  const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas;
}
async function addFiles(groupId, source, fileList, meter = '') {
  const group = findGroup(groupId);
  const files = [...fileList].filter(file => file && (!file.type || file.type.startsWith('image/')));
  if (!files.length) return;
  for (const file of files) {
    try {
      $('feedback').textContent = 'Processando foto…';
      const insertedAt = new Date().toISOString();
      const watermarkText = source === 'camera' ? formatDate(insertedAt) : await exifDateText(file);
      const image = await decodePhoto(file);
      const normalized = normalizePhoto(image, 1280);
      const src = drawWatermark(normalized, watermarkText);
      group.photos.push({ id: newId(), src, insertedAt, watermarkText, meter, blockCode: group.title, seal: '', note: '' });
      renderBlocks();
      await saveNow();
      $('feedback').textContent = '✓ Foto adicionada e salva neste aparelho.';
    } catch (error) {
      console.error('Blexo: falha ao processar foto.', error);
      $('feedback').textContent = `Não foi possível salvar esta foto: ${error?.message || 'erro desconhecido'}`;
    }
  }
}


function openReports() { renderReportsList(); $('reportsDialog').showModal(); }
function countReportPhotos(report) { return report.groups.reduce((n, group) => n + group.photos.length, 0); }
async function renderReportsList() { const reports = (await getAllReports()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); $('reportsList').innerHTML = reports.map(report => `<div class="report-row"><button data-open-report="${report.id}">${escapeHtml(report.name || 'Sem nome')}<small>${countReportPhotos(report)} fotos · atualizado ${formatDate(report.updatedAt)}</small></button><button class="report-delete" data-delete-report="${report.id}" aria-label="Excluir relatório">×</button></div>`).join('') || '<p class="dialog-hint">Nenhum relatório salvo.</p>'; document.querySelectorAll('[data-open-report]').forEach(button => button.onclick = async () => { await saveNow(); currentReport = ensureReportShape((await getAllReports()).find(report => report.id === button.dataset.openReport)); $('reportsDialog').close(); renderReport(); }); document.querySelectorAll('[data-delete-report]').forEach(button => button.onclick = async () => { if (confirm('Excluir este relatório deste aparelho? Esta ação não pode ser desfeita.')) { await deleteReport(button.dataset.deleteReport); if (button.dataset.deleteReport === currentReport.id) { currentReport = blankReport(); await saveNow(); renderReport(); } renderReportsList(); } }); }
async function saveNow() { syncFields(); currentReport.updatedAt = new Date().toISOString(); await saveReport(currentReport); }
function setOnlineStatus() { const online = navigator.onLine; $('offlineStatus').textContent = online ? '● Online' : '● Offline'; $('offlineStatus').classList.toggle('offline', !online); }

function splitText(doc, text, width) { return doc.splitTextToSize(text || '—', width); }
function hexRgb(hex) { const value = hex.replace('#', ''); return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]; }
function drawPdfSeal(doc, photo, x, y, width) { const seal = sealOptions().find(option => option.label === photo.seal); if (!seal) return; const [r, g, b] = hexRgb(seal.color); doc.setFillColor(r, g, b); if (seal.kind === 'dot') { doc.circle(x + width - 5, y + 5, 3, 'F'); return; } doc.setFontSize(7); doc.setFont(undefined, 'bold'); const box = doc.getTextWidth(seal.label) + 5; doc.roundedRect(x + width - box - 3, y + 2, box, 6, 1, 1, 'F'); doc.setTextColor(255); doc.text(seal.label, x + width - box - .5, y + 6.3); doc.setTextColor(80); doc.setFont(undefined, 'normal'); }
function header(doc, page, title) { const cfg=typeof blexoConfig==='function'?blexoConfig():{}; const hc=cfg.leituristaHeaderColor||'#123047'; const rgb=hexRgb(hc); doc.setFillColor(...rgb); doc.rect(0, 0, 210, 22, 'F'); doc.setTextColor(255); doc.setFontSize(15); doc.text(cfg.leituristaHeaderName || settings().company || 'Blexo-Leiturista', 12, 14); doc.setFontSize(9); doc.text(`RELATÓRIO FOTOGRÁFICO · ${page}`, 198, 14, { align: 'right' }); doc.setTextColor(30, 46, 56); doc.setFontSize(18); doc.text(title, 12, 35); }
function drawReadings(doc, group, x, y) {
  doc.setFontSize(8.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 46, 56);
  doc.text(`GAS: ${group.gas || '—'}`, x, y);
  doc.text(`ÁGUA: ${group.water || '—'}`, x + 45, y);
  doc.setFont(undefined, 'normal');
}

function drawReadingsTable(doc, groups) {
  let y = 48;
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(30, 46, 56);
  doc.text('Resumo das leituras', 12, y);
  y += 9;
  const x0 = 12, colBlock = 84, colGas = 49, colWater = 53;
  const rowH = 7;
  const drawRow = (label, gas, water, header = false) => {
    if (y + rowH > 282) {
      doc.addPage();
      y = 28;
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('Resumo das leituras', 12, y);
      y += 9;
    }
    if (header) {
      doc.setFillColor(18, 48, 71);
      doc.setTextColor(255);
    } else {
      doc.setFillColor(248, 251, 252);
      doc.setTextColor(30, 46, 56);
    }
    doc.rect(x0, y, colBlock, rowH, 'F');
    doc.rect(x0 + colBlock, y, colGas, rowH, 'F');
    doc.rect(x0 + colBlock + colGas, y, colWater, rowH, 'F');
    doc.setDrawColor(220, 229, 233);
    doc.rect(x0, y, colBlock, rowH);
    doc.rect(x0 + colBlock, y, colGas, rowH);
    doc.rect(x0 + colBlock + colGas, y, colWater, rowH);
    doc.setFontSize(header ? 8 : 8.5);
    doc.setFont(undefined, header ? 'bold' : 'normal');
    doc.text(label, x0 + 3, y + 4.7);
    doc.text(String(gas || '—'), x0 + colBlock + 3, y + 4.7);
    doc.text(String(water || '—'), x0 + colBlock + colGas + 3, y + 4.7);
    y += rowH;
  };
  drawRow('BLOCO / ÁREA', 'LEITURA GAS', 'LEITURA ÁGUA', true);
  groups.forEach(group => drawRow(group.title, group.gas, group.water));
}

function generatePdf() {
  if (!window.jspdf) {
    $('feedback').textContent = 'O gerador de PDF ainda não foi baixado. Conecte-se uma vez à internet e tente novamente.';
    return;
  }
  syncFields();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  header(doc, '1', currentReport.name || 'Leitura de gás e água');
  doc.setFontSize(11);
  doc.setTextColor(80);
  let y = 47;
  [['Condomínio', currentReport.client], ['Local / referência', currentReport.location], ['Observação da coleta', currentReport.service], ['Responsável técnico', currentReport.technician], ['Gerado em', formatDate()]].forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 12, y);
    doc.setFont(undefined, 'normal');
    const lines = splitText(doc, value, 138);
    doc.text(lines, 60, y);
    y += Math.max(9, lines.length * 5 + 3);
  });

  const one = settings().template === 'one', six = settings().template === 'six', four = settings().template === 'four';
  const cols = one ? 1 : (six ? 3 : 2), imageW = one ? 174 : (six ? 56 : (four ? 83 : 87)), imageH = one ? 115 : (six ? 48 : (four ? 57 : 65));
  let x = 12, yPhoto = y + 17, col = 0, page = 1, photoNumber = 0;
  doc.setFontSize(14);
  doc.setTextColor(30, 46, 56);
  doc.text('Evidências fotográficas', 12, y + 7);
  const nextPage = () => {
    doc.addPage();
    page++;
    header(doc, `${page}`, 'Evidências fotográficas');
    x = 12;
    yPhoto = 48;
    col = 0;
  };

  currentReport.groups.forEach((group, index) => {
    if (col) { col = 0; x = 12; yPhoto += imageH + 18; }
    if (yPhoto + 24 > 282) nextPage();
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(23, 109, 154);
    doc.text(group.title || `Bloco ${index + 1}`, 12, yPhoto);
    drawReadings(doc, group, 12, yPhoto + 5);
    yPhoto += 11;
    group.photos.forEach(photo => {
      photoNumber++;
      const noteLines = photo.note ? splitText(doc, photo.note, imageW) : [], footer = 8 + noteLines.length * 4;
      if (yPhoto + imageH + footer > 282) {
        nextPage();
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(23, 109, 154);
        doc.text(group.title || `Bloco ${index + 1}`, 12, yPhoto);
        drawReadings(doc, group, 12, yPhoto + 5);
        yPhoto += 11;
      }
      if (!photo.src || !photo.src.startsWith('data:image/')) {
        throw new Error('Uma fotografia não está disponível em formato válido para o PDF.');
      }
      doc.addImage(photo.src, 'JPEG', x, yPhoto, imageW, imageH);
      drawPdfSeal(doc, photo, x, yPhoto, imageW);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80);
      doc.text(`Foto ${photoNumber} · inserida em ${formatDate(photo.insertedAt || photo.date)}`, x, yPhoto + imageH + 5);
      if (noteLines.length) {
        doc.setFontSize(8.5);
        doc.text(noteLines, x, yPhoto + imageH + 9);
      }
      col++;
      if (col === cols) { col = 0; x = 12; yPhoto += imageH + footer + 5; }
      else x += imageW + 10;
    });
    if (col) { col = 0; x = 12; yPhoto += imageH + 18; }
    else yPhoto += 7;
  });

  if (currentReport.notes) {
    const finalNotes = splitText(doc, currentReport.notes, 174), notesHeight = 14 + finalNotes.length * 5;
    if (yPhoto + notesHeight > 282) { nextPage(); yPhoto = 48; }
    doc.setDrawColor(220, 229, 233);
    doc.setFillColor(248, 251, 252);
    doc.roundedRect(12, yPhoto, 186, notesHeight, 3, 3, 'FD');
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(30, 46, 56);
    doc.text('Observações finais', 18, yPhoto + 7);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(finalNotes, 18, yPhoto + 13);
  }

  doc.addPage();
  header(doc, `${page + 1}`, 'Resumo das leituras');
  drawReadingsTable(doc, currentReport.groups);

  const safe = (currentReport.name || 'relatorio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const pdfBlob = doc.output('blob');
  window.__blexoLastPdfBlob = pdfBlob; window.__blexoLastPdfReportId = currentReport.id;
  doc.save(`blexo-check-${safe}.pdf`);
  saveNow();
  $('feedback').textContent = 'PDF gerado e download iniciado.';
  return pdfBlob;
}

['reportName', 'client', 'location', 'service', 'technician', 'notes'].forEach(id => $(id).addEventListener('input', () => { syncFields(); scheduleSave(); }));
$('newReportButton').onclick = async () => { await saveNow(); currentReport = blankReport(); await saveNow(); renderReport(); $('feedback').textContent = 'Novo relatório criado neste aparelho.'; };
$('reportsButtonInline').onclick = openReports; if($('sendCloudButton')) $('sendCloudButton').onclick = async()=>{ const b=$('sendCloudButton'); b.disabled=true; try{ if(window.__blexoLastPdfReportId!==currentReport.id || !(window.__blexoLastPdfBlob instanceof Blob)) await generatePdf(); await sendToCloud(); }catch(e){ console.error('Blexo Cloud:',e); $('feedback').textContent='Falha no envio: '+(e?.message||'erro desconhecido'); }finally{ b.disabled=false; } };  $('settingsButton').onclick = () => { renderModuleColors(); $('settingsDialog').showModal(); }; document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close()); $('settingsDialog').addEventListener('close', () => { if ($('settingsDialog').returnValue !== 'cancel') { saveModuleColors(); syncFields(); renderBlocks(); scheduleSave(); } }); $('generateButton').onclick = generatePdf;
window.addEventListener('online', setOnlineStatus); window.addEventListener('offline', setOnlineStatus);
(async () => { try{await blexoLoadFieldConfig()}catch(e){console.warn('Usando estrutura local do Leiturista',e)} const reports = await getAllReports(); currentReport = ensureReportShape(reports.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || blankReport()); if(LINKED_ACTIVITY_ID) currentReport.activityId=LINKED_ACTIVITY_ID; if (!reports.length || LINKED_ACTIVITY_ID) await saveReport(currentReport); renderReport(); setOnlineStatus(); })();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
