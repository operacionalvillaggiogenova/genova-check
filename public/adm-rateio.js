const $=id=>document.getElementById(id); let utility='water', current=null, submissionRows=[];
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const num=v=>{if(v===''||v==null)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const fmt=v=>v==null||v===''?'—':Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2});
async function api(path,options={}){const r=await fetch('/api'+path,{...options,headers:{...(options.headers||{})}});let d=null;try{d=await r.json()}catch{}if(!r.ok)throw new Error(d?.error||`Erro HTTP ${r.status}`);return d}
async function refresh(){try{$('status').textContent='● Atualizando…';const rows=await api(`/adm-rateio/cycles?utility=${utility}`);$('cycles').innerHTML=rows.length?rows.map(r=>`<div class="cycle-row"><button data-cycle="${r.id}"><span class="cycle-name">${utility==='water'?'💧':'🔥'} ${r.reference||'Sem competência'}</span><span class="cycle-sub">${r.name||'Leitura mensal'} · ${r.report_date||''}</span></button><span class="status-pill ${r.status==='CLOSED'?'closed':''}">${r.status==='CLOSED'?'FECHADO':'ABERTO'}</span><span class="cycle-extra">${money(r.total_value)}</span><button class="secondary-button" data-cycle="${r.id}">Abrir</button></div>`).join(''):'<p class="hint">Nenhum ciclo recebido para este tipo.</p>';document.querySelectorAll('[data-cycle]').forEach(b=>b.onclick=()=>openCycle(b.dataset.cycle));$('status').textContent='● Online';}catch(e){$('status').textContent='● Erro';$('cycles').innerHTML=`<p class="hint">${e.message}</p>`}}
async function openCycle(id){try{current=await api(`/adm-rateio/cycles/${id}`);renderDetail()}catch(e){alert(e.message)}}
function renderDetail(){const c=current; $('detail').hidden=false;$('detailTitle').textContent=`${c.utility==='water'?'Água':'Gás'} · ${c.reference||'Sem competência'}`;$('detailMeta').textContent=`${c.name||'Relatório'} · ${c.report_date||''} · ${c.status==='CLOSED'?'Ciclo fechado':'Ciclo aberto para conferência'}`;$('reference').value=c.reference||'';$('invoiceConsumption').value=c.invoice_consumption??'';$('factor').value=c.conversion_factor??1;$('units').value=c.units_per_block??16;$('condoConsumption').value=c.condo_consumption??0;$('notes').value=c.notes||'';$('closeCycle').hidden=c.status==='CLOSED';$('closeCycle').disabled=c.status==='CLOSED';$('save').disabled=c.status==='CLOSED';$('recalculate').disabled=c.status==='CLOSED';$('reopenCycle').hidden=c.status!=='CLOSED';renderCosts();renderReadings();renderSummary();renderEvidence();$('closedLabel').textContent=c.status==='CLOSED'?`Fechado em ${new Date(c.closed_at).toLocaleString('pt-BR')}`:'';window.scrollTo({top:document.getElementById('detail').offsetTop-20,behavior:'smooth'})}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]))}
const submissionTypeName=type=>({tags:'Tags',mudancas:'Mudanças',ressarcimentos:'Ressarcimentos'})[type]||type;
const submissionStatusName=status=>({RECEIVED:'Recebido',IN_REVIEW:'Em análise',PROCESSED:'Processado',CANCELLED:'Cancelado'})[status]||status;
function payloadEntries(row){const p=row.payload||{};return row.submission_type==='tags'?(p.tags||[]):row.submission_type==='mudancas'?(p.changes||[]):(p.refunds||[])}
async function refreshSubmissions(){
  try{
    submissionRows=await api('/adm-rateio/submissions');
    $('submissions').innerHTML=submissionRows.length?submissionRows.map(row=>`<div class="cycle-row"><button data-submission="${row.id}"><span class="cycle-name">${escapeHtml(submissionTypeName(row.submission_type))} · ${escapeHtml(row.title)}</span><span class="cycle-sub">${escapeHtml(row.submitted_by_name||'Usuário')} · ${escapeHtml(row.team_name||'')} · ${escapeHtml(row.report_date||'')}</span></button><span class="status-pill ${row.status==='PROCESSED'?'closed':''}">${escapeHtml(submissionStatusName(row.status))}</span><span class="cycle-extra">${payloadEntries(row).length} itens · ${Number(row.evidence_count||0)} docs.</span><button class="secondary-button" data-submission="${row.id}">Abrir</button></div>`).join(''):'<p class="hint">Nenhum envio de campo recebido.</p>';
    document.querySelectorAll('[data-submission]').forEach(button=>button.onclick=()=>openSubmission(button.dataset.submission));
  }catch(error){$('submissions').innerHTML=`<p class="hint">${escapeHtml(error.message)}</p>`}
}
function submissionTable(row){
  const entries=payloadEntries(row);
  if(!entries.length)return'<p class="hint">Nenhum item neste envio.</p>';
  if(row.submission_type==='tags')return`<table class="submission-table"><thead><tr><th>Bloco</th><th>Apartamento</th><th>Tipo</th><th>Quantidade</th></tr></thead><tbody>${entries.map(item=>`<tr><td>${escapeHtml(item.block)}</td><td>${escapeHtml(item.apartment)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.qty)}</td></tr>`).join('')}</tbody></table>`;
  if(row.submission_type==='mudancas')return`<table class="submission-table"><thead><tr><th>Bloco</th><th>Apartamento</th><th>Data</th><th>Tipo</th></tr></thead><tbody>${entries.map(item=>`<tr><td>${escapeHtml(item.block)}</td><td>${escapeHtml(item.apartment)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.type)}</td></tr>`).join('')}</tbody></table>`;
  return`<table class="submission-table"><thead><tr><th>Bloco</th><th>Apartamento</th><th>Data</th><th>Itens</th></tr></thead><tbody>${entries.map(item=>`<tr><td>${escapeHtml(item.block)}</td><td>${escapeHtml(item.apartment)}</td><td>${escapeHtml(item.date)}</td><td>${(item.items||[]).map(value=>`${escapeHtml(value.name)} × ${escapeHtml(value.qty)}`).join('<br>')}</td></tr>`).join('')}</tbody></table>`;
}
async function openSubmission(id){
  try{
    const row=await api(`/adm-rateio/submissions/${id}`);$('submissionTitle').textContent=row.title;
    const evidence=(row.evidence||[]).map(file=>{const key=encodeURIComponent(file.r2_key).replaceAll('%2F','/');return`<a href="/api/files/${key}" target="_blank" rel="noopener">${escapeHtml(file.filename||'Documento')} · ${Math.ceil(Number(file.size||0)/1024)} KB</a>`}).join('');
    $('submissionDetail').innerHTML=`<div class="submission-meta"><span>${escapeHtml(submissionTypeName(row.submission_type))}</span><span>${escapeHtml(row.report_date)}</span><span>${escapeHtml(row.submitted_by_name||'Usuário')}</span><span>${escapeHtml(row.team_name||'')}</span></div>${submissionTable(row)}<h3>Documentos comprobatórios</h3><div class="submission-evidence">${evidence||'<p class="hint">Nenhum documento anexado.</p>'}</div><div class="submission-status"><label>Status <select id="submissionStatus"><option value="RECEIVED">Recebido</option><option value="IN_REVIEW">Em análise</option><option value="PROCESSED">Processado</option><option value="CANCELLED">Cancelado</option></select></label><button id="saveSubmissionStatus" class="primary-button">Salvar status</button><span id="submissionFeedback" class="feedback"></span></div>`;
    $('submissionStatus').value=row.status;$('saveSubmissionStatus').onclick=async()=>{try{await api(`/adm-rateio/submissions/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:$('submissionStatus').value})});$('submissionFeedback').textContent='✓ Status salvo.';await refreshSubmissions()}catch(error){$('submissionFeedback').textContent=error.message}};
    $('submissionDialog').showModal();
  }catch(error){alert(error.message)}
}
function exportSubmissions(){
  const quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const lines=[['Tipo','Título','Data','Status','Responsável','Equipe','Bloco','Apartamento','Detalhe','Quantidade'].map(quote).join(';')];
  for(const row of submissionRows){for(const item of payloadEntries(row)){const detail=row.submission_type==='ressarcimentos'?(item.items||[]).map(x=>`${x.name} x ${x.qty}`).join(' | '):(item.type||'');lines.push([submissionTypeName(row.submission_type),row.title,row.report_date,submissionStatusName(row.status),row.submitted_by_name,row.team_name,item.block,item.apartment,detail,item.qty||''].map(quote).join(';'))}}
  const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`blexo-rateio-envios-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderEvidence(){
  const list=[];
  if(current.pdf_key) list.push(`<div class="evidence-item"><div><strong>PDF de evidências do relatório</strong><small>Documento principal enviado pelo Leiturista</small></div><div class="evidence-actions"><a class="secondary-button" href="/api/files/${encodeURIComponent(current.pdf_key).replaceAll('%2F','/')}" target="_blank" rel="noopener">👁 Consultar</a><a class="secondary-button" href="/api/files/${encodeURIComponent(current.pdf_key).replaceAll('%2F','/')}?download=1">⬇ Baixar</a></div></div>`);
  for(const e of (current.evidences||[])){
    const key=encodeURIComponent(e.r2_key).replaceAll('%2F','/');
    list.push(`<div class="evidence-item"><div><strong>${escapeHtml(e.filename||'Evidência')}</strong><small>${escapeHtml(e.utility||'')} ${e.meter?'· '+escapeHtml(e.meter):''} · ${e.size?Math.ceil(e.size/1024)+' KB':''}</small></div><div class="evidence-actions"><a class="secondary-button" href="/api/files/${key}" target="_blank" rel="noopener">👁 Consultar</a><a class="secondary-button" href="/api/files/${key}?download=1">⬇ Baixar</a></div></div>`);
  }
  $('evidenceList').innerHTML=list.length?list.join(''):'<p class="hint">Nenhum PDF ou evidência armazenado para este ciclo.</p>';
}

function renderCosts(){const rows=c=>`<div class="cost-row"><input data-cost-desc placeholder="Descrição" value="${(c.description||'').replace(/"/g,'&quot;')}"><input data-cost-invoice placeholder="NF / fatura" value="${(c.invoice_number||'').replace(/"/g,'&quot;')}"><input data-cost-amount type="number" step="0.01" value="${c.amount??0}"><button class="remove-cost" type="button">×</button></div>`;$('costs').innerHTML=(current.costs||[]).map(rows).join('');document.querySelectorAll('.remove-cost').forEach(b=>b.onclick=()=>{b.parentElement.remove();renderSummary()});document.querySelectorAll('[data-cost-amount]').forEach(x=>x.oninput=renderSummary)}
function normalizeAreaName(value){
  return String(value||'').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
}
function isCommonArea(code){
  const c=typeof blexoConfig==='function'?blexoConfig():{};
  const value=normalizeAreaName(code);
  const configured=(Array.isArray(c.commonAreas)?c.commonAreas:[]).map(normalizeAreaName);
  if(configured.includes(value)) return true;
  // Compatibilidade com leituras antigas que usam “Salões 1/2”,
  // enquanto a configuração usa “Salão 1/2”.
  const aliases={'saloes 1':'salao 1','saloes 2':'salao 2'};
  return configured.includes(aliases[value]||'');
}

function renderReadings(){
  const rows=current.readings||[];
  const c=collect();
  const factor=num(c.conversionFactor)||1;
  const invoice=num(c.invoiceConsumption);
  const units=Math.max(1,Number(c.unitsPerBlock||16));
  const blockCount=Math.max(1,Number(blexoConfig?.().blockCount||26));
  const totalUnits=units*blockCount;
  const blocks=rows.filter(r=>!isCommonArea(r.block_code));
  const common=rows.filter(r=>isCommonArea(r.block_code));
  const allRows=rows;
  const consumptionOf=r=>{
    const p=num(document.querySelector(`[data-prev="${r.id}"]`)?.value??r.previous_value);
    const a=num(document.querySelector(`[data-current="${r.id}"]`)?.value??r.current_value);
    return p!=null&&a!=null?Math.max(0,a-p)*factor:0;
  };
  const blockSum=blocks.reduce((s,r)=>s+consumptionOf(r),0);
  const commonSum=common.reduce((s,r)=>s+consumptionOf(r),0);
  const denominator=invoice!=null&&invoice>0?invoice:(blockSum+commonSum);
  const total=Number(c.totalValue||0);
  const commonCostTotal=denominator>0?total*(commonSum/denominator):0;
  const commonPerUnit=totalUnits>0?commonCostTotal/totalUnits:0;
  const rowHtml=(r)=>{
    const p=num(r.previous_value),a=num(r.current_value);
    const delta=p!=null&&a!=null?Math.max(0,a-p):null;
    const converted=delta==null?0:delta*factor;
    const pct=denominator>0?converted/denominator*100:0;
    const amount=denominator>0?total*converted/denominator:0;
    const commonRow=isCommonArea(r.block_code);
    const perApto=commonRow?0:amount/units;
    const finalPerApto=commonRow?0:perApto+commonPerUnit;
    return `<tr class="${commonRow?'common-area-row':''}">
      <td><strong>${r.block_code}</strong></td>
      <td><input data-prev="${r.id}" type="number" step="0.01" value="${r.previous_value??''}"></td>
      <td><input data-current="${r.id}" type="number" step="0.01" value="${r.current_value??''}"></td>
      <td class="reading-consumption" data-delta="${r.id}">${fmt(delta)}</td>
      <td>${pct.toLocaleString('pt-BR',{maximumFractionDigits:3})}%</td>
      <td>${money(amount)}</td>
      <td>${commonRow?'—':money(perApto)}</td>
      <td>${commonRow?money(amount):money(commonPerUnit)}</td>
      <td>${commonRow?'—':money(finalPerApto)}</td>
      <td><input class="correction-check" data-corrected="${r.id}" type="checkbox" ${r.corrected?'checked':''}></td><td><button type="button" class="danger-button delete-reading" data-delete-reading="${r.id}">Excluir</button></td>
      <td><input data-reason="${r.id}" value="${r.correction_reason||''}" placeholder="Motivo da correção"></td>
    </tr>`;
  };
  const blockRows=blocks.map(rowHtml).join('');
  const commonRows=common.map(rowHtml).join('');
  const blockCostTotal=blocks.reduce((s,r)=>{
    const p=num(r.previous_value),a=num(r.current_value);
    const d=p!=null&&a!=null?Math.max(0,a-p)*factor:0;
    return s+(denominator>0?total*d/denominator:0);
  },0);
  const blockPct=denominator>0?blockSum/denominator*100:0;
  const commonPct=denominator>0?commonSum/denominator*100:0;
  const blockSubtotalRow=`<tr class="subtotal-row">
    <td colspan="3"><strong>Subtotal blocos</strong></td>
    <td><strong>${fmt(blockSum)}</strong></td>
    <td><strong>${blockPct.toLocaleString('pt-BR',{maximumFractionDigits:3})}%</strong></td>
    <td><strong>${money(blockCostTotal)}</strong></td>
    <td colspan="6"></td>
  </tr>`;
  const commonTotalRow=`<tr class="common-total-row">
    <td colspan="3"><strong>Subtotal áreas comuns</strong></td>
    <td><strong>${fmt(commonSum)}</strong></td>
    <td><strong>${commonPct.toLocaleString('pt-BR',{maximumFractionDigits:3})}%</strong></td>
    <td><strong>${money(commonCostTotal)}</strong></td>
    <td>—</td>
    <td><strong>${money(commonPerUnit)}</strong><small class="table-note"> por unidade / ${totalUnits} aptos</small></td>
    <td colspan="4"></td>
  </tr>`;
  $('readingsTable').querySelector('tbody').innerHTML=
    (blockRows?`<tr class="group-title-row"><td colspan="12"><strong>BLOCOS</strong></td></tr>${blockRows}${blockSubtotalRow}`:'')+
    (commonRows?`<tr class="group-title-row"><td colspan="12"><strong>ÁREAS COMUNS</strong></td></tr>${commonRows}${commonTotalRow}`:'')+
    (!allRows.length?'<tr><td colspan="12">Nenhuma leitura recebida.</td></tr>':'');
  document.querySelectorAll('[data-delete-reading]').forEach(b=>b.onclick=()=>deleteReading(b.dataset.deleteReading));
  document.querySelectorAll('[data-prev],[data-current]').forEach(x=>x.oninput=()=>{
    const id=x.dataset.prev||x.dataset.current;
    const p=document.querySelector(`[data-prev="${id}"]`).value;
    const a=document.querySelector(`[data-current="${id}"]`).value;
    const cell=document.querySelector(`[data-delta="${id}"]`);
    const d=num(p)!=null&&num(a)!=null?num(a)-num(p):null;
    cell.textContent=fmt(d);
    renderSummary();
  });
}
function collect(){const costs=[...document.querySelectorAll('.cost-row')].map(r=>({description:r.querySelector('[data-cost-desc]').value.trim()||'Conta',invoiceNumber:r.querySelector('[data-cost-invoice]').value.trim(),amount:num(r.querySelector('[data-cost-amount]').value)||0}));const readings=(current.readings||[]).map(r=>({id:r.id,previousValue:document.querySelector(`[data-prev="${r.id}"]`)?.value,currentValue:document.querySelector(`[data-current="${r.id}"]`)?.value,corrected:document.querySelector(`[data-corrected="${r.id}"]`)?.checked,correctionReason:document.querySelector(`[data-reason="${r.id}"]`)?.value||''}));return {reference:$('reference').value,invoiceConsumption:$('invoiceConsumption').value,totalValue:costs.reduce((s,x)=>s+x.amount,0),conversionFactor:$('factor').value,unitsPerBlock:$('units').value,condoConsumption:$('condoConsumption').value,notes:$('notes').value,costs,readings}}
function renderSummary(){
  const c=collect();
  const readings=current.readings||[];
  const factor=num(c.conversionFactor)||1;
  const blockRows=readings.filter(r=>!isCommonArea(r.block_code));
  const commonRows=readings.filter(r=>isCommonArea(r.block_code));
  const sumFor=rows=>rows.reduce((s,r)=>{
    const p=num(document.querySelector(`[data-prev="${r.id}"]`)?.value),a=num(document.querySelector(`[data-current="${r.id}"]`)?.value);
    return s+(p!=null&&a!=null?Math.max(0,a-p)*factor:0);
  },0);
  const blockSum=sumFor(blockRows);
  const commonSum=sumFor(commonRows);
  const totalConsumption=blockSum+commonSum;
  const inv=num(c.invoiceConsumption);
  const denominator=inv!=null&&inv>0?inv:totalConsumption;
  const total=Number(c.totalValue||0);
  const commonAmount=denominator>0?total*commonSum/denominator:0;
  const blockCount=Math.max(1,Number(blexoConfig?.().blockCount||26));
  const commonPerUnit=commonAmount/(Math.max(1,Number(c.unitsPerBlock||16))*blockCount);
  const avg=blockRows.length?blockSum/blockRows.length:0;
  $('summary').innerHTML=[
    ['Valor das contas',money(total)],
    ['Consumo dos blocos',fmt(blockSum)],
    ['Média por bloco',fmt(avg)],
    ['Consumo áreas comuns',fmt(commonSum)],
    ['Rateio comum / unidade',money(commonPerUnit)],
    ['Status',current.status==='CLOSED'?'FECHADO':'ABERTO']
  ].map(x=>`<div class="summary-box"><small>${x[0]}</small><strong>${x[1]}</strong></div>`).join('');
}
function rateioExportData(){
  const form=collect(), factor=num(form.conversionFactor)||1, total=Number(form.totalValue||0);
  const all=(current.readings||[]).map(reading=>{
    const previous=num(document.querySelector(`[data-prev="${reading.id}"]`)?.value??reading.previous_value);
    const value=num(document.querySelector(`[data-current="${reading.id}"]`)?.value??reading.current_value);
    return {...reading,common:isCommonArea(reading.block_code),consumption:previous!=null&&value!=null?Math.max(0,value-previous)*factor:0};
  });
  const blocks=all.filter(row=>!row.common), common=all.filter(row=>row.common);
  const blockConsumption=blocks.reduce((sum,row)=>sum+row.consumption,0), commonConsumption=common.reduce((sum,row)=>sum+row.consumption,0);
  const invoice=num(form.invoiceConsumption), denominator=invoice!=null&&invoice>0?invoice:blockConsumption+commonConsumption;
  const units=Math.max(1,Number(form.unitsPerBlock||16)), blockCount=Math.max(1,Number(blexoConfig?.().blockCount||blocks.length||1));
  const commonAmount=denominator>0?total*commonConsumption/denominator:0, commonPerUnit=commonAmount/(units*blockCount);
  const rows=all.map(row=>{const amount=denominator>0?total*row.consumption/denominator:0;return {...row,percent:denominator>0?row.consumption/denominator*100:0,amount,perUnit:row.common?0:amount/units+commonPerUnit};});
  return {form,total,blocks,common,blockConsumption,commonConsumption,average:blocks.length?blockConsumption/blocks.length:0,commonPerUnit,rows};
}
function exportName(extension){return `blexo-rateio-${current.utility==='water'?'agua':'gas'}-${current.reference||'sem-competencia'}.${extension}`}
function exportRateioExcel(){
  if(!current)return;const data=rateioExportData(), quote=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const heading=current.utility==='water'?'RATEIO DE ÁGUA':'RATEIO DE GÁS';
  const lines=[[heading],[`Competência: ${data.form.reference||'—'}`],[`Valor das contas: ${money(data.total)}`],[`Consumo dos blocos: ${fmt(data.blockConsumption)}`],[`Média por bloco: ${fmt(data.average)}`],[`Observações: ${data.form.notes||'—'}`],[],['Bloco / área','Consumo','Percentual','Valor rateado','Valor por apartamento'].map(quote)];
  data.rows.forEach(row=>lines.push([row.block_code,fmt(row.consumption),`${row.percent.toFixed(3)}%`,money(row.amount),row.common?'—':money(row.perUnit)].map(quote).join(';')));
  const blob=new Blob(['\ufeff'+lines.map(row=>Array.isArray(row)?row.map(quote).join(';'):row).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=exportName('csv');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportRateioPdf(){
  if(!current)return;if(!window.jspdf?.jsPDF){alert('Gerador de PDF indisponível. Conecte-se e tente novamente.');return;}
  const data=rateioExportData(),{jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4',orientation:'landscape'}),utilityName=current.utility==='water'?'ÁGUA':'GÁS';
  doc.setFillColor(18,48,71);doc.rect(0,0,297,20,'F');doc.setTextColor(255);doc.setFontSize(15);doc.text(`BLEXO-SUITE · RATEIO DE ${utilityName}`,12,13);doc.setTextColor(35,45,55);
  doc.setFontSize(9);const summary=[['Competência',data.form.reference||'—'],['Valor das contas',money(data.total)],['Consumo dos blocos',fmt(data.blockConsumption)],['Média por bloco',fmt(data.average)]];
  summary.forEach(([label,value],index)=>{const x=12+index*70;doc.setFillColor(241,246,248);doc.roundedRect(x,27,65,16,2,2,'F');doc.setFontSize(7);doc.text(label,x+3,33);doc.setFontSize(10);doc.text(String(value),x+3,40);});
  const notes=doc.splitTextToSize(data.form.notes||'Sem observações.',267).slice(0,4);doc.setFontSize(8);doc.text('Observações:',12,51);doc.text(notes,38,51);let y=Math.max(61,51+notes.length*3.4+5);
  const cols=[55,43,36,45,45], headers=['Bloco / área','Consumo','% do rateio','Valor rateado','R$ por apartamento'];let x=12;doc.setFillColor(230,238,242);doc.setFontSize(7.5);headers.forEach((header,index)=>{doc.rect(x,y,cols[index],6,'F');doc.text(header,x+2,y+4);x+=cols[index];});y+=6;
  const rowHeight=Math.max(3.3,Math.min(4.7,(194-y)/Math.max(1,data.rows.length)));data.rows.forEach(row=>{x=12;const values=[row.block_code,fmt(row.consumption),`${row.percent.toFixed(3)}%`,money(row.amount),row.common?'—':money(row.perUnit)];doc.setFontSize(rowHeight<4?6.1:7.2);values.forEach((value,index)=>{doc.rect(x,y,cols[index],rowHeight);doc.text(String(value),x+2,y+rowHeight*.7,{maxWidth:cols[index]-3});x+=cols[index];});y+=rowHeight;});
  doc.setFontSize(7);doc.text(`Consumo de áreas comuns: ${fmt(data.commonConsumption)} · Rateio de áreas comuns por apartamento: ${money(data.commonPerUnit)}`,12,202);doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`,285,202,{align:'right'});doc.save(exportName('pdf'));
}
async function deleteReading(readingId){
  if(!current||current.status==='CLOSED')return;
  const row=(current.readings||[]).find(r=>r.id===readingId);
  if(!row)return;
  if(!confirm(`Excluir a leitura de ${row.block_code}? Ela deixará de participar do cálculo deste ciclo.`))return;
  try{$('detailFeedback').textContent='Excluindo leitura…';current=await api(`/adm-rateio/cycles/${current.id}/readings/${readingId}`,{method:'DELETE'});renderDetail();await refresh();$('detailFeedback').textContent='✓ Leitura excluída do ciclo.'}catch(e){$('detailFeedback').textContent='Falha: '+e.message}}
async function recalculate(){if(!current||current.status==='CLOSED')return;try{$('detailFeedback').textContent='Salvando e recalculando…';await api(`/adm-rateio/cycles/${current.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(collect())});current=await api(`/adm-rateio/cycles/${current.id}/recalculate`,{method:'POST'});renderDetail();await refresh();$('detailFeedback').textContent='✓ Cálculo recalculado.'}catch(e){$('detailFeedback').textContent='Não foi possível recalcular: '+e.message}}
async function reopen(){if(!current||current.status!=='CLOSED')return;if(!confirm('Reabrir este ciclo? As alterações voltarão a ser permitidas e o rateio fechado será descartado até novo recálculo/fechamento.'))return;try{$('detailFeedback').textContent='Reabrindo…';current=await api(`/adm-rateio/cycles/${current.id}/reopen`,{method:'POST'});renderDetail();await refresh();$('detailFeedback').textContent='✓ Ciclo reaberto para edição.'}catch(e){$('detailFeedback').textContent='Não foi possível reabrir: '+e.message}}

async function save(){if(!current||current.status==='CLOSED')return;try{$('detailFeedback').textContent='Salvando…';current=await api(`/adm-rateio/cycles/${current.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(collect())});renderDetail();$('detailFeedback').textContent='✓ Alterações salvas.';await refresh()}catch(e){$('detailFeedback').textContent='Falha: '+e.message}}
async function closeCycle(){if(!current||current.status==='CLOSED')return;const c=collect();if(!confirm('Fechar este ciclo? Depois do fechamento, as leituras ficarão bloqueadas para edição.'))return;try{$('detailFeedback').textContent='Conferindo e fechando…';await api(`/adm-rateio/cycles/${current.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(c)});current=await api(`/adm-rateio/cycles/${current.id}/close`,{method:'POST'});renderDetail();await refresh();$('detailFeedback').textContent='✓ Ciclo fechado com sucesso.'}catch(e){$('detailFeedback').textContent='Não foi possível fechar: '+e.message}}
document.querySelectorAll('[data-utility]').forEach(b=>b.onclick=()=>{utility=b.dataset.utility;document.querySelectorAll('[data-utility]').forEach(x=>x.classList.toggle('active',x===b));$('detail').hidden=true;refresh()});$('refresh').onclick=refresh;$('refreshSubmissions').onclick=refreshSubmissions;$('exportSubmissions').onclick=exportSubmissions;$('closeSubmission').onclick=()=>$('submissionDialog').close();$('save').onclick=save;$('recalculate').onclick=recalculate;$('reopenCycle').onclick=reopen;$('closeCycle').onclick=closeCycle;$('exportRateioPdf').onclick=exportRateioPdf;$('exportRateioExcel').onclick=exportRateioExcel;$('addCost').onclick=()=>{const div=document.createElement('div');div.className='cost-row';div.innerHTML='<input data-cost-desc placeholder="Descrição"><input data-cost-invoice placeholder="NF / fatura"><input data-cost-amount type="number" step="0.01" value="0"><button class="remove-cost" type="button">×</button>';$('costs').appendChild(div);div.querySelector('.remove-cost').onclick=()=>{div.remove();renderSummary()};div.querySelector('[data-cost-amount]').oninput=renderSummary;renderSummary()};
refresh();refreshSubmissions();
